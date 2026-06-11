import logger from '../services/logger.js';

/**
 * Executes an async function with exponential backoff retry logic.
 * Specifically designed to handle 429 (Rate Limit) and 5xx errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Enforce a hard 180-second timeout at the Promise level
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const err = new Error('LLM request timed out at the application level after 180000ms');
          (err as any).code = 'ECONNABORTED'; // Make it retryable
          reject(err);
        }, 180000);
      });
      
      return await Promise.race([fn(), timeoutPromise]);
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a retryable error (429 or 5xx)
      const status = error.status || error.response?.status;
      const errorDetail = error.response?.data || error.message;

      if (status >= 400 && status < 500) {
        logger.error(`LLM Call failed with terminal ${status} error:`, { detail: errorDetail });
      }

      const isRetryable = status === 429 || (status >= 500 && status < 600) || error.code === 'ECONNABORTED';
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      const delay = initialDelayMs * Math.pow(2, attempt); // Exponential backoff
      logger.warn(`LLM Call failed with status ${status}. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${maxRetries})`, {
        error: error.message
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
