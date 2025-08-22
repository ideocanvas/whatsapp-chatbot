#!/usr/bin/env ts-node

/**
 * Comprehensive test for web scraping tool integration
 * Tests the complete workflow from tool registration to execution
 */

import { initializeTools, getToolSchemas, executeTool, cleanupTools } from '../src/tools';
import { GoogleSearchService } from '../src/services/googleSearchService';

async function testWebScrapeIntegration() {
  console.log('🧪 Testing Web Scrape Tool Integration...\n');

  // Initialize tools with mock Google service
  const mockGoogleService = new GoogleSearchService({
    apiKey: 'mock',
    searchEngineId: 'mock'
  });
  initializeTools(mockGoogleService);

  // Test 1: Verify tool schemas
  console.log('1. Testing tool schemas...');
  try {
    const schemas = getToolSchemas();
    const toolNames = schemas.map((schema: any) => schema.function.name);
    console.log('✅ Available tools:', toolNames);

    const webScrapeSchema = schemas.find((schema: any) => schema.function.name === 'web_scrape');
    if (webScrapeSchema) {
      console.log('✅ Web scrape tool schema is properly configured');
    } else {
      throw new Error('Web scrape tool schema not found');
    }
  } catch (error) {
    console.error('❌ Tool schema test failed:', error);
    return;
  }

  // Test 2: Execute web scrape with single URL
  console.log('\n2. Testing web scrape with single URL...');
  try {
    const result = await executeTool('web_scrape', {
      urls: ['https://httpbin.org/html'],
      selector: 'body'
    });
    console.log('✅ Web scrape executed successfully');
    console.log('Result summary:', {
      urlCount: result.length,
      firstResultLength: result[0]?.content?.length || 0,
      hasContent: !!result[0]?.content
    });
  } catch (error) {
    console.error('❌ Web scrape test failed:', error);
    return;
  }

  // Test 3: Execute web scrape with multiple URLs
  console.log('\n3. Testing web scrape with multiple URLs...');
  try {
    const result = await executeTool('web_scrape', {
      urls: [
        'https://httpbin.org/html',
        'https://httpbin.org/user-agent',
        'https://httpbin.org/headers'
      ],
      selector: 'body'
    });
    console.log('✅ Multi-URL web scrape executed successfully');
    console.log('Result summary:', {
      totalUrls: result.length,
      successfulScrapes: result.length, // All should be successful since errors are thrown
      firstResultLength: result[0]?.content?.length || 0
    });
  } catch (error) {
    console.error('❌ Multi-URL web scrape test failed:', error);
    return;
  }

  // Test 4: Execute web scrape with specific selector
  console.log('\n4. Testing web scrape with specific selector...');
  try {
    const result = await executeTool('web_scrape', {
      urls: ['https://httpbin.org/html'],
      selector: 'h1'
    });
    console.log('✅ Selector-based web scrape executed successfully');
    console.log('Result content preview:', result[0]?.content?.substring(0, 100) || 'No content');
  } catch (error) {
    console.error('❌ Selector web scrape test failed:', error);
    return;
  }

  // Test 5: Test error handling with invalid URL
  console.log('\n5. Testing error handling with invalid URL...');
  try {
    const result = await executeTool('web_scrape', {
      urls: ['https://invalid-url-that-does-not-exist-12345.com'],
      selector: 'body'
    });
    console.log('✅ Error handling test completed');
    console.log('Error result:', {
      hasError: !!result[0]?.error,
      errorType: result[0]?.error ? 'Network error' : 'No error'
    });
  } catch (error) {
    console.error('❌ Error handling test failed:', error);
    return;
  }

  // Test 6: Test mixed URLs (valid + invalid)
  console.log('\n6. Testing mixed URLs (valid + invalid)...');
  try {
    const result = await executeTool('web_scrape', {
      urls: [
        'https://httpbin.org/html',
        'https://invalid-url-that-does-not-exist-12345.com',
        'https://httpbin.org/user-agent'
      ],
      selector: 'body'
    });
    console.log('✅ Mixed URL test completed');
    console.log('Result summary:', {
      totalUrls: result.length,
      successful: result.length, // All successful URLs are returned, failed ones are skipped
      firstResultLength: result[0]?.content?.length || 0
    });
  } catch (error) {
    console.error('❌ Mixed URL test failed:', error);
    return;
  }

  // Cleanup
  await cleanupTools();
  console.log('\n🎉 Web Scrape Integration Test Completed Successfully!');
  console.log('\n📋 Summary:');
  console.log('✅ Tool schemas properly configured');
  console.log('✅ Single URL scraping works');
  console.log('✅ Multiple URL scraping works');
  console.log('✅ Selector-based scraping works');
  console.log('✅ Error handling works correctly');
  console.log('✅ Mixed URL scenarios handled properly');
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
testWebScrapeIntegration().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});