/**
 * segmentOverview.ts
 * Graph-based Financial Planning & Analysis (FP&A) Agent tool.
 * Implements a PnL Segment Overview report using dependency graphs.
 */
import { exportDataSlice } from './exportDataSlice.js';
import { graphEngine, GraphModel, GraphNode } from '../services/graphEngine.js';
import logger from '../services/logger.js';

// ─── Row Graph Model (Hierarchy + Formulas) ──────────────────────────────────
const ROW_GRAPH: GraphModel = {
  nodes: {
    "REV_TOTAL": {
      id: "REV_TOTAL", type: "aggregate", label: "Revenues", account: "REVENUES", vertical: "Total Vertical", level: 0,
      children: ["REV_CASINO", "REV_SPORT"]
    },
    "REV_CASINO": {
      id: "REV_CASINO", type: "aggregate", label: "Total Casino", account: "REVENUES", vertical: "S2 - TOTAL CASINO", level: 1,
      children: ["REV_REG_CASINO", "REV_SWEEPSTAKES", "REV_OTHER_CASINO"]
    },
    "REV_REG_CASINO": {
      id: "REV_REG_CASINO", type: "data", label: "Regulated Casino", account: "REVENUES", vertical: "S2.1 - REGULATED CASINO", level: 2
    },
    "REV_SWEEPSTAKES": {
      id: "REV_SWEEPSTAKES", type: "data", label: "Social Sweepstakes Cash", account: "REVENUES", vertical: "V7", level: 2
    },
    "REV_OTHER_CASINO": {
      id: "REV_OTHER_CASINO", type: "data", label: "Other Casino", account: "REVENUES", vertical: "S2.2 - OTHER CASINO", level: 2
    },
    "REV_SPORT": {
      id: "REV_SPORT", type: "data", label: "Total Sport", account: "REVENUES", vertical: "S1 - TOTAL SPORT", level: 1
    },
    "DIRECT_COST": {
      id: "DIRECT_COST", type: "data", label: "Total Direct Cost", account: "Direct costs", vertical: "Total Vertical", level: 0
    },
    "GROSS_MARGIN": {
      id: "GROSS_MARGIN", type: "calc", label: "Gross Margin", account: "Gross Margin", vertical: "Total Vertical", level: 0,
      operation: "subtract", inputs: ["REV_TOTAL", "DIRECT_COST"]
    },
    "GM_PCT": {
      id: "GM_PCT", type: "calc", label: "GM%", account: "GM%", vertical: "Total Vertical", level: 0,
      operation: "divide", inputs: ["GROSS_MARGIN", "REV_TOTAL"], format: "percentage"
    },
    "PERSONNEL_TOTAL": {
      id: "PERSONNEL_TOTAL", type: "aggregate", label: "Total Personnel Expenses", account: "Personnel Expenses", vertical: "Total Vertical", level: 0,
      children: ["PERSONNEL_PRODUCT", "PERSONNEL_TECH", "PERSONNEL_FINLEGAL", "PERSONNEL_OTHER"]
    },
    "PERSONNEL_PRODUCT": {
      id: "PERSONNEL_PRODUCT", type: "data", label: "Product", account: "Product", vertical: "Total Vertical", level: 1
    },
    "PERSONNEL_TECH": {
      id: "PERSONNEL_TECH", type: "data", label: "Tech.", account: "Tech.", vertical: "Total Vertical", level: 1
    },
    "PERSONNEL_FINLEGAL": {
      id: "PERSONNEL_FINLEGAL", type: "data", label: "Finance & Legal", account: "Finance & Legal", vertical: "Total Vertical", level: 1
    },
    "PERSONNEL_OTHER": {
      id: "PERSONNEL_OTHER", type: "data", label: "Other", account: "Other", vertical: "Total Vertical", level: 1
    },
    "OTHER_OPEX": {
      id: "OTHER_OPEX", type: "data", label: "Other Operating Expenses", account: "Other Operating Expenses", vertical: "Total Vertical", level: 0
    },
    "EBITDA": {
      id: "EBITDA", type: "calc", label: "Adjusted EBITDA", account: "Adjusted EBITDA", vertical: "Total Vertical", level: 0,
      operation: "subtract", inputs: ["GROSS_MARGIN", "PERSONNEL_TOTAL", "OTHER_OPEX"]
    },
    "EBITDA_PCT": {
      id: "EBITDA_PCT", type: "calc", label: "Adjusted EBITDA %", account: "Adjusted EBITDA %", vertical: "Total Vertical", level: 0,
      operation: "divide", inputs: ["EBITDA", "REV_TOTAL"], format: "percentage"
    },
    "CAPEX": {
      id: "CAPEX", type: "data", label: "CAPEX Activity", account: "CAPEX Activity", vertical: "Total Vertical", level: 0
    }
  }
};

