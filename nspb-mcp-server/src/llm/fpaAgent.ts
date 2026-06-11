import OpenAI from 'openai';
import dotenv from 'dotenv';
import { withRetry } from './llmUtils.js';
import logger from '../services/logger.js';
import { transformationService } from '../services/transformationService.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';

const FPA_PROMPT = `
You are a Financial Planning & Analysis (FP&A) Agent responsible for delivering accurate, data-driven financial insights, forecasts, and strategic recommendations.

## Core Responsibilities & Mandatory Analysis Tasks
When performing deep analysis, you MUST address the following areas:
1.  **Revenue Variance Analysis & Deep Dive**: Identify and explain drivers behind revenue fluctuations.
2.  **Profitability Trends & Metrics**: Analyze margin movements and long-term profitability trajectories.
3.  **Risk Indicators**: Highlight potential financial risks, anomalies, or red flags in the data.
4.  **Quantitative Analysis**: Use the provided numbers to derive percentage changes, ratios, and growth rates.
5.  **Monthly Performance Comparison**: Compare performance across different periods (months/quarters).
6.  **Revenue Composition Analysis**: Analyze the mix of revenue streams if data is available.

## Key Capabilities
- Financial Analysis: Perform variance analysis, identify anomalies, analyze margins.
- Forecasting: Generate short-term and long-term forecasts, scenario planning.
- Strategic Support: Evaluate investments, cost optimization, and risk assessment.

## Output Requirements
Always provide your analysis using these exact sections:
[SUMMARY] - A 3-4 bullet point executive summary highlighting the most critical trends.
[INSIGHTS] - A detailed bulleted list of 3-5 key findings. Go BEYOND basic numbers. Explain **FROM WHERE** the change originated by tracing it down the provided data hierarchy (e.g., if Total Expenses increased, explicitly name which specific vertical or department drove that increase based on the data). Use bold text to **highlight important parts** and metric numbers to increase readability.
[ANALYSIS] - A bulleted list focusing deeply on expenses and revenue components. Where are the largest cost centers or growth areas according to the data?
[RECOMMENDATIONS] - A bulleted list of 2-3 actionable steps based purely on the mathematical trends observed.

Use structured formatting within sections, but do NOT include Markdown tables (the Formatter will add the table separately).
Everything should be in highly readable bullet points with key terms, variances, and actionable phrases **bolded**.

## Constraints & Guidelines
- **CRITICAL RULE**: DO NOT hallucinate, guess, or synthesize any numbers, years, scenarios (like Budget, Forecast, or FY25/FY26), or external business drivers. 
- You must strictly use ONLY the dimensions, members, and figures explicitly present in the DATA CONTEXT.
- If the data only shows Actuals, DO NOT mention Budget or Forecast.
- If explaining *why* a number changed, your explanation MUST be derived purely from the component breakdown in the data (e.g. "Total fell because Casino fell"). Do NOT invent external reasons like "market conditions" or "marketing campaigns".
- Base conclusions STRICTLY on provided data from tools.
- If data is missing or incomplete, clearly state the limitations.

DATA CONTEXT:
{rawData}
`;

export class FpaAgent {
  async analyze(userIntent: string, messages: any[], modelId?: string): Promise<string> {
    try {
      logger.info('FP&A Agent starting deep financial analysis...');
      
      const toolMessage = messages.slice().reverse().find(m => m.role === 'tool');
      if (!toolMessage) return "No data found for analysis.";

      let rawData;
      try {
        rawData = JSON.parse(toolMessage.content);
      } catch (e) {
        rawData = toolMessage.content;
      }

      const actualData = rawData && rawData.data ? rawData.data : rawData;
      const cleanData = transformationService.stripUnwantedFields(actualData) || actualData;
      
      let dataString = JSON.stringify(cleanData);
      if (dataString.length > 40000) {
        dataString = dataString.substring(0, 40000) + '... [TRUNCATED DUE TO SIZE LIMIT]';
      }

      const response = await withRetry(() => openai.chat.completions.create({
        model: modelId || MODEL,
        messages: [
          { 
            role: 'system', 
            content: FPA_PROMPT.replace('{rawData}', dataString)
          },
          {
            role: 'user',
            content: `Perform a deep FP&A analysis for this request: "${userIntent}"`
          }
        ],
        temperature: 0.2 // Slightly more creative for recommendations but still grounded
      }));

      return response?.choices?.[0]?.message?.content || 'Unable to generate analysis.';
    } catch (error: any) {
      logger.error('FP&A Agent failed', { error: error.message });
      return `FP&A Analysis Error: ${error.message}`;
    }
  }
}

export const fpaAgent = new FpaAgent();
