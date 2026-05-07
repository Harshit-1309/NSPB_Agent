import { llmAgent } from './llm/llmAgent.js';
import logger from './services/logger.js';

async function test() {
  console.log("Starting Internal Report Test...");
  
  try {
    const response = await llmAgent.handleUserInput(
      "Create Actual Income Statement Report by Subsidiary for FY25",
      undefined,
      [],
      (step) => console.log(`[STEP] ${step}`)
    );
    
    console.log("\n--- FINAL RESPONSE ---");
    console.log(response.response);
    
    try {
      const parsed = JSON.parse(response.response);
      console.log("\n--- VALIDATION ---");
      console.log(`Type: ${parsed.type}`);
      console.log(`Table Rows: ${parsed.table?.rows?.length || 0}`);
      console.log(`Table Cols: ${parsed.table?.columns?.join(', ') || 'None'}`);
      console.log(`Filters: ${parsed.filters?.join(', ') || 'None'}`);
      
      if (parsed.type === 'report' && parsed.table?.rows?.length > 0) {
        console.log("✅ SUCCESS: Found valid report table!");
      } else {
        console.log("❌ FAILURE: Missing report type or empty table.");
      }
    } catch (e) {
      console.log("❌ FAILURE: Response is not valid JSON.");
    }
    
    console.log("\n--- STEPS ---");
    console.log(response.steps.join("\n"));
  } catch (error: any) {
    console.error("Test Failed:", error.message);
  }
}

test();
