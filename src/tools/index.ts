import { GoogleSearchService } from '../services/googleSearchService';
import { WebScrapeService, createWebScrapeService } from '../services/webScrapeService';

// Tool function definitions
export interface ToolFunction {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<any>;
}

// Available tools
export const availableTools: { [key: string]: ToolFunction } = {};
let webScrapeService: WebScrapeService;

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
];

// Initialize tools with dependencies
export function initializeTools(googleSearchService: GoogleSearchService) {
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
      const results = await googleSearchService.search(args.query, args.num_results || 5);
      const executionTime = Date.now() - startTime;

      console.log('✅ Google Search Completed:', {
        query: args.query,
        resultsCount: results.length,
        executionTime: `${executionTime}ms`,
        firstResult: results[0] ? results[0].title.substring(0, 50) + '...' : 'No results'
      });

      return googleSearchService.formatSearchResults(results);
    }
  };

  // Initialize web scrape service
  webScrapeService = createWebScrapeService();

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
          error: error instanceof Error ? error.message : 'Unknown error',
          urls: args.urls
        });
        throw new Error('Failed to scrape web content');
      }
    }
  };
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