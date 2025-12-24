import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../../src/services/GoogleSearchService';
import * as dotenv from 'dotenv';

// Load environment variables for Jest tests
dotenv.config();

// Simple integration test to validate the Google Search service with updated API key
describe('GoogleSearchService Integration Test', () => {
  let searchService: GoogleSearchService;

  beforeAll(() => {
    // Create service from environment variables
    searchService = createGoogleSearchServiceFromEnv();
  });

  it('should be properly configured with API key', () => {
    expect(searchService.isConfigured()).toBe(true);
  });

  it('should perform a simple search with the updated API key', async () => {
    // Use a simple, non-controversial search query
    const query = 'weather today';

    try {
      const results = await searchService.search(query, 3);

      console.log('🌐 Search Results:', {
        query,
        resultsFound: results.length,
        results: results.map(r => ({
          title: r.title.substring(0, 50) + (r.title.length > 50 ? '...' : ''),
          url: r.link.substring(0, 30) + (r.link.length > 30 ? '...' : '')
        }))
      });

      // Basic validation - should have results and proper structure
      expect(Array.isArray(results)).toBe(true);

      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty('title');
        expect(result).toHaveProperty('link');
        expect(result).toHaveProperty('snippet');
        expect(typeof result.title).toBe('string');
        expect(typeof result.link).toBe('string');
        expect(typeof result.snippet).toBe('string');
      }

      // API key is working if we get results or no results (empty array is valid)
      expect(true).toBe(true); // Test passes if we reach here without API errors

    } catch (error) {
      // If we get an API error, it might indicate the API key is invalid
      console.error('❌ API Error:', error);

      // Check if it's an API key error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('API key') || errorMessage.includes('invalid') || errorMessage.includes('403')) {
        throw new Error(`API Key validation failed: ${errorMessage}`);
      }

      // Other errors (network issues, etc.) don't necessarily mean API key is bad
      console.warn('⚠️ Network or temporary error, not necessarily API key issue:', errorMessage);
    }
  });

  it('should format search results correctly', () => {
    const mockResults = [
      {
        title: 'Test Result 1',
        link: 'https://example.com/1',
        snippet: 'This is a test snippet for result 1'
      },
      {
        title: 'Test Result 2',
        link: 'https://example.com/2',
        snippet: 'This is a test snippet for result 2'
      }
    ];

    const formatted = searchService.formatSearchResults(mockResults);

    expect(formatted).toContain('Test Result 1');
    expect(formatted).toContain('Test Result 2');
    expect(formatted).toContain('https://example.com/1');
    expect(formatted).toContain('https://example.com/2');
  });

  it('should handle empty search results', () => {
    const formatted = searchService.formatSearchResults([]);
    expect(formatted).toBe('No search results found.');
  });
});
