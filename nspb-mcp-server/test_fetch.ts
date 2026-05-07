import oracleClient from './src/services/oracleClient.js';
import { transformationService } from './src/services/transformationService.js';

const grid = {
  pov: {
    dimensions: ['Scenario', 'Version', 'Years', 'Subsidiary'],
    members: [['NSP_Actual'], ['NSP_Base'], ['FY25'], ['NSP_Total Subsidiary']]
  },
  columns: [{ dimensions: ['Period'], members: [['Mar']] }],
  rows: [{ dimensions: ['Account'], members: [['IDescendants(NFS_Income)']] }],
  suppressMissingRows: true,
  suppressMissingColumns: true
};

oracleClient.post('/plantypes/NSP_NFS/exportdataslice', { gridDefinition: grid, exportPlanningData: false })
  .then(r => {
     console.log("Raw response rows:", r.data.rows.length);
     console.log(JSON.stringify(r.data.rows[0], null, 2));
  })
  .catch(console.error);
