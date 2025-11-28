import { BrowserService } from '../services/BrowserService';
import { ContextManager } from '../memory/ContextManager';
import { WhatsAppService } from '../services/whatsappService';
import { Agent } from './Agent';
import { ActionQueueService } from '../services/ActionQueueService';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';

/**
 * The Heartbeat of the autonomous agent system.
 * Manages the 1-minute tick cycle for idle browsing and proactive messaging.
 */
export class Scheduler {
  private isRunning: boolean = false;
  private tickCount: number = 0;
  private stats = {
    browsingSessions: 0,
    proactiveChecks: 0,
    messagesSent: 0,
    knowledgeLearned: 0,
    lastTick: new Date()
  };

  constructor(
    private browser: BrowserService,
    private contextMgr: ContextManager,
    private whatsapp: WhatsAppService,
    private agent: Agent,
    private actionQueue: ActionQueueService,
    private kb: KnowledgeBasePostgres
  ) {}

  /**
   * Start the scheduler with 1-minute ticks
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.log('🕰️ Autonomous Agent Scheduler Started (1-minute ticks)');

    // Initial tick immediately
    this.tick();

    // Set up periodic ticking
    setInterval(() => this.tick(), 60 * 1000); // 1 minute

    // Set up periodic maintenance
    setInterval(() => {
      this.maintenance().catch(error => {
        console.error('❌ Maintenance error:', error);
      });
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;
    console.log('🛑 Autonomous Agent Scheduler Stopped');
  }

  /**
   * Interrupt current background tasks (Browsing)
   */
  interrupt(): void {
    if (this.isRunning) {
      console.log('🚦 Scheduler interrupting background tasks...');
      this.browser.stopBrowsing();
    }
  }

  /**
   * Main tick function - decides between idle browsing and proactive messaging
   */
  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    this.tickCount++;
    this.stats.lastTick = new Date();

    try {
      // 1. Get STRICTLY active users (last contact < 1 hour)
      const activeUsers = this.contextMgr.getActiveUsers();
      console.log(`⏰ Tick #${this.tickCount} - Active users: ${activeUsers.length}`);

      // 2. IDLE MODE: Browse if not too busy or just random
      if (this.shouldBrowse(activeUsers.length)) {
          // Pass a user interest as intent if a user is active!
          let browseIntent = undefined;
          if (activeUsers.length > 0) {
              const randomUser = activeUsers[Math.floor(Math.random() * activeUsers.length)];
              const interests = this.contextMgr.getUserInterests(randomUser);
              if (interests.length > 0) {
                  browseIntent = interests[Math.floor(Math.random() * interests.length)];
                  console.log(`🎯 Browsing targeted for active user ${randomUser}: ${browseIntent}`);
              }
          }
          await this.idleMode(browseIntent);
      }

      // 3. PROACTIVE MODE: Only for Active Users
      if (activeUsers.length > 0) {
        await this.proactiveMode(activeUsers);
      }

      this.logTickStats();

    } catch (error) {
      console.error('❌ Scheduler tick error:', error);
    }
  }

  private async idleMode(intent?: string): Promise<void> {
    console.log('🌐 Entering Idle Mode: Autonomous Browsing');
    this.stats.browsingSessions++;
    
    // Surf with intent if provided, otherwise generic
    const result = await this.browser.surf(intent);
    this.stats.knowledgeLearned += result.knowledgeGained;
  }

  private async proactiveMode(activeUsers: string[]): Promise<void> {
    console.log(`💬 Proactive Mode: Checking ${activeUsers.length} active users`);

    for (const userId of activeUsers) {
      // Check strict cooldown (e.g., don't message twice in 15 mins)
      if (!this.actionQueue.canSendProactiveMessage(userId)) continue;

      // Find knowledge specifically learned RECENTLY (last 1 hour) that matches interests
      const relevantContent = await this.findFreshRelevantContent(userId);
      
      if (relevantContent) {
          const message = await this.agent.generateProactiveMessage(userId, relevantContent);
          if (message) {
              this.actionQueue.queueMessage(userId, message, { isProactive: true, priority: 8 });
              this.stats.messagesSent++;
          }
      }
    }
  }


  /**
   * Find content learned in the last hour that matches user interests
   */
  private async findFreshRelevantContent(userId: string): Promise<string | null> {
      const interests = this.contextMgr.getUserInterests(userId);
      if (interests.length === 0) return null;

      // We need a way to search specifically for *recent* docs in KB matching tags
      // This uses a specific search logic on the KB
      for (const interest of interests) {
          // This relies on the KnowledgeBase having a method to find *fresh* content by tag/query
          // We can use the existing search but filter the string results or add a new method to KB
          // For now, using standard search but looking for the "🆕" indicator added by KB
          const knowledge = await this.kb.search(interest, 1);
          if (knowledge && knowledge.includes('🆕')) {
              return knowledge; // Found something fresh
          }
      }
      return null;
  }

  /**
   * Map user interest to knowledge base category
   */
  private mapInterestToCategory(interest: string): string {
    const lowerInterest = interest.toLowerCase();
    
    if (lowerInterest.includes('tech') || lowerInterest.includes('programming')) return 'tech';
    if (lowerInterest.includes('business') || lowerInterest.includes('finance')) return 'business';
    if (lowerInterest.includes('sports') || lowerInterest.includes('game')) return 'sports';
    if (lowerInterest.includes('news') || lowerInterest.includes('current')) return 'news';
    
    return 'general';
  }


  private shouldBrowse(activeUserCount: number): boolean {
    return true; // Always try to browse if browser limit allows
  }

  private shouldCheckProactive(activeUserCount: number): boolean {
    return activeUserCount > 0;
  }

  /**
   * Periodic maintenance tasks
   */
  private async maintenance(): Promise<void> {
    console.log('🧹 Running maintenance tasks');
    
    // Clean up expired contexts (now async with summarization)
    const expiredCount = await this.contextMgr.cleanupExpiredContexts();
    
    // Clean up old knowledge
    const oldKnowledgeCount = await this.kb.cleanupOldKnowledge(30); // 30 days
    
    if (expiredCount > 0 || oldKnowledgeCount > 0) {
      console.log(`📊 Maintenance: ${expiredCount} expired contexts, ${oldKnowledgeCount} old knowledge documents`);
    }
  }

  /**
   * Log tick statistics
   */
  private logTickStats(): void {
    if (this.tickCount % 10 === 0) { // Every 10 ticks
      console.log('📊 Scheduler Statistics:', {
        ticks: this.tickCount,
        browsingSessions: this.stats.browsingSessions,
        proactiveChecks: this.stats.proactiveChecks,
        messagesSent: this.stats.messagesSent,
        knowledgeLearned: this.stats.knowledgeLearned,
        queueStats: this.actionQueue.getQueueStats(),
        browserStats: this.browser.getStats()
      });
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      tickCount: this.tickCount,
      stats: this.stats,
      lastTick: this.stats.lastTick
    };
  }
}