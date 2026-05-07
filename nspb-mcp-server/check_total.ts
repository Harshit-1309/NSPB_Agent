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
          ['NSP_Total Relationship'], ['NSP_Amount'], ['EUR_Reporting'], ['TD'], ['TC'], ['TV'], ['NSP_Total Subsidiary']
      ]
    },
    columns: [{ dimensions: ['Period'], members: [['YearTotal']] }],
    rows: [{ dimensions: ['Account'], members: [['NFS_Income']] }],
    suppressMissingRows: false,
    suppressMissingColumns: true
  },
  exportPlanningData: false
};

async function test() {
    try {
        const response = await oracleClient.post('/plantypes/NSP_NFS/exportdataslice', grid);
        console.log("Data for NFS_Income at NSP_Total Subsidiary / YearTotal:");
        if (response.data && response.data.rows && response.data.rows[0]) {
            console.log("Value:", response.data.rows[0].data[0]);
        } else {
            console.log("No data found.");
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

test();
