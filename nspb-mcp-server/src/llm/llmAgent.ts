import OpenAI from 'openai';
import dotenv from 'dotenv';
import { mcpClient } from '../agent/mcpClient.js';
import { mcpToolMapper } from './mcpToolMapper.js';
import { formatterAgent } from './formatterAgent.js';
import { mathAgent } from './mathAgent.js';
import { fpaAgent } from './fpaAgent.js';
import { withRetry } from './llmUtils.js';
import logger from '../services/logger.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/mcp-nspb-server', // Optional, for rankings
    'X-Title': 'NSPB MCP Agent', // Optional, for rankings
  },
  maxRetries: 5 // Built-in OpenAI retry for some errors
});

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o';

const SYSTEM_PROMPT = `
# Role
You are an expert NSPB (NetSuite Planning and Budgeting) Financial Analyst Agent.

## Core Objective
Your goal is to provide fast, accurate financial data retrieval and analysis. Treat phrasings like "Show me", "Fetch", "Get", "Display", "View", and "Look up" as identical instructions to retrieve data.

## Domain Knowledge (Use these directly)
- **Scenario**: NSP_Actual, NSP_Budget, NSP_Forecast.
- **Years**: FY25 (default), FY24.
- **Period**: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, YearTotal.
- **Account**: NFS_Income (Revenue), NFS_Expense, NFS_Cost of Sales.
- **Standard POV**: Unless specified, assume Currency="EUR_Reporting", Version="NSP_Base", Subsidiary="NSP_Total Subsidiary", Region="Total Region".

## Efficiency Rules (Critical)
1. **NO DISCOVERY**: Do NOT call 'getDimensions', 'getSubstitutionVariables', or 'listMembers' unless a previous data fetch failed with a 'Member not found' error.
2. **IMMEDIATE EXPORT**: For any data request (Variance, Totals, Comparisons, Lists), call 'exportDataSlice' immediately.
3. **VARIANCE CALCULATIONS**: When asked for Variance, Growth, or Comparisons:
   - **MANDATORY**: Call 'exportDataSlice' and pass the math instructions to the 'calculationInstructions' parameter.
   - Example: For "Variance Oct vs Nov", pass calculationInstructions: "Calculate Variance (Nov-Oct) and Variance % ((Nov-Oct)/Oct)".
   - Set 'columns' to the periods involved (e.g., ["Oct", "Nov"]).
   - NEVER skip the 'calculationInstructions' parameter if math is requested.
4. **SUBSTITUTION VARIABLES**: NEVER call 'getSubstitutionVariables' unless the user explicitly mentions "substitution variables" or "placeholder variables" in their text.

## Report Generation (Income Statement)
- When requested for an "Actual Income Statement Report" or "Data by X":
  1. Call 'exportDataSlice' without 'rows' or 'pivotDim' to trigger the optimized default P&L layout.
  2. If "by X" is requested (e.g., "by Region", "by Product", "by Subsidiary"), set 'pivotDim' to that dimension (e.g., \`pivotDim: "Region"\`). 
  3. **CRITICAL**: If a dimension is used as \`pivotDim\`, remove it from the \`pov\` object to avoid redundancy.
  4. Use 'segmentOverview' ONLY when the user explicitly uses the words "Segment Overview" or "Dashboard Report". For all other "Show" or "Fetch" requests, use 'exportDataSlice'.
`;

export interface LLMResponse {
  response: string;
  steps: string[];
}

export class LLMAgent {
  private tools: any[] = [];
  private lastExportedData: any = null; // Session cache for math operations
  private lastToolName: string = ''; // Track which tool produced the cache

  async initialize() {
    this.tools = await mcpToolMapper.getOpenAITools();
    
    // Add virtual applyMath tool
    this.tools.push({
      type: 'function',
      function: {
        name: 'applyMath',
        description: 'Perform mathematical calculations (e.g., Variance, Totals, Margins) on the most recently fetched data slice. Use this to avoid re-exporting data if it is already available in the chat context.',
        parameters: {
          type: 'object',
          properties: {
            calculationInstructions: { 
              type: 'string', 
              description: 'The math instructions to perform on the data. Example: "Calculate Variance between Oct and Nov"' 
            }
          },
          required: ['calculationInstructions']
        }
      }
    });

    logger.info(`LLM Agent initialized with ${this.tools.length} tools (including virtual applyMath).`);
  }

  private analyticalKeywords = ['analyze', 'analysis', 'insight', 'recommend', 'trend', 'risk', 'opportunity', 'strategy', 'why', 'drivers', 'commentary', 'explain', 'tell me about'];
  private mathKeywords = ['calculate', 'variance', 'growth', 'percentage', 'delta', 'difference', 'vs', 'compared to', 'margin %'];

