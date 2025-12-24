import { BrowserService } from '../services/BrowserService';
import { ContextManager } from '../memory/ContextManager';
import { WhatsAppService } from '../services/WhatsAppService';
import { Agent } from './Agent';
import { ActionQueueService } from '../services/ActionQueueService';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { GoogleNewsService } from '../services/GoogleNewsService';
import { BlogGenerationService } from '../services/BlogGenerationService';
import * as fs from 'fs';
import * as path from 'path';

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
  private readonly BATCH_FLUSH_INTERVAL: number;
  private readonly TICK_INTERVAL_MS: number;
  private readonly MAINTENANCE_INTERVAL_MS: number;

  private stats = {
    browsingSessions: 0,
    proactiveChecks: 0,
    messagesSent: 0,
    knowledgeLearned: 0,
    lastTick: new Date()
  };

  // Persistence settings
  private readonly DATA_DIR = path.join(process.cwd(), 'data');
  private readonly STATE_FILE = path.join(this.DATA_DIR, 'scheduler_state.json');

  constructor(
    private browser: BrowserService,
    private contextMgr: ContextManager,
    private whatsapp: WhatsAppService,
    private agent: Agent,
    private actionQueue: ActionQueueService,
    private kb: KnowledgeBasePostgres,
    private googleNewsService?: GoogleNewsService,
    private blogGenerationService?: BlogGenerationService
  ) {
    // Initialize intervals from environment variables with defaults
    this.TICK_INTERVAL_MS = parseInt(process.env.AUTONOMOUS_TICK_INTERVAL_MS || '60000');
    this.MAINTENANCE_INTERVAL_MS = parseInt(process.env.AUTONOMOUS_MAINTENANCE_INTERVAL_MS || '300000');
    this.BATCH_FLUSH_INTERVAL = parseInt(process.env.AUTONOMOUS_BATCH_FLUSH_INTERVAL || '30');

    this.loadState();
  }

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
    setInterval(() => this.tick(), this.TICK_INTERVAL_MS);

    // Set up periodic maintenance
    setInterval(() => {
      this.maintenance().catch(error => {
        console.error('❌ Maintenance error:', error);
      });
    }, this.MAINTENANCE_INTERVAL_MS);
  }

  stop(): void {
    this.isRunning = false;
    console.log('🛑 Autonomous Agent Scheduler Stopped');
    this.saveState(); // Save on stop
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

    // Save stats periodically (every 5 ticks)
    if (this.tickCount % 5 === 0) this.saveState();

    try {
      // 1. Get STRICTLY active users (last contact < 1 hour)
      const activeUsers = this.contextMgr.getActiveUsers();
      console.log(`⏰ Tick #${this.tickCount} - Active users: ${activeUsers.length}`);

      // 2. Check for deep news browsing (daily at 6:00 AM)
      if (this.shouldPerformDeepNewsBrowsing() && this.shouldBrowse(activeUsers.length) && this.canGoogleNewsProceed()) {
        await this.performDeepNewsBrowsing();
      }

      // 3. Check for quick news checks (every 3 hours)
      if (this.shouldPerformQuickNewsCheck() && this.shouldBrowse(activeUsers.length) && this.canGoogleNewsProceed()) {
        await this.performQuickNewsCheck();
      }

      // 4. IDLE MODE: Browse (legacy browsing)
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

      // 5. PROACTIVE MODE: Accumulate News
      if (activeUsers.length > 0) {
        await this.accumulateNews(activeUsers);
      }

      // 6. [NEW] Flush Batch based on configured interval
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
    let changed = false;

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
              changed = true;
          }
      }
    }

    if (changed) this.saveState();
  }

  /**
   * [NEW] Flush News Batches
   * Processes accumulated news, deduplicates, and sends digests.
   */
  private async flushNewsBatches(): Promise<void> {
      console.log('🔄 Flushing news batches...');
      let changed = false;

      for (const [userId, contentSet] of this.pendingNewsBatch.entries()) {
          if (contentSet.size === 0) continue;

          // Convert Set to Array
          const rawItems = Array.from(contentSet);

          // Clear the batch immediately to prevent double sending if processing takes time
          this.pendingNewsBatch.delete(userId);
          changed = true;

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

      if (changed) this.saveState();
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
    // Check if browser has reached its hourly limit
    const browserStats = this.browser.getStats();
    return browserStats.pagesVisitedThisHour < 20; // MAX_PAGES_PER_HOUR
  }

  /**
   * Check if it's time for deep news browsing (6:00 AM daily)
   */
  private shouldPerformDeepNewsBrowsing(): boolean {
    if (!this.googleNewsService) return false;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Check if it's approximately 6:00 AM
    return currentHour === 6 && currentMinute < 10;
  }

  /**
   * Check if it's time for quick news check (every 3 hours)
   */
  private shouldPerformQuickNewsCheck(): boolean {
    if (!this.googleNewsService) return false;

    const now = new Date();
    const currentHour = now.getHours();

    // Check if current hour is divisible by 3 (0, 3, 6, 9, 12, 15, 18, 21)
    return currentHour % 3 === 0 && now.getMinutes() < 10;
  }

  /**
   * Perform deep news browsing and blog generation
   */
  private async performDeepNewsBrowsing(): Promise<void> {
    if (!this.googleNewsService || !this.blogGenerationService) {
      console.log('⚠️ Google News or Blog Generation service not available');
      return;
    }

    console.log('🌅 Starting deep news browsing (6:00 AM)');

    try {
      // 1. Perform deep news browsing
      const articles = await this.googleNewsService.performDeepNewsBrowsing();

      // 2. Generate blog posts from articles
      if (articles.length > 0) {
        const blogPosts = await this.blogGenerationService.generateBlogPosts(articles);
        console.log(`📝 Generated ${blogPosts.length} blog posts`);

        // 3. Generate daily digest
        const today = new Date();
        await this.blogGenerationService.generateDailyDigest(today);
        console.log('📅 Generated daily digest');
      }

      console.log('✅ Deep news browsing completed');
    } catch (error) {
      console.error('❌ Error during deep news browsing:', error);
    }
  }

  /**
   * Perform quick news check
   */
  private async performQuickNewsCheck(): Promise<void> {
    if (!this.googleNewsService) {
      console.log('⚠️ Google News service not available');
      return;
    }

    console.log('⚡ Performing quick news check');

    try {
      const articles = await this.googleNewsService.performQuickNewsCheck();
      console.log(`📰 Quick check: ${articles.length} articles processed`);
    } catch (error) {
      console.error('❌ Error during quick news check:', error);
    }
  }

  /**
   * Check if Google News can proceed with scraping based on browser limits
   */
  private canGoogleNewsProceed(): boolean {
    if (!this.googleNewsService) return false;

    const scrapingStatus = this.googleNewsService.canProceedWithScraping();
    if (!scrapingStatus.canProceed) {
      console.log(`💤 Google News paused (${scrapingStatus.pagesRemaining} pages remaining)`);
      return false;
    }
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
      lastTick: this.stats.lastTick,
      intervals: {
        tickIntervalMs: this.TICK_INTERVAL_MS,
        maintenanceIntervalMs: this.MAINTENANCE_INTERVAL_MS,
        batchFlushInterval: this.BATCH_FLUSH_INTERVAL
      }
    };
  }

  // --- Persistence Methods ---

  private saveState() {
      try {
          if (!fs.existsSync(this.DATA_DIR)) {
              fs.mkdirSync(this.DATA_DIR, { recursive: true });
          }

          // Convert Map<string, Set<string>> to friendly JSON format: [string, string[]][]
          const serializedBatch = Array.from(this.pendingNewsBatch.entries()).map(([userId, set]) => {
              return [userId, Array.from(set)];
          });

          const state = {
              stats: this.stats,
              tickCount: this.tickCount,
              pendingNewsBatch: serializedBatch
          };

          fs.writeFileSync(this.STATE_FILE, JSON.stringify(state, null, 2));
      } catch (error) {
          console.error('❌ Failed to save scheduler state:', error);
      }
  }

  private loadState() {
      try {
          if (fs.existsSync(this.STATE_FILE)) {
              const raw = fs.readFileSync(this.STATE_FILE, 'utf-8');
              const state = JSON.parse(raw);

              if (state.stats) this.stats = state.stats;
              if (state.tickCount) this.tickCount = state.tickCount;

              if (Array.isArray(state.pendingNewsBatch)) {
                  // Convert back to Map<string, Set<string>>
                  this.pendingNewsBatch = new Map(
                      state.pendingNewsBatch.map(([userId, items]: [string, string[]]) => [userId, new Set(items)])
                  );
              }
              console.log(`📦 Loaded scheduler state: ${this.pendingNewsBatch.size} pending batches`);
          }
      } catch (error) {
          console.error('❌ Failed to load scheduler state:', error);
      }
  }

}