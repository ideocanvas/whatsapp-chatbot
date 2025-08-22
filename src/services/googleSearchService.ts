import axios from 'axios';

export interface GoogleSearchConfig {
  apiKey: string;
  searchEngineId: string;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export class GoogleSearchService {
  private config: GoogleSearchConfig;

  constructor(config: GoogleSearchConfig) {
    this.config = config;
  }

  /**
   * Perform a Google search using the Custom Search JSON API
   */
  async search(query: string, numResults: number = 5): Promise<SearchResult[]> {
    try {
      console.log('🌐 Making Google API Request:', {
        query: query,
        numResults: numResults,
        engineId: this.config.searchEngineId.substring(0, 10) + '...'
      });

      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: this.config.apiKey,
          cx: this.config.searchEngineId,
          q: query,
          num: Math.min(numResults, 10), // Google API max is 10 results per request
        },
      });

      const items = response.data.items || [];

      console.log('📊 Google API Response:', {
        query: query,
        totalResults: response.data.searchInformation?.totalResults || 0,
        itemsFound: items.length,
        items: items.map((item: any) => ({
          title: item.title?.substring(0, 30) + (item.title?.length > 30 ? '...' : ''),
          link: item.link?.substring(0, 30) + (item.link?.length > 30 ? '...' : '')
        }))
      });

      if (items.length > 0) {
        return items.map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
        }));
      }

      return [];
    } catch (error) {
      console.error('❌ Google search error:', {
        error: error instanceof Error ? error.message : `${error}`,
        query: query
      });
      throw new Error('Failed to perform Google search');
    }
  }

  /**
   * Format search results for LLM consumption
   */
  formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No search results found.';
    }

    return results.map((result, index) =>
      `[${index + 1}] ${result.title}\n${result.link}\n${result.snippet}\n`
    ).join('\n');
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey && !!this.config.searchEngineId;
  }
}

// Helper function to create GoogleSearchService instance from environment variables
export function createGoogleSearchServiceFromEnv(): GoogleSearchService {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    throw new Error('GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables are required');
  }

  return new GoogleSearchService({
    apiKey,
    searchEngineId,
  });
}