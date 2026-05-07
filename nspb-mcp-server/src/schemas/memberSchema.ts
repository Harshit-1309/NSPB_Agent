import { z } from 'zod';

export const addMemberSchema = z.object({
  dimName: z.string().min(1, 'Dimension name is required'),
  memberName: z.string().min(1, 'Member name is required'),
  parentName: z.string().min(1, 'Parent name is required'),
  dataStorage: z.string().optional().default('store'), // store, shared, never_share, label_only, etc.
  alias: z.string().optional(),
  description: z.string().optional()
});

export const getMemberSchema = z.object({
  dimName: z.string().min(1, 'Dimension name is required'),
  memberName: z.string().min(1, 'Member name is required')
});

export const listMembersSchema = z.object({
  dimName: z.string().min(1, 'Dimension name is required')
});

export const updateMemberSchema = z.object({
  dimName: z.string().min(1, 'Dimension name is required'),
  memberName: z.string().min(1, 'Member name is required'),
  dataStorage: z.string().optional().describe('New data storage property (e.g., Never Share, Store, Dynamic Calc)'),
  alias: z.string().optional().describe('New alias for the member'),
  description: z.string().optional().describe('New description for the member')
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type GetMemberInput = z.infer<typeof getMemberSchema>;
export type ListMembersInput = z.infer<typeof listMembersSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
