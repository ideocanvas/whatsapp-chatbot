import 'dotenv/config';
import * as fs from 'fs'; // Added for reading generated audio files
import { DatabaseConfig } from './config/databaseConfig';
import { Agent } from './core/Agent';
import { Scheduler } from './core/Scheduler';
import { ToolRegistry } from './core/ToolRegistry';
import { ContextManager } from './memory/ContextManager';
import { SummaryStore } from './memory/SummaryStore';
import { ActionQueueService } from './services/ActionQueueService';
import { BrowserService } from './services/BrowserService';
import { UserProfileService } from './services/UserProfileService';
import { BlogGenerationService, createBlogGenerationService } from './services/blogGenerationService';
import { GoogleNewsService, createGoogleNewsService } from './services/googleNewsService';
import { createGoogleSearchServiceFromEnv } from './services/googleSearchService';
import { MediaService } from './services/mediaService';
import { OpenAIService, createOpenAIServiceFromConfig } from './services/openaiService';
import { createWebScrapeService } from './services/webScrapeService';
import { WhatsAppService } from './services/whatsappService';
import { ConversationAnalyticsTool } from './tools/ConversationAnalyticsTool';
import { DeepResearchTool } from './tools/DeepResearchTool';
import { RecallHistoryTool } from './tools/RecallHistoryTool';
import { SetReminderTool } from './tools/SetReminderTool';
import { WebSearchTool } from './tools/WebSearchTool';

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
  private mediaService?: MediaService; // Add MediaService
  private openai?: OpenAIService;
  private historyStore?: any; // HistoryStore or HistoryStorePostgres
  private summaryStore?: SummaryStore;
  private userProfileService?: UserProfileService;
  private googleNewsService?: GoogleNewsService;
  private blogGenerationService?: BlogGenerationService;
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
      this.summaryStore = new SummaryStore();

      // Initialize database services using configuration switcher
      await DatabaseConfig.initialize();
      this.kb = DatabaseConfig.getKnowledgeBase(this.openai);
      this.historyStore = DatabaseConfig.getHistoryStore();
      this.actionQueue = new ActionQueueService();

      // Initialize User Profile Service
      this.userProfileService = new UserProfileService();

      // Set dependencies for ContextManager (rolling summarization)
      this.contextMgr.setDependencies(this.summaryStore, this.openai);

      // WhatsApp configuration
      const whatsappConfig = {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        apiVersion: 'v19.0'
      };

      this.whatsapp = new WhatsAppService(whatsappConfig, process.env.DEV_MODE === 'true');
      this.mediaService = new MediaService(whatsappConfig); // Initialize MediaService

      // CRITICAL FIX: Link ActionQueue to WhatsApp Service
      this.actionQueue.registerMessageSender(async (userId, content) => {
        return this.whatsapp!.sendMessage(userId, content);
      });

      // 2. Initialize Browser & News Services
      const scraper = createWebScrapeService();
      this.browser = new BrowserService(scraper, this.kb);

      // Initialize Google News Service (pass browser service for rate limiting)
      this.googleNewsService = createGoogleNewsService(scraper, this.openai, undefined, this.browser);

      // Initialize Blog Generation Service
      this.blogGenerationService = createBlogGenerationService(this.openai);

      // 3. Initialize Tool Registry
      this.tools = new ToolRegistry();

      // Register Web Search
      const searchService = createGoogleSearchServiceFromEnv();
      if (searchService) {
        this.tools.registerTool(new WebSearchTool(searchService));
      }

      // Register NEW Tools
      this.tools.registerTool(new RecallHistoryTool(this.historyStore));
      this.tools.registerTool(new ConversationAnalyticsTool(this.historyStore));

      // Register Deep Research Tool
      if (this.browser) {
          this.tools.registerTool(new DeepResearchTool(this.browser));
      }

      // Register Set Reminder Tool
      this.tools.registerTool(new SetReminderTool());

      // 4. Initialize Agent (pass UserProfileService)
      this.agent = new Agent(this.openai, this.contextMgr, this.kb, this.tools, this.actionQueue, this.userProfileService);

      // 5. Initialize Scheduler
      this.scheduler = new Scheduler(
        this.browser,
        this.contextMgr,
        this.whatsapp,
        this.agent,
        this.actionQueue,
        this.kb,
        this.googleNewsService,
        this.blogGenerationService
      );

      this.isInitialized = true;
      console.log('✅ Autonomous WhatsApp Agent Initialized Successfully');

    } catch (error) {
      console.error('❌ Failed to initialize Autonomous Agent:', error);
      throw error;
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

    // 1. INTERRUPT BACKGROUND TASKS
    if (this.scheduler) {
        this.scheduler.interrupt();
    }

    console.log(`📱 Incoming message from ${userId}: ${message.substring(0, 50)}...`);

    try {
      // LOG USER MESSAGE TO HISTORY
      if (this.historyStore) {
        await this.historyStore.storeMessage({
          userId,
          message: message,
          role: 'user',
          timestamp: new Date().toISOString(),
          messageType: 'text',
          metadata: { messageId }
        });
      }

      // Process through the agent
      const response = await this.agent.handleUserMessage(userId, message);

      // LOG AGENT RESPONSE TO HISTORY
      if (this.historyStore) {
        await this.historyStore.storeMessage({
          userId,
          message: response,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        });
      }

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
   * NEW: Handle incoming Image messages
   */
  async handleImageMessage(userId: string, imageId: string, mimeType: string, sha256: string, caption?: string): Promise<void> {
    if (!this.isInitialized || !this.agent || !this.whatsapp || !this.mediaService) {
      throw new Error('Agent not initialized');
    }

    // 1. INTERRUPT BACKGROUND TASKS
    if (this.scheduler) {
        this.scheduler.interrupt();
    }

    console.log(`🖼️ Incoming IMAGE from ${userId}`);

    try {
      // 1. Download Media
      const mediaInfo = await this.mediaService.downloadAndSaveMedia(imageId, mimeType, sha256, 'image');

      // 2. Analyze using Vision AI
      console.log(`👁️ Analyzing image: ${mediaInfo.filename}`);
      const analysis = await this.mediaService.analyzeImageWithOpenAI(mediaInfo.filepath);

      // LOG USER MESSAGE (IMAGE) TO HISTORY
      // We store the analysis in the message text so it's searchable via Recall tool
      if (this.historyStore) {
        const storedMessage = caption ? `${caption} [Image Analysis: ${analysis}]` : `[Image Analysis: ${analysis}]`;
        await this.historyStore.storeMessage({
          userId,
          message: storedMessage,
          role: 'user',
          timestamp: new Date().toISOString(),
          messageType: 'image',
          metadata: {
              imageId,
              mimeType,
              filepath: mediaInfo.filepath,
              analysis,
              caption
          }
        });
      }

      // 3. Construct Augmented Message for Agent
      // We present the image analysis as system context or augmented user message
      const augmentedMessage = `[USER SENT AN IMAGE]\n\nImage Analysis:\n${analysis}\n\n${caption ? `User Caption: "${caption}"` : 'No caption provided.'}`;

      console.log(`📝 Processing analyzed image as text context...`);

      // 4. Pass to standard agent handler
      const response = await this.agent.handleUserMessage(userId, augmentedMessage);

      // LOG AGENT RESPONSE
      if (this.historyStore) {
        await this.historyStore.storeMessage({
          userId,
          message: response,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        });
      }

      if (process.env.DEV_MODE === 'true') {
        console.log(`💬 Response to ${userId}: ${response}`);
      } else {
        await this.whatsapp.sendMessage(userId, response);
      }

      console.log(`✅ Image processed for ${userId}`);

    } catch (error) {
      console.error(`❌ Error processing image from ${userId}:`, error);
      const fallback = "I received your image but had trouble analyzing it. Please try again.";
      if (process.env.DEV_MODE !== 'true') {
        await this.whatsapp.sendMessage(userId, fallback);
      }
    }
  }

  /**
   * NEW: Handle incoming Audio messages
   * Workflow: Download -> Transcribe -> AI Response -> Synthesize (TTS) -> Send Audio
   */
  async handleAudioMessage(userId: string, audioId: string, mimeType: string, sha256: string): Promise<void> {
    if (!this.isInitialized || !this.agent || !this.whatsapp || !this.mediaService) {
      throw new Error('Agent not initialized');
    }

    // 1. Interrupt background tasks
    if (this.scheduler) this.scheduler.interrupt();

    console.log(`🎤 Incoming AUDIO from ${userId}`);

    try {
      // 2. Download Audio
      const mediaInfo = await this.mediaService.downloadAndSaveMedia(audioId, mimeType, sha256, 'audio');

      // 3. Convert audio to WAV format for better transcription (fixes OGG/Opus issues)
      console.log(`🔄 Converting audio to WAV format: ${mediaInfo.filename}`);
      const convertedAudioPath = await this.mediaService.convertAudioToWav(mediaInfo.filepath);

      // 4. Transcribe (Speech-to-Text)
      console.log(`👂 Transcribing audio: ${convertedAudioPath}`);
      // Assuming 'en' or auto-detect. You can change 'en' to undefined to auto-detect if supported.
      const transcription = await this.mediaService.transcribeAudio(convertedAudioPath);
      console.log(`📝 User said: "${transcription}"`);

      // LOG USER MESSAGE (AUDIO) TO HISTORY
      if (this.historyStore) {
        await this.historyStore.storeMessage({
          userId,
          message: transcription || '[Unintelligible Audio]',
          role: 'user',
          timestamp: new Date().toISOString(),
          messageType: 'audio',
          metadata: {
              audioId,
              mimeType,
              filepath: mediaInfo.filepath
          }
        });
      }

      // 4. Get Agent Text Response
      // We pass the transcription as if the user typed it
      const textResponse = await this.agent.handleUserMessage(userId, transcription);

      // LOG AGENT RESPONSE
      if (this.historyStore) {
        await this.historyStore.storeMessage({
          userId,
          message: textResponse,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        });
      }

      // 5. Synthesize Response (Text-to-Speech)
      console.log(`🗣️ Synthesizing voice response...`);
      const audioResponse = await this.mediaService.synthesizeAudio(textResponse, {
        voice: 'af_heart', // You can change the voice here
        speed: 1.0
      });

      // 6. Convert WAV to WhatsApp-compatible format (OGG)
      console.log(`🔄 Converting audio to WhatsApp-compatible format...`);
      const convertedAudio = await this.mediaService.convertAudioToWhatsAppFormat(audioResponse.filepath, 'ogg');

      // 7. Upload Converted Audio to WhatsApp
      const uploadedMediaId = await this.whatsapp.uploadMedia(convertedAudio.filepath, convertedAudio.mimeType);

      if (uploadedMediaId) {
        // 8. Send Audio Message
        await this.whatsapp.sendAudioMessage(userId, uploadedMediaId);

        // 9. Check for URLs and send them as text if present
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const links = textResponse.match(urlRegex);

        if (links && links.length > 0) {
            // Deduplicate links
            const uniqueLinks = [...new Set(links)];
            const linkMessage = `🔗 *Links mentioned:*\n${uniqueLinks.join('\n')}`;

            console.log(`🔗 Link(s) detected, sending text fallback to ${userId}`);

            // Short delay to ensure audio arrives first on client
            await new Promise(resolve => setTimeout(resolve, 800));
            await this.whatsapp.sendMessage(userId, linkMessage);
        }
      } else {
        // Fallback to text if upload fails
        await this.whatsapp.sendMessage(userId, textResponse);
      }

      console.log(`✅ Voice interaction completed for ${userId}`);

    } catch (error) {
      console.error(`❌ Error processing audio from ${userId}:`, error);
      const fallback = "I heard you, but had trouble processing the audio. Please type your message instead.";
      if (process.env.DEV_MODE !== 'true') {
        await this.whatsapp.sendMessage(userId, fallback);
      }
    }
  }

  /**
   * Handle web interface messages (returns response instead of sending)
   * Supports optional attachment (simulated upload)
   * Returns object with text and optional audio (base64)
   */
  async handleWebMessage(userId: string, message: string, attachment?: { type: 'image' | 'audio', filePath: string }): Promise<{ text: string, audio?: string }> {
    if (!this.isInitialized || !this.agent) {
      throw new Error('Agent not initialized');
    }

    // 1. INTERRUPT BACKGROUND TASKS
    if (this.scheduler) {
        this.scheduler.interrupt();
    }

    console.log(`🌐 Web message from ${userId}: ${message.substring(0, 50)}... ${attachment ? `[With ${attachment.type}]` : ''}`);

    try {
      let processedMessage = message;
      let analysisResult = '';

      // Handle Attachment logic simulating real media processing
      if (attachment && this.mediaService) {
        if (attachment.type === 'image') {
          console.log(`👁️ Analyzing web image attachment: ${attachment.filePath}`);
          const analysis = await this.mediaService.analyzeImageWithOpenAI(attachment.filePath);
          processedMessage = `[USER SENT AN IMAGE]\n\nImage Analysis:\n${analysis}\n\n${message ? `User Caption: "${message}"` : ''}`;
          analysisResult = analysis;
        } else if (attachment.type === 'audio') {
          console.log(`🎤 Transcribing web audio attachment: ${attachment.filePath}`);
          // Convert audio to WAV format for better transcription
          const convertedAudioPath = await this.mediaService.convertAudioToWav(attachment.filePath);
          const transcription = await this.mediaService.transcribeAudio(convertedAudioPath);
          console.log(`📝 Transcription: "${transcription}"`);
          processedMessage = transcription;
          if (message) processedMessage += `\n\n(User Note: ${message})`;
        }
      }

      // LOG USER MESSAGE
      if (this.historyStore) {
        // Calculate what to store. If it's an image, include analysis for searchability.
        let storeMsg = message;
        let msgType: 'text'|'image'|'audio' = 'text';

        if (attachment) {
            msgType = attachment.type;
            if (attachment.type === 'image') {
                storeMsg = message ? `${message} [Image Analysis: ${analysisResult}]` : `[Image Analysis: ${analysisResult}]`;
            } else if (attachment.type === 'audio') {
                storeMsg = processedMessage; // The transcription
            }
        }

        await this.historyStore.storeMessage({
          userId,
          message: storeMsg,
          role: 'user',
          timestamp: new Date().toISOString(),
          messageType: msgType,
          metadata: attachment ? { filePath: attachment.filePath } : undefined
        });
      }

      // Process through the agent but don't send via WhatsApp
      // Note: For image attachments, we pass the 'processedMessage' (augmented with analysis) to the agent
      // For audio, we pass the transcription
      // For text, just the text
      const inputToAgent = attachment ? processedMessage : message;
      const responseText = await this.agent.handleUserMessage(userId, inputToAgent);

      // LOG AGENT RESPONSE
      if (this.historyStore) {
        await this.historyStore.storeMessage({
          userId,
          message: responseText,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        });
      }

      let audioData: string | undefined;

      // Generate TTS Audio response if input was audio
      if (attachment && attachment.type === 'audio' && this.mediaService) {
          try {
              console.log(`🗣️ Generating audio response for Web UI...`);
              const audioInfo = await this.mediaService.synthesizeAudio(responseText);

              if (fs.existsSync(audioInfo.filepath)) {
                  const buffer = fs.readFileSync(audioInfo.filepath);
                  // Convert to base64 Data URI
                  audioData = `data:${audioInfo.mimeType};base64,${buffer.toString('base64')}`;
              }
          } catch (e) {
              console.error('Failed to synthesize audio for web response:', e);
          }
      }

      console.log(`✅ Web message processed for ${userId}`);
      return { text: responseText, audio: audioData };
    } catch (error) {
      console.error(`❌ Error processing web message from ${userId}:`, error);
      return { text: "Sorry, I encountered an issue processing your message. Please try again." };
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
   * Get the Google News service for external access
   */
  getGoogleNewsService(): GoogleNewsService | undefined {
    return this.googleNewsService;
  }

  /**
   * Get the browser service for external access
   */
  getBrowserService(): BrowserService | undefined {
    return this.browser;
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
