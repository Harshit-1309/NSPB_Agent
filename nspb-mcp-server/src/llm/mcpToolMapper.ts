import { mcpClient } from '../agent/mcpClient.js';
import logger from '../services/logger.js';

export interface OpenAIFunction {
  name: string;
  description: string;
  parameters: any;
}

export interface OpenAITool {
  type: 'function';
  function: OpenAIFunction;
}

export class MCPToolMapper {
  async getOpenAITools(): Promise<OpenAITool[]> {
    logger.info('Fetching tools from MCP server for mapping...');
    const result = await mcpClient.listTools();
    
    if (!result.success || !result.tools) {
      logger.error('Failed to list tools from MCP server for mapping');
      return [];
    }

    return result.tools.map((tool: any) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.sanitizeSchema(tool.inputSchema)
      }
    }));
  }

  /**
   * Cleans a JSON schema to ensure it only contains fields strictly supported 
   * by OpenAI-compatible tool calling.
   */
  private sanitizeSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') return schema;

    const allowedFields = ['type', 'properties', 'required', 'description', 'items', 'additionalProperties'];
    const sanitized: any = {};

    for (const field of allowedFields) {
      if (schema[field] !== undefined) {
        if (field === 'properties') {
          sanitized.properties = {};
          for (const [key, prop] of Object.entries(schema.properties)) {
            sanitized.properties[key] = this.sanitizeSchema(prop);
          }
        } else if (field === 'items') {
          sanitized.items = this.sanitizeSchema(schema.items);
        } else {
          sanitized[field] = schema[field];
        }
      }
    }

    return sanitized;
  }
}

export const mcpToolMapper = new MCPToolMapper();
