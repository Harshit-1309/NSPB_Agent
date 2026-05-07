import oracleClient from '../services/oracleClient.js';
import { listMembersSchema } from '../schemas/memberSchema.js';
import logger from '../services/logger.js';
import { transformationService } from '../services/transformationService.js';

export const listMembers = async (args: any) => {
  try {
    const validatedArgs = listMembersSchema.parse(args);
    const { dimName } = validatedArgs;

    // Try standard path first
    logger.info(`Attempting to list members for dimension: ${dimName} via standard path`);
    try {
      const response = await oracleClient.get(`/dimensions/${encodeURIComponent(dimName)}`);
      return { success: true, data: transformationService.stripUnwantedFields(response.data) };
    } catch (err) {
      // Fallback: Try plan types
      logger.warn('Standard path failed, trying plan types fallback for members...');
      const ptResponse = await oracleClient.get('/plantypes');
      const items = ptResponse.data?.items || [];
      const planTypeObj = items[0];
      const planType = planTypeObj?.name || planTypeObj?.id || planTypeObj?.planTypeName;
 
      if (planType) {
        logger.info(`Using plan type ${planType} to fetch dimension hierarchy: ${dimName}`);
        const ptResponse = await oracleClient.get(`/plantypes/${encodeURIComponent(planType)}/dimensions/${encodeURIComponent(dimName)}`);
        return { success: true, planTypeUsed: planType, data: transformationService.stripUnwantedFields(ptResponse.data) };
      }
      throw err;
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return { success: false, error: 'Validation Error', details: error.errors };
    }

    const message = error.response?.data?.detail || error.message;
    logger.error('Failed to list dimension members', { 
      dimension: args.dimName, 
      error: message 
    });

    return {
      success: false,
      error: 'Failed to list dimension members',
      details: error.response?.data || error.message
    };
  }
};
