import oracleClient from '../services/oracleClient.js';
import logger from '../services/logger.js';
import { transformationService } from '../services/transformationService.js';
import { mathAgent } from '../llm/mathAgent.js';
import { aliasResolver } from '../services/aliasResolver.js';

const DEFAULT_POV: Record<string, string> = {
  "Years": "FY25",
  "Period": "YearTotal",
  "Subsidiary": "NSP_Total Subsidiary",
  "Region": "Total Region",
  "Location": "NSP_Total Location",
  "Relationship": "NSP_Total Relationship",
  "Tracker": "NSP_Amount",
  "Currency": "EUR_Reporting",
  "Department": "TD",
  "Class": "TC",
  "Vertical": "TV",
  "Scenario": "NSP_Actual",
  "Version": "NSP_Base",
  "Account": "NFS_Income"
};

/**
 * Intelligent Dimension Resolver (Case-Insensitive)
 */
const resolveDim = (member: string): string => {
  let m = member.toLowerCase();
  
  // Strip hierarchy functions (e.g. IDescendants(NFS_Income) -> nfs_income)
  if (m.includes('descendants(')) {
    const match = m.match(/\(([^)]+)\)/);
    if (match) m = match[1].replace(/["']/g, '').trim();
  }

  // Years: Exactly 4 digits starting with 20 or 21 (e.g. 2024, 2025) or starting with FY
  if (m.startsWith('fy') || /^(20|21)\d{2}$/.test(m)) return 'Years';
  if (['oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'begbalance', 'tp10', 'tp11', 'tp12', 'tp01', 'tp02', 'tp03', 'tp04', 'tp05', 'tp06', 'tp07', 'tp08', 'tp09'].includes(m) || m.startsWith('tp')) return 'Period';
  if (m.startsWith('nfs_') || ['income', 'expense', 'revenue', 'sales', 'cost of sales'].includes(m) || /^\d{5,}$/.test(m)) return 'Account';
  if (m === 'tc' || m.startsWith('tc') || m.includes('class')) return 'Class';
  if (m === 'td' || m.startsWith('td') || m.includes('dept') || m.includes('department') || m === 'operations' || m === 'marketing') return 'Department';
  if (m.startsWith('tv') || m.includes('vertical')) return 'Vertical';
  if (m.includes('sub') || m.includes('subsidiary') || m === 'all subsidiaries') return 'Subsidiary';
  if (m.includes('region')) return 'Region';
  if (m.includes('loc') || m.includes('location')) return 'Location';
  if (m.includes('curr') || m.includes('currency')) return 'Currency';
  if (['actual', 'forecast', 'plan', 'working', 'final', 'budget', 'bud'].includes(m) || m.startsWith('nsp_actual') || m.startsWith('nsp_forecast') || m.startsWith('nsp_budget')) return 'Scenario';

  // Match periods like YearTotal, Q1, Q2, etc.
  if (m === 'yeartotal' || m.match(/^q[1-4]$/)) return 'Period';

  // Try to match against DEFAULT_POV keys case-insensitively
  for (const dim of Object.keys(DEFAULT_POV)) {
    if (m === dim.toLowerCase()) return dim;
  }
  
  // Final fallback mappings for common aliases
  if (m.includes('income') || m.includes('expense') || m.includes('revenue') || m.includes('sales') || m.includes('profit') || m.includes('tax')) return 'Account';
  if (m === 'year' || m === 'fy') return 'Years';

  return 'Unknown';
};

/**
 * Normalizes member names from 'Friendly' or Alias names to Technical IDs.
 */
const normalizeMember = (m: string, dim: string): string => {
  if (!m || typeof m !== 'string') return m;
  const lower = m.toLowerCase();

  // Department normalization
  if (dim === 'Department') {
    if (lower === 'operations') return 'D1AAE - OPERATIONS';
    if (lower === 'sales') return 'D3ABK - SALES';
    if (lower === 'marketing') return 'D3ABD - MARKETING';
    if (lower === 'total department' || lower === 'all departments') return 'TD';
  }

  // Subsidiary/Region/Location normalization
  if (dim === 'Subsidiary' && (lower === 'total subsidiary' || lower === 'all subsidiaries')) return 'NSP_Total Subsidiary';
  if (dim === 'Region' && (lower === 'total region' || lower === 'all regions')) return 'Total Region';
  if (dim === 'Location' && (lower === 'total location' || lower === 'all locations')) return 'NSP_Total Location';
  if (dim === 'Vertical' && (lower === 'total vertical' || lower === 'all verticals')) return 'TV';

  // Account normalization
  if (dim === 'Account') {
    if (lower === 'income' || lower === 'revenue') return 'NFS_Income';
    if (lower === 'expense' || lower === 'expenses') return 'NFS_Expense';
    if (lower === 'cogs' || lower === 'cost of sales') return 'NFS_Cost of Sales';
  }

  // Scenario normalization
  if (dim === 'Scenario') {
    if (lower === 'actual') return 'NSP_Actual';
    if (lower === 'forecast' || lower === 'fcst') return 'NSP_Forecast';
    if (lower === 'budget' || lower === 'bud' || lower === 'plan') return 'NSP_Budget';
  }

  // Period normalization (Common Aliases -> Technical TP Codes)
  if (dim === 'Period') {
    const periodMap: Record<string, string> = {
      'jan': 'TP01', 'feb': 'TP02', 'mar': 'TP03', 'apr': 'TP04', 'may': 'TP05', 'jun': 'TP06',
      'jul': 'TP07', 'aug': 'TP08', 'sep': 'TP09', 'oct': 'TP10', 'nov': 'TP11', 'dec': 'TP12',
      'yeartotal': 'YearTotal', 'begbalance': 'BegBalance'
    };
    if (periodMap[lower]) return periodMap[lower];
  }

  return m;
};

/**
 * Cleans a member name for use in POV (removes hierarchy functions)
 */
const sanitizePovMember = (m: string): string => {
  if (typeof m !== 'string') return m;
  if (m.includes('Descendants(')) {
    const match = m.match(/\("?([^")]+)"?\)/);
    return match ? match[1] : m;
  }
  return m;
};

export const exportDataSlice = async (rawArgs: any) => {
  const planType = rawArgs.planType || "NSP_NFS";
  try {
    const autoParse = (val: any) => {
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (e) { return [val]; }
      }
      return val;
    };

    const grid: any = { 
      pov: { dimensions: [], members: [] }, 
      columns: [], 
      rows: [], 
      suppressMissingRows: rawArgs.suppressMissingRows !== undefined ? rawArgs.suppressMissingRows : true, 
      suppressMissingColumns: rawArgs.suppressMissingColumns !== undefined ? rawArgs.suppressMissingColumns : true 
    };
    const usedDims = new Set<string>();

    const processSection = (section: 'rows' | 'columns' | 'pov', input: any) => {
      if (!input) return;
      const parsed = autoParse(input);
      if (!parsed) return;
      if (Array.isArray(parsed)) {
        const groups: Record<string, string[]> = {};
        parsed.forEach((m: any) => {
          if (typeof m === 'string' && m.includes(',') && !m.includes('IDescendants') && !m.includes('ILvl0')) {
            // INTERSECTION CASE: "Scenario:Actual, Years:FY25, Period:Jan"
            const parts = m.split(',').map(p => p.trim());
            const dims: string[] = [];
            const mems: string[][] = [];
            parts.forEach(part => {
              let explicitDim: string | null = null;
              let mem = part;
              if (part.includes(':')) {
                const [d, ...rest] = part.split(':');
                explicitDim = d.trim();
                mem = rest.join(':').trim();
              }
              const dim = explicitDim || resolveDim(mem);
              if (dim !== 'Unknown') {
                dims.push(dim);
                mems.push([mem]);
                usedDims.add(dim);
              }
            });
            if (dims.length > 0) {
              grid[section].push({ dimensions: dims, members: mems });
            }
            return;
          }

          let explicitDim: string | null = null;
          // Sanitize 'Dim:Member' format the AI sometimes generates
          if (typeof m === 'string' && m.includes(':') && !m.startsWith('IDescendants') && !m.startsWith('ILvl0')) {
            const parts = m.split(':');
            explicitDim = parts[0].trim();
            m = parts.slice(1).join(':').trim(); // support ILvl0Descendants(...) as member
          }
          const dim = explicitDim || resolveDim(m);
          if (dim === 'Unknown') return; // prevent Oracle 400 errors if dimension is completely unmappable
          
          if (usedDims.has(dim) && section !== 'columns') return; // For columns, we might allow multiple groups
          if (!groups[dim]) groups[dim] = [];
          groups[dim].push(m);
        });
        
        if (Object.keys(groups).length > 0) {
          Object.entries(groups).forEach(([dim, members]) => {
            // Guard: if the member value IS the dimension name (or a generic 'Total' guess), use the default member instead
            const cleanedMembers = members.map(m => {
              const lowerM = typeof m === 'string' ? m.toLowerCase() : '';
              const lowerDim = dim.toLowerCase();
              if (lowerM === lowerDim || lowerM === `total ${lowerDim}` || lowerM === `all ${lowerDim}` || lowerM === `all ${lowerDim}s`) {
                return DEFAULT_POV[dim] || m;
              }
              return normalizeMember(m, dim);
            }).filter(Boolean);
            const finalMembers = cleanedMembers.length > 0 ? cleanedMembers : [DEFAULT_POV[dim] || dim];

            if (section === 'pov') {
              grid.pov.dimensions.push(dim);
              // Enforce single member in POV and strip functions
              grid.pov.members.push([sanitizePovMember(finalMembers[0])]);
            } else if (section === 'columns') {
              // MERGE Logic for Columns (Array case) - only if they aren't already handled as intersections
              if (grid.columns.length === 0) {
                grid.columns.push({ dimensions: [dim], members: [finalMembers] });
              } else {
                // If the dimension is already in the first column group, add to its members
                const dimIdx = grid.columns[0].dimensions.indexOf(dim);
                if (dimIdx !== -1) {
                  grid.columns[0].members[dimIdx] = Array.from(new Set([...grid.columns[0].members[dimIdx], ...finalMembers]));
                } else {
                  grid.columns[0].dimensions.push(dim);
                  grid.columns[0].members.push(finalMembers);
                }
              }
            } else {
              grid[section].push({ dimensions: [dim], members: [finalMembers] });
            }
            usedDims.add(dim);
          });
        }
      } else if (typeof parsed === 'object' && Array.isArray(parsed.dimensions) && Array.isArray(parsed.members)) {
        // Handle native Oracle format { dimensions: ["Class"], members: [["Total Class"]] }
        parsed.dimensions.forEach((dim: string, i: number) => {
          if (usedDims.has(dim)) return;
          const membersArray = Array.isArray(parsed.members[i]) ? parsed.members[i] : [parsed.members[i]];
          
          // Apply sanitization for generic "Total <Dim>" inputs generated by LLM
          const sanitizedMembers = membersArray.map((m: any) => {
            if (typeof m !== 'string') return m;
            const lowerM = m.toLowerCase();
            const lowerDim = dim.toLowerCase();
            if (lowerM === lowerDim || lowerM === `total ${lowerDim}` || lowerM === `all ${lowerDim}` || lowerM === `all ${lowerDim}s`) {
              return DEFAULT_POV[dim] || m;
            }
            return normalizeMember(m, dim);
          });

          if (section === 'pov') {
            grid.pov.dimensions.push(dim);
            grid.pov.members.push([sanitizePovMember(sanitizedMembers[0])]); // Enforce single member and strip functions
          } else if (section === 'columns') {
            if (grid.columns.length === 0) {
              grid.columns.push({ dimensions: [dim], members: [sanitizedMembers] });
            } else {
              grid.columns[0].dimensions.push(dim);
              grid.columns[0].members.push(sanitizedMembers);
            }
          } else {
            grid[section].push({ dimensions: [dim], members: [sanitizedMembers] });
          }
          usedDims.add(dim);
        });
      } else if (typeof parsed === 'object') {
        Object.entries(parsed).forEach(([dim, members]) => {
          if (usedDims.has(dim)) return; // Skip if already assigned
          let membersArray = Array.isArray(members) ? members : [members];
          
          // Guard: sanitize generic guesses
          membersArray = membersArray.map(m => {
            if (typeof m !== 'string') return m;
            const lowerM = m.toLowerCase();
            const lowerDim = dim.toLowerCase();
            if (lowerM === lowerDim || lowerM === `total ${lowerDim}` || lowerM === `all ${lowerDim}` || lowerM === `all ${lowerDim}s`) {
              return DEFAULT_POV[dim] || m;
            }
            return m;
          });

          // Fallback if AI sent empty array, wildcard, or just the dimension name itself
          if (membersArray.length === 0 || 
              membersArray.includes("*") || 
              membersArray.map(m => typeof m === 'string' ? m.toLowerCase() : '').includes("all")) {
            membersArray = [DEFAULT_POV[dim] || "N/A"];
          }
          
          if (section === 'pov') {
            grid.pov.dimensions.push(dim);
            // ENFORCE SINGLE MEMBER IN POV: Oracle only allows one member per POV dimension
            grid.pov.members.push([sanitizePovMember(membersArray[0])]);
          } else if (section === 'columns') {
            // MERGE Logic for Columns: Oracle requires all column dims in one group for grouping
            if (grid.columns.length === 0) {
              grid.columns.push({ dimensions: [dim], members: [membersArray] });
            } else {
              grid.columns[0].dimensions.push(dim);
              grid.columns[0].members.push(membersArray);
            }
          } else {
            grid[section].push({ dimensions: [dim], members: [membersArray] });
          }
          usedDims.add(dim);
        });
      }
    };

    // --- INCOME STATEMENT OVERRIDE ---
    // The Income Statement layout is ALWAYS hardcoded. We never let the AI choose
    // the Period expression or Account hierarchy root - these are fixed by design.
    // However, if the user explicitly asks for a pivot (e.g. "by Department"), 
    // OR if they specify their own rows, we bypass this to allow the custom logic.
    const isIncomeStatement = !rawArgs.skipLayoutEnforcement && !rawArgs.pivotDim && !rawArgs.rows;

    if (isIncomeStatement) {
      logger.info('Income Statement mode: Forcing Account into Rows, Period/Year/Scenario into Columns.');

      // HARDCODED Income Statement Layout — never let the AI override these
      // Account: Full P&L hierarchy
      const accountRoot = 'IDescendants(NFS_Income)';
      grid.rows = [{ dimensions: ['Account'], members: [[accountRoot]] }];
      usedDims.add('Account'); // Mark Account as used so it NEVER goes into POV

      // Columns: Scenario > Years > Period (all months via IDescendants)
      // IDescendants(YearTotal) expands to Jan, Feb, ..., Dec, YearTotal
      const scenario = DEFAULT_POV['Scenario'];
      // Year: try to extract from pov, years arg, or prompt. Also handle 'Years:FY25' format.
      const year = (() => {
        const povData = autoParse(rawArgs.pov);
        if (povData) {
          if (typeof povData === 'object' && !Array.isArray(povData) && povData['Years']) {
            return Array.isArray(povData['Years']) ? povData['Years'][0] : povData['Years'];
          }
          if (Array.isArray(povData)) {
            const yearEntry = povData.find((s: string) => typeof s === 'string' && s.toLowerCase().startsWith('year'));
            if (yearEntry) return yearEntry.includes(':') ? yearEntry.split(':')[1].trim() : yearEntry;
          }
        }
        const yr = autoParse(rawArgs.years);
        if (yr) return Array.isArray(yr) ? yr[0] : yr;
        // Check if columns arg contains a year like 'Years:FY25'
        const colRaw = rawArgs.columns;
        if (Array.isArray(colRaw)) {
          const yEntry = colRaw.find((s: string) => typeof s === 'string' && /^(FY|20|21)\d{2,}/i.test(s.split(':').pop() || ''));
          if (yEntry) return yEntry.includes(':') ? yEntry.split(':')[1].trim() : yEntry;
        }
        return rawArgs.year || DEFAULT_POV['Years'];
      })();
      const period = 'IDescendants(YearTotal)';

      // Period goes to columns
      grid.columns.push({ dimensions: ['Period'], members: [[period]] });
      usedDims.add('Period');

      // Scenario and Years go to POV
      grid.pov.dimensions.push('Scenario', 'Years');
      grid.pov.members.push([scenario], [year]);
      usedDims.add('Scenario'); usedDims.add('Years');


      // Step 3: Put the filter dimension (e.g. Subsidiary) in POV with its default root member
      // Guard: pivotDim may be undefined if the LLM didn't provide it
      const filterDimInput = (rawArgs.pivotDim ?? '').toLowerCase();
      if (filterDimInput && filterDimInput !== 'undefined') {
        for (const dim of Object.keys(DEFAULT_POV)) {
          if (filterDimInput.includes(dim.toLowerCase())) {
            const povData = autoParse(rawArgs.pov);
            let filterMember = DEFAULT_POV[dim];
            if (povData && povData[dim]) {
              const m = Array.isArray(povData[dim]) ? povData[dim][0] : povData[dim];
              if (m && m !== dim && m !== '*' && m !== 'undefined') filterMember = m;
            }
            grid.pov.dimensions.push(dim);
            grid.pov.members.push([filterMember]);
            usedDims.add(dim);
            break;
          }
        }
      }

      // Step 4: Remaining POV dims
      processSection('pov', rawArgs.pov);

    } else if (rawArgs.pivotDim) {
      // --- ACCOUNT PIVOT (Normal pivotDim: 'Account') ---
      const pivotDimInput = rawArgs.pivotDim.toLowerCase();
      let targetDim = "";
      let pivotMember = "";

      // 1. Find the target dimension and its current member (or default)
      // Check against DEFAULT_POV keys case-insensitively
      for (const dim of Object.keys(DEFAULT_POV)) {
        if (pivotDimInput.includes(dim.toLowerCase())) {
          targetDim = dim;
          pivotMember = DEFAULT_POV[dim];
          break;
        }
      }
      
      if (targetDim) {
        logger.info(`Pivoting: Moving ${targetDim} to Rows and Account to POV`);
        
        // Find the best member to use as the root for hierarchy expansion
        const povData = autoParse(rawArgs.pov);
        const rowData = autoParse(rawArgs.rows || rawArgs.accounts);
        
        if (povData && povData[targetDim]) {
          pivotMember = Array.isArray(povData[targetDim]) ? povData[targetDim][0] : povData[targetDim];
        } else if (rowData) {
          // If the target dimension is mentioned in rows/accounts, use that as the root
          const items = Array.isArray(rowData) ? rowData : [rowData];
          const match = items.find(m => resolveDim(m) === targetDim);
          if (match) pivotMember = match;
        }

        // If still no member found, or it's just the dimension name, use the default from POV
        if (!pivotMember || pivotMember.toLowerCase() === targetDim.toLowerCase()) {
          pivotMember = DEFAULT_POV[targetDim];
        }

        // Action 1: Set Rows to the Pivot Dimension (with Hierarchy expansion)
        let formattedPivotMember = (pivotMember.includes(' ') || pivotMember.includes('-')) ? `"${pivotMember}"` : pivotMember;
        
        // Final safeguard for common root members that AI might misname
        if (targetDim === 'Subsidiary' && (pivotMember.toLowerCase().includes('all subsidiar') || pivotMember.toLowerCase() === 'subsidiary')) {
          formattedPivotMember = '"NSP_Total Subsidiary"';
        } else if (targetDim === 'Region' && (pivotMember.toLowerCase() === 'region' || pivotMember.toLowerCase().includes('all region'))) {
          formattedPivotMember = '"Total Region"';
        } else if (targetDim === 'Location' && (pivotMember.toLowerCase() === 'location' || pivotMember.toLowerCase().includes('all location'))) {
          formattedPivotMember = '"NSP_Total Location"';
        } else if (targetDim === 'Vertical' && (pivotMember.toLowerCase() === 'vertical' || pivotMember.toLowerCase() === 'tv')) {
          formattedPivotMember = 'TV';
        }
        
        grid.rows = [{ dimensions: [targetDim], members: [[`ILvl0Descendants(${formattedPivotMember})`]] }];
        usedDims.add(targetDim);

        // Action 2: Move Account to POV (ONLY if we aren't already pivoting by Account)
        if (targetDim !== "Account") {
          let accounts = autoParse(rawArgs.rows || rawArgs.accounts || DEFAULT_POV["Account"]);
          if (!accounts || (Array.isArray(accounts) && (accounts.length === 0 || accounts.includes("*")))) accounts = [DEFAULT_POV["Account"]];
          
          const accountArray = Array.isArray(accounts) ? accounts : [accounts];
          grid.pov.dimensions.push("Account");
          // ENFORCE SINGLE MEMBER IN POV: Oracle only allows one member per POV dimension
          grid.pov.members.push([sanitizePovMember(accountArray[0])]);
          usedDims.add("Account");
        }

        // Action 3: Process remaining POV/Columns normally (skipping Account and targetDim)
        processSection('columns', rawArgs.columns || rawArgs.periods);
        processSection('pov', rawArgs.pov);
      } else {
        // Fallback to normal processing if targetDim not found
        processSection('rows', rawArgs.rows);
        processSection('columns', rawArgs.columns);
        processSection('pov', rawArgs.pov);
      }
    } else {
      // Normal processing (no pivot)
      if (!rawArgs.rows && rawArgs.accounts) processSection('rows', rawArgs.accounts);
      if (!rawArgs.columns && rawArgs.periods) processSection('columns', rawArgs.periods);
      if (!rawArgs.pov && rawArgs.years) processSection('pov', rawArgs.years);

      processSection('rows', rawArgs.rows);
      processSection('columns', rawArgs.columns);
      processSection('pov', rawArgs.pov);
    }

    // Add remaining defaults to POV
    Object.entries(DEFAULT_POV).forEach(([dim, member]) => {
      if (!usedDims.has(dim)) {
        grid.pov.dimensions.push(dim);
        grid.pov.members.push([member]);
        usedDims.add(dim);
      } else {
        // Also check if any dimension already in usedDims has an empty member array in POV
        const povIdx = grid.pov.dimensions.indexOf(dim);
        if (povIdx !== -1 && grid.pov.members[povIdx].length === 0) {
          grid.pov.members[povIdx] = [member];
        }
      }
    });

    // Final check for mandatory Year/Period if they were somehow missed
    ['Years', 'Period'].forEach(dim => {
      if (!usedDims.has(dim)) {
        grid.pov.dimensions.push(dim);
        grid.pov.members.push([DEFAULT_POV[dim]]);
        usedDims.add(dim);
      }
    });

    // --- AXIS REFINEMENT ---
    // At this point, we have built the grid. Now we apply critical layout rules
    // to ensure Oracle compatibility (e.g. Period/Years on Columns).
    if (!rawArgs.skipLayoutEnforcement) {
      // --- CRITICAL RULE: Period must ALWAYS be in Columns ---
      const periodIdx = grid.pov.dimensions.indexOf("Period");
      if (periodIdx !== -1) {
        const dim = grid.pov.dimensions.splice(periodIdx, 1)[0];
        const members = grid.pov.members.splice(periodIdx, 1)[0];
        if (grid.columns.length === 0) {
          grid.columns.push({ dimensions: [dim], members: [members] });
        } else {
          grid.columns[0].dimensions.unshift(dim);
          grid.columns[0].members.unshift(members);
        }
      }

      // --- REFINEMENT: ONLY Period stays in Columns ---
      // If Years or Scenario are in Columns, move them to POV
      if (grid.columns.length > 0) {
        const colGroup = grid.columns[0];
        ['Years', 'Scenario'].forEach(dim => {
          const idx = colGroup.dimensions.indexOf(dim);
          if (idx !== -1) {
            const members = colGroup.members[idx];
            // Remove from columns
            colGroup.dimensions.splice(idx, 1);
            colGroup.members.splice(idx, 1);
            // Add to POV if not already there
            if (!grid.pov.dimensions.includes(dim)) {
              grid.pov.dimensions.push(dim);
              grid.pov.members.push([members[0]]);
            }
          }
        });
      }
    }

    // --- DIMENSION ISOLATION PASS: Ensure each dimension exists on EXACTLY ONE axis ---
    // Priority: Rows > Columns > POV. This prevents 400 errors if AI duplicates dimensions.
    const finalUsedDims = new Set<string>();

    grid.rows.forEach((rGroup: any) => {
      rGroup.dimensions.forEach((d: string) => finalUsedDims.add(d));
    });

    grid.columns.forEach((cGroup: any) => {
      const filteredDims: string[] = [];
      const filteredMembers: any[] = [];
      cGroup.dimensions.forEach((d: string, i: number) => {
        if (!finalUsedDims.has(d)) {
          filteredDims.push(d);
          filteredMembers.push(cGroup.members[i]);
          finalUsedDims.add(d);
        } else {
          logger.warn(`Removing duplicated dimension "${d}" from Columns (already in Rows)`);
        }
      });
      cGroup.dimensions = filteredDims;
      cGroup.members = filteredMembers;
    });

    const filteredPovDims: string[] = [];
    const filteredPovMembers: any[] = [];
    grid.pov.dimensions.forEach((d: string, i: number) => {
      if (!finalUsedDims.has(d)) {
        filteredPovDims.push(d);
        filteredPovMembers.push(grid.pov.members[i]);
        finalUsedDims.add(d);
      } else {
        logger.warn(`Removing duplicated dimension "${d}" from POV (already in Rows or Columns)`);
      }
    });
    grid.pov.dimensions = filteredPovDims;
    grid.pov.members = filteredPovMembers;

    // Scrub invalid member values
    grid.pov.members = grid.pov.members.map((memberArr: string[], i: number) => {
      const dim = grid.pov.dimensions[i];
      return memberArr.map((m: string) => {
        if (!m || m === 'undefined' || m === 'null') return DEFAULT_POV[dim] || 'Unknown';
        return m;
      });
    });

    if (grid.columns.length === 0 || grid.columns[0].dimensions.length === 0) {
      grid.columns = [{ dimensions: ['Period'], members: [[DEFAULT_POV['Period']]] }];
    }
    if (grid.rows.length === 0 || grid.rows[0].dimensions.length === 0) {
      grid.rows = [{ dimensions: ['Account'], members: [[DEFAULT_POV['Account']]] }];
    }

    logger.info('Executing Smart Data Export...', { grid });

    // DEBUG: Write grid to file for analysis
    try {
      const fs = await import('fs');
      fs.writeFileSync('debug_grid.json', JSON.stringify({ planType, grid }, null, 2));
    } catch (e) { 
      logger.error('Failed to write debug grid', { error: (e as Error).message });
    }

    // 5. CALL ORACLE
    const response = await oracleClient.post(`/plantypes/${planType}/exportdataslice`, {
      gridDefinition: grid,
      exportPlanningData: false
    });

    const rawData = response.data;

    // --- DIMENSION-AWARE ALIAS RESOLUTION ---
    const dimToMembers = new Map<string, Set<string>>();
    const addMember = (dim: string, m: string) => {
      if (!dimToMembers.has(dim)) dimToMembers.set(dim, new Set());
      dimToMembers.get(dim)!.add(m);
    };

    // 1. Collect from POV
    grid.pov.dimensions.forEach((dim: string, i: number) => {
      const members = grid.pov.members[i];
      if (members) members.forEach((m: string) => addMember(dim, m));
      addMember(dim, dim); // Also resolve dimension name itself
    });

    // 2. Collect from Rows
    if (rawData.rows && rawData.rows.length > 0) {
      const rowDims = grid.rows[0].dimensions; // Technical dimensions in rows
      rawData.rows.forEach((row: any) => {
        if (row.headers) {
          row.headers.forEach((m: string, i: number) => {
            const dim = rowDims[i] || rowDims[0];
            addMember(dim, m);
          });
        }
      });
      rowDims.forEach((d: string) => addMember(d, d));
    }

    // 3. Collect from Columns
    if (rawData.columns && rawData.columns.length > 0) {
      const colDims = grid.columns[0].dimensions;
      if (Array.isArray(rawData.columns[0])) {
        // Simple array of arrays format: rawData.columns[row][col]
        rawData.columns.forEach((row: string[], rIdx: number) => {
          const dim = colDims[rIdx] || colDims[0];
          row.forEach((m: string) => addMember(dim, m));
        });
      } else {
        // Object format: rawData.columns[col].headers[dimIndex]
        rawData.columns.forEach((col: any) => {
          const headers = Array.isArray(col) ? col : (col.headers || []);
          headers.forEach((m: string, i: number) => {
            const dim = colDims[i] || colDims[0];
            addMember(dim, m);
          });
        });
      }
      colDims.forEach((d: string) => addMember(d, d));
    }

    // 4. Resolve all dimensions in parallel
    const aliasPromises = Array.from(dimToMembers.entries()).map(async ([dim, members]) => {
      return aliasResolver.resolveAliases(dim, Array.from(members));
    });
    
    const aliasMaps = await Promise.all(aliasPromises);
    const fullAliasMap: Record<string, string> = Object.assign({}, ...aliasMaps);

    const rowDims = grid.rows.length > 0 ? grid.rows[0].dimensions : [];
    const transformedData: any = transformationService.transformNSPBResponse(rawData, grid.pov, fullAliasMap, rowDims);
    
    return { success: true, data: transformedData };
  } catch (error: any) {
    logger.error('Export tool failed', { error: error.message });
    
    // Attempt to fetch actual dimensions to help troubleshoot 400 errors
    let availableDims: string[] = [];
    try {
      // Try multiple paths
      let dimRes = await oracleClient.get('/dimensions').catch(() => null);
      if (!dimRes) dimRes = await oracleClient.get(`/plantypes/${planType}/dimensions`).catch(() => null);
      
      availableDims = dimRes?.data?.items?.map((i: any) => i.name) || [];
    } catch (e) {}

    return { 
      success: false, 
      error: error.message,
      details: error.response?.data || error.message,
      availableDimensions: availableDims.length > 0 ? availableDims : undefined,
      payloadSent: (error.config?.data ? JSON.parse(error.config.data) : null)
    };
  }
};
