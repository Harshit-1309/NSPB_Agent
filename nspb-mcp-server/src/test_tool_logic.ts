import { segmentOverview } from './tools/segmentOverview.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    const result = await segmentOverview({
      periodLabel: 'Nov-25',
      filterDimensions: ['Subsidiary'],
      pov: {}
    });
    
    console.log("Success:", result.success);
    if (result.success) {
      console.log("Keys:", Object.keys(result));
      console.log("Rows:", result.rows?.length);
      if (result.rows && result.rows.length > 0) {
        console.log("Row Sample:", JSON.stringify(result.rows[0], null, 2));
      }
    } else {
      console.log("Error:", (result as any).error);
    }
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}

test();
