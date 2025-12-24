import { OpenAIService } from '../services/OpenAIService';
import { ContextManager } from '../memory/ContextManager';
import { ToolRegistry } from './ToolRegistry';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { ActionQueueService } from '../services/ActionQueueService';
import { UserProfileService } from '../services/UserProfileService';
import { UpdateProfileTool } from '../tools/UpdateProfileTool';
import { SetReminderTool } from '../tools/SetReminderTool';

/**
 * The Brain of the autonomous agent system.
 * Orchestrates LLM interactions, tool calling, and decision-making.
 */
export class Agent {
  private chatbotName: string;

  constructor(
    private openai: OpenAIService,
    private contextMgr: ContextManager,
    private kb: KnowledgeBasePostgres,
    private tools: ToolRegistry,
    private actionQueue: ActionQueueService,
    private profileService: UserProfileService // Injected dependency
  ) {
    this.chatbotName = process.env.CHATBOT_NAME || 'Lucy';
  }

  /**
   * Main entry point for User Messages (reactive mode)
   */
  async handleUserMessage(userId: string, message: string): Promise<string> {
    // 1. Add to Short-term context
    this.contextMgr.addMessage(userId, 'user', message);

    // 2. Fetch User Profile
    const userProfileStr = await this.profileService.getProfileContext(userId);

    // 3. Prepare Dynamic System Prompt
    let systemContext = await this.getSystemPrompt(userId, userProfileStr);

    // 4. RAG Logic (Existing)
    const relevantFacts = await this.kb.search(message);
    if (relevantFacts && !relevantFacts.includes('No relevant knowledge')) {
      systemContext += `\n\n🧠 Relevant Knowledge:\n${relevantFacts}`;
    }

    // 5. Add context-aware tools specifically for this user
    const profileTool = new UpdateProfileTool(this.profileService, userId);
    const reminderTool = new SetReminderTool();
    reminderTool.setUserId(userId);
    reminderTool.setActionQueue(this.actionQueue);

    // Create a temporary registry for this request that includes the base tools + context-aware tools
    const requestTools = [
      ...this.tools.getOpenAITools(),
      profileTool.toOpenAISchema(),
      reminderTool.toOpenAISchema()
    ];

    // We need a way to execute these tools since they're not in the global registry
    const tempRegistry = new ToolRegistry();
    // Copy existing tools
    this.tools.getAvailableTools().forEach(name => {
        const t = this.tools.getTool(name);
        if(t) tempRegistry.registerTool(t);
    });
    // Add our specific tools
    tempRegistry.registerTool(profileTool);
    tempRegistry.registerTool(reminderTool);

    // 6. Generate Response
    const history = this.contextMgr.getHistory(userId);

    const response = await this.generateResponseWithContext({
      systemPrompt: systemContext,
      history: history,
      tools: requestTools, // Use the expanded toolset
      userMessage: message,
      toolRegistry: tempRegistry // Use the temp registry
    });

    this.contextMgr.addMessage(userId, 'assistant', response);
    return this.optimizeForMobile(response);
  }


  /**
   * Generate response with full context and tool calling
   */
  private async generateResponseWithContext(options: {
    systemPrompt: string;
    history: any[];
    tools: any[];
    userMessage: string;
    toolRegistry?: ToolRegistry;
  }): Promise<string> {
    const messages: any[] = [
      {
        role: 'system',
        content: options.systemPrompt
      },
      ...options.history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: options.userMessage
      }
    ];

