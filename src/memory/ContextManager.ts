import { SummaryStore } from './SummaryStore';

interface ConversationContext {
  userId: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>;
  lastInteraction: number;
  userInterests: string[];
  messageCountSinceAnalysis: number; // New counter for periodic LLM analysis
}

export class ContextManager {
  private activeContexts: Map<string, ConversationContext> = new Map();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 Hour
  private readonly ANALYSIS_INTERVAL = 5; // Analyze interests every 5 messages
  private summaryStore?: SummaryStore;
  private openai?: any;

  setDependencies(summaryStore: any, openai: any) {
    this.summaryStore = summaryStore;
    this.openai = openai;
  }

  getHistory(userId: string): any[] {
    const ctx = this.activeContexts.get(userId);
    if (!ctx) return [];
    
    const now = Date.now();
    ctx.messages = ctx.messages.filter(m => (now - m.timestamp) < this.TTL_MS);
    
    return ctx.messages.map(({ role, content }) => ({ role, content }));
  }

  addMessage(userId: string, role: 'user' | 'assistant', content: string) {
    if (!this.activeContexts.has(userId)) {
      this.activeContexts.set(userId, {
        userId,
        messages: [],
        lastInteraction: Date.now(),
        userInterests: [],
        messageCountSinceAnalysis: 0
      });
    }
    const ctx = this.activeContexts.get(userId)!;
    ctx.messages.push({ role, content, timestamp: Date.now() });
    ctx.lastInteraction = Date.now();
    
    // Only analyze user messages for interests
    if (role === 'user') {
        ctx.messageCountSinceAnalysis++;
        
        // 1. Immediate: Quick Regex Check (Strict Mode)
        this.updateUserInterestsRegex(userId, content);

        // 2. Periodic: Deep LLM Analysis
        if (ctx.messageCountSinceAnalysis >= this.ANALYSIS_INTERVAL) {
            this.analyzeInterestsWithLLM(userId, ctx.messages);
            ctx.messageCountSinceAnalysis = 0;
        }
    }
  }

  getActiveUsers(): string[] {
    const now = Date.now();
    return Array.from(this.activeContexts.values())
      .filter(ctx => (now - ctx.lastInteraction) < this.TTL_MS)
      .map(ctx => ctx.userId);
  }

  getUserInterests(userId: string): string[] {
    const ctx = this.activeContexts.get(userId);
    return ctx?.userInterests || [];
  }

  /**
   * [UPDATED] Strict Regex: Only matches clear intent patterns
   * Prevents "I hate news" from triggering the "news" tag.
   */
  private updateUserInterestsRegex(userId: string, content: string) {
    const ctx = this.activeContexts.get(userId);
    if (!ctx) return;

    const lowerContent = content.toLowerCase();
    const interests: string[] = [];

    // Pattern: "I like/love/want/interested in X"
    const intentPrefixes = [
        "i like", "i love", "interested in", "tell me about", "news about", "updates on", "looking for"
    ];

    // Check if message starts with or contains affirmative intent
    const hasIntent = intentPrefixes.some(prefix => lowerContent.includes(prefix));

    if (!hasIntent) return; // Skip regex extraction if no clear intent word

    // Category Keywords
    const categories = {
        'tech': ['tech', 'technology', 'programming', 'coding', 'ai', 'software'],
        'finance': ['business', 'finance', 'stock', 'market', 'economy', 'crypto'],
        'sports': ['sports', 'football', 'basketball', 'soccer', 'game'],
        'news': ['news', 'headlines', 'events', 'world'], // "General News"
        'science': ['science', 'space', 'biology', 'physics']
    };

    for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(k => lowerContent.includes(k))) {
            interests.push(category);
        }
    }

    // Add unique interests
    interests.forEach(interest => {
      if (!ctx.userInterests.includes(interest)) {
        ctx.userInterests.push(interest);
        console.log(`🎯 Discovered interest via Regex for ${userId}: ${interest}`);
      }
    });
  }

  /**
   * [NEW] Deep Analysis: Uses LLM to refine interest list based on conversation context.
   * This removes incorrect tags and adds subtle ones.
   */
  private async analyzeInterestsWithLLM(userId: string, messages: any[]): Promise<void> {
      if (!this.openai) return;

      const ctx = this.activeContexts.get(userId);
      if (!ctx) return;

      // Take last 10 messages for context
      const recentHistory = messages.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');
      const currentInterests = ctx.userInterests.join(', ');

      const prompt = `
Analyze the user's interests based on this conversation history.
Current Tags: [${currentInterests}]

Conversation:
${recentHistory}

Task:
1. Identify clear topics the user is interested in.
2. Remove tags that are incorrect (e.g., user said "I hate sports" but has "sports" tag).
3. Return ONLY a JSON array of strings (lowercase).

Example output: ["tech", "ai", "startups"]
`;

      try {
          const response = await this.openai.generateTextResponse(prompt);
          const jsonMatch = response.match(/\[.*\]/s);
          
          if (jsonMatch) {
              const newInterests = JSON.parse(jsonMatch[0]);
              if (Array.isArray(newInterests)) {
                  ctx.userInterests = newInterests; // Overwrite with high-quality LLM list
                  console.log(`🧠 LLM refined interests for ${userId}: ${ctx.userInterests.join(', ')}`);
              }
          }
      } catch (e) {
          console.error('Failed to analyze interests with LLM', e);
      }
  }

  async cleanupExpiredContexts(): Promise<number> {
    const now = Date.now();
    let removedCount = 0;

    for (const [userId, ctx] of this.activeContexts.entries()) {
      if (now - ctx.lastInteraction >= this.TTL_MS) {
        await this.summarizeAndArchive(userId, ctx.messages);
        this.activeContexts.delete(userId);
        removedCount++;
      }
    }
    return removedCount;
  }

  private async summarizeAndArchive(userId: string, messages: any[]): Promise<void> {
    if (!this.summaryStore || !this.openai) return;
    if (messages.length < 3) return;

    try {
      // We also do a final interest extraction here to save for long-term if needed
      await this.analyzeInterestsWithLLM(userId, messages);

      const prompt = `Summarize this conversation in 3 bullet points:\n${JSON.stringify(messages)}`;
      const summary = await this.openai.generateTextResponse(prompt);
      await this.summaryStore.storeSummary(userId, summary, messages);
    } catch (error) {
      console.error('❌ Failed to summarize:', error);
    }
  }
  
  async getLongTermSummaries(userId: string): Promise<string[]> {
    if (!this.summaryStore) return [];
    try {
      return await this.summaryStore.getRecentSummaries(userId, 3);
    } catch (error) {
      return [];
    }
  }

  getStats() {
    let totalMessages = 0;
    this.activeContexts.forEach(ctx => totalMessages += ctx.messages.length);
    return { activeUsers: this.activeContexts.size, totalMessages };
  }
}