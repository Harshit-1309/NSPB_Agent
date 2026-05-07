import oracleClient from '../services/oracleClient.js';
import { getMemberSchema } from '../schemas/memberSchema.js';
import logger from '../services/logger.js';

export const getMember = async (args: any) => {
  try {
    const validatedArgs = getMemberSchema.parse(args);
    const { dimName, memberName } = validatedArgs;

    const response = await oracleClient.get(`/dimensions/${encodeURIComponent(dimName)}/members/${encodeURIComponent(memberName)}`);
    const d = response.data;

    return {
      success: true,
      data: {
        name: d.name,
        alias: d.alias,
        parent: d.parent,
        dataStorage: d.dataStorage,
        dimName: d.dimName,
        objectType: d.objectType
      }
    };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return { success: false, error: 'Validation Error', details: error.errors };
    }

    const message = error.response?.data?.detail || error.message;
    logger.error('Failed to fetch member details', { 
      dimension: args.dimName, 
      member: args.memberName, 
      error: message 
    });

    return {
      success: false,
      error: 'Failed to fetch member details',
      details: error.response?.data || error.message
    };
  }
};
