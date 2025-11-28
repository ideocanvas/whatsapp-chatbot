import { startAutonomousAgent, getAutonomousAgent } from './autonomous';

/**
 * Test script for the Autonomous WhatsApp Agent
 * This demonstrates the core functionality without requiring WhatsApp integration
 */
async function testAutonomousAgent() {
  console.log('🧪 Testing Autonomous WhatsApp Agent Architecture...\n');

  try {
    // 1. Start the autonomous agent
    console.log('1. Starting autonomous agent...');
    const agent = await startAutonomousAgent();
    
    // Small delay to let the system initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Check system status
    console.log('\n2. Checking system status...');
    const status = await agent.getStatus();
    console.log('System Status:', {
      status: status.status,
      memory: {
        activeUsers: status.memory?.context?.activeUsers || 0,
        knowledgeDocuments: status.memory?.knowledge?.totalDocuments || 0
      },
      tools: status.tools?.count || 0,
      browser: status.browser?.favoritesCount || 0
    });

    // 3. Test incoming message handling
    console.log('\n3. Testing message processing...');
    const testUserId = 'test-user-123';
    const testMessage = 'Hello! Can you tell me about the latest tech news?';
    
    await agent.handleIncomingMessage(testUserId, testMessage, 'test-message-1');
    
    // 4. Test another message to build context
    console.log('\n4. Testing context building...');
    await agent.handleIncomingMessage(testUserId, 'What about AI developments?', 'test-message-2');

    // 5. Check if user interests were discovered
    console.log('\n5. Checking user interest discovery...');
    const statusAfterMessages = await agent.getStatus();
    console.log('After messages - User should have discovered interests');

    // 6. Wait for autonomous browsing to occur
    console.log('\n6. Waiting for autonomous browsing session...');
    console.log('The scheduler will automatically start browsing in idle mode');
    console.log('This may take a few minutes depending on the tick cycle...');

    // 7. Demonstrate proactive messaging potential
    console.log('\n7. Proactive messaging capabilities:');
    console.log('- The system will automatically browse for knowledge');
    console.log('- User interests are auto-discovered from conversations');
    console.log('- When relevant content is found, proactive messages are queued');
    console.log('- Rate limiting prevents spam (15-minute cooldown per user)');

    // 8. Show system architecture
    console.log('\n8. System Architecture Summary:');
    console.log('✅ 3-Tier Memory: ContextManager (1h) + KnowledgeBase (vector) + HistoryStore (SQL)');
    console.log('✅ Autonomous Browser: 10 pages/hour limit with intelligent URL selection');
    console.log('✅ Scheduler: 1-minute ticks with idle/proactive mode switching');
    console.log('✅ Agent: LLM orchestration with tool calling and mobile optimization');
    console.log('✅ Action Queue: Rate-limited messaging with exponential backoff');
    console.log('✅ Interest Discovery: Auto-extracts user interests from conversations');

    // 9. Keep the test running to observe autonomous behavior
    console.log('\n9. Test will continue running to observe autonomous behavior...');
    console.log('Press Ctrl+C to stop the test');
    console.log('You should see browsing sessions and potential proactive checks in the logs');

    // Keep the process alive to observe autonomous behavior
    setInterval(async () => {
      const currentStatus = await agent.getStatus();
      if (currentStatus.status === 'Running') {
        console.log(`⏰ System running - Ticks: ${currentStatus.scheduler?.tickCount || 0}`);
      }
    }, 30000); // Log every 30 seconds

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testAutonomousAgent().catch(console.error);
}

export { testAutonomousAgent };