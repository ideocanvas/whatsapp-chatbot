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
 * Shortens responses for WhatsApp by truncating long messages and making them more concise
 * @param response The response to shorten
 * @param maxLength Maximum length for WhatsApp responses (default: 320 characters)
 * @returns Shortened response suitable for WhatsApp
 */
export function shortenForWhatsApp(response: string, maxLength: number = 320): string {
  if (!response || response.length <= maxLength) {
    return response;
  }

  // First, clean up the response
  let shortened = response.trim();

  // Remove excessive formalities and make it more conversational
  shortened = shortened
    .replace(/^(?:hello|hi|hey|greetings)[,!.\s]*/i, '') // Remove greeting words at start
    .replace(/thank you for your (?:question|query|message)/gi, '')
    .replace(/i (?:would like to|want to) (?:share|tell you|inform you)/gi, '')
    .replace(/in (?:conclusion|summary|closing)/gi, '')
    .replace(/\b(?:certainly|absolutely|definitely|of course)\b/gi, '')
    .replace(/\.\s+However,/g, ', but') // Make transitions more casual
    .replace(/\.\s+Additionally,/g, ', also') // Make transitions more casual
    .replace(/\.\s+Furthermore,/g, ', plus') // Make transitions more casual
    .trim();

  // If still too long, truncate at the last sentence before maxLength
  if (shortened.length > maxLength) {
    // Find the last sentence ending before maxLength
    const lastPeriod = shortened.lastIndexOf('.', maxLength - 1);
    const lastQuestion = shortened.lastIndexOf('?', maxLength - 1);
    const lastExclamation = shortened.lastIndexOf('!', maxLength - 1);

    const lastPunctuation = Math.max(lastPeriod, lastQuestion, lastExclamation);

    if (lastPunctuation > 0 && lastPunctuation > shortened.length * 0.3) {
      // Truncate at the last natural sentence break
      shortened = shortened.substring(0, lastPunctuation + 1);
    } else {
      // Truncate at word boundary near maxLength
      const spaceIndex = shortened.lastIndexOf(' ', maxLength - 1);
      if (spaceIndex > 0 && spaceIndex > shortened.length * 0.3) {
        shortened = shortened.substring(0, spaceIndex) + '...';
      } else {
        // Fallback: hard truncate with ellipsis
        shortened = shortened.substring(0, maxLength - 3) + '...';
      }
    }
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