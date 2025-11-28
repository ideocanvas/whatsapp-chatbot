import { BaseTool } from './BaseTool';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Dynamic tool management system for the autonomous agent.
 * Allows easy addition of new tools without changing core logic.
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  /**
   * Register a new tool with the registry
   */
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
    console.log(`🛠️ Tool registered: ${tool.name} - ${tool.description}`);
  }

  /**
   * Register multiple tools at once
   */
  registerTools(tools: BaseTool[]): void {
    tools.forEach(tool => this.registerTool(tool));
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool with the given arguments
   */
  async executeTool(name: string, args: any, context?: any): Promise<string> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    console.log(`🔧 Executing tool: ${name}`, { args, context });

    try {
      const result = await tool.execute(args, context);
      console.log(`✅ Tool execution completed: ${name}`);
      return result;
    } catch (error) {
      console.error(`❌ Tool execution failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Get all tools as OpenAI function schemas
   */
  getOpenAITools(): ChatCompletionTool[] {
    return Array.from(this.tools.values()).map(tool => tool.toOpenAISchema());
  }

  /**
   * Get all available tool names
   */
  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Remove a tool from the registry
   */
  unregisterTool(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      console.log(`🗑️ Tool unregistered: ${name}`);
    }
    return existed;
  }
}