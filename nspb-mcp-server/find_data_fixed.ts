import oracleClient from './src/services/oracleClient.js';

const grid = {
  gridDefinition: {
    pov: {
      dimensions: [
          'Scenario', 'Version', 'Years', 'Account', 'Region', 'Location',
          'Relationship', 'Tracker', 'Currency', 'Department', 'Class', 'Vertical'
      ],
      members: [
          ['NSP_Actual'], ['NSP_Base'], ['FY25'], ['NFS_Income'], ['Total Region'], ['NSP_Total Location'],
          ['NSP_Total Relationship'], ['NSP_Amount'], ['EUR_Reporting'], ['TD'], ['TC'], ['TV']
      ]
    },
    columns: [{ dimensions: ['Period'], members: [['Mar']] }],
    rows: [{ dimensions: ['Subsidiary'], members: [['ILvl0Descendants(NSP_Total Subsidiary)']] }],
    suppressMissingRows: true,
    suppressMissingColumns: true
  },
  exportPlanningData: false
};

async function test() {
    try {
        const response = await oracleClient.post('/plantypes/NSP_NFS/exportdataslice', grid);
        console.log("Subsidiaries with data for NFS_Income at YearTotal:");
        if (response.data && response.data.rows) {
            response.data.rows.forEach((r: any) => {
                console.log(` - ${r.headers[0]}: ${r.data[0]}`);
            });
        } else {
            console.log("No subsidiaries have data for NFS_Income at this intersection.");
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
