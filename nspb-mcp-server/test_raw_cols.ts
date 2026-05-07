import oracleClient from './src/services/oracleClient.js';

async function testRawColumns() {
  const grid = {
    pov: {
      dimensions: ['Version', 'Subsidiary', 'Region', 'Location', 'Relationship', 'Tracker', 'Currency', 'Department', 'Class', 'Vertical'],
      members: [['NSP_Base'], ['NSP_Total Subsidiary'], ['Total Region'], ['NSP_Total Location'], ['NSP_Total Relationship'], ['NSP_Amount'], ['EUR_Reporting'], ['TD'], ['TC'], ['TV']]
    },
    columns: [
        { dimensions: ['Scenario', 'Years', 'Period'], members: [['NSP_Actual'], ['FY25'], ['TP11']] },
        { dimensions: ['Scenario', 'Years', 'Period'], members: [['NSP_Forecast'], ['FY25'], ['TP11']] }
    ],
    rows: [{ dimensions: ['Account'], members: [['NFS_Gross Profit']] }],
    suppressMissingRows: true
  };

  try {
    const res = await oracleClient.post('/plantypes/NSP_NFS/exportdataslice', { gridDefinition: grid, exportPlanningData: false });
    console.log('--- RAW COLUMNS ---');
    console.log(JSON.stringify(res.data.columns, null, 2));
  } catch (e: any) {
    console.error('ERROR:', e.response?.data || e.message);
  }
}

testRawColumns();
