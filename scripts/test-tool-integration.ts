import { initializeTools, getToolSchemas, executeTool, cleanupTools } from '../src/tools';
import { GoogleSearchService } from '../src/services/googleSearchService';

// Mock GoogleSearchService for testing
class MockGoogleSearchService extends GoogleSearchService {
  constructor() {
    super({ apiKey: 'mock', searchEngineId: 'mock' });
  }

  async search(query: string, numResults: number = 5): Promise<any[]> {
    console.log('🔍 Mock Google Search:', { query, numResults });
    return [];
  }
}

async function testToolIntegration() {
  console.log('🧪 Testing Tool Integration (Web Scrape + Google Search)...\n');

  // Initialize tools with mock services
  const mockGoogleService = new MockGoogleSearchService();
  initializeTools(mockGoogleService);

  try {
    // Test 1: Get available tool schemas
    console.log('1. Testing tool schemas...');
    const schemas = getToolSchemas();
    console.log('✅ Available tools:', schemas.map(s => s.function.name));
    console.log('Web scrape schema:', JSON.stringify(schemas.find(s => s.function.name === 'web_scrape'), null, 2));
    console.log();

    // Test 2: Execute web scrape tool directly
    console.log('2. Testing web_scrape tool execution...');
    const scrapeResult = await executeTool('web_scrape', {
      urls: ['https://httpbin.org/html', 'https://httpbin.org/user-agent'],
      selector: 'body'
    });
    console.log('✅ Web scrape executed successfully!');
    console.log('Result length:', scrapeResult.length, 'characters');
    console.log('First 200 chars:', scrapeResult.substring(0, 200) + '...\n');

    // Test 3: Test error handling
    console.log('3. Testing error handling...');
    try {
      await executeTool('web_scrape', {
        urls: ['https://invalid-url-that-does-not-exist-12345.com']
      });
    } catch (error) {
      console.log('✅ Error handling works:', error instanceof Error ? error.message : 'Unknown error');
    }
    console.log();

    // Test 4: Test with specific selector
    console.log('4. Testing with specific selector...');
    const selectorResult = await executeTool('web_scrape', {
      urls: ['https://httpbin.org/html'],
      selector: 'h1'
    });
    console.log('✅ Selector execution successful!');
    console.log('Result:', selectorResult);
    console.log();

    console.log('🎉 All tool integration tests passed!');

  } catch (error) {
    console.error('❌ Tool integration test failed:', error instanceof Error ? error.message : 'Unknown error');
  } finally {
    await cleanupTools();
  }
}

// Run the test
testToolIntegration().catch(console.error);