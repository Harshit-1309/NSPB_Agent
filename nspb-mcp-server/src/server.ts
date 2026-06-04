import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import logger from './services/logger.js';
import { llmAgent } from './llm/llmAgent.js';
import oracleClient, { authStorage, rawClient } from './services/oracleClient.js';
import { exportDataSlice } from './tools/exportDataSlice.js';
import { segmentOverview } from './tools/segmentOverview.js';
import { generateCommentary } from './tools/generateCommentary.js';
import { transformationService } from './services/transformationService.js';
import { aliasResolver } from './services/aliasResolver.js';

import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 3000;

// Global Middleware to handle Dynamic Authentication
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  
  if (auth) {
    try {
      fs.writeFileSync('scratch/auth_token.txt', auth);
    } catch (e) {}
    authStorage.run(auth, () => next());
  } else {
    // Let it pass, the oracleClient will warn/fail if auth is missing and it's needed
    next();
  }
});

import { executeTool, TOOLS_REGISTRY } from './agent/toolDispatcher.js';

// MCP Endpoint
app.post('/mcp', async (req: Request, res: Response) => {
  const { method, params, type, name, arguments: args } = req.body;

  // Handle both common interpretations of "MCP via POST"
  const action = method || type;
  const toolName = params?.name || name;
  const toolArgs = params?.arguments || args;

  logger.info(`Incoming MCP Request: ${action}`, { toolName });

  try {
    switch (action) {
      case 'tools/list':
        return res.json({
          success: true,
          tools: TOOLS_REGISTRY
        });

      case 'tools/call':
        if (!toolName) {
          return res.status(400).json({ error: 'Tool name is required for tools/call' });
        }

        logger.info(`Executing tool: ${toolName}`, { toolArgs });

        const result = await executeTool(toolName, toolArgs);
        return res.json(result);

      default:
        return res.status(400).json({ error: `Unsupported MCP method: ${action}` });
    }
  } catch (error: any) {
    logger.error('Unexpected error handling MCP request', { error: error.message });
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Chat API for the React UI (SSE for real-time progress)
app.post('/api/chat', async (req: Request, res: Response) => {
  const { message, model, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  logger.info(`Incoming Chat Request (SSE): ${message.substring(0, 50)}...`);

  // Initialize SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering for SSE

  const sendEvent = (type: string, data: any) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      logger.info('Client disconnected before response finished, aborting...');
      abortController.abort();
    }
  });

  try {
    const response = await llmAgent.handleUserInput(
      message, 
      model, 
      history, 
      (step) => sendEvent('step', step),
      abortController.signal
    );

    sendEvent('final', response);
    res.end();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.info('Request aborted successfully');
    } else {
      logger.error('Error in Chat API (SSE)', { error: error.message });
      sendEvent('error', error.message);
    }
    res.end();
  }
});

// ─── Members Lookup (for dropdown population) ────────────────────────────────
// GET /api/members?dim=Subsidiary&parent=NSP_Total+Subsidiary
// Returns ILvl0Descendants with their aliases for use in filter dropdowns.
app.get('/api/members', async (req: Request, res: Response) => {
  const dim = req.query.dim as string;

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

  const parent = (req.query.parent as string) || DEFAULT_POV[dim] || `NSP_Total ${dim}`;

  if (!dim) return res.status(400).json({ error: 'dim query param is required' });

  logger.info(`[/api/members] Fetching ILvl0Descendants for dim=${dim}, parent=${parent}`);

  try {
    const planType = process.env.DEFAULT_PLAN_TYPE || 'NSP_NFS';

    // Fetch the full dimension tree from Oracle
    const url = `/plantypes/${encodeURIComponent(planType)}/dimensions/${encodeURIComponent(dim)}`;
    const response = await oracleClient.get(url);
    
    const lvl0: { name: string, alias: string }[] = [];
    
    // Recursively traverse the Oracle dimension tree to find all Level 0 descendants
    const traverse = (node: any) => {
      if (node.level === 0) {
        lvl0.push({ 
          name: node.name, 
          alias: node.alias || node.name 
        });
      }
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(traverse);
      }
    };
    
    if (response.data) {
      traverse(response.data);
    }

    // Always prepend the parent "Total" option
    return res.json({
      items: [
        { name: parent, alias: `All ${dim}s (Total)` },
        ...lvl0
      ]
    });
  } catch (err: any) {
    logger.error('[/api/members] Failed', { error: err.message });
    // Return empty so frontend falls back to its hardcoded list
    return res.status(500).json({ error: err.message, items: [] });
  }
});

