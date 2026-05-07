import axios from 'axios';
import axiosRetry from 'axios-retry';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

const {
  ORACLE_BASE_URL,
  ORACLE_USERNAME,
  ORACLE_PASSWORD,
  APP_NAME
} = process.env;

if (!ORACLE_BASE_URL || !ORACLE_USERNAME || !ORACLE_PASSWORD || !APP_NAME) {
  logger.error('Missing required environment variables for Oracle NSPB connection');
  throw new Error('Environment configuration error');
}

// Create encoded credentials for Basic Auth
const authHeader = `Basic ${Buffer.from(`${ORACLE_USERNAME}:${ORACLE_PASSWORD}`).toString('base64')}`;

// Function to create a client for a specific service path
const createClient = (basePath: string) => {
  const client = axios.create({
    baseURL: `${new URL(ORACLE_BASE_URL).origin}${basePath}`,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-By': 'Link'
    },
    timeout: 60000
  });

  // Configure retry mechanism
  axiosRetry(client, {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      return axiosRetry.isNetworkError(error) || 
             (error.response ? error.response.status >= 500 : false);
    }
  });

  // Interceptors
  client.interceptors.request.use((config) => {
    const fullUrl = `${config.baseURL}${config.url}`;
    logger.info(`Oracle API Request: ${config.method?.toUpperCase()} ${fullUrl}`);
    return config;
  });

  client.interceptors.response.use((response) => {
    let displayData: any = '[Response Body Hidden]';
    const isLargeDiscovery = response.config.method?.toUpperCase() === 'GET' && 
                            (response.config.url?.includes('/dimensions') || 
                             response.config.url?.includes('/members') ||
                             response.config.url?.includes('/integrations'));

    if (!isLargeDiscovery) {
      const logData = JSON.stringify(response.data);
      displayData = logData.length > 200 ? `${logData.substring(0, 200)}... [Truncated]` : response.data;
    }

    logger.info(`Oracle API Response: ${response.status}`, {
      url: response.config.url,
      data: displayData
    });

    // Handle cases where Oracle redirects to a login page instead of returning 401
    // This happens if the username is missing the identity domain prefix
    if (typeof response.data === 'string' && (response.data.includes('<!--loginForm-->') || response.data.includes('loginForm'))) {
      const error = new Error('User not found or missing Identity Domain prefix') as any;
      error.response = { status: 401, data: { detail: 'User not found. Ensure your username has the Identity Domain prefix (e.g. IdentityDomain.Username)' } };
      throw error;
    }

    return response;
  }, (error) => {
    const status = error.response?.status;
    const errorData = error.response?.data;
    const errorDetails = errorData || error.message;

    if (status === 401) {
      const errorStr = JSON.stringify(errorDetails);
      logger.error(`Oracle API 401 Unauthorized: ${errorStr}`);
      
      // Check if username likely lacks identity domain
      const hasDomain = ORACLE_USERNAME?.includes('.');
      if (!hasDomain || errorStr.includes('User not found') || errorStr.includes('Invalid user')) {
        logger.warn('--------------------------------------------------------------------------------');
        logger.warn('CRITICAL AUTH HINT: Your username likely needs an Identity Domain prefix.');
        logger.warn(`Current username: ${ORACLE_USERNAME}`);
        logger.warn('Expected format:  IdentityDomain.Username (e.g. idcs-1234.jsmith@example.com)');
        logger.warn('Please update your .env file and the server will restart.');
        logger.warn('--------------------------------------------------------------------------------');
      }
    } else {
      const errorStr = JSON.stringify(errorData);
      logger.error(`Oracle API Response Error: ${status || 'Network Error'}`, {
        url: error.config?.url,
        details: errorDetails,
        fullError: errorStr
      });
    }
    return Promise.reject(error);
  });

  return client;
};

// Export specialized clients
export const planningClient = createClient(`/HyperionPlanning/rest/v3/applications/${APP_NAME}`);
export const aifClient = createClient('/aif/rest/V1');
export const rawClient = createClient(''); // Used for discovery/absolute paths

// Maintain default export as planningClient
export default planningClient;
export { APP_NAME, ORACLE_BASE_URL };
