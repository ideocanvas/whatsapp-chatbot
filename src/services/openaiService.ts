import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { cleanLLMResponse } from '../utils/responseCleaner';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { executeTool } from '../tools';

export interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  visionModel?: string;
  temperature?: number;
  maxTokens?: number;
  enableToolCalling?: boolean;
}

export class OpenAIService {
  private openai: OpenAI;
  private config: OpenAIConfig;

  constructor(config: OpenAIConfig) {
    this.config = {
      model: config.model || process.env.OPENAI_MODEL || 'gpt-4o',
      visionModel: config.visionModel || process.env.OPENAI_VISION_MODEL || 'gpt-4o',
      temperature: config.temperature || parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
      maxTokens: config.maxTokens || parseInt(process.env.OPENAI_MAX_TOKENS || '1000'),
      apiKey: config.apiKey,
      baseURL: config.baseURL || process.env.OPENAI_BASE_URL,
      enableToolCalling: config.enableToolCalling ?? (process.env.OPENAI_ENABLE_TOOL_CALLING === 'true')
    };

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
      const systemPrompt = context
        ? `You are a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message. Context: ${context}`
        : 'You are a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. Be direct and avoid formal language. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message.';

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
   * Generate response with tool calling support
   */
  async generateResponseWithTools(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    maxToolRounds: number = 5
  ): Promise<string> {
    if (!this.config.enableToolCalling || !tools || tools.length === 0) {
      // Fall back to regular response generation
      const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
      return this.generateTextResponse(
        lastUserMessage?.content as string || '',
        undefined,
        tools
      );
    }

    let currentMessages = [...messages];
    let toolCallRound = 0;
    let partialResults: any[] = [];

    while (toolCallRound < maxToolRounds) {
      toolCallRound++;

      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: currentMessages,
        tools,
        tool_choice: 'auto',
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
        responseContent: message.content?.substring(0, 100) || 'No content'
      });

      currentMessages.push(message);

      // If no tool calls, return the final response
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return cleanLLMResponse(message.content || '');
      }

      // Process tool calls
      const toolResults = await this.processToolCalls(message.tool_calls);

      // Store successful results for potential partial response
      const successfulResults = toolResults.filter(result => !result.error);
      partialResults.push(...successfulResults.map(result => result.result));

      // Add tool results to the conversation - each result needs its own message
      for (const result of toolResults) {
        currentMessages.push({
          role: 'tool',
          content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result),
          tool_call_id: result.tool_call_id
        });
      }
    }

    // Get the last user message to provide context
    const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
    const userQuery = lastUserMessage?.content || 'your query';

    // Use LLM to generate a contextual final response
    const finalResponsePrompt = partialResults.length > 0
      ? `I reached the maximum search limit while researching "${userQuery}". Here's what I found so far:\n\n${partialResults.map((result: any) => typeof result === 'string' ? result : JSON.stringify(result)).join('\n\n')}\n\nPlease create a helpful WhatsApp-style response that summarizes these findings, explains I hit the search limit, and suggests next steps. Keep it conversational and short.`
      : `I reached the maximum search attempts while trying to find information for "${userQuery}" but couldn't find any relevant results. Please create a helpful WhatsApp-style response explaining this situation and suggesting the user try a more specific query or different wording. Keep it conversational and short.`;

    // Generate final response using LLM
    const finalResponse = await this.generateTextResponse(
      finalResponsePrompt,
      'You are a helpful assistant explaining search limitations. Be honest, helpful, and suggest concrete next steps.',
      undefined,
      'none' // Don't use tools for this final response
    );

    return finalResponse;
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

      const visionPrompt = prompt || `Analyze this image comprehensively with context awareness. Describe what you see in detail, including:

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
   * Create embeddings for text content
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-ada-002',
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
}

// Helper function to create OpenAIService instance from environment variables
export function createOpenAIServiceFromEnv(): OpenAIService {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  return new OpenAIService({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
    visionModel: process.env.OPENAI_VISION_MODEL,
    temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : undefined,
    maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : undefined,
    enableToolCalling: process.env.OPENAI_ENABLE_TOOL_CALLING === 'true',
  });
}