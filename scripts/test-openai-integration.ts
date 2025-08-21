import { OpenAIService } from '../src/services/openaiService';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testOpenAIIntegration() {
  console.log('Testing OpenAI integration...');

  // Check if API key is available
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('❌ OPENAI_API_KEY not found in environment variables');
    console.log('Please add OPENAI_API_KEY to your .env file');
    return;
  }

  try {
    // Create OpenAI service instance
    const openaiService = new OpenAIService({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL,
      visionModel: process.env.OPENAI_VISION_MODEL,
      temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : undefined,
      maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : undefined,
    });

    console.log('✅ OpenAI service created successfully');

    // Test text response
    console.log('\nTesting text response...');
    const testMessage = 'Hello! Can you tell me a fun fact about space?';
    const textResponse = await openaiService.generateTextResponse(testMessage);
    console.log(`Input: ${testMessage}`);
    console.log(`Response: ${textResponse}`);

    // Test that the response doesn't contain thinking tags
    if (textResponse.includes('<think>') || textResponse.includes('</think>')) {
      console.log('❌ Response contains thinking tags - cleaner not working');
    } else {
      console.log('✅ Text response test passed (thinking tags removed)');
    }

    // Test embedding creation
    console.log('\nTesting embedding creation...');
    const embedding = await openaiService.createEmbedding('Hello world');
    console.log(`Embedding vector length: ${embedding.length}`);
    console.log('✅ Embedding test passed');

    console.log('\n🎉 All OpenAI integration tests passed!');
    console.log('\nTo test image analysis, you need to:');
    console.log('1. Send an image to your WhatsApp bot');
    console.log('2. The bot will automatically analyze it using OpenAI vision');

  } catch (error) {
    console.error('❌ OpenAI integration test failed:', error instanceof Error ? error.message : error);
  }
}

// Run the test
testOpenAIIntegration().catch(console.error);