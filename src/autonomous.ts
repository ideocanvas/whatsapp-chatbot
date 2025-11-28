import 'dotenv/config';
import { Scheduler } from './core/Scheduler';
import { Agent } from './core/Agent';
import { ContextManager } from './memory/ContextManager';
import { ToolRegistry } from './core/ToolRegistry';
import { BrowserService } from './services/BrowserService';
import { ActionQueueService } from './services/ActionQueueService';
import { WhatsAppService } from './services/whatsappService';
import { OpenAIService, createOpenAIServiceFromConfig } from './services/openaiService';
import { WebScrapeService, createWebScrapeService } from './services/webScrapeService';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from './services/googleSearchService';
import { WebSearchTool } from './tools/WebSearchTool';
import { RecallHistoryTool } from './tools/RecallHistoryTool';
import { ScrapeNewsTool } from './tools/ScrapeNewsTool';
import { NewsScrapeService, createNewsScrapeService } from './services/newsScrapeService';
import { NewsProcessorService } from './services/newsProcessorService';
import { DatabaseConfig } from './config/databaseConfig';
import type { KnowledgeDocument } from './memory/KnowledgeBase';

/**
 * Autonomous WhatsApp Agent Main Entry Point
 * 
 * This is the complete replacement for the reactive bot architecture.
 * Features autonomous browsing, proactive messaging, and intelligent memory management.
 */
class AutonomousWhatsAppAgent {
  private scheduler?: Scheduler;
  private agent?: Agent;
  private contextMgr?: ContextManager;
  private kb?: any; // KnowledgeBase or KnowledgeBasePostgres
  private tools?: ToolRegistry;
  private browser?: BrowserService;
  private actionQueue?: ActionQueueService;
  private whatsapp?: WhatsAppService;
  private openai?: OpenAIService;
  private historyStore?: any; // HistoryStore or HistoryStorePostgres
  private vectorStore?: any; // VectorStoreService or VectorStoreServicePostgres
  private isInitialized: boolean = false;

  constructor() {
    console.log('🚀 Initializing Autonomous WhatsApp Agent...');
  }

  /**
   * Initialize all components of the autonomous system
   */
  async initialize(): Promise<void> {
    try {
      // 1. Initialize Core Services
      this.openai = await createOpenAIServiceFromConfig();
      this.contextMgr = new ContextManager();
      
      // Initialize database services using configuration switcher
      await DatabaseConfig.initialize();
      this.kb = DatabaseConfig.getKnowledgeBase(this.openai);
      this.historyStore = DatabaseConfig.getHistoryStore();
      this.vectorStore = DatabaseConfig.getVectorStoreService(this.openai);
      this.actionQueue = new ActionQueueService();

      // WhatsApp configuration
      const whatsappConfig = {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        apiVersion: 'v19.0'
      };

      this.whatsapp = new WhatsAppService(whatsappConfig, process.env.DEV_MODE === 'true');

      // CRITICAL FIX: Link ActionQueue to WhatsApp Service
      this.actionQueue.registerMessageSender(async (userId, content) => {
        return this.whatsapp!.sendMessage(userId, content);
      });

      // 2. Initialize Browser & News Services
      const scraper = createWebScrapeService();
      this.browser = new BrowserService(scraper, this.kb);
      
      // Initialize News Stack
      // Mock GoogleSearchService for processor if not available, or initialize properly
      const searchService = createGoogleSearchServiceFromEnv();
      const newsProcessor = new NewsProcessorService(this.openai, searchService, this.vectorStore);
      const newsService = createNewsScrapeService(scraper, newsProcessor);

      // 3. Initialize Tool Registry
      this.tools = new ToolRegistry();
      
      // Register Web Search
      if (searchService) {
        this.tools.registerTool(new WebSearchTool(searchService));
      }

      // Register NEW Tools
      this.tools.registerTool(new RecallHistoryTool(this.historyStore));
      this.tools.registerTool(new ScrapeNewsTool(newsService));

      // 4. Initialize Agent
      this.agent = new Agent(this.openai, this.contextMgr, this.kb, this.tools, this.actionQueue);

      // 5. Initialize Scheduler
      this.scheduler = new Scheduler(
        this.browser,
        this.contextMgr,
        this.whatsapp,
        this.agent,
        this.actionQueue,
        this.kb
      );

      this.isInitialized = true;
      console.log('✅ Autonomous WhatsApp Agent Initialized Successfully');
      
      // Start background news service
      newsService.startBackgroundService(30);

    } catch (error) {
      console.error('❌ Failed to initialize Autonomous Agent:', error);
      throw error;
    }
  }

