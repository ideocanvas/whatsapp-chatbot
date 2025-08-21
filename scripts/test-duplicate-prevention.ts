import { ProcessedMessageService } from '../src/services/processedMessageService';

async function testDuplicatePrevention() {
  console.log('Testing duplicate message prevention...\n');

  const processedMessageService = new ProcessedMessageService('data/test_processed_messages.db');

  // Test 1: Basic functionality
  console.log('Test 1: Basic message tracking');
  const testMessageId = 'test_message_123';

  // Check if message is not processed yet
  const isProcessed1 = await processedMessageService.hasMessageBeenProcessed(testMessageId);
  console.log(`Message ${testMessageId} processed: ${isProcessed1}`);

  // Mark message as processed
  await processedMessageService.markMessageAsProcessed(testMessageId, '1234567890', 'text');
  console.log('Message marked as processed');

  // Check if message is now processed
  const isProcessed2 = await processedMessageService.hasMessageBeenProcessed(testMessageId);
  console.log(`Message ${testMessageId} processed: ${isProcessed2}`);

  if (isProcessed2) {
    console.log('✓ Test 1 PASSED: Message tracking works correctly\n');
  } else {
    console.log('✗ Test 1 FAILED: Message tracking failed\n');
  }

  // Test 2: Duplicate detection
  console.log('Test 2: Duplicate detection');
  const duplicateMessageId = 'duplicate_message_456';

  // First processing
  await processedMessageService.markMessageAsProcessed(duplicateMessageId, '0987654321', 'text');
  const firstCheck = await processedMessageService.hasMessageBeenProcessed(duplicateMessageId);

  // Second check (should be duplicate)
  const secondCheck = await processedMessageService.hasMessageBeenProcessed(duplicateMessageId);

  console.log(`First check: ${firstCheck}, Second check: ${secondCheck}`);

  if (firstCheck && secondCheck) {
    console.log('✓ Test 2 PASSED: Duplicate detection works correctly\n');
  } else {
    console.log('✗ Test 2 FAILED: Duplicate detection failed\n');
  }

  // Test 3: Different messages should not be detected as duplicates
  console.log('Test 3: Different message IDs');
  const message1 = 'unique_message_1';
  const message2 = 'unique_message_2';

  await processedMessageService.markMessageAsProcessed(message1, '1111111111', 'text');
  const checkMessage1 = await processedMessageService.hasMessageBeenProcessed(message1);
  const checkMessage2 = await processedMessageService.hasMessageBeenProcessed(message2);

  console.log(`Message ${message1} processed: ${checkMessage1}`);
  console.log(`Message ${message2} processed: ${checkMessage2}`);

  if (checkMessage1 && !checkMessage2) {
    console.log('✓ Test 3 PASSED: Different messages handled correctly\n');
  } else {
    console.log('✗ Test 3 FAILED: Different messages not handled correctly\n');
  }

  // Test 4: Get statistics
  console.log('Test 4: Statistics');
  const stats = await processedMessageService.getStats();
  console.log('Statistics:', stats);

  if (stats.totalProcessed > 0) {
    console.log('✓ Test 4 PASSED: Statistics working correctly\n');
  } else {
    console.log('✗ Test 4 FAILED: Statistics not working\n');
  }

  // Clean up
  console.log('Cleaning up test database...');
  // The test database will be automatically cleaned up by the cleanup process
  // For immediate cleanup, we could delete the file, but it's fine for testing

  console.log('\nAll tests completed!');
  processedMessageService.close();
}

// Run the test
testDuplicatePrevention().catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
});