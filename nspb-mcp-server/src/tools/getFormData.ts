import planningClient from '../services/oracleClient.js';
import { z } from 'zod';
import logger from '../services/logger.js';
import { authStorage } from '../services/oracleClient.js';
import fs from 'fs';

export const getFormDataSchema = z.object({
  idorname: z.string().min(1, 'Form ID or name is required'),
  pageMbrList: z.union([z.string(), z.array(z.string())]).optional().describe('Members for page dimensions like Subsidiary, Currency, etc.'),
  userVariableUpdates: z.record(z.string()).optional().describe('CRITICAL: To change the Period (e.g. Jan) or Years (e.g. FY26) for the form, you MUST provide them here as a map of Dimension to Member name (e.g. {"Period": "Jan", "Years": "FY26"}). DO NOT pass Period or Years in pageMbrList!')
});

export type GetFormDataInput = z.infer<typeof getFormDataSchema>;

export const getFormData = async (args: any) => {
  try {
    const validatedArgs = getFormDataSchema.parse(args);
    const { idorname, pageMbrList, userVariableUpdates } = validatedArgs;

    // Optional: Update User Variables first
    if (userVariableUpdates && Object.keys(userVariableUpdates).length > 0) {
      try {
        // 1. Get the current user name
        const auth = authStorage.getStore() || (fs.existsSync('scratch/auth_token.txt') ? fs.readFileSync('scratch/auth_token.txt', 'utf8').trim() : '');
        let username = '';
        if (auth && auth.startsWith('Basic ')) {
          const b64 = auth.split(' ')[1];
          const fullUser = Buffer.from(b64, 'base64').toString('utf8').split(':')[0];
          username = fullUser.includes('.') && fullUser.indexOf('.') < fullUser.indexOf('@') 
            ? fullUser.substring(fullUser.indexOf('.') + 1) 
            : fullUser;
        }

        if (username) {
          logger.info(`Fetching user variables to update for user: ${username}`);
          // 2. Fetch all user variables
          const uvRes = await planningClient.get('/uservariables');
          const allVars = uvRes.data?.items || [];

          // 3. Find matching variables for requested dimensions
          const itemsToUpdate: any[] = [];
          
          const monthToTp: Record<string, string> = {
            'jan': 'TP1', 'january': 'TP1', 'feb': 'TP2', 'february': 'TP2',
            'mar': 'TP3', 'march': 'TP3', 'apr': 'TP4', 'april': 'TP4',
            'may': 'TP5', 'jun': 'TP6', 'june': 'TP6',
            'jul': 'TP7', 'july': 'TP7', 'aug': 'TP8', 'august': 'TP8',
            'sep': 'TP9', 'september': 'TP9', 'oct': 'TP10', 'october': 'TP10',
            'nov': 'TP11', 'november': 'TP11', 'dec': 'TP12', 'december': 'TP12'
          };

          for (const [dim, member] of Object.entries(userVariableUpdates)) {
            let mappedMember = String(member);
            if (dim.toLowerCase() === 'period') {
              const lowerMbr = mappedMember.toLowerCase();
              if (monthToTp[lowerMbr]) {
                mappedMember = monthToTp[lowerMbr];
              }
            }

            const matchingVars = allVars.filter((v: any) => v.dimension.toLowerCase() === dim.toLowerCase());
            for (const v of matchingVars) {
              itemsToUpdate.push({
                userName: username,
                name: v.name,
                dimension: v.dimension,
                member: mappedMember
              });
            }
          }

          // 4. Update the variables individually to avoid one failure blocking others
          for (const item of itemsToUpdate) {
            try {
              logger.info(`Updating user variable ${item.name}...`);
              await planningClient.post('/uservariablevalues', { items: [item] });
              logger.info(`Successfully updated user variable ${item.name}.`);
            } catch (err: any) {
              logger.warn(`Failed to update user variable ${item.name}`, { error: err.response?.data?.details || err.message });
            }
          }
        }
      } catch (uvError: any) {
        logger.warn('Failed in user variable update process', { error: uvError.message });
      }
    }

    // Call Oracle Planning REST API relative to planningClient base URL
    // Endpoint: GET /HyperionPlanning/rest/v3/applications/{application}/forms/{idorname}/data
    const queryParams = new URLSearchParams();

    if (pageMbrList) {
      let pages: string[] = [];
      if (Array.isArray(pageMbrList)) {
        pages = pageMbrList;
      } else {
        pages = pageMbrList.split(',');
      }
      pages.forEach(m => queryParams.append('page', m.trim()));
    }

    // Add formatting parameters to get beautiful human-readable Alias names in the UI!
    queryParams.append('displayMemberAs', 'Alias');
    queryParams.append('memberAliasDelimiter', ' | ');

    const url = `/forms/${encodeURIComponent(idorname)}/data?${queryParams.toString()}`;

    const response = await planningClient.get(url);

    return {
      success: true,
      data: response.data
    };
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return { success: false, error: 'Validation Error', details: error.errors };
    }

    const message = error.response?.data?.detail || error.message;
    logger.error('Failed to fetch form data', {
      idorname: args.idorname,
      error: message
    });

    return {
      success: false,
      error: 'Failed to fetch form data',
      details: error.response?.data || error.message
    };
  }
};

