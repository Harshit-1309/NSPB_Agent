import oracleClient from '../services/oracleClient.js';
import { updateMemberSchema } from '../schemas/memberSchema.js';
import logger from '../services/logger.js';

export const updateMember = async (args: any) => {
  try {
    const validatedArgs = updateMemberSchema.parse(args);
    const { dimName, memberName, dataStorage, alias, description } = validatedArgs;

    // Standard properties mapping for Oracle NSPB member update
    const payload: any = {
      memberName
    };
    if (dataStorage) payload.dataStorage = dataStorage;
    if (alias) payload.alias = alias;
    if (description) payload.description = description;

    logger.info(`Attempting to update member: ${memberName} in dimension: ${dimName}`);
    
    // Strategy: In many EPM REST versions, metadata updates are performed via POST
    // to the members collection, providing the existing name.
    try {
      // 1. Try POST to the dimensions collection (common update-or-insert pattern)
      const postUrl = `/dimensions/${encodeURIComponent(dimName)}/members`;
      logger.info(`Trying POST update (Method 1): ${postUrl}`);
      const response = await oracleClient.post(postUrl, payload);
      
      return {
        success: true,
        message: `Member ${memberName} updated successfully via POST.`,
        data: response.data
      };
    } catch (postErr: any) {
      logger.warn('POST update failed, trying PUT update (Method 2)...', { error: postErr.message });
      
      try {
        // 2. Try PUT to the specific member resource
        const putUrl = `/dimensions/${encodeURIComponent(dimName)}/members/${encodeURIComponent(memberName)}`;
        const putResponse = await oracleClient.put(putUrl, payload);
        
        return {
          success: true,
          message: `Member ${memberName} updated successfully via PUT.`,
          data: putResponse.data
        };
      } catch (putErr: any) {
        // 3. Last Resort: Try via Plan Type
        logger.warn('Direct PUT failed, trying Plan Type discovery fallback...');
        const ptResponse = await oracleClient.get('/plantypes');
        const items = ptResponse.data?.items || [];
        const planTypeObj = items[0];
        const planType = planTypeObj?.name || planTypeObj?.id || planTypeObj?.planTypeName;

        if (planType) {
          const ptUrl = `/plantypes/${encodeURIComponent(planType)}/dimensions/${encodeURIComponent(dimName)}/members`;
          logger.info(`Trying Plan Type POST (Method 3): ${ptUrl}`);
          const retryResponse = await oracleClient.post(ptUrl, payload);
          return {
            success: true,
            message: `Member ${memberName} updated successfully via plan type ${planType}.`,
            data: retryResponse.data
          };
        }
        throw putErr;
      }
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return { success: false, error: 'Validation Error', details: error.errors };
    }

    const message = error.response?.data?.detail || error.message;
    logger.error('Failed to update member across all methods', { 
      dimension: args.dimName, 
      member: args.memberName, 
      error: message,
      details: error.response?.data
    });

    return {
      success: false,
      error: 'Failed to update member',
      details: error.response?.data || error.message
    };
  }
};
