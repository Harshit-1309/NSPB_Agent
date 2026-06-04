import axios from 'axios';
import axiosRetry from 'axios-retry';
import dotenv from 'dotenv';
import { AsyncLocalStorage } from 'node:async_hooks';
import logger from './logger.js';

dotenv.config();

const {
  ORACLE_BASE_URL,
  APP_NAME
} = process.env;

// This storage will hold the Authorization header for the duration of a request
export const authStorage = new AsyncLocalStorage<string>();

if (!ORACLE_BASE_URL || !APP_NAME) {
  logger.error('Missing required environment variables ORACLE_BASE_URL or APP_NAME');
  throw new Error('Environment configuration error');
}

/**
 * Helper to get the current auth header from storage or fallback to env for dev/testing
 */
import fs from 'fs';

const getAuthHeader = () => {
  const storedAuth = authStorage.getStore();
  if (storedAuth) return storedAuth;

  // Fallback to cached token file if it exists
  try {
    if (fs.existsSync('scratch/auth_token.txt')) {
      const cached = fs.readFileSync('scratch/auth_token.txt', 'utf8').trim();
      if (cached) return cached;
    }
  } catch (e) {}

  // Fallback to .env credentials ONLY if they exist (for local testing/CLI scripts)
  const envUser = process.env.ORACLE_USERNAME;
  const envPass = process.env.ORACLE_PASSWORD;
  if (envUser && envPass) {
    return `Basic ${Buffer.from(`${envUser}:${envPass}`).toString('base64')}`;
  }

  return undefined;
};

// Function to create a client for a specific service path
const createClient = (basePath: string) => {
  const client = axios.create({
    baseURL: `${new URL(ORACLE_BASE_URL).origin}${basePath}`,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-By': 'Link'
    },
    timeout: 60000
  });

  // Dynamically inject the Authorization header into every request
  client.interceptors.request.use((config) => {
    const auth = getAuthHeader();
    if (auth) {
      config.headers['Authorization'] = auth;
    } else {
      // In production, we should probably throw here if not logged in
      logger.warn(`No Authorization found for request to ${config.url}`);
    }

    const fullUrl = `${config.baseURL}${config.url}`;
    logger.info(`Oracle API Request: ${config.method?.toUpperCase()} ${fullUrl}`);
    return config;
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
    if (typeof response.data === 'string' && (response.data.includes('<!--loginForm-->') || response.data.includes('loginForm'))) {
      const error = new Error('Invalid credentials or missing Identity Domain prefix') as any;
      error.response = { status: 401, data: { detail: 'Unauthorized. Please check your credentials and Identity Domain prefix.' } };
      throw error;
    }

    return response;
  }, (error) => {
    const status = error.response?.status;
    const errorData = error.response?.data;
    const errorDetails = errorData || error.message;

    if (status === 401) {
      logger.error(`Oracle API 401 Unauthorized for URL: ${error.config?.url}`);
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

