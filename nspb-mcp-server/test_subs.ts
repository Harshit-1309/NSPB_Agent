import { exportDataSlice } from './src/tools/exportDataSlice.js';

exportDataSlice({ 
    rows: ['Subsidiary:ILvl0Descendants(NSP_Total Subsidiary)'], 
    columns: ['Period:Mar'], 
    pov: { Years: 'FY25', Scenario: 'NSP_Actual' } 
})
.then(d => {
    console.log("Subsidiaries found:");
    if (d && d.rows) {
        d.rows.forEach((r: any) => console.log(` - ${r.Member}`));
    }
})
.catch(console.error);
