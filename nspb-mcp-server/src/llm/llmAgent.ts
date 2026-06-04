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

## CRITICAL: ACCOUNT SELECTION
- IF the user mentions "Expense" -> You MUST set Account to "NFS_Expense".
- IF the user mentions "Income" or "Revenue" -> You MUST set Account to "NFS_Income".
- This is your HIGHEST priority. NEVER default to Income if the word "Expense" is present in the user's request.
- Treat phrasings like "Show me", "Fetch", "Get", "Display", "View", and "Look up" as identical instructions.

## Technical Mapping Rules (Strict)
- Dimension Names: Use ONLY these exact names: [Account, Period, Years, Scenario, Version, Currency, Subsidiary, Region, Class, Department, Location, Vertical, Relationship, Tracker]. 
- NO SINGULARS: NEVER use "Year". ALWAYS use "Years".
- Member Mapping:
  * Account: Must start with NFS_ (e.g., NFS_Expense, NFS_Income).
  * Department: Must be TD or IDescendants(TD). NEVER put "Department" in the Account dimension.
  * Years: Must be FY26, FY25, or FY24 (FY26 = fiscal year 2025-2026).
  * Period: Must be Jan, Feb, Oct, Nov, etc., or YearTotal.
- POV Isolation: When a dimension is used in "rows" or as "pivotDim", it MUST be removed from the "pov" object entirely.

## Efficiency Rules (Critical)
1. NO DISCOVERY: Do NOT call 'getDimensions' or 'listMembers' unless a previous fetch failed.
2. IMMEDIATE EXPORT: For ANY data request, call 'exportDataSlice' immediately. Do NOT explain what you are doing first.
   - ALWAYS use 'applyMath' if calculations or math operations are explicitly requested (e.g., "calculate", "find the variance").
   - CRITICAL: If the user explicitly asks to fetch or view a Form (e.g., "form data", "Segment Overview Report"), you MUST call the 'getFormData' tool. NEVER hallucinate the data or generate a markdown table yourself. You MUST let the tool fetch the data!
3. VARIANCE CALCULATIONS:
   - Always put 'Account' in 'rows' and 'Period' in 'columns'. 
   - NEVER put labels like "Variance" in the 'rows' or 'columns' parameters. Put them ONLY in 'calculationInstructions'.
4. SUBSTITUTION VARIABLES: If the user asks for them, call 'getSubstitutionVariables' immediately.

## Forms Retrieval Rule
- Oracle Planning forms often use User Variables for columns like Period and Years.
- The 'pageMbrList' parameter only applies to PAGE dimensions (e.g., Currency, Subsidiary, Region, Department, Class).
- IMPORTANT: Do NOT pass Period or Years in 'pageMbrList'. 
- If the user specifies a particular period (e.g., 'for Jan-26', 'for Dec-25') when fetching a form, you MUST use the 'userVariableUpdates' parameter to set the Period and Years.
  - For example, "Jan-26" means userVariableUpdates: {"Period": "Jan", "Years": "FY26"}.
- If the user wants to filter by page dimensions, build 'pageMbrList' as: "<Currency>,<Subsidiary>,<Region>,<Department>,<Class>" in that order.
- If the user ONLY wants data for a specific period (without needing the form layout at all), use 'exportDataSlice' instead.

## Report Generation
- For any "Data by X" request:
  1. ALWAYS call 'exportDataSlice'.
  2. If the user mentions "Expense", use Account = "NFS_Expense".
  3. Set 'pivotDim' to the requested dimension (e.g., "Department"). 
  4. ALWAYS remove the pivot dimension from the 'pov' object.

