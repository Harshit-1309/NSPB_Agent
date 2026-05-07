import { executeJob } from './executeJob.js';
import { runDataRuleSchema } from '../schemas/jobSchema.js';

/**
 * Specifically run a Data Management Data Rule (AIF).
 * This tool is a specialized wrapper around executeJob.
 */
export const runDataRule = async (args: any) => {
  try {
    const validatedArgs = runDataRuleSchema.parse(args);
    
    // Map runDataRule arguments to executeJob format
    const executeJobArgs = {
      jobType: 'DATARULE',
      ...validatedArgs
    };

    return await executeJob(executeJobArgs);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return { success: false, error: 'Validation Error', details: error.errors };
    }
    return {
      success: false,
      error: 'Failed to run data rule',
      details: error.message
    };
  }
};
