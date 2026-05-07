import oracleClient from './src/services/oracleClient.js';

const grid = {
  pov: {
    dimensions: [
        'Scenario', 'Version', 'Years', 'Account', 'Region', 'Location',
        'Relationship', 'Tracker', 'Currency', 'Department', 'Class', 'Vertical', 'Period'
    ],
    members: [
        ['NSP_Actual'], ['NSP_Base'], ['FY25'], ['NFS_Income'], ['Total Region'], ['NSP_Total Location'],
        ['NSP_Total Relationship'], ['NSP_Amount'], ['EUR_Reporting'], ['TD'], ['TC'], ['TV'], ['YearTotal']
    ]
  },
  columns: [{ dimensions: ['Period'], members: [['YearTotal']] }], // Wait, Period is already in POV in my list above.
  rows: [{ dimensions: ['Subsidiary'], members: [['ILvl0Descendants(NSP_Total Subsidiary)']] }],
  suppressMissingRows: true,
  suppressMissingColumns: true
};

// Fix the grid POV/Columns overlap
grid.columns = [{ dimensions: ['Period'], members: [['YearTotal']] }];
grid.pov.dimensions = grid.pov.dimensions.filter(d => d !== 'Period');
grid.pov.members = grid.pov.members.filter((m, i) => grid.pov.dimensions[i] !== 'Period');

async function test() {
    try {
        const response = await oracleClient.post('/plantypes/NSP_NFS/exportdataslice', { gridDefinition: grid, exportPlanningData: false });
        console.log("Subsidiaries with data for NFS_Income at YearTotal:");
        if (response.data && response.data.rows) {
            response.data.rows.forEach((r: any) => {
                console.log(` - ${r.headers[0]}: ${r.data[0]}`);
            });
        } else {
            console.log("No subsidiaries have data for NFS_Income at this intersection.");
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

test();
