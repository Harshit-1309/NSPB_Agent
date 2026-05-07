import { z } from 'zod';
import { planningClient } from '../services/oracleClient.js';
import { runBusinessRuleSchema } from '../schemas/jobSchema.js';
import logger from '../services/logger.js';

/**
 * Run a specific business rule in the NSPB application.
 * Endpoint: POST /HyperionPlanning/rest/v3/applications/{app}/jobs
 */
export const runBusinessRule = async (args: any) => {
  try {
    if (!args) {
      return { success: false, error: 'No arguments provided' };
    }

    logger.info('Run Business Rule Args:', JSON.stringify(args));

    if (!runBusinessRuleSchema) {
      throw new Error('runBusinessRuleSchema is not defined. Possible circular dependency or import error.');
    }

    const localSchema = z.object({
      ruleName: z.string(),
      parameters: z.record(z.string()).optional(),
      planType: z.string().optional()
    });
    const validatedArgs = localSchema.parse(args);
    const { ruleName, parameters, planType } = validatedArgs;

    logger.info(`Running business rule: ${ruleName}`);

    const payload = {
      jobType: 'RULES',
      jobName: ruleName,
      parameters: parameters || {}
    };

    const response = await planningClient.post('/jobs', payload);

    return {
      success: true,
      jobId: response.data.jobId,
      status: response.data.status,
      details: response.data
    };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return { success: false, error: 'Validation Error', details: error.errors };
    }

    const message = error.response?.data?.detail || error.message;
    logger.error(`Failed to run business rule: ${args.ruleName}`, { error: message });

    return {
      success: false,
      error: 'Failed to run business rule',
      details: error.response?.data || error.message
    };
  }
};
