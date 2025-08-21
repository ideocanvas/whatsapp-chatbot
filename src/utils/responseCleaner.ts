/**
 * Utility functions for cleaning and processing LLM responses
 */

/**
 * Removes <think>...</think> tags and their content from LLM responses
 * @param response The raw LLM response that may contain thinking tags
 * @returns Cleaned response without thinking tags
 */
export function removeThinkingTags(response: string): string {
  // Regular expression to match <think>...</think> tags and their content
  // Also captures optional whitespace around tags to clean up properly
  const thinkingTagRegex = /\s*<think>[\s\S]*?<\/think>\s*/gi;

  // Remove all thinking tags and their content, including surrounding whitespace
  return response.replace(thinkingTagRegex, ' ').trim();
}

/**
 * Processes an LLM response by removing thinking tags and cleaning up whitespace
 * @param response The raw LLM response
 * @returns Cleaned and processed response ready for display
 */
export function cleanLLMResponse(response: string): string {
  if (!response) return '';

  // Remove thinking tags
  let cleaned = removeThinkingTags(response);

  // Clean up excessive whitespace and newlines
  cleaned = cleaned
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace 3+ newlines with 2
    .replace(/^\s+|\s+$/g, '') // Trim leading/trailing whitespace
    .replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space

  return cleaned;
}

/**
 * Checks if a response contains thinking tags
 * @param response The response to check
 * @returns True if thinking tags are present, false otherwise
 */
export function containsThinkingTags(response: string): boolean {
  return /<think>[\s\S]*?<\/think>/i.test(response);
}