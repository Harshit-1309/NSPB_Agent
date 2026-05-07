import { z } from 'zod';

export const substitutionVariableSchema = z.object({
  name: z.string().min(1, 'Variable name is required'),
  value: z.string(),
  planType: z.string().optional().default('ALL')
});

export const updateSubVarInputSchema = z.object({
  name: z.string().min(1, 'Variable name is required'),
  value: z.string(),
  planType: z.string().optional().default('ALL')
});

export const batchUpdateSubVarInputSchema = z.object({
  items: z.array(substitutionVariableSchema)
});

export type SubstitutionVariable = z.infer<typeof substitutionVariableSchema>;
export type UpdateSubVarInput = z.infer<typeof updateSubVarInputSchema>;
export type BatchUpdateSubVarInput = z.infer<typeof batchUpdateSubVarInputSchema>;
