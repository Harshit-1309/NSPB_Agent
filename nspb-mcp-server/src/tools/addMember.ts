import oracleClient from '../services/oracleClient.js';
import { addMemberSchema } from '../schemas/memberSchema.js';
import logger from '../services/logger.js';

export const addMember = async (args: any) => {
  try {
    const validatedArgs = addMemberSchema.parse(args);
    const { dimName, memberName, parentName, dataStorage, alias, description } = validatedArgs;

    const payload = {
      memberName,
      parentName,
      dataStorage,
      alias,
      description
    };

    const response = await oracleClient.post(`/dimensions/${encodeURIComponent(dimName)}/members`, payload);
    
    return {
      success: true,
      data: response.data
    };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return { success: false, error: 'Validation Error', details: error.errors };
    }

    const message = error.response?.data?.detail || error.message;
    logger.error('Failed to add member', { 
      dimension: args.dimName, 
      member: args.memberName, 
      error: message 
    });

    return {
      success: false,
      error: 'Failed to add member',
      details: error.response?.data || error.message
    };
  }
};
