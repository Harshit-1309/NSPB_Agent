import { planningClient, aifClient, rawClient, APP_NAME, ORACLE_BASE_URL } from '../services/oracleClient.js';
import { listBusinessRulesSchema } from '../schemas/jobSchema.js';
import logger from '../services/logger.js';

/**
 * List all available business rules in the NSPB application.
 * This tool performs aggressive discovery across multiple common Oracle EPM REST endpoints.
 */
export const listBusinessRules = async (args: any) => {
  try {
    const validatedArgs = listBusinessRulesSchema.parse(args);
    const { planType } = validatedArgs;

    logger.info(`[TOOL SELECTED]: listBusinessRules`, { planType });

    // 1. Fetch Planning Business Rules (Try multiple variations)
    let planningRules: any[] = [];
    const planningPaths = [
      '/businessrules',
      '/rules',
      '/jobdefinitions',
      '/jobDefinitions',
      `/rest/v3/applications/${APP_NAME}/businessrules`,
      `/rest/v3/applications/${APP_NAME}/rules`,
      `/rest/v3/applications/${APP_NAME}/jobdefinitions`,
      // Try using the user's base URL path if it's different
      `${new URL(ORACLE_BASE_URL || 'http://localhost').pathname}applications/${APP_NAME}/businessrules`.replace(/\/+/g, '/'),
      `${new URL(ORACLE_BASE_URL || 'http://localhost').pathname}applications/${APP_NAME}/jobdefinitions`.replace(/\/+/g, '/'),
    ];

    if (planType) {
      planningPaths.unshift(`/plantypes/${encodeURIComponent(planType)}/businessrules`);
      planningPaths.unshift(`/plantypes/${encodeURIComponent(planType)}/rules`);
    }

    for (const path of planningPaths) {
      try {
        const client = path.startsWith('/rest') || path.startsWith('/Hyperion') ? rawClient : planningClient;
        const response = await client.get(path);
        
        if (response.data.items || response.data.rules) {
          const items = response.data.items || response.data.rules || [];
          
          // If we hit jobdefinitions, filter for "Rules" or common NSPB rule types
          if (path.includes('jobdefinitions')) {
            planningRules = items.filter((item: any) => {
              const jt = item.jobType ? item.jobType.toUpperCase() : '';
              return jt === 'RULES' || jt === 'BUSINESS RULE' || jt === 'RULE' || (item.jobName && !item.jobType);
            }).map((item: any) => ({
              name: item.jobName || item.name,
              ruleName: item.jobName || item.name,
              cube: item.planTypeName || item.cubeName || 'ALL',
              parameters: item.parameters || item.jobParameters || item.runtimePrompts || item.rtps
            }));
          } else {
            planningRules = items;
          }

          if (planningRules.length > 0) {
            logger.info(`[SUCCESS]: Found Planning rules at ${path}`);
            break;
          }
        }
      } catch (err: any) {
        // Continue to next path
      }
    }

    // 2. Fetch AIF Integrations (Data Rules)
    let dataRules: any[] = [];
    const aifPaths = [
      '/integrations',
      '/rest/V1/integrations',
      '/rest/v1/integrations',
      '/aif/rest/V1/integrations',
      '/aif/rest/v1/integrations'
    ];

    for (const path of aifPaths) {
      try {
        const client = path.startsWith('/aif') || path.startsWith('/rest') ? rawClient : aifClient;
        const response = await client.get(path);
        if (response.data.items) {
          dataRules = response.data.items || [];
          logger.info(`[SUCCESS]: Found AIF rules at ${path}`);
          break;
        }
      } catch (err: any) {
        // Continue
      }
    }

    // Filter and format
    const formattedPlanningRules = planningRules.map((r: any) => ({
      name: r.name || r.ruleName,
      type: 'Planning Business Rule',
      cube: r.cube || r.planType || 'ALL',
      parameters: r.parameters || r.jobParameters || r.runtimePrompts
    }));

    const formattedDataRules = dataRules.map((r: any) => ({
      name: r.name || r.ruleName,
      type: 'Data Rule (AIF)',
      cube: 'N/A',
      parameters: r.parameters || r.jobParameters
    }));

    const allRules = [...formattedPlanningRules, ...formattedDataRules];
    
    logger.info(`[SUCCESS]: Found ${allRules.length} total rules.`);

    return {
      success: true,
      rules: allRules.map(r => r.name),
      details: allRules
    };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return { success: false, error: 'Validation Error', details: error.errors };
    }

    const details = error.response?.data || error.message;
    logger.error('Failed to list business rules', { details });

    return {
      success: false,
      error: 'Failed to list business rules',
      details: details
    };
  }
};
