export interface AIConfig {
  // API Configuration
  apiKey: string;
  baseURL?: string;
  model?: string;
  visionModel?: string;
  temperature?: number;
  maxTokens?: number;
  enableToolCalling?: boolean;
  embeddingModel?: string;

  // Prompt Templates
  prompts?: {
    textResponse?: string;
    imageAnalysis?: string;
    toolCalling?: string;
    errorResponse?: string;
    searchLimit?: string;
    // Specialized prompts for different services
    mediaImageAnalysis?: string;
    webScrapeImageAnalysis?: string;
    enhancedImageResponse?: string;
    audioTranscriptionResponse?: string;
  };

}

export interface AIConfigFile {
  name: string;
  description?: string;
  config: AIConfig;
}

export interface AIConfigManagerOptions {
  configPath?: string;
  defaultConfig?: string;
}