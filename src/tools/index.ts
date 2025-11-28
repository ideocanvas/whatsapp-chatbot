import { GoogleSearchService } from '../services/googleSearchService';
import { WebScrapeService, createWebScrapeService } from '../services/webScrapeService';
import { NewsScrapeService, createNewsScrapeService, NewsArticle } from '../services/newsScrapeService';
import { VectorStoreServicePostgres } from '../services/VectorStoreServicePostgres';
import { NewsProcessorService } from '../services/newsProcessorService'; // New
import { OpenAIService, createOpenAIServiceFromConfig } from '../services/openaiService';

// Tool function definitions
export interface ToolFunction {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<any>;
}

// Available tools
export const availableTools: { [key: string]: ToolFunction } = {};
let webScrapeService: WebScrapeService | undefined;
export let newsScrapeService: NewsScrapeService;
let vectorStoreService: VectorStoreServicePostgres; // Updated global reference
let mediaService: any; // Will be initialized later

// Tool schemas for OpenAI function calling
export const toolSchemas = [
  {
    type: 'function' as const,
    function: {
      name: 'google_search',
      description: 'Perform a web search using Google to find current information, news, or facts',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up information about',
          },
          num_results: {
            type: 'number',
            description: 'Number of search results to return (default: 5)',
          }
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_scrape',
      description: 'Scrape content from specific URLs to get real-time information from websites. Useful for getting current data, news articles, or specific page content.',
      parameters: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Array of URLs to scrape content from',
          },
          selector: {
            type: 'string',
            description: 'Optional CSS selector to target specific content on the page (e.g., "article", ".content", "#main")',
          }
        },
        required: ['urls'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'scrape_news',
      description: 'Get latest news headlines. Categories: general, tech, business, sports, world.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Category of news (default: general).',
          }
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_image',
      description: 'Analyze image content using AI vision capabilities. Use this when users send images that need detailed analysis, description, or interpretation.',
      parameters: {
        type: 'object',
        properties: {
          image_path: {
            type: 'string',
            description: 'The file path to the image that needs to be analyzed',
          },
          prompt: {
            type: 'string',
            description: 'Optional specific instructions or questions about what to focus on in the image analysis',
          }
        },
        required: ['image_path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'transcribe_audio',
      description: 'Transcribe audio files to text using speech-to-text technology. Use this when users send audio messages that need to be converted to text for processing.',
      parameters: {
        type: 'object',
        properties: {
          audio_path: {
            type: 'string',
            description: 'The file path to the audio file that needs to be transcribed',
          },
          language: {
            type: 'string',
            description: 'Optional language code for transcription (e.g., "en", "zh", "ja")',
          }
        },
        required: ['audio_path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_knowledge',
      description: 'Search the bot\'s learned knowledge base for past news, facts, and enriched context.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The specific topic or question to search for in memory',
          }
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
];

// Initialize tools with dependencies
export async function initializeTools(searchService: GoogleSearchService, mediaServiceInstance?: any) {
  // 1. Initialize OpenAI (Needed for Embeddings & Processor)
  const openaiService = await createOpenAIServiceFromConfig();

  // 2. Initialize Vector Store (The Better RAG)
  vectorStoreService = new VectorStoreServicePostgres(openaiService);

  // 3. Initialize News Processor
  const newsProcessor = new NewsProcessorService(openaiService, searchService, vectorStoreService);

  // 4. Initialize Web Scrape
  webScrapeService = createWebScrapeService();

  // 5. Initialize News Scrape Service WITH Processor
  newsScrapeService = createNewsScrapeService(webScrapeService, newsProcessor);

  // Store media service reference for later use
  if (mediaServiceInstance) {
    mediaService = mediaServiceInstance;
  }

  availableTools.google_search = {
    name: 'google_search',
    description: 'Perform a web search using Google',
    parameters: toolSchemas[0].function.parameters,
    execute: async (args: { query: string; num_results?: number }) => {
      console.log('🔍 Executing Google Search:', {
        query: args.query,
        numResults: args.num_results || 5
      });

      const startTime = Date.now();
      const results = await searchService.search(args.query, args.num_results || 5);
      const executionTime = Date.now() - startTime;

      console.log('✅ Google Search Completed:', {
        query: args.query,
        resultsCount: results.length,
        executionTime: `${executionTime}ms`,
        firstResult: results[0] ? results[0].title.substring(0, 50) + '...' : 'No results'
      });

      return searchService.formatSearchResults(results);
    }
  };

  availableTools.web_scrape = {
    name: 'web_scrape',
    description: 'Scrape content from specific URLs',
    parameters: toolSchemas[1].function.parameters,
    execute: async (args: { urls: string[]; selector?: string }) => {
      console.log('🌐 Executing Web Scrape:', {
        urls: args.urls,
        selector: args.selector || 'auto',
        urlCount: args.urls.length
      });

      const startTime = Date.now();

      try {
        if (!webScrapeService) {
          throw new Error('Web scrape service not initialized');
        }
        const results = await webScrapeService.scrapeUrls(args.urls, args.selector);
        const executionTime = Date.now() - startTime;

        console.log('✅ Web Scrape Completed:', {
          urlCount: args.urls.length,
          successfulScrapes: results.length,
          executionTime: `${executionTime}ms`,
          firstResult: results[0] ? results[0].title.substring(0, 50) + '...' : 'No results'
        });

        return webScrapeService.formatScrapeResults(results);
      } catch (error) {
        console.error('❌ Web scrape execution error:', {
          error: error instanceof Error ? error.message : `${error}`,
          urls: args.urls
        });
        throw new Error('Failed to scrape web content');
      }
    }
  };

  availableTools.scrape_news = {
    name: 'scrape_news',
    description: 'Get latest news headlines. Categories: general, tech, business, sports, world.',
    parameters: toolSchemas[2].function.parameters,
    execute: async (args: { category?: string }) => {
      const cat = args.category || 'general';
      console.log(`📰 Tool retrieving cached news for: ${cat}`);
      return newsScrapeService.getCachedNews(cat);
    }
  };

  availableTools.search_knowledge = {
    name: 'search_knowledge',
    description: 'Search learned knowledge base',
    parameters: toolSchemas[5].function.parameters,
    execute: async (args: { query: string }) => {
      console.log(`🧠 Searching Vector Store for: ${args.query}`);
      return vectorStoreService.search(args.query);
    }
  };

  // Initialize media tools if media service is available
  if (mediaService) {
    availableTools.analyze_image = {
      name: 'analyze_image',
      description: 'Analyze image content using AI vision capabilities',
      parameters: toolSchemas[3].function.parameters,
      execute: async (args: { image_path: string; prompt?: string }) => {
        console.log('🖼️ Executing Image Analysis:', {
          imagePath: args.image_path,
          prompt: args.prompt || 'default analysis'
        });

        const startTime = Date.now();

        try {
          const result = await mediaService.analyzeImageWithOpenAI(args.image_path);
          const executionTime = Date.now() - startTime;

          console.log('✅ Image Analysis Completed:', {
            imagePath: args.image_path,
            executionTime: `${executionTime}ms`,
            resultLength: result.length
          });

          return result;
        } catch (error) {
          console.error('❌ Image analysis execution error:', {
            error: error instanceof Error ? error.message : `${error}`,
            imagePath: args.image_path
          });
          throw new Error('Failed to analyze image');
        }
      }
    };

    availableTools.transcribe_audio = {
      name: 'transcribe_audio',
      description: 'Transcribe audio files to text using speech-to-text technology',
      parameters: toolSchemas[4].function.parameters,
      execute: async (args: { audio_path: string; language?: string }) => {
        console.log('🎤 Executing Audio Transcription:', {
          audioPath: args.audio_path,
          language: args.language || 'auto'
        });

        const startTime = Date.now();

        try {
          const result = await mediaService.transcribeAudio(args.audio_path, args.language);
          const executionTime = Date.now() - startTime;

          console.log('✅ Audio Transcription Completed:', {
            audioPath: args.audio_path,
            executionTime: `${executionTime}ms`,
            resultLength: result.length
          });

          return result;
        } catch (error) {
          console.error('❌ Audio transcription execution error:', {
            error: error instanceof Error ? error.message : `${error}`,
            audioPath: args.audio_path
          });
          throw new Error('Failed to transcribe audio');
        }
      }
    };
  }
}

// Check if any tools are available
export function hasAvailableTools(): boolean {
  return Object.keys(availableTools).length > 0;
}

// Get tool schemas for OpenAI
export function getToolSchemas() {
  return toolSchemas;
}

// Execute a specific tool
export async function executeTool(toolName: string, args: any): Promise<any> {
  const tool = availableTools[toolName];
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }
  return tool.execute(args);
}

// Cleanup function to close browser instances
export async function cleanupTools(): Promise<void> {
  if (webScrapeService) {
    await webScrapeService.close();
  }
}