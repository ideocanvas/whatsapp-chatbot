import { removeThinkingTags, cleanLLMResponse, containsThinkingTags } from '../src/utils/responseCleaner';

function testResponseCleaner() {
  console.log('Testing response cleaner functionality...\n');

  // Test cases with thinking tags
  const testCases = [
    {
      input: 'Hello! <think>This is an internal thought that should be removed</think> How can I help you?',
      expected: 'Hello! How can I help you?'
    },
    {
      input: '<think>Planning response strategy...</think>Welcome to our service! <think>Checking user history...</think>How can I assist you today?',
      expected: 'Welcome to our service! How can I assist you today?'
    },
    {
      input: 'The weather is nice today. <think>User seems happy, should maintain positive tone</think> Would you like to go for a walk?',
      expected: 'The weather is nice today. Would you like to go for a walk?'
    },
    {
      input: 'Response without thinking tags should remain unchanged.',
      expected: 'Response without thinking tags should remain unchanged.'
    },
    {
      input: 'Multiple <think>first thought</think> thinking <think>second thought</think> tags',
      expected: 'Multiple thinking tags'
    },
    {
      input: '',
      expected: ''
    }
  ];

  console.log('Testing removeThinkingTags function:');
  testCases.forEach((testCase, index) => {
    const result = removeThinkingTags(testCase.input);
    const passed = result === testCase.expected;
    console.log(`Test ${index + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) {
      console.log(`  Input:    "${testCase.input}"`);
      console.log(`  Expected: "${testCase.expected}"`);
      console.log(`  Got:      "${result}"`);
    }
  });

  console.log('\nTesting containsThinkingTags function:');
  const thinkingTestCases = [
    { input: 'No tags here', expected: false },
    { input: '<think>internal thought</think>', expected: true },
    { input: 'Text <think>thought</think> more text', expected: true },
    { input: '<think>thought</think>', expected: true }
  ];

  thinkingTestCases.forEach((testCase, index) => {
    const result = containsThinkingTags(testCase.input);
    const passed = result === testCase.expected;
    console.log(`Test ${index + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) {
      console.log(`  Input:    "${testCase.input}"`);
      console.log(`  Expected: ${testCase.expected}`);
      console.log(`  Got:      ${result}`);
    }
  });

  console.log('\nTesting cleanLLMResponse function with complex example:');
  const complexInput = `
<think>User asked about weather. Checking location data...</think>

Hello!

<think>Preparing weather response...</think>

The weather today is sunny with a high of 25°C.

<think>Adding friendly suggestion...</think>

Perfect day for outdoor activities!

<think>Response complete.</think>
`;

  const cleaned = cleanLLMResponse(complexInput);
  console.log('Input:');
  console.log(complexInput);
  console.log('Cleaned output:');
  console.log(cleaned);

  console.log('\nTesting integration with OpenAI service simulation:');

  // Simulate what the OpenAI service would return
  const simulatedOpenAIResponse = `
<think>User asked about pizza. Checking if they want recipe or restaurant recommendation...</think>

I'd be happy to help with pizza!

<think>User seems interested in cooking, providing recipe...</think>

Here's a simple pizza recipe:
- 2 cups flour
- 1 tsp yeast
- 3/4 cup warm water
- 1 tbsp olive oil
- Your favorite toppings

<think>Adding encouragement...</think>

Enjoy your homemade pizza!
`;

  console.log('Simulated OpenAI response with thinking tags:');
  console.log(simulatedOpenAIResponse);
  console.log('\nAfter cleaning:');
  console.log(cleanLLMResponse(simulatedOpenAIResponse));

  console.log('\n✅ All response cleaner tests completed!');
  console.log('\nThe response cleaner is now integrated into the OpenAI service and will automatically');
  console.log('remove <think>...</think> tags from all LLM responses before they are sent to users.');
}

// Run the test
testResponseCleaner();