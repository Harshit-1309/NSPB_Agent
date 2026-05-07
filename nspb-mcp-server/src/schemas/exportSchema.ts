import { z } from 'zod';

export const gridDefinitionSchema = z.object({
  pov: z.object({
    dimensions: z.array(z.string()).optional(),
    members: z.array(z.array(z.string())).optional()
  }).optional(),
  columns: z.array(z.object({
    dimensions: z.array(z.string()).optional(),
    members: z.array(z.array(z.string())).optional()
  })).optional(),
  rows: z.array(z.object({
    dimensions: z.array(z.string()).optional(),
    members: z.array(z.array(z.string())).optional()
  })).optional(),
  suppressMissingBlocks: z.boolean().optional(),
  suppressMissingRows: z.boolean().optional(),
  suppressMissingColumns: z.boolean().optional()
});

export const exportDataSliceSchema = z.object({
  years: z.array(z.string()).optional(),
  periods: z.array(z.string()).optional(),
  accounts: z.array(z.string()).optional(),
  planType: z.string().optional().default('NSP_NFS'),
  exportPlanningData: z.boolean().optional().default(false),
  suppressMissingRows: z.boolean().optional().default(true),
  calculationInstructions: z.string().optional()
});

export type ExportDataSliceInput = z.infer<typeof exportDataSliceSchema>;
