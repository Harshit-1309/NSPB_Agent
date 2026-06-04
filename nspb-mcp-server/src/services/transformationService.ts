import fs from 'fs';

/**
 * Transformation Logic for NSPB Raw Data
 * Transforms raw Oracle NSPB dimension and data slice responses into a clean, minimal tabular format.
 */

export interface FormattedTable {
  povContext?: string;
  povDetails?: Record<string, string>;
  columns: string[];
  rows: Record<string, string | number>[];
}

export interface TransformationError {
  error: string;
}

export class TransformationService {
  /**
   * Transforms raw NSPB exportDataSlice response into a flat tabular format.
   * @param rawData Raw JSON response from Oracle NSPB exportdataslice endpoint
   * @param pov Optional POV definition to extract context
   */
  transformNSPBResponse(rawData: any, pov?: any, aliasMap: Record<string, string> = {}, rowDimensions?: string[]): FormattedTable | TransformationError {
    try {
      if (!rawData) {
        return { error: 'Unable to format NSPB response: Input is null or undefined' };
      }

      // If the response is wrapped in a "grid" property (e.g. from EPM forms API), unwrap it
      const gridData = rawData.grid ? rawData.grid : rawData;

      // Check if it's a grid-style response
      if (gridData.rows && gridData.columns) {
        return this.formatGridData(gridData, pov, aliasMap, rowDimensions);
      }

      // Check if it's a members or rules list response
      if (rawData.items && Array.isArray(rawData.items)) {
        return this.formatItemList(rawData.items);
      }

      return { error: 'Unable to format NSPB response: Unrecognized data structure' };
    } catch (error: any) {
      try {
        fs.writeFileSync('scratch/last_error.json', JSON.stringify({
          error: error.message,
          stack: error.stack,
          rawDataKeys: rawData ? Object.keys(rawData) : null,
          rawDataSample: rawData ? JSON.stringify(rawData).substring(0, 4000) : null
        }, null, 2));
      } catch (e) {}
      return { error: `Unable to format NSPB response: ${error.message}` };
    }
  }

  private formatGridData(rawData: any, pov?: any, aliasMap: Record<string, string> = {}, rowDimensions?: string[]): FormattedTable {
    // 1. Extract Column Headers and apply Aliases
    let colNames: string[] = [];
    if (Array.isArray(rawData.columns) && rawData.columns.length > 0) {
      if (Array.isArray(rawData.columns[0])) {
        // Simple array of arrays (multi-row headers)
        // We need to pivot this: for each column index, join all row headers
        const numCols = rawData.columns[0].length;
        colNames = [];
        for (let i = 0; i < numCols; i++) {
          const headers = rawData.columns.map((row: string[]) => {
            const h = row[i];
            return aliasMap[h] || h;
          });
          // Filter out redundant headers like 'Years' or 'Period' if they are dimension names
          const filtered = headers.filter((h: string, idx: number) => {
             // For simplicity, we join everything, but could skip dimension names if needed
             return h !== undefined && h !== null;
          });
          colNames.push(filtered.join(' | '));
        }
      } else if (rawData.columns[0].headers) {
        // Complex grid structure
        colNames = rawData.columns.map((col: any) => {
          if (Array.isArray(col.headers) && col.headers.length > 1) {
            return col.headers.map((h: string) => aliasMap[h] || h).join(' | ');
          }
          return aliasMap[col.headers[0]] || col.headers[0];
        });
      }
    }
    
    // 3. Extract ALL POV Context
    const povDetails: Record<string, string> = {};
    const effectivePov = pov || rawData.pov;
    if (effectivePov) {
      if (effectivePov.dimensions && effectivePov.members) {
        effectivePov.dimensions.forEach((dim: string, idx: number) => {
          // Skip dimensions that are already in columns (to avoid redundancy)
          if (colNames.includes(dim)) return;
          
          const member = effectivePov.members[idx] ? (Array.isArray(effectivePov.members[idx]) ? effectivePov.members[idx][0] : effectivePov.members[idx]) : "N/A";
          povDetails[aliasMap[dim] || dim] = aliasMap[member] || member;
        });
      } else if (Array.isArray(effectivePov)) {
        // EPM Forms array style: pov is ["NSP_Base", "NSP_Total Location", ...]
        const povDimNames = rawData.gridInfo?.povDimNames || [];
        const pageDimNames = rawData.gridInfo?.pageDimNames || [];
        const allDims = [...povDimNames, ...pageDimNames];
        
        allDims.forEach((dim: string, idx: number) => {
          if (colNames.includes(dim)) return;
          const member = effectivePov[idx] || "N/A";
          povDetails[aliasMap[dim] || dim] = aliasMap[member] || member;
        });
      }
    }
    
    // 4. Identify the Row Dimension dynamically
    let rowDimLabel = "Member";
    
    // Check if the grid response includes dimension names for rows
    if (rawData.gridInfo?.rowDimNames) {
      rowDimLabel = rawData.gridInfo.rowDimNames.map((d: string) => aliasMap[d] || d).join(' | ');
    } else if (rawData.rows?.[0]?.dimensions?.[0]) {
      const rowDim = rawData.rows[0].dimensions[0];
      rowDimLabel = aliasMap[rowDim] || rowDim;
    } else if (rowDimensions && rowDimensions.length > 0) {
      // Fallback to the dimensions we know were placed in rows
      rowDimLabel = aliasMap[rowDimensions[0]] || rowDimensions[0];
    }

    // Ensure the row dimension is removed from POV details (since it's on an axis now)
    delete povDetails[rowDimLabel];
    if (rowDimensions) {
      rowDimensions.forEach(rd => {
        delete povDetails[rd];
        delete povDetails[aliasMap[rd]];
      });
    }

    const columns = [rowDimLabel, ...colNames];
    return { povDetails, columns, rows: this.formatRows(rawData, colNames, aliasMap, rowDimLabel) };
  }

