import dotenv from 'dotenv';
import logger from '../services/logger.js';
import { executeTool, TOOLS_REGISTRY } from './toolDispatcher.js';

dotenv.config();

export interface MCPResponse {
  success: boolean;
  data?: any;
  error?: string;
  details?: any;
  tools?: any[];
}

export class MCPClient {
  /**
   * Directly executes a tool using the local dispatcher.
   */
  async callTool(name: string, args: any = {}): Promise<any> {
    try {
      return await executeTool(name, args);
    } catch (error: any) {
      logger.error(`Error in local MCP dispatcher: ${name}`, { error: error.message });
      return {
        success: false,
        error: 'Local execution error',
        details: error.message
      };
    }
  }

  /**
   * Lists all available tools from the central registry.
   */
  async listTools(): Promise<any> {
    return { 
      success: true, 
      tools: TOOLS_REGISTRY 
    };
  }
}

export const mcpClient = new MCPClient();
