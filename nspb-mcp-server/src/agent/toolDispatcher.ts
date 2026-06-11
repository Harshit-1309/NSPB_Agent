import { getSubstitutionVariables } from '../tools/getSubstitutionVariables.js';
import { updateSubstitutionVariable } from '../tools/updateSubstitutionVariable.js';
import { getMember } from '../tools/getMember.js';
import { addMember } from '../tools/addMember.js';
import { listMembers } from '../tools/listMembers.js';
import { getDimensions } from '../tools/getDimensions.js';
import { diagnoseConnection } from '../tools/diagnoseConnection.js';
import { updateMember } from '../tools/updateMember.js';
import { exportDataSlice } from '../tools/exportDataSlice.js';
import { listBusinessRules } from '../tools/listBusinessRules.js';
import { runBusinessRule } from '../tools/runBusinessRule.js';
import { executeJob } from '../tools/executeJob.js';
import { runDataRule } from '../tools/runDataRule.js';
import { segmentOverview } from '../tools/segmentOverview.js';
import { getFormData } from '../tools/getFormData.js';
import logger from '../services/logger.js';

export const TOOLS_REGISTRY = [
  {
    name: 'getSubstitutionVariables',
    description: 'Fetch global placeholder variables (like CurMonth, CurYear).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'updateSubstitutionVariable',
    description: 'Update a substitution variable in Oracle NSPB.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Variable name' },
        value: { type: 'string', description: 'New value' },
        planType: { type: 'string', description: 'Optional plan type', default: 'ALL' }
      },
      required: ['name', 'value']
    }
  },
  {
    name: 'getMember',
    description: 'Fetch detailed properties of a specific member in a dimension.',
    inputSchema: {
      type: 'object',
      properties: {
        dimName: { type: 'string', description: 'Dimension name' },
        memberName: { type: 'string', description: 'Member name' }
      },
      required: ['dimName', 'memberName']
    }
  },
  {
    name: 'addMember',
    description: 'Add a new member to a dimension.',
    inputSchema: {
      type: 'object',
      properties: {
        dimName: { type: 'string' },
        memberName: { type: 'string' },
        parentName: { type: 'string' },
        alias: { type: 'string' }
      },
      required: ['dimName', 'memberName', 'parentName']
    }
  },
  {
    name: 'listMembers',
    description: 'List all members or the hierarchy of a specific dimension.',
    inputSchema: {
      type: 'object',
      properties: {
        dimName: { type: 'string', description: 'Dimension to list (e.g., Period, Account, Year)' }
      },
      required: ['dimName']
    }
  },
  {
    name: 'getDimensions',
    description: 'List all dimensions available in the NSPB application.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'exportDataSlice',
    description: 'Export a structured data slice from NSPB. Use rows, columns, and pov to define the pivot table layout. \n' +
                 'IMPORTANT: If the user asks for data "By Department", set pivotDim="Department". \n' +
                 'If the user asks for data "By Class", set pivotDim="Class". \n' +
                 'For these pivots, the system will automatically use ILvl0Descendants("TD") or ILvl0Descendants("TC") and move Account to POV.\n' +
                 'CRITICAL: If the user mentions "Expense", you MUST pass "NFS_Expense" in the `accounts` parameter or inside `pov.Account`!',
    inputSchema: {
      type: 'object',
      properties: {
        rows: { type: 'array', items: { type: 'string' }, description: 'Dimension members to display in Rows (e.g. ["Revenue", "COGS"])' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Dimension members to display in Columns (e.g. ["Oct", "Nov"])' },
        pov: { type: 'object', description: 'Context dimensions and members. Example: {"Years": ["FY25"], "Currency": ["USD"], "Account": ["NFS_Expense"]}' },
        accounts: { type: 'array', items: { type: 'string' }, description: 'Account members to filter by (e.g. ["NFS_Expense"])' },
        periods: { type: 'array', items: { type: 'string' }, description: 'Period members (e.g. ["Mar"])' },
        years: { type: 'array', items: { type: 'string' }, description: 'Years members (e.g. ["FY26"])' },
        pivotDim: { type: 'string', description: 'Dimension to pivot to Rows (e.g. "Class", "Department"). If provided, the system will move this dimension to Rows and move Account to POV.' },
        calculationInstructions: { type: 'string', description: 'Optional math/variance instructions' },
        planType: { type: 'string', description: 'Target plan type (default: NSP_NFS)' }
      }
    }
  },
  {
    name: 'listBusinessRules',
    description: 'Fetch the list of executable Calculation Rules (Business Rules).',
    inputSchema: {
      type: 'object',
      properties: { planType: { type: 'string' } }
    }
  },
  {
    name: 'runBusinessRule',
    description: 'Execute a specific business rule. Ask user for Runtime Prompts first.',
    inputSchema: {
      type: 'object',
      properties: {
        ruleName: { type: 'string' },
        parameters: { type: 'object' }
      },
      required: ['ruleName']
    }
  },
  {
    name: 'runDataRule',
    description: 'Execute a Data Management (AIF) data load rule.',
    inputSchema: {
      type: 'object',
      properties: {
        jobName: { type: 'string' },
        startPeriod: { type: 'string' },
        endPeriod: { type: 'string' }
      },
      required: ['jobName', 'startPeriod', 'endPeriod']
    }
  },
  {
    name: 'diagnoseConnection',
    description: 'Run a full diagnostic check on the Oracle NSPB connection.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'segmentOverview',
    description: 'Generate a graph-based PnL Segment Overview report with multi-scenario comparison (Actual, Budget, Forecast, LY).',
    inputSchema: {
      type: 'object',
      properties: {
        periodLabel: { type: 'string', description: 'Period to report on (e.g. "Mar-25")' },
        view: { type: 'string', enum: ['MTD', 'YTD'], description: 'Month-to-Date or Year-to-Date perspective' },
        pov: { type: 'object', description: 'Optional POV overrides (e.g. {"Subsidiary": "SUB_1"})' }
      },
      required: ['periodLabel']
    }
  },
  {
    name: 'getFormData',
    description: 'Extract data from a specific form in the NSPB application by providing the form name or ID. Supports selecting specific page dimension members (like Period and Years) via pageMbrList, and updating user variables (like for dynamic columns) via userVariableUpdates.',
    inputSchema: {
      type: 'object',
      properties: {
        idorname: { type: 'string', description: 'Form name or form ID' },
        pageMbrList: { type: 'string', description: 'Optional comma-separated list of page/POV dimension members to filter by (e.g. "FY25,Jan")' },
        userVariableUpdates: { type: 'object', description: 'Map of Dimension to Member name for updating user variables before fetching data (e.g. {"Period": "Dec", "Years": "FY25"}). CRITICAL: If the user explicitly specifies a Year or Period in their prompt, you MUST include them here so the form fetches the correct data!' }
      },
      required: ['idorname']
    }
  }
];

export async function executeTool(name: string, args: any): Promise<any> {
  logger.info(`Local Dispatcher: Executing tool ${name}`);
  
  switch (name) {
    case 'getSubstitutionVariables':
      return await getSubstitutionVariables();
    case 'updateSubstitutionVariable':
      return await updateSubstitutionVariable(args);
    case 'getMember':
      return await getMember(args);
    case 'addMember':
      return await addMember(args);
    case 'listMembers':
      return await listMembers(args);
    case 'getDimensions':
      return await getDimensions();
    case 'diagnoseConnection':
      return await diagnoseConnection();
    case 'updateMember':
      return await updateMember(args);
    case 'exportDataSlice':
      return await exportDataSlice(args);
    case 'listBusinessRules':
      return await listBusinessRules(args);
    case 'runBusinessRule':
      return await runBusinessRule(args);
    case 'executeJob':
      return await executeJob(args);
    case 'runDataRule':
      return await runDataRule(args);
    case 'segmentOverview':
      return await segmentOverview(args);
    case 'getFormData':
      return await getFormData(args);
    default:
      throw new Error(`Tool ${name} not found in dispatcher`);
  }
}
