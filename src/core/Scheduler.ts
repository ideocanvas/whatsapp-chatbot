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
  
  // [NEW] Batching storage
  // Map<UserId, Set<ContentString>> to automatically handle exact string duplicates
  private pendingNewsBatch: Map<string, Set<string>> = new Map();
  private readonly BATCH_FLUSH_INTERVAL = 30; // Flush every 30 ticks (minutes)

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

  stop(): void {
    this.isRunning = false;
    console.log('🛑 Autonomous Agent Scheduler Stopped');
  }

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

      // 2. IDLE MODE: Browse
      if (this.shouldBrowse(activeUsers.length)) {
          let browseIntent = undefined;
          if (activeUsers.length > 0) {
              const randomUser = activeUsers[Math.floor(Math.random() * activeUsers.length)];
              const interests = this.contextMgr.getUserInterests(randomUser);
              if (interests.length > 0) {
                  browseIntent = interests[Math.floor(Math.random() * interests.length)];
              }
          }
          await this.idleMode(browseIntent);
      }

      // 3. PROACTIVE MODE: Accumulate News
      if (activeUsers.length > 0) {
        await this.accumulateNews(activeUsers);
      }

      // 4. [NEW] Flush Batch every 5 minutes
      if (this.tickCount % this.BATCH_FLUSH_INTERVAL === 0) {
          await this.flushNewsBatches();
      }

      this.logTickStats();

    } catch (error) {
      console.error('❌ Scheduler tick error:', error);
    }
  }

  private async idleMode(intent?: string): Promise<void> {
    console.log('🌐 Entering Idle Mode: Autonomous Browsing');
    this.stats.browsingSessions++;
    const result = await this.browser.surf(intent);
    this.stats.knowledgeLearned += result.knowledgeGained;
  }

  /**
   * [UPDATED] Accumulate News (Instead of Proactive Mode)
   * Finds fresh content and adds it to the user's pending batch.
   */
  private async accumulateNews(activeUsers: string[]): Promise<void> {
    console.log(`📥 Accumulating news for ${activeUsers.length} active users`);

    for (const userId of activeUsers) {
      // 1. Strict Interest Filter: If user has no interests, skip immediately
      const interests = this.contextMgr.getUserInterests(userId);
      if (interests.length === 0) {
          continue;
      }

      // 2. Find fresh content
      const relevantContent = await this.findFreshRelevantContent(userId);
      
      if (relevantContent) {
          // Initialize set if not exists
          if (!this.pendingNewsBatch.has(userId)) {
              this.pendingNewsBatch.set(userId, new Set());
          }
          
          // Add to pending batch
          const userBatch = this.pendingNewsBatch.get(userId)!;
          // Simple check to see if we already queued this exact string in this batch
          if (!userBatch.has(relevantContent)) {
              userBatch.add(relevantContent);
              console.log(`📦 Added news item to queue for ${userId} (Queue size: ${userBatch.size})`);
          }
      }
    }
  }

  /**
   * [NEW] Flush News Batches
   * Processes accumulated news, deduplicates, and sends digests.
   */
  private async flushNewsBatches(): Promise<void> {
      console.log('🔄 Flushing news batches...');
      
      for (const [userId, contentSet] of this.pendingNewsBatch.entries()) {
          if (contentSet.size === 0) continue;

          // Convert Set to Array
          const rawItems = Array.from(contentSet);
          
          // Clear the batch immediately to prevent double sending if processing takes time
          this.pendingNewsBatch.delete(userId);

          // Ask Agent to deduplicate and summarize
          console.log(`🤖 Generating digest for ${userId} from ${rawItems.length} items...`);
          const digest = await this.agent.generateNewsDigest(userId, rawItems);

          if (digest) {
              // Send via ActionQueue
              this.actionQueue.queueMessage(userId, digest, {
                  isProactive: true,
                  priority: 8
              });
              this.stats.messagesSent++;
              console.log(`✅ Digest sent to ${userId}`);
          } else {
              console.log(`🚫 No digest generated for ${userId} (Content filtered or deduplicated to zero)`);
          }
      }
  }

  private async findFreshRelevantContent(userId: string): Promise<string | null> {
      const interests = this.contextMgr.getUserInterests(userId);
      if (interests.length === 0) return null;

      // Look for fresh content matching interests
      for (const interest of interests) {
          // We search for recent items (last 1 hour implied by KB search logic + recent tags)
          // Note: In a real prod environment, we would pass a 'since' timestamp to the KB
          const knowledge = await this.kb.search(interest, 2);
          if (knowledge && knowledge.includes('🆕')) {
              return knowledge;
          }
      }
      return null;
  }

  private shouldBrowse(activeUserCount: number): boolean {
    return true;
  }

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

  private logTickStats(): void {
    if (this.tickCount % 10 === 0) {
      console.log('📊 Scheduler Statistics:', {
        ticks: this.tickCount,
        browsingSessions: this.stats.browsingSessions,
        messagesSent: this.stats.messagesSent,
        knowledgeLearned: this.stats.knowledgeLearned,
        queueStats: this.actionQueue.getQueueStats(),
        pendingBatches: this.pendingNewsBatch.size
      });
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      tickCount: this.tickCount,
      stats: this.stats,
      lastTick: this.stats.lastTick
    };
  }
}