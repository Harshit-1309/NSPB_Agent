import { mathAgent } from './src/llm/mathAgent.js';
import dotenv from 'dotenv';
dotenv.config();

const testData = {
  columns: ["Account", "Jan", "Feb"],
  rows: [
    { Account: "Income", Jan: 100, Feb: 200 },
    { Account: "Expense", Jan: 40, Feb: 80 }
  ]
};

async function run() {
  console.log("Original Data:", JSON.stringify(testData, null, 2));
  
  const result = await mathAgent.applyMath(
    testData, 
    "Calculate Profit as Income - Expense", 
    "openai/gpt-4o-mini"
  );
  
  console.log("Calculated Data:", JSON.stringify(result, null, 2));
}

run().catch(console.error);
