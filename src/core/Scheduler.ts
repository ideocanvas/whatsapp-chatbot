import { BrowserService } from '../services/BrowserService';
import { ContextManager } from '../memory/ContextManager';
import { WhatsAppService } from '../services/whatsappService';
import { Agent } from './Agent';
import { ActionQueueService } from '../services/ActionQueueService';
import { KnowledgeBase } from '../memory/KnowledgeBase';

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
    private kb: KnowledgeBase
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
    setInterval(() => this.maintenance(), 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;
    console.log('🛑 Autonomous Agent Scheduler Stopped');
  }

  /**
   * Main tick function - decides between idle browsing and proactive messaging
   */
  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    this.tickCount++;
    this.stats.lastTick = new Date();

    try {
      const activeUsers = this.contextMgr.getActiveUsers();
      
      console.log(`⏰ Tick #${this.tickCount} - Active users: ${activeUsers.length}`);

      // 1. IDLE MODE: Autonomous Browsing (when no active users or low load)
      if (this.shouldBrowse(activeUsers.length)) {
        await this.idleMode();
      }

      // 2. PROACTIVE MODE: Check active users for relevant content
      if (this.shouldCheckProactive(activeUsers.length)) {
        await this.proactiveMode(activeUsers);
      }

      // 3. Log tick statistics
      this.logTickStats();

    } catch (error) {
      console.error('❌ Scheduler tick error:', error);
    }
  }

  /**
   * Idle Mode: Autonomous web browsing for knowledge acquisition
   */
  private async idleMode(): Promise<void> {
    console.log('🌐 Entering Idle Mode: Autonomous Browsing');
    this.stats.browsingSessions++;

    // Determine browsing intent based on recent knowledge gaps
    const intent = this.determineBrowsingIntent();
    
    const result = await this.browser.surf(intent);
    this.stats.knowledgeLearned += result.knowledgeGained;

    console.log(`📚 Idle Mode Complete: ${result.urlsVisited.length} pages, ${result.knowledgeGained} facts learned`);
  }

  /**
   * Proactive Mode: Check if we should message active users
   */
  private async proactiveMode(activeUsers: string[]): Promise<void> {
    console.log('💬 Entering Proactive Mode: Checking active users');
    this.stats.proactiveChecks++;

    for (const userId of activeUsers) {
      // Only check 20% of active users per tick to avoid spam
      if (Math.random() > 0.2) continue;

      await this.checkUserForProactiveMessage(userId);
    }
  }

  /**
   * Check if a specific user should receive a proactive message
   */
  private async checkUserForProactiveMessage(userId: string): Promise<void> {
    // Check cooldown first
    if (!this.actionQueue.canSendProactiveMessage(userId)) {
      const cooldown = this.actionQueue.getProactiveCooldownRemaining(userId);
      console.log(`⏰ User ${userId} in cooldown: ${Math.round(cooldown / 60000)} minutes remaining`);
      return;
    }

    // Find recently learned knowledge relevant to user interests
    const relevantKnowledge = await this.findRelevantKnowledgeForUser(userId);
    if (!relevantKnowledge) {
      console.log(`🤔 No relevant knowledge found for user ${userId}`);
      return;
    }

    // Generate proactive message using agent
    const message = await this.agent.generateProactiveMessage(userId, relevantKnowledge);
    if (!message) {
      console.log(`❌ Agent decided not to message user ${userId}`);
      return;
    }

    // Queue the proactive message with appropriate delay
    const actionId = this.actionQueue.queueMessage(userId, message, {
      isProactive: true,
      delayMs: 5000 + Math.random() * 10000, // 5-15 second delay
      priority: 7 // Medium-high priority
    });

    this.stats.messagesSent++;
    console.log(`📤 Proactive message queued for ${userId}: ${message.substring(0, 50)}...`);
  }

  /**
   * Find knowledge relevant to a user's interests
   */
  private async findRelevantKnowledgeForUser(userId: string): Promise<string | null> {
    const userInterests = this.contextMgr.getUserInterests(userId);
    if (userInterests.length === 0) return null;

    // Try each interest until we find relevant knowledge
    for (const interest of userInterests) {
      try {
        // Search knowledge base for this interest
        const knowledge = await this.kb.search(interest, 1, this.mapInterestToCategory(interest));
        
        if (knowledge && !knowledge.includes('No relevant knowledge')) {
          console.log(`🎯 Found relevant knowledge for ${userId}'s interest in ${interest}`);
          return knowledge;
        }
      } catch (error) {
        console.error(`❌ Error searching knowledge for interest ${interest}:`, error);
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

  /**
   * Determine browsing intent based on knowledge gaps
   */
  private determineBrowsingIntent(): string | undefined {
    const knowledgeStats = this.kb.getStats();
    
    // If we have few documents, browse broadly
    if (knowledgeStats.totalDocuments < 10) {
      return undefined; // Browse everything
    }

    // Find category with least knowledge
    const categoryCounts = knowledgeStats.categories.reduce((acc, category) => {
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const leastKnownCategory = Object.keys(categoryCounts).reduce((a, b) => 
      categoryCounts[a] < categoryCounts[b] ? a : b
    );

    return leastKnownCategory;
  }

  /**
   * Decide if we should browse in this tick
   */
  private shouldBrowse(activeUserCount: number): boolean {
    // Browse if no active users OR random chance when users are active
    return activeUserCount === 0 || Math.random() > 0.7; // 30% chance when users active
  }

  /**
   * Decide if we should check for proactive messages
   */
  private shouldCheckProactive(activeUserCount: number): boolean {
    // Only check if we have active users
    return activeUserCount > 0 && Math.random() > 0.5; // 50% chance per tick
  }

  /**
   * Periodic maintenance tasks
   */
  private maintenance(): void {
    console.log('🧹 Running maintenance tasks');
    
    // Clean up expired contexts
    const expiredCount = this.contextMgr.cleanupExpiredContexts();
    
    // Clean up old knowledge
    const oldKnowledgeCount = this.kb.cleanupOldKnowledge(30); // 30 days
    
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