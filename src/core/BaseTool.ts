import { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Abstract base class for all tools in the autonomous agent system.
 * Provides a strict contract for tool creation and OpenAI function calling.
 */
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, any>;

  abstract execute(args: any, context?: any): Promise<string>;

  /**
   * Convert tool definition to OpenAI function calling schema
   */
  toOpenAISchema(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}