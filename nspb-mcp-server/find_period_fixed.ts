import oracleClient from './src/services/oracleClient.js';

const grid = {
  gridDefinition: {
    pov: {
      dimensions: [
          'Scenario', 'Version', 'Years', 'Region', 'Location',
          'Relationship', 'Tracker', 'Currency', 'Department', 'Class', 'Vertical', 'Subsidiary'
      ],
      members: [
          ['NSP_Actual'], ['NSP_Base'], ['FY25'], ['Total Region'], ['NSP_Total Location'],
          ['NSP_Total Relationship'], ['NSP_Amount'], ['EUR_Reporting'], ['TD'], ['TC'], ['TV'], ['SUB_16']
      ]
    },
    columns: [{ dimensions: ['Period'], members: [['IDescendants(YearTotal)']] }],
    rows: [{ dimensions: ['Account'], members: [['NFS_Income']] }],
    suppressMissingRows: false,
    suppressMissingColumns: true
  },
  exportPlanningData: false
};

async function test() {
    try {
        const response = await oracleClient.post('/plantypes/NSP_NFS/exportdataslice', grid);
        console.log("Periods with data for NFS_Income at SUB_16:");
        if (response.data && response.data.columns && response.data.columns[0]) {
            console.log("Found columns:", response.data.columns[0]);
            if (response.data.rows && response.data.rows[0]) {
                console.log("Data values:", response.data.rows[0].data);
            }
        } else {
            console.log("No data found for any period at this intersection.");
        }
    } catch (e: any) {
        if (e.response) {
            console.error("Error Status:", e.response.status);
            console.error("Error Data:", JSON.stringify(e.response.data, null, 2));
        } else {
            console.error("Error:", e.message);
        }
    }
}

test();
