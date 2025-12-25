import { BrowserService } from '../services/BrowserService';
import { ContextManager } from '../memory/ContextManager';
import { WhatsAppService } from '../services/WhatsAppService';
import { Agent } from './Agent';
import { ActionQueueService } from '../services/ActionQueueService';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { GoogleSearchService } from '../services/GoogleSearchService';
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
  // Map<UserId, Map<Url, ProcessedNewsResult>> to automatically handle URL duplicates
  private pendingNewsBatch: Map<string, Map<string, any>> = new Map();
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
    private googleSearchService?: GoogleSearchService
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

      // 2. Check for news fetching (every 6 hours: 6am, 12pm, 6pm, 12am)
      if (this.shouldFetchNews()) {
        await this.performNewsFetching();
      }

      // 3. IDLE MODE: Browse (legacy browsing)
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

      // 4. PROACTIVE MODE: Accumulate News
      if (activeUsers.length > 0) {
        await this.accumulateNews(activeUsers);
      }

      // 5. [NEW] Flush Batch based on configured interval
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
      const relevantArticles = await this.findFreshRelevantArticles(userId, interests);

      if (relevantArticles.length > 0) {
          // Initialize map if not exists
          if (!this.pendingNewsBatch.has(userId)) {
              this.pendingNewsBatch.set(userId, new Map());
          }

          // Add to pending batch
          const userBatch = this.pendingNewsBatch.get(userId)!;
          for (const article of relevantArticles) {
              // Check if we already queued this URL in this batch
              if (!userBatch.has(article.url)) {
                  userBatch.set(article.url, article);
                  console.log(`📦 Added news item to queue for ${userId}: ${article.title} (Queue size: ${userBatch.size})`);
                  changed = true;
              }
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

      for (const [userId, articleMap] of this.pendingNewsBatch.entries()) {
          if (articleMap.size === 0) continue;

          // Convert Map to Array of ProcessedNewsResult
          const articles = Array.from(articleMap.values());

          // Clear the batch immediately to prevent double sending if processing takes time
          this.pendingNewsBatch.delete(userId);
          changed = true;

          // Ask Agent to deduplicate and summarize
          console.log(`🤖 Generating digest for ${userId} from ${articles.length} items...`);
          const digest = await this.agent.generateNewsDigest(userId, articles);

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

  private async findFreshRelevantArticles(userId: string, interests: string[]): Promise<any[]> {
      if (!this.googleSearchService) return [];

      const articles: any[] = [];
      
      // Get recently processed articles from the database
      // We'll use ProcessedArticleService to get recent articles
      const { ProcessedArticleService } = await import('../services/ProcessedArticleService');
      const articleService = new ProcessedArticleService();
      
      // Get articles from the last 24 hours
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      
      const result = await articleService.searchProcessedArticles(undefined, {
          dateFrom: oneDayAgo.toISOString(),
          limit: 50,
          status: 'completed',
          orderBy: 'publishedAt',
          orderDirection: 'desc'
      });
      
      // Filter articles by user interests using keywords, tags, and category
      for (const article of result.articles) {
          // Check if article matches any interest
          const matchesInterest = this.articleMatchesInterests(article, interests);
          
          if (matchesInterest) {
              articles.push({
                  title: article.title,
                  url: article.url,
                  source: article.source,
                  feedUrl: article.feedUrl,
                  publishedAt: article.publishedAt,
                  keywords: article.keywords,
                  tags: article.tags,
                  category: article.category,
                  processedContent: article.processedContent,
              });
          }
      }
      
      return articles;
  }
  
  /**
   * Check if an article matches user interests
   */
  private articleMatchesInterests(article: any, interests: string[]): boolean {
      const articleText = `${article.title} ${article.category} ${article.keywords.join(' ')} ${article.tags.join(' ')}`.toLowerCase();
      
      for (const interest of interests) {
          if (articleText.includes(interest.toLowerCase())) {
              return true;
          }
      }
      return false;
  }

  private shouldBrowse(activeUserCount: number): boolean {
    // Check if browser has reached its hourly limit
    const browserStats = this.browser.getStats();
    return browserStats.pagesVisitedThisHour < 20; // MAX_PAGES_PER_HOUR
  }

  /**
   * Check if it's time for news fetching (every 6 hours: 6am, 12pm, 6pm, 12am)
   */
  private shouldFetchNews(): boolean {
    if (!this.googleSearchService) return false;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Check if it's approximately 6am, 12pm, 6pm, or 12am (within first 10 minutes)
    return (currentHour === 0 || currentHour === 6 || currentHour === 12 || currentHour === 18) && currentMinute < 10;
  }

  /**
   * Perform news fetching
   */
  private async performNewsFetching(): Promise<void> {
    if (!this.googleSearchService) {
      console.log('⚠️ Google Search service not available');
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    console.log(`🌅 Starting news fetching (${timeStr})`);

    try {
      // Fetch latest news articles (up to 100) - only returns new articles
      const articles = await this.googleSearchService.fetchLatestNews(100);
      
      console.log(`📰 Fetched ${articles.length} new news articles`);

      console.log('✅ News fetching completed');
    } catch (error) {
      console.error('❌ Error during news fetching:', error);
    }
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

          // Convert Map<string, Map<string, any>> to friendly JSON format: [string, any[]][]
          const serializedBatch = Array.from(this.pendingNewsBatch.entries()).map(([userId, articleMap]) => {
              return [userId, Array.from(articleMap.values())];
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
                  // Convert back to Map<string, Map<string, any>>
                  this.pendingNewsBatch = new Map(
                      state.pendingNewsBatch.map(([userId, items]: [string, any[]]) => {
                          const articleMap = new Map();
                          for (const item of items) {
                              if (item && item.url) {
                                  articleMap.set(item.url, item);
                              }
                          }
                          return [userId, articleMap];
                      })
                  );
              }
              console.log(`📦 Loaded scheduler state: ${this.pendingNewsBatch.size} pending batches`);
          }
      } catch (error) {
          console.error('❌ Failed to load scheduler state:', error);
      }
  }

}