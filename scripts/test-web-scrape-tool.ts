import { initializeTools, executeTool, cleanupTools } from '../src/tools';
import { GoogleSearchService } from '../src/services/googleSearchService';
import { WebScrapeService } from '../src/services/webScrapeService';

// Mock GoogleSearchService for testing
class MockGoogleSearchService extends GoogleSearchService {
  constructor() {
    super({ apiKey: 'mock', searchEngineId: 'mock' });
  }

  async search(query: string, numResults: number = 5): Promise<any[]> {
    return [];
  }
}

async function testWebScrapeTool() {
  console.log('🧪 Testing Web Scrape Tool Integration...\n');

  // Initialize tools with mock services
  const mockGoogleService = new MockGoogleSearchService();
  initializeTools(mockGoogleService);

  try {
    // Test web scrape tool with multiple URLs
    console.log('1. Testing web_scrape tool with news URLs...');

    const newsUrls = [
      'https://httpbin.org/html',
      'https://httpbin.org/user-agent'
    ];

    const result = await executeTool('web_scrape', {
      urls: newsUrls,
      selector: 'body'
    });

    console.log('✅ Web scrape tool executed successfully!');
    console.log('Result preview:');
    console.log(result.substring(0, 300) + '...\n');

    // Test with specific selector
    console.log('2. Testing web_scrape tool with specific selector...');

    const resultWithSelector = await executeTool('web_scrape', {
      urls: ['https://httpbin.org/html'],
      selector: 'h1'
    });

    console.log('✅ Web scrape with selector executed successfully!');
    console.log('Result:');
    console.log(resultWithSelector + '\n');

    console.log('🎉 Web scrape tool integration tests passed!');

  } catch (error) {
    console.error('❌ Tool test failed:', error instanceof Error ? error.message : `${error}`);
  } finally {
    await cleanupTools();
  }
}

// Run the test
testWebScrapeTool().catch(console.error);