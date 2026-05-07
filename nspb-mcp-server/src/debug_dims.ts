import { planningClient } from './services/oracleClient.js';
import logger from './services/logger.js';

async function debugDims() {
  try {
    const res = await planningClient.get('/dimensions');
    console.log('--- DIMENSIONS ---');
    console.log(res.data.items.map((i: any) => i.name).join(', '));
    console.log('------------------');
  } catch (err: any) {
    console.error('Failed to fetch dimensions:', err.response?.data || err.message);
  }
}

debugDims();
