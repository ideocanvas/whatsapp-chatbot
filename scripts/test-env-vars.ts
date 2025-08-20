#!/usr/bin/env ts-node

/**
 * Simple test to verify environment variables are being loaded correctly
 */

console.log('Testing environment variable loading...');

// Check if dotenv is configured
try {
  // Try to require dotenv to see if it's installed and configured
  require('dotenv').config();
  console.log('✅ dotenv is configured');
} catch (error) {
  console.log('❌ dotenv not found or not configured');
}

// Check specific OpenAI environment variables
console.log('\n📋 Environment variables:');
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET'}`);
console.log(`OPENAI_BASE_URL: ${process.env.OPENAI_BASE_URL || 'NOT SET'}`);
console.log(`OPENAI_MODEL: ${process.env.OPENAI_MODEL || 'NOT SET'}`);

// Check if the API key is the placeholder value
if (process.env.OPENAI_API_KEY === 'your_openai_compatible_api_key_here') {
  console.log('\n⚠️  WARNING: OPENAI_API_KEY is still using the placeholder value!');
  console.log('   Please update your .env file with a real API key from your provider.');
} else if (process.env.OPENAI_API_KEY) {
  console.log('\n✅ OPENAI_API_KEY is set to a non-placeholder value');
}

console.log('\n🧪 To test with a real API provider:');
console.log('1. Choose an OpenAI-compatible provider (OpenAI, Azure, Anthropic, etc.)');
console.log('2. Get your API key from the provider');
console.log('3. Update OPENAI_API_KEY in your .env file');
console.log('4. Update OPENAI_BASE_URL to match your provider\'s endpoint');
console.log('5. Run: npm run test:openai:config');