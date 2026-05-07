import { exportDataSlice } from './src/tools/exportDataSlice.js';
import logger from './src/services/logger.js';
import dotenv from 'dotenv';

dotenv.config();

async function runTest() {
  console.log('--- STARTING DIAGNOSTIC EXPORT ---');
  
  const args = {
    gridDefinition: {
      pov: { dimensions: ["Years"], members: [["FY25"]] },
      columns: [{ dimensions: ["Period"], members: [["Oct", "Nov", "Dec"]] }],
      rows: [{ dimensions: ["Account"], members: [["NFS_Income", "NFS_Cost of Sales", "NFS_Expense"]] }]
    }
  };

  try {
    const result = await exportDataSlice(args);
    console.log('RESULT:', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('TEST FAILED:', err.message);
  }
}

runTest();
