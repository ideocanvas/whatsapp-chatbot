#!/usr/bin/env ts-node

/**
 * Test script for OpenAI tool calling with web scraping
 * This tests the complete integration from OpenAI function calling to actual tool execution
 */

import { OpenAIService } from '../src/services/openaiService';

async function testOpenAIToolCalling() {
  console.log('🧪 Testing OpenAI Tool Calling Integration...');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const openaiService = new OpenAIService({
    apiKey: process.env.OPENAI_API_KEY
  });

  // Test 1: Simple message without tool calls
  console.log('\n1. Testing simple message without tool calls...');
  try {
    const simpleResponse = await openaiService.generateTextResponse(
      'Hello, how are you?',
      'test-user-123'
    );
    console.log(`✅ Simple response: ${simpleResponse.substring(0, 100)}...`);
  } catch (error) {
    console.error('❌ Simple message test failed:', error);
  }

  // Test 2: Message that should trigger web scraping
  console.log('\n2. Testing message that should trigger web scraping...');
  try {
    const scrapeResponse = await openaiService.generateTextResponse(
      'Can you get me the latest news from httpbin.org? I want to see what content they have available.',
      'test-user-456'
    );
    console.log(`✅ Scrape response: ${scrapeResponse.substring(0, 200)}...`);
  } catch (error) {
    console.error('❌ Web scraping test failed:', error);
  }

  // Test 3: Message that should trigger Google search
  console.log('\n3. Testing message that should trigger Google search...');
  try {
    const searchResponse = await openaiService.generateTextResponse(
      'Search for the latest AI news and developments in 2024',
      'test-user-789'
    );
    console.log(`✅ Search response: ${searchResponse.substring(0, 200)}...`);
  } catch (error) {
    console.error('❌ Google search test failed:', error);
  }

  // Test 4: Complex query with multiple potential tool calls
  console.log('\n4. Testing complex query with multiple tool potential...');
  try {
    const complexResponse = await openaiService.generateTextResponse(
      'I need information about web development trends and also want to see what httpbin.org has to offer. Can you search for both?',
      'test-user-complex'
    );
    console.log(`✅ Complex response: ${complexResponse.substring(0, 200)}...`);
  } catch (error) {
    console.error('❌ Complex query test failed:', error);
  }

  console.log('\n🎉 OpenAI Tool Calling Integration Test Completed!');
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
testOpenAIToolCalling().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});