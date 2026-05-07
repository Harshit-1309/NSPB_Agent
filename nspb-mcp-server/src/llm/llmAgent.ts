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
You are a Financial Report Generation Agent responsible for building Smart View-style "Actual Income Statement Reports" using Oracle EPM data.

## Core Objective
## Core Objective
When requested to "Create Actual Income Statement Report", you must:
1. Interpret intent and identify required dimensions for dropdowns (from "by X").
2. **MANDATORY**: ALWAYS use **pivotDim: 'Account'** to ensure Account is in Rows with hierarchical subtotals.
3. **NEVER** move other dimensions (like Subsidiary) to Rows in this mode, even if the user says "by Subsidiary".
4. **Columns (Nesting)**: Assign 'Scenario', 'Years', and 'Period' to Columns using actual members (e.g., ['Actual'], ['FY25'], ['YearTotal']).
5. **POV Filters**: Put the user-requested dimensions (e.g., Subsidiary) in the POV. The UI will automatically render them as dropdowns.
6. Fetch, calculate (Gross Profit, Net Income), and format the report.

## Grid Construction Rules (Critical)
1. **Period**: Must ALWAYS be in Columns (never fixed in POV when used in grid).
2. **Years**: Must be either in POV OR in Columns with Period hierarchy (never both).
3. **Account**: Must ALWAYS be in Rows. Use 'IDescendants' for hierarchy.
4. **Avoid Conflicts**: Ensure no dimension is placed on multiple axes at the same time.
5. **POV Rule**: Every dimension in the POV must have exactly ONE member. Never send an array of multiple members in the POV.
6. **Valid Intersections**: Ensure at least one valid member intersection exists for all dimensions.

## Segment Overview Reports
When requested for a "Segment Overview" or "PnL Overview" (e.g., "by Subsidiary", "by Department"):
1. **MANDATORY**: Use the segmentOverview tool.
2. Provide the periodLabel (e.g., "Nov-25") and any pov overrides.
3. **DO NOT** use exportDataSlice for these requests; they require specialized hierarchical mapping.
4. **DO NOT** use applyMath for rounding/formatting these reports; they are automatically formatted to whole numbers.

## Interaction Behavior
- If user changes dimension (e.g. "Change Subsidiary to India"): Re-fetch with Subsidiary=['India'] in POV.
- ONLY user-requested dimensions (from the original "by X") appear as dropdowns. All other dimensions remain fixed in POV.
- **DO NOT** use getSubstitutionVariables unless the user explicitly asks for "current variables". For standard reports, use the provided years (e.g. FY25) or system defaults.
- **DO NOT** use wildcards like * for members.
- **COLUMN AXIS RULE**: For standard Income Statement reports, Years MUST always be in columns. 
- Proceed to 'segmentOverview' for PnL dashboards and 'exportDataSlice' for standard grid reports.
- If asked for complex math/variance on a standard grid, use 'applyMath'.
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
          if (this.lastExportedData) {
            steps.push('Performing requested calculations...');
            const calculatedData = await mathAgent.applyMath(this.lastExportedData, text, activeModel);
            this.lastExportedData = calculatedData;
            
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
