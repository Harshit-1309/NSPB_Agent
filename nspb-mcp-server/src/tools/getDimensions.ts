import oracleClient from '../services/oracleClient.js';
import logger from '../services/logger.js';

export const getDimensions = async () => {
  try {
    // 1. Try the standard v3 applications/app/dimensions endpoint
    logger.info('Attempting to fetch dimensions via standard path...');
    const response = await oracleClient.get('/dimensions');
    
    return {
      success: true,
      data: response.data
    };
  } catch (error: any) {
    logger.warn('Standard dimensions path failed, trying plan types discovery...', { error: error.message });

    try {
      // 2. Discover plan types
      const ptResponse = await oracleClient.get('/plantypes');
      const items = ptResponse.data?.items || [];
      
      // Oracle plan types can have different property names for the ID/Name
      const planTypeObj = items[0];
      const planType = planTypeObj?.name || planTypeObj?.id || planTypeObj?.planTypeName;

      if (planType) {
        logger.info(`Found plan type: ${planType}, attempting to fetch dimensions...`);
        
        // Final attempt: /plantypes/{pt}/dimensions
        const ptDimsResponse = await oracleClient.get(`/plantypes/${encodeURIComponent(planType)}/dimensions`);
        return {
          success: true,
          planTypeUsed: planType,
          data: ptDimsResponse.data
        };
      } else {
        logger.warn('No valid plan type name/id found in response', { sampleItem: planTypeObj });
      }
    } catch (innerError: any) {
      logger.error('Failed to discover dimensions via plan types', { error: innerError.message });
    }

    const message = error.response?.data?.detail || error.message;
    return {
      success: false,
      error: 'Failed to list dimensions',
      details: message
    };
  }
};