// ─── Dynamic Members Lookup (Suppress Missing) ──────────────────────────────
app.post('/api/members-dynamic', async (req: Request, res: Response) => {
  const { dim, gridConfig } = req.body;
  if (!dim || !gridConfig) return res.status(400).json({ error: 'dim and gridConfig are required' });

  const DEFAULT_POV: Record<string, string> = {
    "Years": "FY25", "Period": "YearTotal", "Subsidiary": "NSP_Total Subsidiary",
    "Region": "Total Region", "Location": "NSP_Total Location", "Relationship": "NSP_Total Relationship",
    "Tracker": "NSP_Amount", "Currency": "EUR_Reporting", "Department": "TD",
    "Class": "TC", "Vertical": "TV", "Scenario": "NSP_Actual", "Version": "NSP_Base", "Account": "NFS_Income"
  };
  
  const parent = DEFAULT_POV[dim] || `NSP_Total ${dim}`;
  logger.info(`[/api/members-dynamic] Fetching active data members for dim=${dim}`);

  try {
    let updatedPov: any;
    const overrides = req.body.livePov || {};
    
    // First, apply all overrides to the gridConfig POV
    if (gridConfig.pov && Array.isArray(gridConfig.pov.dimensions) && Array.isArray(gridConfig.pov.members)) {
      updatedPov = {
        dimensions: [...gridConfig.pov.dimensions],
        members: gridConfig.pov.members.map((mArr: any[]) => [...mArr])
      };
      Object.entries(overrides).forEach(([overrideDim, overrideMember]) => {
        const dimIndex = updatedPov.dimensions.findIndex((d: string) => d.toLowerCase() === overrideDim.toLowerCase());
        if (dimIndex >= 0) {
          updatedPov.members[dimIndex] = [overrideMember];
        } else {
          updatedPov.dimensions.push(overrideDim);
          updatedPov.members.push([overrideMember]);
        }
      });
      // Strip the target dimension from the POV so we can put it in rows
      const targetIndex = updatedPov.dimensions.findIndex((d: string) => d.toLowerCase() === dim.toLowerCase());
      if (targetIndex >= 0) {
        updatedPov.dimensions.splice(targetIndex, 1);
        updatedPov.members.splice(targetIndex, 1);
      }
    } else if (Array.isArray(gridConfig.pov)) {
      updatedPov = [...gridConfig.pov];
      Object.entries(overrides).forEach(([overrideDim, overrideMember]) => {
        updatedPov = [
          ...updatedPov.filter((m: any) => typeof m !== 'string' || !m.toLowerCase().includes(overrideDim.toLowerCase())),
          `${overrideDim}:${overrideMember}`
        ];
      });
      updatedPov = updatedPov.filter((m: any) => typeof m !== 'string' || !m.toLowerCase().includes(dim.toLowerCase()));
    } else {
      updatedPov = { ...(gridConfig.pov || {}) };
      Object.entries(overrides).forEach(([overrideDim, overrideMember]) => {
        updatedPov[overrideDim] = [overrideMember];
      });
      delete updatedPov[dim];
    }

    // We MUST include at least Account in columns, otherwise the hard constraint
    // in exportDataSlice will remove it from POV and the query will 400.
    const safeColumns = Array.isArray(gridConfig.columns) && gridConfig.columns.length > 0 
      ? [...gridConfig.columns, 'Account:NFS_Income'] 
      : ['Account:NFS_Income'];

    const newArgs = {
      ...gridConfig,
      pov: updatedPov,
      columns: safeColumns,
      rows: [`${dim}:ILvl0Descendants(${parent})`],
      skipLayoutEnforcement: true, // IMPORTANT: Bypass Income Statement hardcoding
      suppressMissingRows: true    // IMPORTANT: Exclude members without data
    };

    const result: any = await exportDataSlice(newArgs);
    if (!result.success) throw new Error(result.error);

    // Parse out members
    const items = (result.data?.rows || []).map((rowObj: any) => {
      // In dynamic mode, rows are parsed into objects. The Member label is usually under "Member"
      const r = rowObj["Member"] || rowObj[dim] || Object.values(rowObj)[0];
      if (typeof r !== 'string') return { name: "Unknown", alias: "Unknown" };
      const parts = r.split(' - ');
      if (parts.length > 1) {
        return { name: parts[0].trim(), alias: parts.slice(1).join(' - ').trim() };
      }
      return { name: r.trim(), alias: r.trim() };
    }).filter((m: any) => m.name !== 'Unknown');

    return res.json({
      items: [
        { name: parent, alias: `All ${dim}s (Total)` },
        ...items
      ]
    });
  } catch (err: any) {
    logger.error('[/api/members-dynamic] Failed', { error: err.message });
    return res.status(500).json({ error: err.message, items: [] });
  }
});

