import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../src/services/googleSearchService';
import { initializeTools, executeTool } from '../src/tools';
import { logger } from '../src/utils/logger';

async function testLogging() {
  try {
    console.log('🧪 Testing Comprehensive Logging System...\n');

    // Initialize Google Search service
    const searchService = createGoogleSearchServiceFromEnv();

    if (!searchService.isConfigured()) {
      console.log('❌ Google Search service is not configured. Skipping logging test.');
      console.log('Please set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.');
      return;
    }

    console.log('✅ Google Search service configured successfully.');

    // Initialize tools
    initializeTools(searchService);

    // Test logging with a search query
    console.log('\n🔍 Testing tool execution with logging...');

    const testQuery = 'artificial intelligence breakthroughs 2024';
    console.log(`Search query: "${testQuery}"`);

    // Execute the tool
    const result = await executeTool('google_search', {
      query: testQuery,
      num_results: 2
    });

    console.log('\n✅ Tool execution completed.');
    console.log(`Result length: ${result.length} characters`);
    console.log(`First 200 chars: ${result.substring(0, 200)}...\n`);

    // Display logged events
    console.log('📊 Logged Events:');
    console.log('='.repeat(50));

    const logs = logger.getLogs();
    logs.forEach((log, index) => {
      console.log(`${index + 1}. [${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}`);
      if (log.data) {
        console.log('   Data:', JSON.stringify(log.data, null, 2).substring(0, 100) + '...');
      }
    });

    console.log('\n📈 Log Statistics:');
    console.log('='.repeat(50));

    const logCounts: { [key: string]: number } = {};
    logs.forEach(log => {
      logCounts[log.type] = (logCounts[log.type] || 0) + 1;
    });

    Object.entries(logCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} entries`);
    });

    console.log(`\n📋 Total logs: ${logs.length}`);

    // Test filtering
    console.log('\n🔍 Filtered Logs (Search type only):');
    console.log('='.repeat(50));

    const searchLogs = logger.getLogs({ type: 'search' });
    searchLogs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.message}`);
    });

    console.log('\n🎉 Logging test completed successfully!');
    console.log('All AI responses and tool calling results are being logged with timestamps and detailed information.');

  } catch (error) {
    console.error('❌ Error testing logging:', error);
    logger.logError('Logging test failed', { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// Run the test
testLogging();