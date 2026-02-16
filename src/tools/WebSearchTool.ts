import { BaseTool } from '../core/BaseTool';
import { GoogleSearchService } from '../services/GoogleSearchService';

/**
 * Web Search Tool for the autonomous agent
 * Bridges the gap between old and new tool systems
 * 
 * Supports two search types:
 * - 'web': General web search via Google Custom Search API (good for facts, general info)
 * - 'news': News search via Google News RSS feeds (good for current events, latest news)
 */
export class WebSearchTool extends BaseTool {
  name = 'web_search';
  description = 'Perform a web search using Google to find current information, news, or facts. Use this when you need up-to-date information that might not be in your knowledge base yet. For current news or recent events, use search_type="news" to get the latest headlines.';
  
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
      },
      search_type: {
        type: 'string',
        enum: ['web', 'news'],
        description: 'Type of search: "web" for general information, "news" for current news and recent events (default: "web")',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private searchService: GoogleSearchService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query, num_results = 3, search_type = 'web' } = args;
    
    console.log(`🔍 WebSearchTool executing: "${query}" (type: ${search_type})`);
    
    try {
      let results;
      
      if (search_type === 'news') {
        // Use Google News RSS for current news
        results = await this.searchService.searchNews(query, num_results);
      } else {
        // Use Google Custom Search API for general web search
        results = await this.searchService.search(query, num_results);
      }
      
      if (results.length === 0) {
        return "No search results found for your query.";
      }
      
      // Format results for the agent
      const formattedResults = results.map((result, index) => {
        let formatted = `${index + 1}. ${result.title}\n   ${result.link}\n   ${result.snippet}`;
        // Include publication date for news results if available
        if (result.pubDate) {
          formatted += `\n   Published: ${result.pubDate}`;
        }
        return formatted;
      }).join('\n\n');
      
      const searchTypeLabel = search_type === 'news' ? 'News' : 'Web';
      return `${searchTypeLabel} search results for "${query}":\n\n${formattedResults}`;
      
    } catch (error) {
      console.error('❌ WebSearchTool failed:', error);
      return `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}