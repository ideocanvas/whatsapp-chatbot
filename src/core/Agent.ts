import { OpenAIService } from '../services/openaiService';
import { ContextManager } from '../memory/ContextManager';
import { ToolRegistry } from './ToolRegistry';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { ActionQueueService } from '../services/ActionQueueService';

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
    private actionQueue: ActionQueueService
  ) {
    this.chatbotName = process.env.CHATBOT_NAME || 'Lucy';
  }

  /**
   * Main entry point for User Messages (reactive mode)
   */
  async handleUserMessage(userId: string, message: string): Promise<string> {
    // 1. Add to Short-term context
    this.contextMgr.addMessage(userId, 'user', message);

    // 2. Check if we need RAG (Knowledge Base)
    let systemContext = await this.getSystemPrompt(userId);
    
    // Retrieve relevant facts from Long-term memory
    const relevantFacts = await this.kb.search(message);
    if (relevantFacts && !relevantFacts.includes('No relevant knowledge')) {
      systemContext += `\n\n🧠 Relevant Knowledge:\n${relevantFacts}`;
    }

    // 3. Build Tool definitions
    const toolDefs = this.tools.getOpenAITools();

    // 4. Generate Response (with Tool Calling loop)
    const history = this.contextMgr.getHistory(userId);
    
    const response = await this.generateResponseWithContext({
      systemPrompt: systemContext,
      history: history,
      tools: toolDefs,
      userMessage: message,
      toolRegistry: this.tools
    });

    // 5. Save and Return (with mobile optimization)
    this.contextMgr.addMessage(userId, 'assistant', response);
    return this.optimizeForMobile(response);
  }

  /**
   * Entry point for Autonomous Thoughts (proactive mode)
   */
  async generateProactiveMessage(userId: string, discoveredContent: string): Promise<string | null> {
    // Check if we should bother the user (cooldown and relevance)
    if (!this.actionQueue.canSendProactiveMessage(userId)) {
      console.log(`⏰ Proactive message cooldown active for ${userId}`);
      return null;
    }

    const userInterests = this.contextMgr.getUserInterests(userId);
    const history = this.contextMgr.getHistory(userId).slice(-3); // Last 3 messages

    // Ask LLM if we should share this discovery
    const prompt = `
You discovered this interesting content: "${discoveredContent}"

Based on the user's conversation history and interests, decide if you should share this:
- User interests: ${userInterests.join(', ') || 'Not yet discovered'}
- Recent conversation: ${JSON.stringify(history)}

Decision guidelines:
✅ Share if: Content matches user interests, it's genuinely interesting, and it's been >15 mins since last message
❌ Skip if: Content doesn't match interests, it's trivial, or user was recently active

If you decide to share, write a short, natural WhatsApp message (under 30 words).
If you decide to skip, reply exactly with: SKIP

Your decision:`;

    const decision = await this.openai.generateTextResponse(prompt);
    
    if (decision.trim().toUpperCase() === 'SKIP') {
      console.log(`🤖 Decision: Skip proactive message to ${userId}`);
      return null;
    }

    console.log(`🤖 Decision: Send proactive message to ${userId}`);
    return this.optimizeForMobile(decision);
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
  private async getSystemPrompt(userId: string): Promise<string> {
    let systemPrompt = `You are ${this.chatbotName}, a witty, concise WhatsApp assistant.

**CRITICAL RESPONSE GUIDELINES:**
1. **Mobile Optimization**: Responses MUST be under 50 words unless specifically requested. Use natural spacing.
2. **No Markdown**: Never use code blocks, markdown, or complex formatting.
3. **Personality**: Be warm, use emojis naturally 🌟, avoid robotic phrases.
4. **Tool Usage**: Use available tools when you need current information or specific actions.
5. **Context Awareness**: Reference recent conversation naturally when relevant.

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
   * Check if content is relevant to user interests for proactive messaging
   */
  isContentRelevantToUser(userId: string, content: string): boolean {
    const userInterests = this.contextMgr.getUserInterests(userId);
    if (userInterests.length === 0) return false;

    const lowerContent = content.toLowerCase();
    
    return userInterests.some(interest => 
      lowerContent.includes(interest.toLowerCase()) ||
      this.calculateRelevanceScore(interest, content) > 0.3
    );
  }

  /**
   * Calculate relevance score between interest and content
   */
  private calculateRelevanceScore(interest: string, content: string): number {
    const interestWords = interest.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);
    
    let matches = 0;
    interestWords.forEach(word => {
      if (contentWords.some(contentWord => contentWord.includes(word) || word.includes(contentWord))) {
        matches++;
      }
    });
    
    return matches / Math.max(interestWords.length, 1);
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