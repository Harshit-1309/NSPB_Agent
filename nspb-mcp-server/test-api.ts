import { exportDataSlice } from './dist/tools/exportDataSlice.js';
import dotenv from 'dotenv';
dotenv.config();

async function testExport() {
  try {
    console.log('Hitting exportDataSlice tool wrapper...');
    
    // Notice: We are completely omitting the 11 default POV dimensions here!
    // We are ONLY providing Years, Period, and Account.
    const payload = {
      planType: 'NSP_NFS',
      exportPlanningData: false,
      gridDefinition: {
        pov: {
          dimensions: ["Years"],
          members: [["FY25"]]
        },
        columns: [
          {
            dimensions: ["Period"],
            members: [["Oct", "Nov", "Dec", "YearTotal"]]
          }
        ],
        rows: [
          {
            dimensions: ["Account"],
            members: [["NFS_Income", "NFS_Cost of Sales", "NFS_Expense"]]
          }
        ]
      }
    };

    const response = await exportDataSlice(payload);
    console.log('Response:', JSON.stringify(response, null, 2));
  } catch (error: any) {
    console.error('Failed.', error);
  }
}

testExport();
