import { exportDataSlice } from './src/tools/exportDataSlice.js';

async function testSegmentSlice() {
  const periodLabel = 'Nov-25';
  const year = 'FY25';
  const period = 'TP11';
  const priorYear = 'FY24';
  
  const accounts = [
    'P_10001', '10001', '10002', 'P_20000', 'NFS_Gross Profit', 'P_20200', 'NFS_Total Expenses', 'NFS_EBITDA'
  ];

  const columns = [
    `Scenario:NSP_Actual, Years:${year}, Period:${period}`,
    `Scenario:NSP_Forecast, Years:${year}, Period:${period}`,
    `Scenario:NSP_Budget, Years:${year}, Period:${period}`,
    `Scenario:NSP_Actual, Years:${priorYear}, Period:${period}`,
    `Scenario:NSP_Actual, Years:${year}, Period:YearTotal`,
    `Scenario:NSP_Forecast, Years:${year}, Period:YearTotal`,
    `Scenario:NSP_Budget, Years:${year}, Period:YearTotal`,
    `Scenario:NSP_Actual, Years:${priorYear}, Period:YearTotal`
  ];

  try {
    const result = await exportDataSlice({
      rows: accounts,
      columns: columns,
      pov: {},
      skipLayoutEnforcement: true,
      suppressMissingRows: false,
      suppressMissingColumns: false
    });

    if (result.success) {
      console.log('SUCCESS');
      console.log('POV Details:', result.data.povDetails);
      console.log('Columns:', result.data.columns);
      console.log('Rows count:', result.data.rows.length);
      if (result.data.rows.length > 0) {
        console.log('First row:', JSON.stringify(result.data.rows[0], null, 2));
      }
    } else {
      console.error('FAILED:', result.error);
      console.error('Details:', JSON.stringify(result.details, null, 2));
    }
  } catch (e: any) {
    console.error('ERROR:', e.message);
  }
}

testSegmentSlice();
