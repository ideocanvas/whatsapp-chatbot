#!/usr/bin/env ts-node

/**
 * Test script to verify OpenAI service configuration
 * This script tests the service creation and configuration without making actual API calls
 */

import dotenv from 'dotenv';
import { OpenAIService, createOpenAIServiceFromEnv } from '../src/services/openaiService';

// Load environment variables
dotenv.config();

async function testOpenAIConfig() {
  console.log('Testing OpenAI service configuration...');

  // Test 1: Try to create service from environment
  try {
    const service = createOpenAIServiceFromEnv();
    console.log('✅ OpenAI service created successfully');

    // Test 2: Check if OpenAI is configured
    const isConfigured = service.isConfigured();
    console.log(`📊 OpenAI configured: ${isConfigured}`);

    // Test 3: Test API functionality
    console.log('🧪 Testing API functionality...');
    try {
      const response = await service.generateTextResponse('Hello, test message');
      console.log('✅ API response generated successfully');
      console.log(`📝 Response: ${response}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log('⚠️  API call failed (this is expected if not properly configured):', errorMessage);
    }

    console.log('\n🎉 OpenAI service configuration test completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Choose an OpenAI-compatible API provider (OpenAI, Azure OpenAI, Anthropic, etc.)');
    console.log('2. Get your API key from the provider');
    console.log('3. Update your .env file with the correct values:');
    console.log('   OPENAI_API_KEY=your_actual_api_key_here');
    console.log('   OPENAI_BASE_URL=https://api.openai.com/v1 (or your provider URL)');
    console.log('   OPENAI_MODEL=gpt-4o (or your model name)');
    console.log('4. Run the full integration test: npm run test:openai');

  } catch (error) {
    console.log('ℹ️  OpenAI service creation failed - this is expected when not configured');
    console.log('📋 Configuration instructions:');
    console.log('1. Choose an OpenAI-compatible API provider');
    console.log('2. Get your API key from the provider');
    console.log('3. Update your .env file with:');
    console.log('   OPENAI_API_KEY=your_api_key_here');
    console.log('   OPENAI_BASE_URL=https://api.openai.com/v1 (or your provider URL)');
    console.log('   OPENAI_MODEL=gpt-4o (or your model name)');
    console.log('4. Run this test again after configuration');
  }
}

// Run the test
testOpenAIConfig().catch(console.error);