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

const FORMATTER_PROMPT = `
You are a Senior Financial Reporting Architect.
Your task is to assemble a FINAL, professional financial report in **MARKDOWN** format.

CRITICAL RULES:
1. Use high-readability Markdown.
2. Structure your report as follows:
   # [Report Title]
   
   ## Table Layout
   - **Rows**: [Dimension/Members]
   - **Columns**: [Dimension/Members]
   - **POV**: [Context Dimensions]

   ## Summary
   [Provide a clear, executive summary of the data]

   ## Key Insights
   [List major drivers, risks, and trends as bullet points]

   ## Detailed Analysis
   [The data table will be rendered here. Provide any specific table-level commentary.]

   ## Assumptions
   - **Inferred Dimensions**: [List dimensions detected from query]
   - **Default Members**: [List default members used for unspecified dimensions]

3. DO NOT include the actual data table in the text block; it is handled by the UI component. 
4. Keep the tone professional and data-driven.

Analysis Context: {analysisContext}
Raw Data: {rawData}
`;

export class FormatterAgent {
  private mathKeywords = ['calculate', 'variance', 'growth', 'total', 'margin', 'sum', 'difference', ' %', 'percent'];

  private truncateData(data: any, limit: number = 40000): string {
    const str = JSON.stringify(data);
    if (str.length <= limit) return str;
    return str.substring(0, limit);
  }

