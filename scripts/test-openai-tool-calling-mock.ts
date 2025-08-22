#!/usr/bin/env ts-node

/**
 * Mock test script for OpenAI tool calling with web scraping
 * Simulates the complete integration without actual API calls
 */

import { initializeTools, getToolSchemas, executeTool, cleanupTools } from '../src/tools';
import { OpenAIService } from '../src/services/openaiService';
import { GoogleSearchService } from '../src/services/googleSearchService';

// Mock OpenAIService for testing
class MockOpenAIService extends OpenAIService {
  constructor() {
    super({ apiKey: 'mock-api-key' });
  }

  async generateTextResponse(
    message: string,
    context?: string,
    tools?: any[],
    toolChoice?: 'auto' | 'none' | 'required'
  ): Promise<string> {
    console.log('🤖 Mock OpenAI Request:', { message, context, hasTools: !!tools, toolChoice });

    // Simulate tool calling decision making
    if (message.toLowerCase().includes('httpbin') || message.toLowerCase().includes('scrape')) {
      console.log('🔧 AI would call web_scrape tool for this message');
      const mockScrapeResult = await executeTool('web_scrape', {
        urls: ['https://httpbin.org/html'],
        selector: 'body'
      });
      return `Mock response with scraped data: ${JSON.stringify(mockScrapeResult).substring(0, 100)}...`;
    }

    if (message.toLowerCase().includes('search') || message.toLowerCase().includes('google')) {
      console.log('🔍 AI would call google_search tool for this message');
      const mockSearchResult = await executeTool('google_search', {
        query: message,
        numResults: 3
      });
      return `Mock response with search results: Found ${mockSearchResult.length} results`;
    }

    return 'Mock AI response: This is a simulated response without actual API calls.';
  }
}

async function testOpenAIToolCallingMock() {
  console.log('🧪 Testing OpenAI Tool Calling Integration (Mock)...\n');

  // Initialize tools with mock services
  const mockGoogleService = new GoogleSearchService({
    apiKey: 'mock',
    searchEngineId: 'mock'
  });
  initializeTools(mockGoogleService);

  const mockOpenaiService = new MockOpenAIService();

  // Test 1: Simple message without tool calls
  console.log('\n1. Testing simple message without tool calls...');
  try {
    const simpleResponse = await mockOpenaiService.generateTextResponse(
      'Hello, how are you?',
      'test-user-123'
    );
    console.log(`✅ Simple response: ${simpleResponse}`);
  } catch (error) {
    console.error('❌ Simple message test failed:', error);
  }

  // Test 2: Message that should trigger web scraping
  console.log('\n2. Testing message that should trigger web scraping...');
  try {
    const scrapeResponse = await mockOpenaiService.generateTextResponse(
      'Can you get me the latest news from httpbin.org? I want to see what content they have available.',
      'test-user-456'
    );
    console.log(`✅ Scrape response: ${scrapeResponse}`);
  } catch (error) {
    console.error('❌ Web scraping test failed:', error);
  }

  // Test 3: Message that should trigger Google search
  console.log('\n3. Testing message that should trigger Google search...');
  try {
    const searchResponse = await mockOpenaiService.generateTextResponse(
      'Search for the latest AI news and developments in 2024',
      'test-user-789'
    );
    console.log(`✅ Search response: ${searchResponse}`);
  } catch (error) {
    console.error('❌ Google search test failed:', error);
  }

  // Test 4: Complex query with multiple potential tool calls
  console.log('\n4. Testing complex query with multiple tool potential...');
  try {
    const complexResponse = await mockOpenaiService.generateTextResponse(
      'I need information about web development trends and also want to see what httpbin.org has to offer. Can you search for both?',
      'test-user-complex'
    );
    console.log(`✅ Complex response: ${complexResponse}`);
  } catch (error) {
    console.error('❌ Complex query test failed:', error);
  }

  // Test 5: Show available tool schemas
  console.log('\n5. Testing tool schemas...');
  try {
    const toolSchemas = getToolSchemas();
    console.log('✅ Available tools:', Object.keys(toolSchemas));
    const schemas = getToolSchemas();
    console.log('✅ Available tools:', schemas.map((schema: any) => schema.function.name));
    const webScrapeSchema = schemas.find((schema: any) => schema.function.name === 'web_scrape');
    console.log('Web scrape schema:', JSON.stringify(webScrapeSchema, null, 2));
  } catch (error) {
    console.error('❌ Tool schema test failed:', error);
  }

  // Cleanup
  await cleanupTools();
  console.log('\n🎉 OpenAI Tool Calling Mock Integration Test Completed!');
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
testOpenAIToolCallingMock().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});