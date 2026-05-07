import { llmAgent } from './src/llm/llmAgent.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const result = await llmAgent.processChat("Fetch Income Statement data for Years-'FY25', Period-'TP1','TP11','YearTotal', Account-'NFS_Income','NFS_Cost of Sales','NFS_Expense'.", [], "openai/gpt-4o-mini");
  console.log("GPT-4o Mini Result:", result);

  const result2 = await llmAgent.processChat("Fetch Income Statement data for Years-'FY25', Period-'TP1','TP11','YearTotal', Account-'NFS_Income','NFS_Cost of Sales','NFS_Expense'.", [], "google/gemini-2.0-flash-001");
  console.log("Gemini Result:", result2);
}

run().catch(console.error);
