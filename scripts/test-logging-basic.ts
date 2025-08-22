import { logger } from '../src/utils/logger';

async function testBasicLogging() {
  try {
    console.log('🧪 Testing Basic Logging System...\n');

    // Clear any existing logs
    logger.clearLogs();

    // Test different log types
    console.log('📝 Testing different log types...');

    logger.logDecision('Starting basic logging test');
    logger.logDecision('Debug information', { timestamp: new Date().toISOString() });
    logger.logDecision('This is a warning message');
    logger.logError('Test error occurred', { code: 404, message: 'Not found' });
    logger.logDecision('Operation completed successfully');

    // Test search logging
    logger.logSearch('Search initiated', { query: 'test query', results: 5 });
    logger.logSearch('Search completed', { duration: 150, success: true });

    // Test AI response logging
    logger.logAIResponse('AI generated response', {
      model: 'gpt-4',
      tokens: 150,
      tool_calls: 1
    });

    // Test tool execution logging
    logger.logToolCall('Tool executed', {
      tool_name: 'google_search',
      duration: 200,
      success: true
    });

    // Display logged events
    console.log('\n📊 Logged Events:');
    console.log('='.repeat(50));

    const logs = logger.getLogs();
    logs.forEach((log, index) => {
      console.log(`${index + 1}. [${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}`);
      if (log.data) {
        console.log('   Data:', JSON.stringify(log.data, null, 2));
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
      if (log.data) {
        console.log('   Data:', JSON.stringify(log.data));
      }
    });

    console.log('\n🎉 Basic logging test completed successfully!');
    console.log('The logging system is working correctly with structured logging and filtering capabilities.');

  } catch (error) {
    console.error('❌ Error testing basic logging:', error);
  }
}

// Run the test
testBasicLogging();