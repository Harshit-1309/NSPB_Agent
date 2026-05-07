import oracleClient from '../services/oracleClient.js';
import { updateSubVarInputSchema, type UpdateSubVarInput } from '../schemas/subVarSchema.js';
import logger from '../services/logger.js';

export const updateSubstitutionVariable = async (args: any) => {
  try {
    // Validate input
    const validatedArgs = updateSubVarInputSchema.parse(args);
    
    // Construct payload for Oracle API
    const payload = {
      items: [
        {
          name: validatedArgs.name,
          value: validatedArgs.value,
          planType: validatedArgs.planType
        }
      ]
    };

    const response = await oracleClient.post('/substitutionvariables', payload);
    
    return {
      success: true,
      data: {
        name: validatedArgs.name,
        value: validatedArgs.value,
        planType: validatedArgs.planType,
        message: 'Variable updated successfully'
      }
    };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return {
        success: false,
        error: 'Validation Error',
        details: error.errors
      };
    }

    const message = error.response?.data?.detail || error.message;
    logger.error('Failed to update substitution variable', { 
      variable: args.name, 
      error: message 
    });

    return {
      success: false,
      error: 'Failed to update substitution variable',
      details: error.response?.data || error.message
    };
  }
};
