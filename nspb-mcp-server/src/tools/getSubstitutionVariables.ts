import { planningClient, rawClient, APP_NAME, ORACLE_BASE_URL } from '../services/oracleClient.js';
import logger from '../services/logger.js';

/**
 * Fetch substitution variables from Oracle NSPB.
 * Tries multiple common paths to ensure compatibility.
 */
export const getSubstitutionVariables = async () => {
  try {
    const paths = [
      '/substitutionvariables',
      `/rest/v3/applications/${APP_NAME}/substitutionvariables`,
      // Try using the user's base URL path if it's different
      `${new URL(ORACLE_BASE_URL || 'http://localhost').pathname}applications/${APP_NAME}/substitutionvariables`.replace(/\/+/g, '/'),
      `${new URL(ORACLE_BASE_URL || 'http://localhost').pathname}substitutionvariables`.replace(/\/+/g, '/')
    ];

    let data = null;
    let successfulPath = '';

    for (const path of paths) {
      try {
        logger.info(`Attempting to fetch substitution variables from: ${path}`);
        const client = path.startsWith('/rest') || path.includes('/Hyperion') ? rawClient : planningClient;
        const response = await client.get(path);
        
        if (response.data && (response.data.items || response.data.substitutionVariables)) {
          data = response.data;
          successfulPath = path;
          logger.info(`Successfully fetched substitution variables from: ${path}`);
          break;
        }
      } catch (err: any) {
        // Continue to next path
        logger.debug(`Path failed: ${path}`, { error: err.message });
      }
    }

    if (!data) {
      throw new Error('Could not find substitution variables endpoint');
    }

    return {
      success: true,
      data: data,
      pathUsed: successfulPath
    };
  } catch (error: any) {
    const message = error.response?.data?.detail || error.message;
    logger.error('Failed to fetch substitution variables', { error: message });
    return {
      success: false,
      error: 'Failed to fetch substitution variables',
      details: error.response?.data || error.message
    };
  }
};