  async handleUserInput(
    text: string, 
    modelId?: string, 
    historicalMessages: any[] = [],
    onStep?: (step: string) => void
  ): Promise<LLMResponse> {
    const activeModel = modelId || MODEL;
    const lowerText = text.toLowerCase();
    if (this.tools.length === 0) await this.initialize();

    // Clean history to prevent context overflow and fix invalid roles
    const cleanedHistory = historicalMessages.map(m => {
      // Fix role: OpenAI/OpenRouter only accept 'assistant', not 'agent'
      return {
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content
      };
    });

    let messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...cleanedHistory,
      { role: 'user', content: text }
    ];

    const steps: string[] = [];
    const addStep = (step: string) => {
      steps.push(step);
      if (onStep) onStep(step);
    };

    let hasNewToolCall = false;

    try {
      addStep('Analyzing request and determining tool usage...');
      
      logger.info('LLM Request Pass 1', { 
        model: activeModel, 
        messageCount: messages.length,
        toolCount: this.tools.length
      });

      let response = await withRetry(() => openai.chat.completions.create({
        model: activeModel,
        messages: messages,
        tools: this.tools.length > 0 ? this.tools : undefined,
        tool_choice: this.tools.length > 0 ? 'auto' : undefined,
      }));
      
      if (!response?.choices?.length) {
        logger.error('Empty LLM response received', { response: JSON.stringify(response) });
        throw new Error('LLM returned an empty response (no choices).');
      }
      
      let responseMessage = response.choices[0].message;
      logger.info('LLM Response Received', { 
        content: responseMessage.content, 
        hasToolCalls: !!responseMessage.tool_calls 
      });

      // Handle Tool Calls
      while (responseMessage.tool_calls) {
        messages.push(responseMessage);

        let shouldBypassNextLLMCall = false;

        for (const toolCall of responseMessage.tool_calls) {
          const functionName = (toolCall as any).function.name;
          // Safe-parse: LLMs sometimes return JS-style objects (unquoted keys, single quotes, trailing commas)
          const safeParseArgs = (raw: string): any => {
            try {
              return JSON.parse(raw);
            } catch (e1) {
              try {
                // Fix 1: Replace single-quoted strings and unquoted keys
                const fixed = raw
                  .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
                  .replace(/:\s*'([^']*)'/g, ': "$1"')
                  .replace(/,\s*([}\]])/g, '$1'); // trailing commas
                return JSON.parse(fixed);
              } catch (e2) {
                logger.error('Failed to parse tool arguments, using empty object', { raw });
                return {};
              }
            }
          };
          const functionArgs = safeParseArgs((toolCall as any).function.arguments);

          logger.info(`LLM requested tool: ${functionName}`, { functionArgs });
          
          // Simple step for the UI
          const uiStepName = functionName === 'exportDataSlice' ? 'Exporting data slice...' :
                           functionName === 'listMembers' ? `Listing members for ${functionArgs.dimName}...` :
                           `Executing ${functionName}...`;
          
          addStep(uiStepName);

          // Execute tool via MCP
          let toolResult: any;
          try {
            hasNewToolCall = true;
            toolResult = await mcpClient.callTool(functionName, functionArgs);
            addStep(`Tool ${functionName} finished successfully.`);
          } catch (error: any) {
            logger.error(`MCP Tool ${functionName} execution failed`, { error: error.message });
            toolResult = { error: error.message || 'Unknown error occurred during tool execution' };
            addStep(`Tool ${functionName} failed: ${error.message}`);
          }
          
          // Fast Path Optimization: Skip the second LLM text formulation pass for massive data tables
          if (functionName === 'exportDataSlice' || functionName === 'listBusinessRules' || functionName === 'applyMath') {
            shouldBypassNextLLMCall = true;
          }

          // --- MATH AGENT HOOK ---
          if (toolResult.success) {
            this.lastExportedData = toolResult; 
            this.lastToolName = functionName;

            if (functionName === 'exportDataSlice' && functionArgs.calculationInstructions) {
              addStep('Performing requested calculations...');
              toolResult.data = await mathAgent.applyMath(toolResult.data, functionArgs.calculationInstructions, activeModel);
              // Update cache with calculated data container
              this.lastExportedData = toolResult;
            }
          }