  async formatData(userIntent: string, messages: any[], modelId?: string, isAnalytical: boolean = false, gridConfig?: any, rawToolResult?: any): Promise<string> {
    try {
      logger.info('Formatter Agent starting strict data transformation...', { isAnalytical });
      
      // 1. Extract the latest tool result from messages
      const toolMessage = messages.slice().reverse().find(m => m.role === 'tool');
      const toolName = toolMessage?.name || '';

      if (!toolMessage && !rawToolResult) {
        // If no tool was run, this is likely a conversational request (Hi, Thanks, etc.)
        const lastAssistant = messages.slice().reverse().find(m => m.role === 'assistant' && m.content);
        return lastAssistant?.content || "I'm ready to help with your NSPB analysis.";
      }

      let rawData;
      if (rawToolResult) {
        rawData = rawToolResult;
      } else {
        try {
          rawData = JSON.parse(toolMessage!.content);
        } catch (e) {
          rawData = toolMessage!.content;
        }
      }

      // --- Specialized Formatters based on Tool Name / Intent ---

      // Case: Segment Overview
      const isSegmentOverviewIntent = /segment\s*overview/i.test(userIntent);
      const isSegmentOverviewTool = toolName === 'segmentOverview';
      
      if (isSegmentOverviewIntent || isSegmentOverviewTool) {
        logger.info('Segment Overview detected.', { isTool: isSegmentOverviewTool });

        // If we already have the data from a tool call, use it!
        if (isSegmentOverviewTool && rawData && rawData.success) {
          return JSON.stringify({
            type: 'segment_overview',
            periodLabel: rawData.periodLabel || 'Report',
            analysis: rawData.insights || `## Segment Overview\nFinancial dashboard with multi-scenario comparison.`,
            data: rawData
          });
        }

        // Fallback for direct API call hint if intent matched but tool didn't run
        if (isSegmentOverviewIntent && !isSegmentOverviewTool) {
          logger.info('Segment Overview intent detected but tool not yet run. Proceeding to standard reasoning.');
        }
      }

      // 1.5 Short-circuit: If tool failed, just return the error message directly
      if (rawData && (rawData.success === false || rawData.error)) {
        logger.info('Tool failed or returned error. Bypassing LLM.', { error: rawData.error });
        const err = rawData.error || "Tool execution failed.";
        const detailsObj = { ...rawData };
        const details = JSON.stringify(detailsObj, null, 2);
        return `${err}\n\n**Diagnostics:**\n\`\`\`json\n${details}\n\`\`\``;
      }

      // 2. Pre-process/Clean data (SKIP for segment_overview as it has a specialized structure)
      const actualData = rawData && rawData.data ? rawData.data : rawData;
      const cleanData = (isSegmentOverviewTool || isSegmentOverviewIntent) 
        ? actualData 
        : (transformationService.stripUnwantedFields(actualData) || actualData);

      // Shared filter extractor — pulls clean dimension name from "by X" phrases
      const extractFilters = (): string[] => {
        const byMatch = userIntent.match(/\bby\s+([a-zA-Z]+)/i);
        if (!byMatch) return [];
        const dimWord = byMatch[1].trim();
        return [dimWord.charAt(0).toUpperCase() + dimWord.slice(1)];
      };

      // 3. Check for analytical context
      const analysisMessage = messages.slice().reverse().find(m => m.role === 'assistant' && !m.tool_calls);
      const hasAnalysis = analysisMessage && analysisMessage.content && 
                         !analysisMessage.content.includes('I processed your request') &&
                         analysisMessage.content.length > 50;

      // --- Specialized Formatters based on Tool Name ---

      // Case: exportDataSlice (The primary data fetch tool)
      if (toolName === 'exportDataSlice' || toolName === 'applyMath') {
        if (cleanData && cleanData.columns && cleanData.rows && !hasAnalysis) {
          logger.info('Direct data report detected. Bypassing LLM.', { rowCount: cleanData.rows.length });
          return JSON.stringify({
            type: "report",
            analysis: `# Data Export Results\nData successfully retrieved and processed for your request.`,
            table: {
              povContext: cleanData.povContext,
              povDetails: cleanData.povDetails,
              columns: cleanData.columns,
              rows: cleanData.rows
            },
            gridConfig: gridConfig || null,
            filters: (() => {
              // Extract dimension name from "by X" — e.g., "by Subsidiary for FY25" → "Subsidiary"
              const byMatch = userIntent.toLowerCase().match(/\bby\s+([a-z]+)/i);
              if (!byMatch) return [];
              const dimWord = byMatch[1].trim();
              // Capitalize first letter to match Oracle dimension names
              return [dimWord.charAt(0).toUpperCase() + dimWord.slice(1)];
            })()
          });
        }
      }


      // Case: listBusinessRules
      if (toolName === 'listBusinessRules') {
        const rules = actualData?.rules || actualData?.details || actualData || [];
        if (Array.isArray(rules)) {
          const rows = rules.map((r: any) => ({
            "Rule Name": typeof r === 'string' ? r : (r.name || r.ruleName || "Unknown"),
            "Cube": r.cube || "ALL"
          }));
          return JSON.stringify({
            type: "report",
            columns: ["Rule Name", "Cube"],
            rows: rows
          });
        }
      }

      // Case: getSubstitutionVariables
      if (toolName === 'getSubstitutionVariables') {
        const subVars = actualData?.items || actualData?.substitutionVariables || [];
        if (Array.isArray(subVars)) {
          const rows = subVars.map((v: any) => ({
            "Variable Name": v.name || v.variableName || "Unknown",
            "Current Value": v.value || v.variableValue || "N/A",
            "Plan Type": v.planType || v.appliesTo || "ALL"
          }));
          return JSON.stringify({
            type: "report",
            analysis: "# Substitution Variables\nBelow is a list of all substitution variables retrieved from the Oracle NSPB application.",
            table: {
              columns: ["Variable Name", "Current Value", "Plan Type"],
              rows: rows
            }
          });
        }
      }

      // Case: getFormData
      if (toolName === 'getFormData') {
        const assistantMessage = messages.slice().reverse().find(m => m.role === 'assistant' && m.tool_calls);
        const toolCall = assistantMessage?.tool_calls?.find((tc: any) => tc.name === 'getFormData' || tc.function?.name === 'getFormData');
        const rawArgs = toolCall?.function?.arguments || toolCall?.arguments;
        const args = rawArgs ? (typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs) : {};
        const formName = args.idorname || "Form";

        // Check if cleanData is already a formatted table, otherwise transform actualData
        const isAlreadyFormatted = cleanData && 
                                   Array.isArray(cleanData.columns) && 
                                   typeof cleanData.columns[0] === 'string' &&
                                   Array.isArray(cleanData.rows) &&
                                   (cleanData.rows.length === 0 || !('headers' in cleanData.rows[0]));

        const transformed = isAlreadyFormatted
          ? cleanData
          : transformationService.transformNSPBResponse(actualData);

        if (transformed && !('error' in transformed)) {
          // Unwrap grid properties from the raw actualData (standard for forms)
          const formGrid = actualData.grid || actualData;
          const povDimNames = formGrid.gridInfo?.povDimNames || [];
          const pageDims = formGrid.gridInfo?.pageDimNames || ["Period", "Years"];
          const colDimNames = formGrid.gridInfo?.columnDimNames || [];

          // Build explicit dim->current-member map for page dims (using pov array offset by povDimNames length)
          // Oracle pov array: [povDim0, povDim1, ..., pageDim0, pageDim1, ...]
          const povByDim: Record<string, string> = {};
          if (Array.isArray(formGrid.pov)) {
            const pagePovOffset = povDimNames.length;
            pageDims.forEach((dim: string, idx: number) => {
              const povVal = formGrid.pov[pagePovOffset + idx];
              if (povVal) povByDim[dim] = povVal;
            });
          }

          return JSON.stringify({
            type: "report",
            analysis: `# Form Data: ${formName}\nSuccessfully retrieved data from the form.`,
            table: transformed,
            gridConfig: {
              type: "form",
              idorname: formName,
              pov: formGrid.pov || null,
              povDimNames: povDimNames,
              pageDimNames: pageDims,
              columnDimNames: colDimNames,
              povByDim: povByDim,
              pageMbrList: args.pageMbrList || "",
              allowedPageMembersByDim: formGrid.gridInfo?.allowedPageMembersByDim || null
            },
            filters: pageDims
          });
        }
      }

      // Case: listMembers / getDimensions
      if (toolName === 'listMembers' || toolName === 'getDimensions' || toolName === 'getMember') {
        const items = Array.isArray(actualData) ? actualData : (actualData?.items || [actualData]);
        if (items.length > 0 && typeof items[0] === 'object') {
          const title = toolName === 'getDimensions' ? "# Application Dimensions" : "# Member List";
          const columns = Object.keys(items[0]).filter(k => typeof items[0][k] !== 'object' && k !== 'links').slice(0, 5);
          return JSON.stringify({
            type: "report",
            analysis: `${title}\nSuccessfully retrieved ${items.length} items for your request.`,
            table: {
              columns: columns,
              rows: items
            }
          });
        }
      }

      // NEW: Fast Path for Non-Analytical Requests (Updates / Single Items / Math)
      if (!isAnalytical) {
        logger.info('Non-analytical request detected. Bypassing LLM for fast formatting.');
        
        // Determine if this was an update or just a fetch/math
        const isUpdate = userIntent.toLowerCase().includes('update') || userIntent.toLowerCase().includes('set') || userIntent.toLowerCase().includes('run');
        const isMath = this.mathKeywords.some(kw => userIntent.toLowerCase().includes(kw));
        
        const title = isUpdate ? "# Operation Completed" : (isMath ? "# Calculation Results" : "# Data Retrieved");
        const summary = isUpdate ? "The requested update has been successfully applied to the NSPB application." : "Requested data has been successfully processed and retrieved.";
        
        let tableData = null;
        
        // If cleanData is already a formatted table (from Grid or Math), use it!
        if (cleanData && cleanData.columns && cleanData.rows) {
          tableData = cleanData;
        } else if (actualData && typeof actualData === 'object' && !Array.isArray(actualData)) {
          // Oracle often returns an 'items' array even for single updates
          const itemToDisplay = (actualData.items && Array.isArray(actualData.items)) ? actualData.items[0] : actualData;
          
          // Filter out technical fields and deeply nested objects
          const columns = Object.keys(itemToDisplay).filter(k => 
            k !== 'success' && k !== 'error' && k !== 'links' && 
            (typeof itemToDisplay[k] !== 'object' || itemToDisplay[k] === null)
          );
          
          if (columns.length > 0) {
            // Map technical names to pretty headers for common fields
            const headerMap: Record<string, string> = {
              'name': 'Name',
              'alias': 'Alias',
              'parent': 'Parent Member',
              'dataStorage': 'Data Storage',
              'planType': 'Plan Type',
              'value': 'Current Value'
            };
            
            const prettyColumns = columns.map(c => headerMap[c] || c.charAt(0).toUpperCase() + c.slice(1));
            
            // Create a row with pretty keys
            const row: Record<string, any> = {};
            columns.forEach((col, idx) => {
              const val = itemToDisplay[col];
              row[prettyColumns[idx]] = val === null ? 'N/A' : val;
            });

            tableData = { columns: prettyColumns, rows: [row] };
          }
        }

        return JSON.stringify({
          type: "report",
          analysis: `${title}\n${summary}`,
          table: tableData,
          filters: extractFilters()
        });
      }

      const truncatedData = this.truncateData(cleanData);
      const analysisContext = analysisMessage ? analysisMessage.content : "No analytical context provided.";


      // 4. Call LLM for final report assembly
      const response = await withRetry(() => openai.chat.completions.create({
        model: modelId || MODEL,
        messages: [
          { 
            role: 'system', 
            content: `You are a Senior Financial Reporting Architect.
Your task is to polish the provided financial analysis into a professional executive report.

CRITICAL RULES:
1. Use high-readability Markdown.
2. Structure your response with these exact sections:
   # [Report Title]
   ## Table Layout
   - **Rows**: [Dimension/Members]
   - **Columns**: [Dimension/Members]
   - **POV**: [Context Dimensions]
   
   ## Summary
   [Clear executive summary]
   
   ## Key Insights
   [Bullet points of drivers/trends]
   
   ## Detailed Analysis
   [Commentary on the table data]
   
   ## Assumptions
   - **Inferred Dimensions**: [Dimensions detected from the user query]
   - **Default Members**: [Standard defaults used for unspecified dims]

3. DO NOT include the actual data table. It will be injected by the UI.
4. Data for reference: ${JSON.stringify(cleanData)}`
          },
          {
            role: 'user',
            content: `Polish this analysis for user intent "${userIntent}": ${analysisContext}`
          }
        ]
      }));

      const polishedAnalysis = response?.choices?.[0]?.message?.content || analysisContext;

      return JSON.stringify({
        type: toolName === 'segmentOverview' ? "segment_overview" : "report",
        analysis: polishedAnalysis,
        data: toolName === 'segmentOverview' ? cleanData : undefined,
        table: (toolName !== 'segmentOverview' && cleanData && cleanData.rows && Array.isArray(cleanData.rows)) ? {
          povContext: cleanData.povContext,
          povDetails: cleanData.povDetails,
          columns: cleanData.columns,
          rows: cleanData.rows
        } : undefined,
        gridConfig: gridConfig || null,
        filters: extractFilters()
      });

    } catch (error: any) {
      logger.error('Formatter Agent failed', { error: error.message });
      return `I encountered an error while formatting your report: ${error.message}`;
    }
  }
}

export const formatterAgent = new FormatterAgent();