  /**
   * Initialize and register all tools
   */
  private async initializeTools(): Promise<void> {
    try {
      // Initialize Google Search Service if configured
      let searchService: GoogleSearchService | undefined;
      try {
        searchService = createGoogleSearchServiceFromEnv();
        console.log('✅ Google Search Service initialized');
      } catch (error) {
        console.log('⚠️ Google Search Service not configured (missing API keys)');
      }
      
      // Register Web Search Tool if available
      if (searchService) {
        const webSearchTool = new WebSearchTool(searchService);
        this.tools!.registerTool(webSearchTool);
        console.log('🔍 Web Search Tool registered');
      }
      
      console.log(`🛠️ Tool Registry: ${this.tools!.getAvailableTools().length} tools available`);
      
      if (this.tools!.getAvailableTools().length === 0) {
        console.log('⚠️ No tools available - agent will rely on knowledge base only');
      }
      
    } catch (error) {
      console.error('❌ Tool initialization failed:', error);
      console.log('⚠️ Continuing with knowledge base only');
    }
  }

  /**
   * Start the autonomous agent system
   */
  start(): void {
    if (!this.isInitialized || !this.scheduler) {
      throw new Error('Agent must be initialized before starting');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🤖 AUTONOMOUS WHATSAPP AGENT STARTING');
    console.log('='.repeat(60));

    // Start the scheduler (1-minute ticks)
    this.scheduler.start();

    console.log('📍 Scheduler: 1-minute autonomous tick cycle started');
    console.log('🌐 Browser: Autonomous surfing enabled');
    console.log('💬 Agent: Proactive messaging capabilities active');
    console.log('🧠 Memory: 3-tier memory system operational');
    console.log('📬 Queue: Rate-limited action queue running');

    if (process.env.DEV_MODE === 'true') {
      console.log('\n💡 DEVELOPMENT MODE: Messages will be logged to console');
      console.log('🚫 No messages will be sent to WhatsApp');
    }

    console.log('='.repeat(60) + '\n');
  }

  /**
   * Handle incoming WhatsApp messages (webhook integration)
   */
  async handleIncomingMessage(userId: string, message: string, messageId: string): Promise<void> {
    if (!this.isInitialized || !this.agent || !this.whatsapp) {
      throw new Error('Agent not initialized');
    }

    console.log(`📱 Incoming message from ${userId}: ${message.substring(0, 50)}...`);

    try {
      // Process through the agent
      const response = await this.agent.handleUserMessage(userId, message);

      // Send response via WhatsApp (or log in dev mode)
      if (process.env.DEV_MODE === 'true') {
        console.log(`💬 Response to ${userId}: ${response}`);
      } else {
        await this.whatsapp.sendMessage(userId, response);
      }

      console.log(`✅ Message processed for ${userId}`);

    } catch (error) {
      console.error(`❌ Error processing message from ${userId}:`, error);
      
      // Fallback response
      const fallback = "Sorry, I encountered an issue. Please try again.";
      if (process.env.DEV_MODE !== 'true') {
        await this.whatsapp.sendMessage(userId, fallback);
      }
    }
  }

  /**
   * Handle web interface messages (returns response instead of sending)
   */
  async handleWebMessage(userId: string, message: string): Promise<string> {
    if (!this.isInitialized || !this.agent) {
      throw new Error('Agent not initialized');
    }

    console.log(`🌐 Web message from ${userId}: ${message.substring(0, 50)}...`);

    try {
      // Process through the agent but don't send via WhatsApp
      const response = await this.agent.handleUserMessage(userId, message);
      console.log(`✅ Web message processed for ${userId}`);
      return response;
    } catch (error) {
      console.error(`❌ Error processing web message from ${userId}:`, error);
      return "Sorry, I encountered an issue processing your message. Please try again.";
    }
  }

  /**
   * Get system status and statistics
   */
  async getStatus() {
    if (!this.isInitialized || !this.agent || !this.scheduler || !this.contextMgr || !this.kb || !this.browser || !this.actionQueue || !this.tools) {
      return { status: 'Not initialized' };
    }

    const dbStats = await DatabaseConfig.getDatabaseStats();

    return {
      status: 'Running',
      database: dbStats,
      agent: this.agent.getStats(),
      scheduler: this.scheduler.getStatus(),
      memory: {
        context: this.contextMgr.getStats(),
        knowledge: await (this.kb as any).getStats()
      },
      browser: this.browser.getStats(),
      queue: this.actionQueue.getQueueStats(),
      tools: {
        available: this.tools.getAvailableTools(),
        count: this.tools.getAvailableTools().length
      }
    };
  }

  /**
   * Get actual knowledge content for dashboard display
   */
  async getKnowledgeContent(limit: number = 10): Promise<Array<{id: string; title: string; content: string; source: string; category: string; timestamp: string}>> {
    if (!this.isInitialized || !this.kb) {
      return [];
    }
    
    try {
      const documents = await (this.kb as any).getRecentDocuments(limit);
      return documents.map((doc: any) => ({
        id: doc.id,
        title: `${doc.category} - ${doc.source}`,
        content: doc.content,
        source: doc.source,
        category: doc.category,
        timestamp: doc.timestamp
      }));
    } catch (error) {
      console.error('Error getting knowledge content:', error);
      return [];
    }
  }

  /**
   * Search knowledge content for dashboard
   */
  async searchKnowledgeContent(query: string, limit: number = 10): Promise<Array<{id: string; title: string; content: string; source: string; category: string; timestamp: string}>> {
    if (!this.isInitialized || !this.kb) {
      return [];
    }
    
    try {
      const documents = await (this.kb as any).searchContent(query, limit);
      return documents.map((doc: any) => ({
        id: doc.id,
        title: `${doc.category} - ${doc.source}`,
        content: doc.content,
        source: doc.source,
        category: doc.category,
        timestamp: doc.timestamp
      }));
    } catch (error) {
      console.error('Error searching knowledge content:', error);
      return [];
    }
  }

  /**
   * Stop the autonomous system
   */
  stop(): void {
    if (this.scheduler) {
      this.scheduler.stop();
    }
    console.log('🛑 Autonomous WhatsApp Agent Stopped');
  }

  /**
   * Log initial system statistics
   */
  private logInitialStats(): void {
    console.log('📊 Initial System Stats:');
    console.log('- Memory: 3-tier architecture (1h context, vector KB, SQL history)');
    console.log('- Browser: Autonomous surfing with 10 pages/hour limit');
    console.log('- Scheduler: 1-minute ticks with intelligent mode switching');
    console.log('- Agent: LLM orchestration with tool calling');
    console.log('- Queue: Rate-limited messaging with proactive cooldowns');
  }
}

// Singleton instance
let autonomousAgent: AutonomousWhatsAppAgent;

/**
 * Get or create the autonomous agent instance
 */
export function getAutonomousAgent(): AutonomousWhatsAppAgent {
  if (!autonomousAgent) {
    autonomousAgent = new AutonomousWhatsAppAgent();
  }
  return autonomousAgent;
}

/**
 * Initialize and start the autonomous agent
 */
export async function startAutonomousAgent(): Promise<AutonomousWhatsAppAgent> {
  const agent = getAutonomousAgent();
  await agent.initialize();
  agent.start();
  return agent;
}

// Export for testing and manual control
export { AutonomousWhatsAppAgent };