// ─── Instant Re-filter (LLM-bypass table refresh) ─────────────────────────────
// POST /api/refilter
// Body: { gridConfig: <original rawArgs from exportDataSlice>, dim: string, member: string }
// Re-runs the Oracle data export with a single POV dimension overridden and returns
// the formatted table JSON without going through the LLM at all.
import { getFormData } from './tools/getFormData.js';

app.post('/api/refilter', async (req: Request, res: Response) => {
  const { gridConfig, dim, member } = req.body;

  if (!gridConfig || !dim || !member) {
    return res.status(400).json({ error: 'gridConfig, dim, and member are required' });
  }

  logger.info(`[/api/refilter] Re-running slice: ${dim} → ${member}`);

  try {
    const overrides = req.body.livePov || { [dim]: member };

    // Handle Form refiltering
    if (gridConfig.type === 'form') {
      const idorname = gridConfig.idorname;
      const pageDimNames: string[] = gridConfig.pageDimNames || ["Currency", "Subsidiary", "Region", "Department", "Class"];
      const povByDim: Record<string, string> = gridConfig.povByDim || {};
      const povDimNames: string[] = gridConfig.povDimNames || [];
      const povArray: any[] = Array.isArray(gridConfig.pov) ? gridConfig.pov : [];

      logger.info(`[/api/refilter] Form page dims: ${pageDimNames.join(',')}`, { overrides, povByDim });

      // Build pageMbrList: for each page dim, use override if provided, else use povByDim, else fallback to pov array
      const newMembers: string[] = [];
      const newPov: any = { dimensions: [], members: [] };

      // First, add fixed POV dims (non-page dims) to newPov for transformationService context
      povDimNames.forEach((dim: string, idx: number) => {
        const overrideKey = Object.keys(overrides).find(k => k.toLowerCase() === dim.toLowerCase());
        const currentMbr = overrideKey ? overrides[overrideKey] : (povArray[idx] || 'N/A');
        newPov.dimensions.push(dim);
        newPov.members.push([currentMbr]);
      });

      // Then, for each page dim, resolve current member
      pageDimNames.forEach((pageDim: string, idx: number) => {
        const overrideKey = Object.keys(overrides).find(k => k.toLowerCase() === pageDim.toLowerCase());
        let currentMbr: string;
        
        if (overrideKey) {
          // User explicitly changed this dim
          currentMbr = overrides[overrideKey];
        } else if (povByDim[pageDim]) {
          // Use the explicit dim->member map built at form fetch time (most reliable)
          currentMbr = povByDim[pageDim];
        } else {
          // Fallback: offset into the pov array by the number of non-page POV dims
          const povOffset = povDimNames.length;
          currentMbr = povArray[povOffset + idx] || 'N/A';
        }
        
        newMembers.push(currentMbr);
        newPov.dimensions.push(pageDim);
        newPov.members.push([currentMbr]);
      });

      const pageMbrList = newMembers.join(',');
      logger.info(`[/api/refilter] Re-running form: ${idorname} with pageMbrList=${pageMbrList}`);

      const result = await getFormData({ idorname, pageMbrList });
      if (!result.success) {
        return res.status(400).json({ error: result.error, details: result.details });
      }

      const transformed = transformationService.transformNSPBResponse(result.data, newPov);
      if ('error' in transformed) {
        return res.status(400).json({ error: transformed.error });
      }

      return res.json({
        success: true,
        table: transformed
      });
    }

    // Merge the new member override into the existing POV
    let updatedPov: any;
    
    if (gridConfig.pov && Array.isArray(gridConfig.pov.dimensions) && Array.isArray(gridConfig.pov.members)) {
      // Oracle Native Format: { dimensions: ["Class", "Region"], members: [["TC"], ["Total Region"]] }
      updatedPov = {
        dimensions: [...gridConfig.pov.dimensions],
        members: gridConfig.pov.members.map((mArr: any[]) => [...mArr]) // deep clone
      };
      
      Object.entries(overrides).forEach(([overrideDim, overrideMember]) => {
        const dimIndex = updatedPov.dimensions.findIndex((d: string) => d.toLowerCase() === overrideDim.toLowerCase());
        if (dimIndex >= 0) {
          updatedPov.members[dimIndex] = [overrideMember];
        } else {
          updatedPov.dimensions.push(overrideDim);
          updatedPov.members.push([overrideMember]);
        }
      });
    } else if (Array.isArray(gridConfig.pov)) {
      // Array Format: ["Region:North", "Subsidiary:SUB_4"]
      updatedPov = [...gridConfig.pov];
      Object.entries(overrides).forEach(([overrideDim, overrideMember]) => {
        updatedPov = [
          ...updatedPov.filter((m: any) => typeof m !== 'string' || !m.toLowerCase().includes(overrideDim.toLowerCase())),
          `${overrideDim}:${overrideMember}`
        ];
      });
    } else {
      // Key-Value Format: { "Region": "North", "Subsidiary": "SUB_4" }
      updatedPov = { ...(gridConfig.pov || {}) };
      Object.entries(overrides).forEach(([overrideDim, overrideMember]) => {
        updatedPov[overrideDim] = [overrideMember];
      });
    }

    const newArgs = {
      ...gridConfig,
      pov: updatedPov
    };

    const result: any = await exportDataSlice(newArgs);

    if (!result.success) {
      return res.status(400).json({ error: result.error, details: result.details });
    }

    const tableData = result.data;
    return res.json({
      success: true,
      table: {
        povContext: tableData.povContext,
        povDetails: tableData.povDetails,
        columns: tableData.columns,
        rows: tableData.rows
      }
    });
  } catch (err: any) {
    logger.error('[/api/refilter] Failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── Segment Overview Report ──────────────────────────────────────────────────
// POST /api/segment-overview
// Body: { periodLabel: "Mar-25", filterDimensions: ["Subsidiary"], pov: { Subsidiary: "NSP_Total Subsidiary" } }
app.post('/api/segment-overview', async (req: Request, res: Response) => {
  console.log('--- RECEIVED SEGMENT OVERVIEW REQUEST ---');
  const { periodLabel, filterDimensions, pov } = req.body;

  if (!periodLabel) {
    return res.status(400).json({ error: 'periodLabel is required (e.g. "Mar-25")' });
  }

  logger.info(`[/api/segment-overview] Building report for ${periodLabel}`, { filterDimensions, pov });

  try {
    const result = await segmentOverview({
      periodLabel,
      filterDimensions: filterDimensions || [],
      pov: pov || {}
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    return res.json(result);
  } catch (err: any) {
    logger.error('[/api/segment-overview] Failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── Segment Overview Re-filter ───────────────────────────────────────────────
// POST /api/segment-overview/refilter
// Re-runs the segment overview with a new POV dimension selection.
app.post('/api/segment-overview/refilter', async (req: Request, res: Response) => {
  const { periodLabel, filterDimensions, pov, dim, member } = req.body;

  if (!periodLabel || !dim || !member) {
    return res.status(400).json({ error: 'periodLabel, dim, and member are required' });
  }

  const updatedPov = { ...(pov || {}), [dim]: member };
  logger.info(`[/api/segment-overview/refilter] ${dim} → ${member}`);

  try {
    const result = await segmentOverview({
      periodLabel,
      filterDimensions: filterDimensions || [],
      pov: updatedPov
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    return res.json(result);
  } catch (err: any) {
    logger.error('[/api/segment-overview/refilter] Failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── Segment Overview Commentary ──────────────────────────────────────────────
// POST /api/segment-overview/commentary
// Body: { rows: SegmentOverviewRow[], period: string, currency: string }
// Generates AI commentary from already-computed segment rows — no Oracle call needed.
app.post('/api/segment-overview/commentary', async (req: Request, res: Response) => {
  const { rows, period, currency } = req.body;

  if (!rows || !period) {
    return res.status(400).json({ error: 'rows and period are required' });
  }

  // Map Oracle currency member names to display symbols
  const CURRENCY_MAP: Record<string, string> = {
    'EUR_Reporting': '€', 'EUR': '€', 'EUR_Local': '€',
    'USD_Reporting': '$', 'USD': '$', 'USD_Local': '$',
    'GBP_Reporting': '£', 'GBP': '£', 'GBP_Local': '£',
    'CAD_Reporting': 'CA$', 'CAD': 'CA$',
    'AUD_Reporting': 'A$', 'AUD': 'A$',
    'JPY_Reporting': '¥', 'JPY': '¥',
    'CHF_Reporting': 'CHF', 'CHF': 'CHF',
  };
  const currencyMember = currency || 'EUR_Reporting';
  const currencySymbol = CURRENCY_MAP[currencyMember]
    || Object.entries(CURRENCY_MAP).find(([k]) =>
        currencyMember.toUpperCase().startsWith(
          k.toUpperCase().replace('_REPORTING', '').replace('_LOCAL', '')
        )
      )?.[1]
    || '€';

  logger.info(`[/api/segment-overview/commentary] Generating for ${period} (${currencySymbol})`);

  try {
    const commentary = await generateCommentary(rows, period, currencySymbol);
    if (!commentary) {
      return res.status(500).json({ error: 'Commentary generation failed' });
    }
    return res.json({ success: true, commentary });
  } catch (err: any) {
    logger.error('[/api/segment-overview/commentary] Failed', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── Authentication ─────────────────────────────────────────────────────────
app.post('/api/login', async (req: Request, res: Response) => {
  let { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Auto-prepend Identity Domain if missing
  const domain = process.env.IDENTITY_DOMAIN;
  if (domain && !username.startsWith(`${domain}.`)) {
    // Only prepend if the user didn't already provide a domain (heuristic: look for the first dot)
    // Most NSPB users are Email addresses, so we look for Domain.Email@company.com
    // If they just typed Email@company.com, we add the domain.
    username = `${domain}.${username}`;
    logger.info(`Prepended Identity Domain to username: ${username}`);
  }

  const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  try {
    // Run the check within the authStorage context
    const success = await authStorage.run(authHeader, async () => {
      // Attempt to fetch application info as a "ping" to verify credentials
      // Using rawClient to hit the base applications endpoint
      await rawClient.get('/HyperionPlanning/rest/v3/applications');
      return true;
    });

    if (success) {
      logger.info(`Login successful for user: ${username}`);
      return res.json({ 
        success: true, 
        message: 'Login successful',
        username, // Return the (potentially prefixed) username
        token: authHeader // Frontend will store this and send in Authorization header
      });
    }
  } catch (err: any) {
    const status = err.response?.status || 500;
    logger.error(`Login failed for user ${username}: ${err.message}`);
    
    if (status === 401) {
      return res.status(401).json({ 
        error: 'Invalid credentials or missing Identity Domain prefix',
        details: 'Ensure your username is in the format: IdentityDomain.Username'
      });
    }
    
    return res.status(status).json({ error: 'Failed to connect to Oracle NSPB', details: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: process.env.APP_NAME });
});

app.listen(PORT, () => {
  logger.info(`NSPB MCP Server running on port ${PORT}`);
  logger.info(`Application: ${process.env.APP_NAME}`);
  logger.info(`Oracle Base URL: ${process.env.ORACLE_BASE_URL}`);
});