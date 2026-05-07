import { planningClient, aifClient, rawClient } from '../services/oracleClient.js';
import { executeJobSchema } from '../schemas/jobSchema.js';
import logger from '../services/logger.js';

/**
 * Execute a generic job in the NSPB application.
 * Supports both Planning jobs and Data Management (AIF) jobs with robust routing.
 */
export const executeJob = async (args: any) => {
  try {
    const validatedArgs = executeJobSchema.parse(args);
    const { 
      jobType, 
      jobName, 
      parameters,
      startPeriod,
      endPeriod,
      importMode,
      exportMode,
      fileName
    } = validatedArgs;

    const isAifJob = jobType.toUpperCase() === 'DATARULE' || jobType.toUpperCase() === 'INTEGRATION';

    logger.info(`Executing job: ${jobName} (${jobType})`, { isAifJob });

    let response;
    if (isAifJob) {
      // Data Management / AIF Job
      const payload = {
        jobType,
        jobName,
        startPeriod,
        endPeriod,
        importMode,
        exportMode,
        fileName,
        ...parameters
      };

      // Remove undefined fields
      Object.keys(payload).forEach(key => (payload as any)[key] === undefined && delete (payload as any)[key]);

      // Try multiple AIF job endpoints
      const aifJobPaths = ['/jobs', '/rest/V1/jobs', '/rest/v1/jobs', '/aif/rest/V1/jobs'];
      let lastError: any;

      for (const path of aifJobPaths) {
        try {
          const client = path.startsWith('/aif') || path.startsWith('/rest') ? rawClient : aifClient;
          response = await client.post(path, payload);
          logger.info(`[SUCCESS]: Executed AIF job via ${path}`);
          break;
        } catch (err: any) {
          lastError = err;
          if (err.response?.status !== 404) break; // If not 404, it's a real error (e.g. 401 or 400)
        }
      }

      if (!response && lastError) throw lastError;
    } else {
      // Standard Planning Job
      const payload = {
        jobType,
        jobName,
        parameters: parameters || {}
      };

      response = await planningClient.post('/jobs', payload);
    }

    if (!response) throw new Error('Failed to execute job: No response from server');

    return {
      success: true,
      jobId: response.data.jobId || response.data.processId || response.data.id,
      status: response.data.status,
      details: response.data
    };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return { success: false, error: 'Validation Error', details: error.errors };
    }

    const details = error.response?.data || error.message;
    logger.error(`Failed to execute job: ${args.jobName}`, { details });

    return {
      success: false,
      error: 'Failed to execute job',
      details: details
    };
  }
};
