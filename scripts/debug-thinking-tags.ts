#!/usr/bin/env ts-node

import { removeThinkingTags, cleanLLMResponse } from '../src/utils/responseCleaner';

const testInput = '<think>Processing user query about weather...</think>\n\nHello! I would like to provide you with a comprehensive weather report for today.';

console.log('Testing removeThinkingTags function:');
console.log('Input:', JSON.stringify(testInput));

const removedTags = removeThinkingTags(testInput);
console.log('After removeThinkingTags:', JSON.stringify(removedTags));
console.log('Contains <think>:', removedTags.includes('<think>'));
console.log('Contains </think>:', removedTags.includes('</think>'));

console.log('\nTesting cleanLLMResponse function:');
const cleaned = cleanLLMResponse(testInput);
console.log('After cleanLLMResponse:', JSON.stringify(cleaned));
console.log('Contains <think>:', cleaned.includes('<think>'));
console.log('Contains </think>:', cleaned.includes('</think>'));