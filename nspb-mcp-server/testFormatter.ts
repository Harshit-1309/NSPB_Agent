import { formatterAgent } from './src/llm/formatterAgent.js';

async function run() {
  const messages = [
    {
      role: 'tool',
      content: JSON.stringify({
        success: true,
        data: {
          povContext: "**Year:** FY25 &nbsp;&nbsp;&nbsp; **Currency:** EUR_Reporting &nbsp;&nbsp;&nbsp; **Subsidiary:** NSP_Total Subsidiary",
          columns: ["Account", "TP1", "TP11", "YearTotal"],
          rows: [
            { "Account": "NFS_Income", "TP1": "#Missing", "TP11": "5260272.94", "YearTotal": "10667587.73" }
          ]
        }
      })
    }
  ];

  const result = await formatterAgent.formatData("format this", messages);
  console.log("=== OUTPUT ===");
  console.log(result);
}

run().catch(console.error);
