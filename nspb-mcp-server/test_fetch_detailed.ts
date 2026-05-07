import oracleClient from './src/services/oracleClient.js';
import { transformationService } from './src/services/transformationService.js';
import { aliasResolver } from './src/services/aliasResolver.js';

const grid = {
  pov: {
    dimensions: [
        'Scenario', 'Version', 'Years', 'Subsidiary', 'Region', 'Location',
        'Relationship', 'Tracker', 'Currency', 'Department', 'Class', 'Vertical'
    ],
    members: [
        ['NSP_Actual'], ['NSP_Base'], ['FY25'], ['NSP_Total Subsidiary'], ['Total Region'], ['NSP_Total Location'],
        ['NSP_Total Relationship'], ['NSP_Amount'], ['EUR_Reporting'], ['TD'], ['TC'], ['TV']
    ]
  },
  columns: [{ dimensions: ['Period'], members: [['Mar']] }],
  rows: [{ dimensions: ['Account'], members: [['IDescendants(NFS_Income)']] }],
  suppressMissingRows: false,
  suppressMissingColumns: false
};

async function test() {
    try {
        const response = await oracleClient.post('/plantypes/NSP_NFS/exportdataslice', { gridDefinition: grid, exportPlanningData: false });
        console.log("Status:", response.status);
        
        const rawData = response.data;
        const pov = {
            Scenario: 'NSP_Actual',
            Version: 'NSP_Base',
            Years: 'FY25',
            Subsidiary: 'NSP_Total Subsidiary'
        };

        const aliasMap = await aliasResolver.resolveAliases('Account', ['NFS_Income']);
        const transformed: any = transformationService.transformNSPBResponse(rawData, pov, aliasMap);
        
        console.log("Columns:", transformed.columns);
        console.log("Transformed rows sample (first 5):");
        if (transformed && transformed.rows) {
            transformed.rows.slice(0, 5).forEach((r: any) => {
                console.log(JSON.stringify(r, null, 2));
            });
            
            const cols = transformed.columns.filter((c: string) => c !== 'Member');
            const withData = transformed.rows.filter((r: any) => {
                return cols.some((c: string) => r[c] != null && r[c] !== 0);
            });
            console.log("\nRows with NON-ZERO data count:", withData.length);
            if (withData.length > 0) {
                console.log("Sample rows with data:");
                withData.slice(0, 10).forEach((r: any) => {
                    console.log(`${r.Member}: ${JSON.stringify(r)}`);
                });
            } else {
                console.log("No non-zero data found at this intersection.");
            }
        }
    } catch (e: any) {
        if (e.response) {
            console.error("Error Status:", e.response.status);
            console.error("Error Detail:", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("Error:", e.message);
        }
    }
}

test();