    try {
      const response = await this.openai.generateResponseWithTools(messages, options.tools, 10, options.toolRegistry);
      return response;
    } catch (error) {
      console.error('❌ Agent response generation failed:', error);

      // Fallback response
      return `I encountered an issue processing your message. ${this.getFallbackResponse(options.userMessage)}`;
    }
  }

  /**
   * Get system prompt with mobile optimization and long-term context
   */
  private async getSystemPrompt(userId: string, profileContext?: string): Promise<string> {
    let systemPrompt = `You are ${this.chatbotName}, a witty, concise WhatsApp assistant.

${profileContext || ''}

**CORE BEHAVIORS:**
1. **Be Proactive**: If the "User Profile" above has "Unknown" fields (Name, Location) or few facts, naturally ask the user about them during conversation.
   - Example: If discussing weather, ask "By the way, where are you located so I can check for you?"
   - Example: If discussing hobbies, ask "What do you do for fun?"
   - Don't interrogate. Ask only one personal question every few turns.

2. **Save Information**: Whenever the user tells you a fact about themselves (name, job, pet, hobby), IMMEDIATELY use the 'update_profile' tool to save it. Do not ask for confirmation, just save it.

**CRITICAL RESPONSE GUIDELINES:**
1. **Mobile Optimization**: Responses MUST be under 50 words unless specifically requested. Use natural spacing.
2. **No Markdown**: Never use code blocks, markdown, or complex formatting.
3. **Personality**: Be warm, use emojis naturally 🌟, avoid robotic phrases.
4. **Tool Usage**: Use available tools when you need current information or specific actions.
5. **Context Awareness**: Reference recent conversation naturally when relevant.
6. **Language Matching**: ALWAYS reply in the SAME LANGUAGE as the user's input. If the user speaks Chinese, reply in Chinese. If English, reply in English.

**TOOL SELECTION PRIORITY:**
1. Check 'recall_history' first if the user refers to the past.
2. Use 'search_knowledge' for general facts you might have learned.
3. Use 'web_search' for quick lookups of current information.
4. **IMPORTANT**: If 'search_knowledge' and 'web_search' yield no results, YOU MUST use 'deep_research' to find the answer. Do not give up without trying deep research.

**CRITICAL: When using 'deep_research', you MUST first respond to the user with a natural message like "Let me research that for you" or "I'll search for more information about that" BEFORE calling the tool. This ensures the user knows you're working on their request.**

**Current Time**: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}`;

    // Add long-term conversation summaries if available
    const longTermSummaries = await this.contextMgr.getLongTermSummaries(userId);
    if (longTermSummaries.length > 0) {
      systemPrompt += `\n\n📚 **Previous Conversation Context:**\n${longTermSummaries.join('\n\n')}`;
    }

    systemPrompt += `\n\nAlways prioritize being helpful while respecting the mobile format constraints.`;

    return systemPrompt;
  }

  /**
   * Optimize response for WhatsApp mobile interface
   */
  private optimizeForMobile(response: string): string {
    // Remove markdown blocks
    let optimized = response.replace(/```[\s\S]*?```/g, '');
    optimized = optimized.replace(/`[^`]*`/g, match => match.replace(/`/g, ''));

    // Limit to 50 words if too long
    const words = optimized.split(/\s+/);
    if (words.length > 50) {
      optimized = words.slice(0, 50).join(' ') + '...';
    }

    // Ensure proper spacing for mobile readability
    optimized = optimized.replace(/\n{3,}/g, '\n\n');

    return optimized.trim();
  }

  /**
   * Get fallback response when AI fails
   */
  private getFallbackResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return 'Hello! 👋 How can I help you today?';
    }
    if (lowerMessage.includes('help')) {
      return 'I can help with questions, search information, or just chat! What would you like to know?';
    }
    if (lowerMessage.includes('time')) {
      return `The current time is: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}`;
    }

    return 'Please try asking your question again or rephrase it.';
  }


  /**
   * [NEW] Batch Process News: Deduplicates and Summarizes
   * Takes a list of raw content, groups duplicates, and returns a single digest message.
   */
  async generateNewsDigest(userId: string, rawNewsItems: string[]): Promise<string | null> {
    if (!rawNewsItems || rawNewsItems.length === 0) return null;

    const userInterests = this.contextMgr.getUserInterests(userId);

    // If no interests are defined, we strictly do not generate a digest (as requested)
    if (userInterests.length === 0) {
        console.log(`🔕 skipping digest for ${userId}: No user interests defined.`);
        return null;
    }

    const prompt = `
You are a smart news editor for WhatsApp.
I have a list of raw news snippets found by a web scraper. There are likely duplicates (same story from different sources).

**User Interests:** ${userInterests.join(', ')}

**Raw News Items:**
${rawNewsItems.map((item, i) => `[${i+1}] ${item.substring(0, 300)}...`).join('\n')}

**Task:**
1. Group duplicates (stories about the same event).
2. Select the top 3 most distinct stories that STRICTLY match the User Interests.
3. If a story does not match the interests, discard it.
4. Summarize each selected story into exactly ONE sentence.

**Output Format:**
Return ONLY the final message to send to the user. Use emojis.
Example:
"Here is your news update 📰:
• [One sentence summary of story 1]
• [One sentence summary of story 2]
"

If NO stories match the user's interests, respond exactly with: "NO_MATCHES"
`;

    try {
      const response = await this.openai.generateTextResponse(prompt);

      if (response.includes('NO_MATCHES')) {
        return null;
      }

      return this.optimizeForMobile(response);
    } catch (error) {
      console.error('Error generating news digest:', error);
      return null;
    }
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      chatbotName: this.chatbotName,
      contextStats: this.contextMgr.getStats(),
      knowledgeStats: this.kb.getStats(),
      availableTools: this.tools.getAvailableTools().length
    };
  }
}