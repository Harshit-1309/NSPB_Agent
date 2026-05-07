import { segmentOverview } from './src/tools/segmentOverview.js';

segmentOverview({ periodLabel: 'Oct-25', filterDimensions: [], pov: {} })
  .then(d => {
    console.log("Success!");
    console.log(JSON.stringify(d, null, 2));
  })
  .catch(console.error);
