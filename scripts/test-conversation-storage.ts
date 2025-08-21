import { ConversationStorageService } from '../src/services/conversationStorageService';
import { Message } from '../src/types/conversation';

// Test the conversation storage service
async function testConversationStorage() {
  console.log('Testing Conversation Storage Service...\n');

  // Initialize storage service
  const storageService = new ConversationStorageService({
    storagePath: 'test-data/conversations',
    maxMessagesPerConversation: 5,
    cleanupIntervalHours: 1
  });

  const testNumber = '1234567890';

  // Test 1: Store text messages
  console.log('1. Storing text messages...');
  const textMessage: Message = {
    id: 'msg_1',
    type: 'text',
    content: 'Hello, how are you?',
    timestamp: new Date().toISOString()
  };

  await storageService.storeMessage(testNumber, textMessage);
  console.log('✓ Text message stored');

  // Test 2: Store image message
  console.log('2. Storing image message...');
  const imageMessage: Message = {
    id: 'msg_2',
    type: 'image',
    content: '',
    timestamp: new Date().toISOString(),
    mediaInfo: {
      id: 'image_123',
      mimeType: 'image/jpeg',
      sha256: 'abc123def456'
    },
    mediaPath: '/path/to/image.jpg'
  };

  await storageService.storeMessage(testNumber, imageMessage);
  console.log('✓ Image message stored');

  // Test 3: Get conversation
  console.log('3. Retrieving conversation...');
  const conversation = await storageService.getConversation(testNumber);
  if (conversation) {
    console.log(`✓ Conversation found with ${conversation.messages.length} messages`);
    console.log(`  Last updated: ${conversation.lastUpdated}`);
  } else {
    console.log('✗ Conversation not found');
  }

  // Test 4: Get formatted history
  console.log('4. Getting formatted message history...');
  const history = await storageService.getFormattedMessageHistory(testNumber, 3);
  console.log('Formatted History:');
  console.log(history);
  console.log('✓ History retrieved successfully');

  // Test 5: Test message rotation (store more messages than limit)
  console.log('5. Testing message rotation...');
  for (let i = 3; i <= 7; i++) {
    const extraMessage: Message = {
      id: `msg_${i}`,
      type: 'text',
      content: `Test message ${i}`,
      timestamp: new Date().toISOString()
    };
    await storageService.storeMessage(testNumber, extraMessage);
  }

  const updatedConversation = await storageService.getConversation(testNumber);
  if (updatedConversation && updatedConversation.messages.length === 5) {
    console.log('✓ Message rotation working correctly (limited to 5 messages)');
    console.log(`  Current messages: ${updatedConversation.messages.length}`);
  } else {
    console.log('✗ Message rotation failed');
  }

  // Test 6: Get storage stats
  console.log('6. Getting storage statistics...');
  const stats = storageService.getStorageStats();
  console.log(`Storage Stats: ${stats.totalConversations} conversations, ${stats.totalMessages} messages`);
  console.log('✓ Stats retrieved successfully');

  // Test 7: Cleanup
  console.log('7. Cleaning up test data...');
  const deleted = await storageService.deleteConversation(testNumber);
  if (deleted) {
    console.log('✓ Test conversation deleted successfully');
  } else {
    console.log('✗ Failed to delete test conversation');
  }

  console.log('\n✅ All tests completed successfully!');
}

// Run the test
testConversationStorage().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});