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
 * Removes tool call artifacts and intermediate reasoning from responses
 * @param response The raw LLM response that may contain tool call artifacts
 * @returns Cleaned response without tool call artifacts
 */
export function removeToolCallArtifacts(response: string): string {
  // Remove common tool call artifacts and intermediate reasoning
  return response
    .replace(/I need to search for more information to answer your question properly\./gi, '')
    .replace(/Let me search for that information\./gi, '')
    .replace(/I'll look that up for you\./gi, '')
    .replace(/Searching for information\.\.\./gi, '')
    .replace(/Based on my search results,/gi, '')
    .replace(/According to my search,/gi, '')
    .trim();
}

/**
 * Shortens responses for WhatsApp by truncating long messages and making them more concise
 * @param response The response to shorten
 * @param maxLength Maximum length for WhatsApp responses (default: 1000 characters)
 * @returns Shortened response suitable for WhatsApp
 */
export function shortenForWhatsApp(response: string, maxLength: number = 1000): string {
  if (!response) return response;

  let shortened = response.trim();

  // DISABLED: Allow the bot to be polite
  // shortened = shortened.replace(/^(?:hello|hi|hey|greetings)[,!.\s]*/i, '');

  if (shortened.length > maxLength) {
      return shortened.substring(0, maxLength) + "...";
  }

  return shortened;
}

/**
 * Processes an LLM response by removing thinking tags, cleaning up whitespace, and shortening for WhatsApp
 * @param response The raw LLM response
 * @returns Cleaned and processed response ready for WhatsApp
 */
export function cleanLLMResponse(response: string): string {
  if (!response) return '';

  // Remove thinking tags first
  let cleaned = removeThinkingTags(response);

  // Remove tool call artifacts
  cleaned = removeToolCallArtifacts(cleaned);

  // Clean up excessive whitespace and newlines
  cleaned = cleaned
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace 3+ newlines with 2
    .replace(/^\s+|\s+$/g, '') // Trim leading/trailing whitespace
    .replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space

  // Shorten for WhatsApp if it's too long
  return shortenForWhatsApp(cleaned);
}

/**
 * Checks if a response contains thinking tags
 * @param response The response to check
 * @returns True if thinking tags are present, false otherwise
 */
export function containsThinkingTags(response: string): boolean {
  return /<think>[\s\S]*?<\/think>/i.test(response);
}