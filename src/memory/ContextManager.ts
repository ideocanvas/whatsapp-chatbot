/**
 * Short-term memory manager with 1-hour TTL for active conversations.
 * Stores the last hour of conversation verbatim for immediate context.
 * Implements rolling summarization to archive expired conversations.
 */
interface ConversationContext {
  userId: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>;
  lastInteraction: number;
  userInterests?: string[]; // Auto-discovered user interests for proactive messaging
}

export class ContextManager {
  private activeContexts: Map<string, ConversationContext> = new Map();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 Hour
  private summaryStore?: any; // SummaryStore instance
  private openai?: any; // OpenAIService instance

  /**
   * Set dependencies for summarization functionality
   */
  setDependencies(summaryStore: any, openai: any) {
    this.summaryStore = summaryStore;
    this.openai = openai;
  }

  /**
   * Get conversation history for a user (filtered by TTL)
   */
  getHistory(userId: string): any[] {
    const ctx = this.activeContexts.get(userId);
    if (!ctx) return [];
    
    // Filter out expired messages
    const now = Date.now();
    ctx.messages = ctx.messages.filter(m => (now - m.timestamp) < this.TTL_MS);
    
    return ctx.messages.map(({ role, content }) => ({ role, content }));
  }

  /**
   * Add a message to the conversation context
   */
  addMessage(userId: string, role: 'user' | 'assistant', content: string) {
    if (!this.activeContexts.has(userId)) {
      this.activeContexts.set(userId, { 
        userId, 
        messages: [], 
        lastInteraction: Date.now(),
        userInterests: []
      });
    }
    const ctx = this.activeContexts.get(userId)!;
    ctx.messages.push({ role, content, timestamp: Date.now() });
    ctx.lastInteraction = Date.now();
    
    // Auto-discover user interests from message content
    this.updateUserInterests(userId, content);
  }

  /**
   * Get active users (those with interactions within the TTL window)
   */
  getActiveUsers(): string[] {
    const now = Date.now();
    return Array.from(this.activeContexts.values())
      .filter(ctx => (now - ctx.lastInteraction) < this.TTL_MS)
      .map(ctx => ctx.userId);
  }

  /**
   * Get user interests for proactive messaging
   */
  getUserInterests(userId: string): string[] {
    const ctx = this.activeContexts.get(userId);
    return ctx?.userInterests || [];
  }

  /**
   * Update user interests based on message content
   */
  private updateUserInterests(userId: string, content: string) {
    const ctx = this.activeContexts.get(userId);
    if (!ctx) return;

    // Extract potential interests from message content
    const interests = this.extractInterests(content);
    
    // Add new interests, avoiding duplicates
    interests.forEach(interest => {
      if (!ctx.userInterests!.includes(interest)) {
        ctx.userInterests!.push(interest);
      }
    });

    // Keep only the most recent 10 interests
    if (ctx.userInterests!.length > 10) {
      ctx.userInterests = ctx.userInterests!.slice(-10);
    }
  }

  /**
   * Extract potential interests from message content
   */
  private extractInterests(content: string): string[] {
    const interests: string[] = [];
    const lowerContent = content.toLowerCase();

    // Common interest patterns
    const interestPatterns = [
      /(tech|technology|programming|coding|ai|artificial intelligence|machine learning)/gi,
      /(business|finance|stock|market|economy|investment)/gi,
      /(sports|football|basketball|tennis|soccer|game)/gi,
      /(news|current events|headlines|breaking)/gi,
      /(travel|vacation|holiday|destination)/gi,
      /(food|cooking|recipe|restaurant|cuisine)/gi,
      /(music|song|artist|album|concert)/gi,
      /(movie|film|cinema|actor|director)/gi,
      /(gaming|video game|console|pc gaming)/gi,
      /(health|fitness|exercise|wellness|diet)/gi
    ];

    interestPatterns.forEach(pattern => {
      const matches = lowerContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const interest = match.toLowerCase();
          if (!interests.includes(interest)) {
            interests.push(interest);
          }
        });
      }
    });

    return interests;
  }

  /**
   * Check if a user is interested in a specific topic
   */
  isUserInterestedIn(userId: string, topic: string): boolean {
    const interests = this.getUserInterests(userId);
    const lowerTopic = topic.toLowerCase();
    
    return interests.some(interest => 
      interest.toLowerCase().includes(lowerTopic) || 
      lowerTopic.includes(interest.toLowerCase())
    );
  }

  /**
   * Clean up expired contexts (run periodically)
   * Now includes summarization of expired conversations
   */
  async cleanupExpiredContexts(): Promise<number> {
    const now = Date.now();
    let removedCount = 0;

    for (const [userId, ctx] of this.activeContexts.entries()) {
      if (now - ctx.lastInteraction >= this.TTL_MS) {
        // Summarize and archive the conversation before deleting
        await this.summarizeAndArchive(userId, ctx.messages);
        this.activeContexts.delete(userId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} expired contexts`);
    }

    return removedCount;
  }

  /**
   * Summarize and archive a conversation when it expires
   */
  private async summarizeAndArchive(userId: string, messages: any[]): Promise<void> {
    if (!this.summaryStore || !this.openai) {
      console.log('⚠️ Summarization dependencies not set, skipping archive');
      return;
    }

    // Only summarize conversations with enough content
    if (messages.length < 5) {
      console.log(`📝 Skipping summary for ${userId}: only ${messages.length} messages`);
      return;
    }

    try {
      const prompt = `Summarize this conversation in 3 bullet points, focusing on user preferences, key facts, and important context. Keep it concise but informative:

${JSON.stringify(messages, null, 2)}

Summary:`;

      const summary = await this.openai.generateTextResponse(prompt);
      
      // Store the summary in long-term memory
      await this.summaryStore.storeSummary(userId, summary, messages);
      
      console.log(`📝 Archived conversation for ${userId}: ${summary.substring(0, 100)}...`);
    } catch (error) {
      console.error('❌ Failed to summarize and archive conversation:', error);
    }
  }

  /**
   * Get long-term conversation summaries for a user
   */
  async getLongTermSummaries(userId: string): Promise<string[]> {
    if (!this.summaryStore) {
      console.log('⚠️ SummaryStore not available, returning empty summaries');
      return [];
    }

    try {
      return await this.summaryStore.getRecentSummaries(userId, 3);
    } catch (error) {
      console.error('❌ Failed to get long-term summaries:', error);
      return [];
    }
  }

  /**
   * Get statistics about active contexts
   */
  getStats(): { activeUsers: number; totalMessages: number } {
    let totalMessages = 0;
    
    this.activeContexts.forEach(ctx => {
      totalMessages += ctx.messages.length;
    });

    return {
      activeUsers: this.activeContexts.size,
      totalMessages
    };
  }
}