## FINAL CHECK
- EVERY request is a NEW report. Do NOT reuse "Income" if the user now says "Expense".
- Do NOT rely on previously fetched chat history or context to generate new data reports. You MUST ALWAYS call the corresponding data fetching tool (e.g., exportDataSlice, segmentOverview, or getFormData) for EACH request to ensure the UI renders the table correctly.
- Use "Show", "Fetch", and "View" as the same instruction.
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
    onStep?: (step: string) => void,
    signal?: AbortSignal
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

      const lowerText = text.toLowerCase();
      const isFormRequest = (lowerText.includes('form') || lowerText.includes('segment overview')) && !lowerText.includes('analyze') && !lowerText.includes('commentary');
      let responseMessage: any = null;
      let response: any = null;

      if (isFormRequest) {
        let interceptedFormId = 'Segment Overview Report';
        let interceptedPeriod = 'YearTotal';
        let interceptedYears = 'FY25';

        // Try to find the exact form name inside quotes
        const quoteMatch = text.match(/(?:form|report).*?['"]([^'"]+)['"]/i);
        if (quoteMatch) {
          interceptedFormId = quoteMatch[1].trim();
        } else if (lowerText.includes('segment overview')) {
          interceptedFormId = 'Segment Overview Report';
        }

        const periodMatch = text.match(/([A-Z][a-z]{2})\s*-\s*(\d{2})/i);
        if (periodMatch) {
          interceptedPeriod = periodMatch[1];
          interceptedYears = `FY${periodMatch[2]}`;
        }

        responseMessage = {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_' + Date.now(),
            type: 'function',
            function: {
              name: 'getFormData',
              arguments: JSON.stringify({
                idorname: interceptedFormId,
                userVariableUpdates: { Period: interceptedPeriod, Years: interceptedYears }
              })
            }
          }]
        };
        logger.info('Bypassed LLM Pass 1 and directly injected getFormData tool call.', { interceptedFormId, interceptedPeriod, interceptedYears });
      } else {
        let toolChoiceOption: any = this.tools.length > 0 ? 'auto' : undefined;
        response = await withRetry(() => openai.chat.completions.create({
          model: activeModel,
          messages: messages,
          tools: this.tools.length > 0 ? this.tools : undefined,
          tool_choice: toolChoiceOption,
        }, { signal, timeout: 60000 }));
        
        if (!response?.choices?.length) {
          logger.error('Empty LLM response received', { response: JSON.stringify(response) });
          throw new Error('LLM returned an empty response (no choices).');
        }
        
        responseMessage = response.choices[0].message;
      }
      
      // NEW: Intercept Hallucinated JSON tool calls from free-tier models
      if (!responseMessage.tool_calls && responseMessage.content && responseMessage.content.includes('{') && responseMessage.content.includes('getFormData')) {
        try {
          const match = responseMessage.content.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            const isToolCall = parsed.tool_code === 'getFormData' || parsed.name === 'getFormData' || parsed.function === 'getFormData';
            if (isToolCall) {
              const params = parsed.parameters || parsed.arguments || {};
              // Convert "Feb-26" to userVariableUpdates format if needed
              let periodStr = params.period || params.Period;
              let yearsStr = params.years || params.Years;
              if (periodStr && periodStr.includes('-')) {
                const parts = periodStr.split('-');
                periodStr = parts[0];
                yearsStr = `FY${parts[1]}`;
              }
              
              responseMessage.tool_calls = [{
                id: 'call_' + Date.now(),
                type: 'function',
                function: {
                  name: 'getFormData',
                  arguments: JSON.stringify({
                    idorname: params.formId || params.idorname || "Segment Overview Report",
                    userVariableUpdates: periodStr ? { Period: periodStr, Years: yearsStr } : undefined
                  })
                }
              }];
              responseMessage.content = null;
              logger.info('Intercepted hallucinated JSON tool call and converted to native tool_calls.');
            }
          }
        } catch (e) {
          logger.warn('Failed to parse hallucinated JSON tool call', { error: (e as Error).message });
        }
      }

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
          if (!toolResult.error && (functionName === 'exportDataSlice' || functionName === 'listBusinessRules' || functionName === 'applyMath' || functionName === 'getFormData' || functionName === 'segmentOverview')) {
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
        }, { signal }));
        
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
        const finalResponse = await formatterAgent.formatData(text, messages, activeModel, shouldAnalyze, gridConfig, this.lastExportedData);

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
      if (error.name === 'AbortError' || error.message?.includes('aborted')) {
        logger.info('LLM Agent execution aborted by user');
        addStep('Execution aborted by user.');
        return {
          response: 'Execution was aborted.',
          steps: steps
        };
      }
      
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
