import { planningClient, aifClient } from '../services/oracleClient.js';
import logger from '../services/logger.js';

export const diagnoseConnection = async () => {
  const diagnostics: any = {
    checks: [],
    suggestedConfig: {}
  };

  try {
    // 1. Try to list Applications (usually v1 is safest for this)
    const appsBase = planningClient.defaults.baseURL?.split('/rest/')[0] + '/rest/v1/applications';
    try {
      const appsResponse = await planningClient.get(appsBase, { baseURL: '' });
      diagnostics.checks.push({
        step: 'List Applications',
        success: true,
        data: appsResponse.data?.items?.map((app: any) => app.name) || appsResponse.data
      });
    } catch (err: any) {
      diagnostics.checks.push({
        step: 'List Applications',
        success: false,
        error: err.message,
        url: appsBase
      });
    }

    // 2. Discover AIF Integrations (Data Rules)
    try {
      const aifResponse = await aifClient.get('/integrations');
      diagnostics.checks.push({
        step: 'Check AIF Integrations',
        success: true,
        count: aifResponse.data?.items?.length || 0
      });
    } catch (err: any) {
      diagnostics.checks.push({
        step: 'Check AIF Integrations',
        success: false,
        error: err.message
      });
    }

    // 3. Try to discover Plan Types (often needed for v3 dimensions)
    let planTypes: string[] = [];
    try {
      const ptResponse = await planningClient.get('/plantypes');
      planTypes = ptResponse.data?.items?.map((pt: any) => pt.name) || [];
      diagnostics.checks.push({
        step: 'List Plan Types',
        success: true,
        data: planTypes
      });
    } catch (err: any) {
      diagnostics.checks.push({
        step: 'List Plan Types',
        success: false,
        error: err.message
      });
    }

    // 4. Discover Business Rules endpoints
    const rulePaths = ['/businessrules', '/rules'];
    
    // Add plan-type specific paths
    planTypes.forEach(pt => {
      rulePaths.push(`/plantypes/${encodeURIComponent(pt)}/businessrules`);
      rulePaths.push(`/plantypes/${encodeURIComponent(pt)}/rules`);
    });

    for (const path of rulePaths) {
      try {
        const fullUrl = path.startsWith('/') ? path : '/' + path;
        const ruleResponse = await planningClient.get(fullUrl);
        diagnostics.checks.push({
          step: `Check Rules Path: ${path}`,
          success: true,
          count: ruleResponse.data?.items?.length || 0
        });
      } catch (err: any) {
        diagnostics.checks.push({
          step: `Check Rules Path: ${path}`,
          success: false,
          status: err.response?.status,
          error: err.message
        });
      }
    }

    return {
      success: true,
      diagnostics
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      diagnostics
    };
  }
};
