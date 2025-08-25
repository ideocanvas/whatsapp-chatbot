import * as fs from 'fs';
import * as path from 'path';
import { AIConfig, AIConfigFile, AIConfigManagerOptions } from '../types/aiConfig';

export class ConfigLoader {
  private configPath: string;
  private defaultConfig: string;

  constructor(options: AIConfigManagerOptions = {}) {
    this.configPath = options.configPath || 'config/ai';
    this.defaultConfig = options.defaultConfig || 'default.json';
  }

  /**
   * Load AI configuration from a config file
   */
  async loadConfig(configName?: string): Promise<AIConfig> {
    const configFileName = configName || this.defaultConfig;
    const configFilePath = path.join(this.configPath, configFileName);

    try {
      // Check if file exists
      if (!fs.existsSync(configFilePath)) {
        throw new Error(`Config file not found: ${configFilePath}`);
      }

      // Read and parse config file
      const configContent = fs.readFileSync(configFilePath, 'utf8');
      const configData: AIConfigFile = JSON.parse(configContent);

      // Validate required fields
      if (!configData.config || !configData.config.apiKey) {
        throw new Error(`Invalid config file: Missing required fields in ${configFileName}`);
      }

      return configData.config;
    } catch (error) {
      console.error(`Failed to load config from ${configFilePath}:`, error);
      throw new Error(`Failed to load AI configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all available config files
   */
  listConfigs(): string[] {
    try {
      if (!fs.existsSync(this.configPath)) {
        return [];
      }

      const files = fs.readdirSync(this.configPath);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
    } catch (error) {
      console.error('Failed to list config files:', error);
      return [];
    }
  }

  /**
   * Validate a config file
   */
  validateConfig(config: AIConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('apiKey is required');
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push('temperature must be between 0 and 2');
    }

    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push('maxTokens must be greater than 0');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a default config file structure
   */
  createDefaultConfigFile(): AIConfigFile {
    return {
      name: 'Default Configuration',
      description: 'Default AI model configuration',
      config: {
        apiKey: 'your_api_key_here',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        visionModel: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 1000,
        enableToolCalling: true,
        embeddingModel: 'text-embedding-ada-002',
        prompts: {
          textResponse: 'You are {chatbotName}, a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message.',
          imageAnalysis: 'Analyze this image comprehensively with context awareness. Describe what you see in detail...',
          toolCalling: 'You are a helpful assistant explaining search limitations. Be honest, helpful, and suggest concrete next steps.',
          errorResponse: 'I apologize, but I could not generate a response. Please try again.',
          searchLimit: 'I reached the maximum search limit while researching "{query}". Here\'s what I found so far...'
        }
      }
    };
  }
}

// Helper function to create config loader from environment
export function createConfigLoaderFromEnv(): ConfigLoader {
  const configPath = process.env.AI_CONFIG_PATH || 'config/ai';
  const defaultConfig = process.env.AI_CONFIG_FILE || 'default.json';

  return new ConfigLoader({
    configPath,
    defaultConfig
  });
}