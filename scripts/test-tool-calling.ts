import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../src/services/googleSearchService';
import { initializeTools, getToolSchemas, executeTool, hasAvailableTools } from '../src/tools';

async function testToolCalling() {
  try {
    console.log('Testing Tool Calling Functionality...');

    // Initialize Google Search service
    const searchService = createGoogleSearchServiceFromEnv();

    if (!searchService.isConfigured()) {
      console.log('Google Search service is not configured. Skipping tool calling test.');
      return;
    }

    console.log('Google Search service configured successfully.');

    // Initialize tools
    initializeTools(searchService);

    if (!hasAvailableTools()) {
      console.log('No tools available for testing.');
      return;
    }

    console.log('Tools initialized successfully.');
    console.log('Available tools:', Object.keys(availableTools));

    // Test tool schemas
    const schemas = getToolSchemas();
    console.log('\nTool schemas:', JSON.stringify(schemas, null, 2));

    // Test tool execution
    console.log('\nTesting Google Search tool execution...');

    const testQuery = 'latest artificial intelligence developments';
    console.log(`Search query: "${testQuery}"`);

    const result = await executeTool('google_search', {
      query: testQuery,
      num_results: 2
    });

    console.log('\nSearch results:');
    console.log(result);

    console.log('\n✅ Tool calling test completed successfully!');

  } catch (error) {
    console.error('Error testing tool calling:', error);
  }
}

// Import availableTools for testing
import { availableTools } from '../src/tools';

// Run the test
testToolCalling();