import { z } from 'zod';

export const listBusinessRulesSchema = z.object({
  planType: z.string().optional().describe('Filter by plan type (cube)')
});

export const runBusinessRuleSchema = z.object({
  ruleName: z.string().min(1, 'Rule name is required'),
  planType: z.string().optional().describe('Plan type (cube) the rule belongs to'),
  parameters: z.record(z.string()).optional().describe('Runtime prompts for the business rule')
});

export const executeJobSchema = z.object({
  jobType: z.string().min(1, 'Job type is required (e.g., RULES, DATAMAP, CLEAR_CUBE, DATARULE, INTEGRATION)'),
  jobName: z.string().min(1, 'Job name is required'),
  parameters: z.record(z.string()).optional().describe('Parameters for the job'),
  // AIF specific parameters (Data Management)
  startPeriod: z.string().optional().describe('First period for data load (e.g., Jan-24)'),
  endPeriod: z.string().optional().describe('Last period for data load (e.g., Dec-24)'),
  importMode: z.enum(['APPEND', 'REPLACE', 'RECALCULATE', 'NONE']).optional().describe('How data is imported into staging'),
  exportMode: z.enum(['STORE_DATA', 'ADD_DATA', 'SUBTRACT_DATA', 'REPLACE_DATA', 'REPLACE', 'MERGE', 'NONE']).optional().describe('How data is exported to Planning'),
  fileName: z.string().optional().describe('Optional file name in EPM Inbox (e.g., #epminbox/data.csv)')
});

export const runDataRuleSchema = z.object({
  jobName: z.string().min(1, 'Data rule name is required'),
  startPeriod: z.string().min(1, 'Start period is required (e.g., Jan-24)'),
  endPeriod: z.string().min(1, 'End period is required (e.g., Dec-24)'),
  importMode: z.enum(['APPEND', 'REPLACE', 'RECALCULATE', 'NONE']).default('REPLACE').describe('How data is imported into Data Management staging'),
  exportMode: z.enum(['STORE_DATA', 'ADD_DATA', 'SUBTRACT_DATA', 'REPLACE_DATA', 'REPLACE', 'MERGE', 'NONE']).default('STORE_DATA').describe('How data is exported from Data Management to Planning'),
  fileName: z.string().optional().describe('Optional file name in EPM Inbox (e.g., #epminbox/data.csv)')
});

export type ListBusinessRulesInput = z.infer<typeof listBusinessRulesSchema>;
export type RunBusinessRuleInput = z.infer<typeof runBusinessRuleSchema>;
export type ExecuteJobInput = z.infer<typeof executeJobSchema>;
export type RunDataRuleInput = z.infer<typeof runDataRuleSchema>;
