import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { cleanLLMResponse } from '../utils/responseCleaner';

export interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  visionModel?: string;
  temperature?: number;
  maxTokens?: number;
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
      baseURL: config.baseURL || process.env.OPENAI_BASE_URL
    };

    this.openai = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });
  }

  /**
   * Generate a response to a text message using OpenAI
   */
  async generateTextResponse(message: string, context?: string): Promise<string> {
    try {
      const systemPrompt = context
        ? `You are a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. Context: ${context}`
        : 'You are a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. Be direct and avoid formal language.';

      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const rawResponse = response.choices[0]?.message?.content?.trim() || 'I apologize, but I could not generate a response. Please try again.';
      return cleanLLMResponse(rawResponse);
    } catch (error) {
      console.error('Error generating text response:', error);
      throw new Error('Failed to generate response from OpenAI');
    }
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
  });
}