// ─── Column Graph Model (Scenarios + Variances) ──────────────────────────────
const COL_GRAPH: GraphModel = {
  nodes: {
    "Actual": { id: "Actual", type: "data", scenario: "NSP_Actual" },
    "Fcst": { id: "Fcst", type: "data", scenario: "NSP_Forecast" },
    "Budget": { id: "Budget", type: "data", scenario: "NSP_Budget" },
    "LY": { id: "LY", type: "data", scenario: "NSP_Actual_PriorYear" }, // Custom flag for LY
    "vsFcst": { id: "vsFcst", type: "calc", operation: "subtract", inputs: ["Actual", "Fcst"] },
    "vsBUD": { id: "vsBUD", type: "calc", operation: "subtract", inputs: ["Actual", "Budget"] },
    "vsLY": { id: "vsLY", type: "calc", operation: "subtract", inputs: ["Actual", "LY"] },
    "vsLY_pct": { id: "vsLY_pct", type: "calc", operation: "divide", inputs: ["vsLY", "LY"], format: "percentage" }
  }
};

export const segmentOverview = async ({ periodLabel, filterDimensions, pov }: { 
  periodLabel: string; 
  filterDimensions: string[]; 
  pov: Record<string, string>;
}) => {
  try {
    let [monthName, yearShort] = periodLabel.split('-');
    yearShort = yearShort || '25';
    
    // Override with POV if available from the UI dropdowns
    if (pov && pov['Years']) {
      const match = pov['Years'].match(/\d+/);
      if (match) yearShort = match[0];
    }
    
    const tpToMonth = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (pov && pov['Period']) {
      const p = pov['Period'];
      if (p.toLowerCase().startsWith('tp')) {
        const idx = parseInt(p.substring(2)) - 1;
        if (idx >= 0 && idx < 12) monthName = tpToMonth[idx];
      } else {
        const monthIdx = tpToMonth.findIndex(m => m.toLowerCase() === p.toLowerCase());
        if (monthIdx !== -1) monthName = tpToMonth[monthIdx];
      }
    }

    const year = `FY${yearShort}`;
    const priorYear = `FY${parseInt(yearShort) - 1}`;
    
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const targetMonthIdx = months.indexOf(monthName);
    if (targetMonthIdx === -1) throw new Error(`Invalid month: ${monthName}`);
    
    const monthToTp = (m: string) => `TP${months.indexOf(m) + 1}`;
    const targetTp = monthToTp(monthName);
    const ytdMonths = months.slice(0, targetMonthIdx + 1);

    // 1. COLLECT DATA NODES
    const rowDataNodes = graphEngine.getDataNodes(ROW_GRAPH);
    const colDataNodes = graphEngine.getDataNodes(COL_GRAPH);

    // 2. BUILD BATCHED MCP PAYLOAD
    // We need to fetch each leaf Row (Account+Vertical) X each leaf Column (Scenario) X each Period (MTD + Jan..MTD for YTD)
    // To minimize calls, we'll fetch all leaf rows for all scenarios for all periods in one slice.
    
    const uniqueAccounts = [...new Set(rowDataNodes.map(n => n.account!))];
    const uniqueVerticals = [...new Set(rowDataNodes.map(n => n.vertical!))];
    
    // Rows: Intersection of Account and Vertical
    const accountsInRows = rowDataNodes.map(n => `Account:${n.account}, Vertical:${n.vertical}`);
    
    const ytdPeriods = ytdMonths.map(monthToTp);
    const allScenarios = ["NSP_Actual", "NSP_Forecast", "NSP_Budget"];
    const allYears = [year, priorYear];
    const allPeriods = [...new Set([targetTp, ...ytdPeriods])];

    const columnConfig = {
      Scenario: allScenarios,
      Years: allYears,
      Period: allPeriods
    };

    logger.info(`[/api/segment-overview] Fetching data product for ${accountsInRows.length} rows and ${allScenarios.length * allYears.length * allPeriods.length} potential columns`);

    const result = await exportDataSlice({
      rows: accountsInRows,
      columns: columnConfig,
      pov: pov,
      skipLayoutEnforcement: true,
      suppressMissingRows: false,
      suppressMissingColumns: false
    });

    if (!result.success) return result;

    // 3. NORMALIZE DATA INTO LOOKUP MAP
    const dataMap = new Map<string, number>(); // Key: "Account|Vertical|Scenario|Year|Period", Value: number
    
    // Alias to Technical Name Map for matching returned columns
    const scenMap: Record<string, string> = { 
      "actual": "NSP_Actual", 
      "nsp_actual": "NSP_Actual",
      "fcst": "NSP_Forecast", 
      "forecast": "NSP_Forecast",
      "nsp_forecast": "NSP_Forecast",
      "budget": "NSP_Budget", 
      "bud": "NSP_Budget",
      "nsp_budget": "NSP_Budget",
      "actual pf": "NSP_Actual",
      "ly": "NSP_Actual" 
    };
    const periodMap: Record<string, string> = { 
      "jan": "TP1", "feb": "TP2", "mar": "TP3", "apr": "TP4", "may": "TP5", "jun": "TP6", 
      "jul": "TP7", "aug": "TP8", "sep": "TP9", "oct": "TP10", "nov": "TP11", "dec": "TP12",
      "yeartotal": "YearTotal",
      "tp1": "TP1", "tp2": "TP2", "tp3": "TP3", "tp4": "TP4", "tp5": "TP5", "tp6": "TP6",
      "tp7": "TP7", "tp8": "TP8", "tp9": "TP9", "tp10": "TP10", "tp11": "TP11", "tp12": "TP12"
    };

    const rawData = result.data;
    const colKeys = rawData.columns.slice(1); // Skip 'Member' column
    logger.info(`[/api/segment-overview] Oracle returned ${rawData.rows.length} rows and ${colKeys.length} columns`);
    
    rawData.rows.forEach((row: any) => {
      const rowHeader = row["Member"] || Object.values(row)[0];
      
      colKeys.forEach((colKey: string) => {
        const val = row[colKey];
        const num = (val === undefined || val === null || isNaN(Number(val))) ? 0 : Number(val);
        
        // Parse colKey (e.g. "Actual | FY25 | Nov")
        const parts = colKey.split(' | ');
        const aliasScen = parts[0].toLowerCase();
        const yr = parts[1];
        const aliasTp = parts[2].toLowerCase();

        const scen = scenMap[aliasScen] || parts[0]; // fallback to original if not mapped
        const tp = periodMap[aliasTp] || parts[2];
        
        const rowNode = rowDataNodes.find(n => {
           const cleanH = rowHeader.toLowerCase();
           const acc = n.account?.toLowerCase() || '';
           const vert = n.vertical?.toLowerCase() || '';
           
           const accMatch = cleanH.includes(acc);
           const vertMatch = cleanH.includes(vert) || (vert === 'tv' && cleanH.includes('total vertical'));
           
           return accMatch && vertMatch;
        });

        if (rowNode) {
          const key = `${rowNode.account}|${rowNode.vertical}|${scen}|${yr}|${tp}`;
          dataMap.set(key, num);
        }
      });
    });

    // 4. DEFINE EVALUATION HELPERS
    const getBaseValue = (rowNode: GraphNode, colNode: GraphNode, yr: string, tp: string) => {
      let scenario = colNode.scenario!;
      let year = yr;
      if (scenario === 'NSP_Actual_PriorYear') {
        scenario = 'NSP_Actual';
        year = priorYear;
      }
      const key = `${rowNode.account}|${rowNode.vertical}|${scenario}|${year}|${tp}`;
      return dataMap.get(key) || 0;
    };

    const getComputedValue = (rowId: string, colId: string, yr: string, tp: string, isYtd: boolean) => {
      // Context-aware getValue for graph evaluation
      const fetchVal = (rNode: GraphNode) => {
        // If it's a data column, fetch directly
        const cNode = COL_GRAPH.nodes[colId];
        if (cNode.type === 'data') {
          if (isYtd) {
            return ytdPeriods.reduce((sum, period) => sum + getBaseValue(rNode, cNode, year, period), 0);
          }
          return getBaseValue(rNode, cNode, year, targetTp);
        } else {
          // If it's a calc column, evaluate it
          return graphEngine.evaluateNode(colId, COL_GRAPH, (cLeaf) => {
             if (isYtd) {
               return ytdPeriods.reduce((sum, period) => sum + getBaseValue(rNode, cLeaf, year, period), 0);
             }
             return getBaseValue(rNode, cLeaf, year, targetTp);
          });
        }
      };

      return graphEngine.evaluateNode(rowId, ROW_GRAPH, fetchVal);
    };

    // 5. ASSEMBLE REPORT ROWS
    const rowIds = [
      "REV_TOTAL", "REV_CASINO", "REV_REG_CASINO", "REV_SWEEPSTAKES", "REV_OTHER_CASINO", "REV_SPORT",
      "DIRECT_COST", "GROSS_MARGIN", "GM_PCT",
      "PERSONNEL_TOTAL", "PERSONNEL_PRODUCT", "PERSONNEL_TECH", "PERSONNEL_FINLEGAL", "PERSONNEL_OTHER",
      "OTHER_OPEX", "EBITDA", "EBITDA_PCT", "CAPEX"
    ];

    const reportRows = rowIds.map(rowId => {
      const node = ROW_GRAPH.nodes[rowId];
      
      const evalCell = (colId: string, isYtd: boolean) => getComputedValue(rowId, colId, year, targetTp, isYtd);

      const formatVal = (val: number, isPercent: boolean) => {
        if (isPercent) return val; // Return raw decimal, let frontend handle formatting
        return Math.round(val);
      };

      const isPct = node.format === 'percentage';

      return {
        id: rowId,
        label: node.label,
        level: node.level,
        isParent: node.type !== 'data',
        isPercent: isPct,
        
        // MTD
        actual: formatVal(evalCell("Actual", false), isPct),
        fcst: formatVal(evalCell("Fcst", false), isPct),
        vsFcst: formatVal(evalCell("vsFcst", false), isPct),
        budget: formatVal(evalCell("Budget", false), isPct),
        vsBud: formatVal(evalCell("vsBUD", false), isPct),
        ly: formatVal(evalCell("LY", false), isPct),
        vsLy: formatVal(evalCell("vsLY", false), isPct),
        vsLyPct: formatVal(evalCell("vsLY_pct", false), true),

        // YTD
        ytdActual: formatVal(evalCell("Actual", true), isPct),
        ytdFcst: formatVal(evalCell("Fcst", true), isPct),
        ytdVsFcst: formatVal(evalCell("vsFcst", true), isPct),
        ytdBudget: formatVal(evalCell("Budget", true), isPct),
        ytdVsBud: formatVal(evalCell("vsBUD", true), isPct),
        ytdLy: formatVal(evalCell("LY", true), isPct),
        ytdVsLy: formatVal(evalCell("vsLY", true), isPct),
        ytdVsLyPct: formatVal(evalCell("vsLY_pct", true), true)
      };
    });

    return {
      success: true,
      reportTitle: 'PnL Segment Overview',
      period: monthName,
      periodLabel: `${monthName}-${yearShort}`,
      ytdLabel: `YTD (${months[0]}-${monthName})`,
      filterDimensions: filterDimensions,
      povDetails: rawData.povDetails,
      columns: [
        'Actual', 'Fcst', 'vs Fcst', 'Budget', 'vs BUD', `PF-${parseInt(yearShort) - 1}`, 'vs LY', 'vs LY%',
        'YTD Actual', 'YTD Fcst', 'vs Fcst', 'YTD Budget', 'vs BUD', `PF-${parseInt(yearShort) - 1}`, 'vs LY', 'vs LY%'
      ],
      rows: reportRows,
      insights: `## Segment Overview — ${monthName}-${yearShort}\n\nMulti-scenario financial dashboard for the selected period.`
    };

  } catch (error: any) {
    logger.error('[/api/segment-overview] Failed', { error: error.message });
    return { success: false, error: error.message };
  }
};