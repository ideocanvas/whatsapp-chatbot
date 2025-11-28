import { BaseTool } from '../core/BaseTool';
import { GoogleSearchService } from '../services/googleSearchService';

/**
 * Web Search Tool for the autonomous agent
 * Bridges the gap between old and new tool systems
 */
export class WebSearchTool extends BaseTool {
  name = 'web_search';
  description = 'Perform a web search using Google to find current information, news, or facts. Use this when you need up-to-date information that might not be in your knowledge base yet.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up information about',
      },
      num_results: {
        type: 'number',
        description: 'Number of search results to return (default: 3)',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private searchService: GoogleSearchService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query, num_results = 3 } = args;
    
    console.log(`🔍 WebSearchTool executing: "${query}"`);
    
    try {
      const results = await this.searchService.search(query, num_results);
      
      if (results.length === 0) {
        return "No search results found for your query.";
      }
      
      // Format results for the agent
      const formattedResults = results.map((result, index) =>
        `${index + 1}. ${result.title}\n   ${result.link}\n   ${result.snippet}`
      ).join('\n\n');
      
      return `Search results for "${query}":\n\n${formattedResults}`;
      
    } catch (error) {
      console.error('❌ WebSearchTool failed:', error);
      return `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}