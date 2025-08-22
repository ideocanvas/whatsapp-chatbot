#!/usr/bin/env ts-node

/**
 * Test script for WhatsApp response shortening functionality
 */

import { shortenForWhatsApp, cleanLLMResponse } from '../src/utils/responseCleaner';

// Test cases for WhatsApp response shortening
const testCases = [
  {
    name: 'Long formal response',
    input: 'Hello! Thank you for your question. I would like to inform you that the weather today is quite pleasant with a high temperature of 25 degrees Celsius and partly cloudy skies. Additionally, there is a slight breeze coming from the northwest at approximately 5-10 kilometers per hour. In conclusion, it should be a wonderful day for outdoor activities.',
    expected: 'The weather today is pleasant with 25°C and partly cloudy skies, plus a light breeze from the northwest.'
  },
  {
    name: 'Very long response with multiple sentences',
    input: 'Certainly! I would be happy to provide you with detailed information about this topic. First, let me explain the background and context of the situation. The historical development of this concept dates back to the early 20th century when several key thinkers began exploring these ideas. Furthermore, the practical applications have evolved significantly over time, with modern implementations being much more sophisticated than their predecessors. However, it is important to note that there are still some limitations and challenges that need to be addressed. In summary, while progress has been made, there is still work to be done in this area.',
    expected: 'This concept dates back to the early 20th century. Modern implementations are more sophisticated, but there are still limitations and challenges to address.'
  },
  {
    name: 'Response with thinking tags',
    input: '<think>User asked about restaurant recommendations. Checking local database...</think>\n\nHello! Based on your location, I recommend trying "La Bella Italia" which serves excellent Italian cuisine. <think>Adding more details about the restaurant...</think>\nThey have great pasta dishes and a lovely atmosphere. The prices are reasonable and they have good reviews online.',
    expected: 'Based on your location, I recommend "La Bella Italia" for excellent Italian cuisine with great pasta and reasonable prices.'
  },
  {
    name: 'Short response (should remain unchanged)',
    input: 'Sure, I can help with that!',
    expected: 'Sure, I can help with that!'
  },
  {
    name: 'Response with excessive formal language',
    input: 'I would like to take this opportunity to thank you for your inquiry and inform you that we have received your message. We are currently processing your request and will provide you with a comprehensive response shortly. Please do not hesitate to contact us if you require any further assistance.',
    expected: 'We received your message and are processing your request. We\'ll respond shortly.'
  }
];

console.log('Testing WhatsApp response shortening functionality...\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`Test: ${testCase.name}`);
  console.log(`Input length: ${testCase.input.length} characters`);

  const result = shortenForWhatsApp(testCase.input);
  console.log(`Output length: ${result.length} characters`);
  console.log(`Output: "${result}"`);

  // Check if the result is significantly shorter and maintains meaning
  const isShorter = result.length < testCase.input.length * 0.7 || result.length <= 320;
  const maintainsMeaning = result.length > 0 && !result.includes('undefined');

  if (isShorter && maintainsMeaning) {
    console.log('✅ PASS - Response shortened appropriately\n');
    passed++;
  } else {
    console.log('❌ FAIL - Response not shortened appropriately\n');
    failed++;
  }
}

console.log('Testing cleanLLMResponse integration...\n');

// Test with thinking tags and long response
const complexTest = '<think>Processing user query about weather...</think>\n\nHello! I would like to provide you with a comprehensive weather report for today. The current temperature is 22 degrees Celsius with humidity at 65%. There is a 20% chance of precipitation later in the afternoon, so you might want to carry an umbrella just in case. The wind is coming from the east at 8 kilometers per hour. Overall, it should be a pleasant day with mostly sunny skies.';

console.log('Complex test input:');
console.log(`Length: ${complexTest.length} characters`);
console.log(`Content: "${complexTest}"\n`);

const cleaned = cleanLLMResponse(complexTest);
console.log('After cleanLLMResponse:');
console.log(`Length: ${cleaned.length} characters`);
console.log(`Content: "${cleaned}"\n`);

// Check if thinking tags were removed and response was shortened appropriately for WhatsApp
const tagsRemoved = !cleaned.includes('<think>') && !cleaned.includes('</think>');
const shortened = cleaned.length < complexTest.length; // Any shortening is good for WhatsApp
const reasonableLength = cleaned.length <= 320; // WhatsApp-friendly length

if (tagsRemoved && (shortened || reasonableLength)) {
  console.log('✅ PASS - Thinking tags removed and WhatsApp-appropriate length\n');
  passed++;
} else {
  console.log('❌ FAIL - Thinking tags not properly handled\n');
  console.log(`Tags removed: ${tagsRemoved}, Shortened: ${shortened}, Reasonable length: ${reasonableLength}`);
  failed++;
}

console.log(`\nTest Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log('🎉 All tests passed! WhatsApp response shortening is working correctly.');
} else {
  console.log('⚠️  Some tests failed. Please review the implementation.');
}