          if (functionName === 'applyMath') {
            // Restore cache if needed
            if (!this.lastExportedData) {
              logger.info('Cache empty, searching history for last exported data...');
              for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i];
                if (m.role === 'tool' && m.name === 'exportDataSlice') {
                  try {
                    const result = JSON.parse(m.content);
                    if (result.success && result.data) {
                      this.lastExportedData = result;
                      this.lastToolName = 'exportDataSlice';
                      break;
                    }
                  } catch (e) {}
                }
              }
            }

            if (!this.lastExportedData || !this.lastExportedData.data) {
              logger.warn('LLM called applyMath but no valid data could be found.');
              toolResult = { success: false, error: "No data found." };
            } else {
              addStep('Performing requested calculations on cached data...');
              const calculatedData = await mathAgent.applyMath(this.lastExportedData.data, functionArgs.calculationInstructions, activeModel);
              toolResult = { success: true, data: calculatedData };
              this.lastExportedData = toolResult; // Update cache with new container
              this.lastToolName = 'exportDataSlice';
            }
          }
          // --- END MATH AGENT HOOK ---

          // Truncate tool result content to prevent 400/Context errors (20k char limit)
          const resultStr = JSON.stringify(toolResult);
          const truncatedContent = resultStr.length > 20000 
            ? resultStr.substring(0, 20000) + '... [TRUNCATED for reasoning context]' 
            : resultStr;

          messages.push({
            tool_call_id: toolCall.id,
            role: 'tool',
            name: functionName,
            content: truncatedContent,
          });
        }

        if (shouldBypassNextLLMCall) {
          logger.info('Bypassing second LLM pass to optimize execution time for data-heavy tools.');
          break;
        }

        // Get new response from LLM with tool results
        addStep('Formulating final response...');
        response = await withRetry(() => openai.chat.completions.create({
          model: activeModel,
          messages: messages,
          tools: this.tools,
          tool_choice: 'auto',
        }));
        
        if (!response?.choices?.length) {
          logger.warn('LLM returned an empty response after tool execution, but proceeding to formatting...');
          break; // Exit loop and try to format what we have
        }
        
        responseMessage = response.choices[0].message;
      }

      // 3. FORMATTER AGENT STEP (Final Assembly)
      // We call the formatter if a tool was just called, OR if the user is asking for 
      // formatting/math on previously fetched data.
      const isFormattingRequest = lowerText.includes('format') || lowerText.includes('table') || lowerText.includes('decimal');
      
      if (hasNewToolCall || (isFormattingRequest && this.lastExportedData)) {
        const isAnalytical = this.analyticalKeywords.some(kw => lowerText.includes(kw));
        const isMath = this.mathKeywords.some(kw => lowerText.includes(kw));

        // NEW: Refined Analysis Control
        const toolMessages = messages.filter(m => m.role === 'tool');
        const lastToolName = toolMessages.length > 0 ? toolMessages[toolMessages.length - 1].name : '';
        const isUpdateTool = lastToolName?.includes('update') || lastToolName?.includes('run') || lastToolName?.includes('execute');
        const shouldAnalyze = isAnalytical && !isUpdateTool;

        // 1. MATH AGENT STEP (if requested and NOT already performed by tool)
        const toolCalls = messages.filter(m => m.role === 'assistant' && m.tool_calls);
        const alreadyCalculated = toolCalls.some(m => 
          m.tool_calls.some((tc: any) => tc.function.name === 'exportDataSlice' && JSON.parse(tc.function.arguments).calculationInstructions)
        );

        if (isMath && !alreadyCalculated) {
          if (this.lastExportedData && this.lastExportedData.data) {
            steps.push('Performing requested calculations...');
            const calculatedData = await mathAgent.applyMath(this.lastExportedData.data, text, activeModel);
            this.lastExportedData.data = calculatedData;
            
            const toolMsgs = messages.filter(m => m.role === 'tool');
            if (toolMsgs.length > 0) {
              const updatedResult = { success: true, data: calculatedData };
              toolMsgs[toolMsgs.length - 1].content = JSON.stringify(updatedResult);
            }
          }
        }

        // 2. FP&A AGENT STEP (if requested)
        let analysisResponse = '';
        if (shouldAnalyze) {
          addStep('Performing deep financial analysis...');
          analysisResponse = await fpaAgent.analyze(text, messages, activeModel);
          messages.push({ role: 'assistant', content: analysisResponse });
        }
        
        // Ensure messages has the tool data for the formatter
        if (!hasNewToolCall && this.lastExportedData) {
          // If no new tool call, we might need to inject the cached data back into the messages 
          // so the formatter can find it.
          const toolMessages = messages.filter(m => m.role === 'tool');
          if (toolMessages.length === 0) {
            messages.push({
              role: 'tool',
              name: this.lastToolName || 'exportDataSlice',
              content: JSON.stringify(this.lastExportedData)
            });
          }
        }

        const exportToolCall = messages
          .filter(m => m.role === 'assistant' && m.tool_calls)
          .flatMap((m: any) => m.tool_calls)
          .find((tc: any) => tc.function?.name === 'exportDataSlice' || tc.function?.name === 'segmentOverview');
        
        let gridConfig: any = null;
        if (exportToolCall) {
          try {
            gridConfig = JSON.parse(exportToolCall.function.arguments);
          } catch (e) {
            logger.warn('Could not parse tool args for gridConfig embedding.');
          }
        }

        addStep(shouldAnalyze ? 'Assembling final report...' : 'Polishing data for readability...');
        const finalResponse = await formatterAgent.formatData(text, messages, activeModel, shouldAnalyze, gridConfig);

        return {
          response: finalResponse,
          steps: steps
        };
      }

      return {
        response: responseMessage.content || 'I processed your request, but no tool was executed.',
        steps: steps
      };
    } catch (error: any) {
      logger.error('Error in LLM Agent processing', { error: error.message });
      addStep(`Error encountered: ${error.message}`);
      return {
        response: `I encountered an error while processing your request: ${error.message}`,
        steps: steps
      };
    }
  }
}

export const llmAgent = new LLMAgent();
