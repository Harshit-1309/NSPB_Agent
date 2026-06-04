import { formatterAgent } from './src/llm/formatterAgent.js';
import fs from 'fs';

async function run() {
  const sampleData = JSON.parse(fs.readFileSync('scratch/form_data_sample.json', 'utf8'));

  const messages = [
    {
      role: 'user',
      content: "Fetch form data for form 'Segment Overview Report'"
    },
    {
      role: 'assistant',
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'getFormData',
            arguments: JSON.stringify({ idorname: 'Segment Overview Report' })
          }
        }
      ]
    },
    {
      role: 'tool',
      name: 'getFormData',
      tool_call_id: 'call_123',
      content: JSON.stringify({
        success: true,
        data: sampleData
      })
    }
  ];

  const result = await formatterAgent.formatData("Fetch form data for form 'Segment Overview Report'", messages, undefined, false);
  console.log("=== OUTPUT START ===");
  console.log(result.substring(0, 800));
}

run().catch(console.error);