  private formatRows(rawData: any, colNames: string[], aliasMap: Record<string, string>, rowDimLabel: string): any[] {
    return rawData.rows.map((row: any) => {
      let rowName = row.headers[0];
      let rowLabel = aliasMap[rowName] || rowName;
      
      // If we have multiple headers (multi-dimension rows), join them
      if (row.headers.length > 1) {
        rowLabel = row.headers.map((h: string) => aliasMap[h] || h).join(' | ');
      }
      
      // Clean up common technical prefixes ONLY if no alias was found
      if (rowLabel === rowName || (row.headers.length > 1 && rowLabel.includes(row.headers[0]))) {
        if (typeof rowLabel === 'string') {
          if (rowLabel.startsWith('NFS_')) rowLabel = rowLabel.replace('NFS_', '');
          if (rowLabel.includes('_')) rowLabel = rowLabel.replace(/_/g, ' ');
        }
      }

      const rowData: Record<string, string | number> = {
        [rowDimLabel]: rowLabel
      };

      colNames.forEach((col: string, index: number) => {
        const val = row.data[index];
        let cellVal = val;
        if (val !== null && typeof val === 'object') {
          cellVal = val.value !== undefined ? val.value : (val.formattedValue !== undefined ? val.formattedValue : val);
        }

        if (cellVal === null || cellVal === undefined || cellVal === '' || cellVal === '#Missing') {
          rowData[col] = 0;
        } else {
          const num = Number(cellVal);
          if (!isNaN(num) && typeof cellVal !== 'boolean') {
            rowData[col] = Math.round(num * 100) / 100; // Keep 2 decimals for financial data
          } else {
            rowData[col] = cellVal;
          }
        }
      });

      return rowData;
    });
  }

  private formatItemList(items: any[]): FormattedTable {
    if (items.length === 0) return { columns: [], rows: [] };

    const firstItem = items[0];
    let columns: string[] = [];
    
    // Detect if it's a Business Rule list
    if (firstItem.name !== undefined && (firstItem.description !== undefined || firstItem.type !== undefined)) {
      columns = ["Rule Name", "Description", "Type"];
      const rows = items.map(item => ({
        "Rule Name": item.name,
        "Description": item.description || "No description",
        "Type": item.type || "N/A"
      }));
      return { columns, rows };
    }

    // Default to Member List
    columns = ["Member Name", "Parent Member", "Data Storage", "Alias"];
    const rows = items.map(item => ({
      "Member Name": item.name,
      "Parent Member": item.parent || "None",
      "Data Storage": item.dataStorage || "N/A",
      "Alias": item.alias || "None"
    }));

    return { columns, rows };
  }

  /**
   * Helper to strip unwanted fields before LLM sees data.
   * Now returns the pre-formatted tabular data to ensure LLM consistency.
   */
  stripUnwantedFields(rawData: any, pov?: any): any {
    if (!rawData) return null;

    // Use the transformation logic to provide a clean table structure to the LLM
    const transformed = this.transformNSPBResponse(rawData, pov);
    
    // If it's a valid table, return it (minus the 'type' field which the LLM will add)
    if (!('error' in transformed)) {
      return transformed;
    }

    // Fallback if transformation failed but it's some other Oracle response
    return rawData.items || rawData.detail || rawData.message || rawData;
  }
}

export const transformationService = new TransformationService();
