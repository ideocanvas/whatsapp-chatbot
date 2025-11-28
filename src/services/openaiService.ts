import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { cleanLLMResponse } from '../utils/responseCleaner';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { executeTool } from '../tools';
import { ToolRegistry } from '../core/ToolRegistry';
import { AIConfig } from '../types/aiConfig';
import { ConfigLoader } from '../utils/configLoader';

export interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  visionModel?: string;
  temperature?: number;
  maxTokens?: number;
  enableToolCalling?: boolean;
  embeddingModel?: string;
}

export class OpenAIService {
  private openai: OpenAI;
  private config: OpenAIConfig;
  private chatbotName: string;
  private prompts: AIConfig['prompts'];

  constructor(config: AIConfig, chatbotName?: string) {
    this.config = {
      model: config.model || 'gpt-4o',
      visionModel: config.visionModel || 'gpt-4o',
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 1000,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      enableToolCalling: config.enableToolCalling ?? true,
      embeddingModel: config.embeddingModel || 'text-embedding-ada-002'
    };
    this.chatbotName = chatbotName || 'Lucy';
    this.prompts = config.prompts || {};

    this.openai = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });
  }

  /**
   * Generate a response to a text message using OpenAI
   */
  async generateTextResponse(
    message: string,
    context?: string,
    tools?: ChatCompletionTool[],
    toolChoice?: 'auto' | 'none' | 'required'
  ): Promise<string> {
    try {
      // Use custom prompt from config if available, otherwise use default
      const textPrompt = this.prompts?.textResponse || `You are {chatbotName}, a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message.`;

      let systemPrompt = textPrompt.replace('{chatbotName}', this.chatbotName);

      if (context) {
        systemPrompt += ` Context: ${context}`;
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: message
        }
      ];

      const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: this.config.model!,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      };

      // Add tools if provided and tool calling is enabled
      if (tools && tools.length > 0 && this.config.enableToolCalling) {
        requestOptions.tools = tools;
        requestOptions.tool_choice = toolChoice || 'auto';
      }

      const response = await this.openai.chat.completions.create(requestOptions);

      const rawResponse = response.choices[0]?.message?.content?.trim() || 'I apologize, but I could not generate a response. Please try again.';

      // Log AI response
      console.log('🤖 AI Response:', {
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        rawResponse: rawResponse.substring(0, 200) + (rawResponse.length > 200 ? '...' : ''),
        hasContext: !!context,
        model: this.config.model
      });

      return cleanLLMResponse(rawResponse);
    } catch (error) {
      console.error('Error generating text response:', error);
      throw new Error('Failed to generate response from OpenAI');
    }
  }

  /**
   * Generate response with tool calling support - let LLM decide when to use tools
   */
  async generateResponseWithTools(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    maxToolRounds: number = 15, // Increased from 5 to 15 as requested
    toolRegistry?: ToolRegistry // Optional ToolRegistry for new BaseTool system
  ): Promise<string> {
    if (!this.config.enableToolCalling || !tools || tools.length === 0) {
      // Fall back to regular response generation without tools
      const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
      return this.generateTextResponse(
        lastUserMessage?.content as string || '',
        undefined,
        undefined,
        'none' // Explicitly disable tools
      );
    }

    let currentMessages = [...messages];
    let toolCallRound = 0;

    while (toolCallRound < maxToolRounds) {
      toolCallRound++;

      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: currentMessages,
        tools,
        tool_choice: 'auto', // Let LLM decide when to use tools
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('No response from OpenAI');
      }

      // Log tool calling round
      console.log('🔄 Tool Calling Round:', {
        round: toolCallRound,
        hasToolCalls: !!message.tool_calls && message.tool_calls.length > 0,
        toolCallCount: message.tool_calls?.length || 0,
        hasContent: !!message.content,
        contentPreview: message.content?.substring(0, 50) || 'No content'
      });

      currentMessages.push(message);

      // If no tool calls, return the final response immediately
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return cleanLLMResponse(message.content || 'I apologize, but I could not generate a response.');
      }

      // Process tool calls using appropriate method
      let toolResults;
      if (toolRegistry) {
        // Use new BaseTool system via ToolRegistry
        toolResults = await this.processToolCallsWithRegistry(message.tool_calls, toolRegistry);
      } else {
        // Use old tool system
        toolResults = await this.processToolCalls(message.tool_calls);
      }

      // Add tool results to the conversation
      for (const result of toolResults) {
        currentMessages.push({
          role: 'tool',
          content: result.error
            ? `Error: ${result.error}`
            : (typeof result.result === 'string' ? result.result : JSON.stringify(result.result)),
          tool_call_id: result.tool_call_id
        });
      }

      // Safety check to prevent infinite loops
      if (toolCallRound >= maxToolRounds) {
        console.warn('⚠️ Maximum tool call rounds reached:', maxToolRounds);

        // Get the last user message for context
        const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
        const userQuery = lastUserMessage?.content;

        // Use custom search limit prompt from config if available, otherwise use default
        const toolLimitPrompt = this.prompts?.searchLimit || `I reached the maximum tool usage limit while processing your request. Please try a more specific query or ask me something else.`;

        return await this.generateTextResponse(
          toolLimitPrompt,
          undefined,
          undefined,
          'none' // Don't use tools for this final response
        );
      }
    }

    return 'I apologize, but I encountered an issue while processing your request. Please try again.';
  }

  /**
   * Process tool calls by executing the appropriate tools
   */
  private async processToolCalls(toolCalls: any[]): Promise<any[]> {
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      try {
        console.log('🛠️ Processing tool call:', {
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments
        });

        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(toolCall.function.name, args);

        results.push({
          tool_call_id: toolCall.id,
          result: result
        });

        console.log('✅ Tool execution completed:', {
          toolName: toolCall.function.name,
          resultLength: typeof result === 'string' ? result.length : 'object'
        });

      } catch (error) {
        console.error('❌ Tool execution failed:', {
          toolName: toolCall.function.name,
          error: error instanceof Error ? error.message : `${error}`
        });

        results.push({
          tool_call_id: toolCall.id,
          error: error instanceof Error ? error.message : 'Tool execution failed'
        });
      }
    }

    return results;
  }

  /**
   * Process tool calls using ToolRegistry (for new BaseTool system)
   */
  async processToolCallsWithRegistry(toolCalls: any[], toolRegistry: ToolRegistry): Promise<any[]> {
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      try {
        console.log('🛠️ Processing tool call with registry:', {
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments
        });

        const args = JSON.parse(toolCall.function.arguments);
        const result = await toolRegistry.executeTool(toolCall.function.name, args);

        results.push({
          tool_call_id: toolCall.id,
          result: result
        });

        console.log('✅ Tool execution completed with registry:', {
          toolName: toolCall.function.name,
          resultLength: typeof result === 'string' ? result.length : 'object'
        });

      } catch (error) {
        console.error('❌ Tool execution failed with registry:', {
          toolName: toolCall.function.name,
          error: error instanceof Error ? error.message : `${error}`
        });

        results.push({
          tool_call_id: toolCall.id,
          error: error instanceof Error ? error.message : 'Tool execution failed'
        });
      }
    }

    return results;
  }


  /**
   * Get MIME type from file extension
   */
  private getMimeTypeFromExtension(extension: string): string {
    const mimeTypes: { [key: string]: string } = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
      svg: 'image/svg+xml'
    };

    return mimeTypes[extension] || 'image/jpeg';
  }
  /**
   * @deprecated Use tool calling with analyze_image tool instead
   * Analyze image content using OpenAI's vision capabilities
   */
  async analyzeImage(imagePath: string, prompt?: string): Promise<string> {
    try {
      // Read the image file
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Determine MIME type from file extension
      const extension = path.extname(imagePath).toLowerCase().substring(1);
      const mimeType = this.getMimeTypeFromExtension(extension);

      // Use custom image prompt from config if available, otherwise use default
      const visionPrompt = prompt || this.prompts?.imageAnalysis || `Analyze this image comprehensively with context awareness. Describe what you see in detail, including:

- Objects, people, animals, text, colors, and environment
- If it's a food menu or restaurant scene: focus on menu items, prices, cuisine type, and popular dishes
- If it's a building, landmark, or location: provide architectural details, possible location clues, and historical context if recognizable
- If it's a product or object: identify the item, brand, purpose, and key features
- If it's a hand holding something: identify the object being held and its potential use
- If it's a document or text-heavy: transcribe all text accurately and note the document type
- If it's nature or scenery: describe the landscape, weather conditions, and geographical features
- If it's people or events: note activities, emotions, and social context

Include any text content exactly as it appears. Provide specific details that would help understand the context and purpose of the image.`;

      const response = await this.openai.chat.completions.create({
        model: this.config.visionModel!,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: visionPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const rawResponse = response.choices[0]?.message?.content?.trim() || 'I could not analyze this image. Please try again.';
      return cleanLLMResponse(rawResponse);
    } catch (error) {
      console.error('Error analyzing image:', error);
      throw new Error('Failed to analyze image with OpenAI');
    }
  }

  /**
   * Create embeddings for text content
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.config.embeddingModel!,
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw new Error('Failed to create embedding with OpenAI');
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Get the current configuration
   */
  getConfig(): OpenAIConfig & { prompts?: AIConfig['prompts'] } {
    return {
      ...this.config,
      prompts: this.prompts
    };
  }
}

// Helper function to create OpenAIService instance from config file
export async function createOpenAIServiceFromConfig(): Promise<OpenAIService> {
  const configLoader = new ConfigLoader();

  try {
    const config = await configLoader.loadConfig();

    if (!config.apiKey) {
      throw new Error('API key is required in the config file');
    }

    return new OpenAIService(config, process.env.CHATBOT_NAME);
  } catch (error) {
    console.error('Failed to create OpenAI service from config:', error);
    throw new Error(`Failed to initialize OpenAI service: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to create OpenAIService instance from environment variables (legacy support)
export function createOpenAIServiceFromEnv(): OpenAIService {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for legacy mode');
  }

  return new OpenAIService({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
    visionModel: process.env.OPENAI_VISION_MODEL,
    temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : undefined,
    maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : undefined,
    enableToolCalling: process.env.OPENAI_ENABLE_TOOL_CALLING === 'true',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
  }, process.env.CHATBOT_NAME);
}