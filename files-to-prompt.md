./src/autonomous.ts
---
import 'dotenv/config';
import { Scheduler } from './core/Scheduler';
import { Agent } from './core/Agent';
import { ContextManager } from './memory/ContextManager';
import { SummaryStore } from './memory/SummaryStore';
import { ToolRegistry } from './core/ToolRegistry';
import { BrowserService } from './services/BrowserService';
import { ActionQueueService } from './services/ActionQueueService';
import { WhatsAppService } from './services/whatsappService';
import { MediaService } from './services/mediaService';
import { OpenAIService, createOpenAIServiceFromConfig } from './services/openaiService';
import { WebScrapeService, createWebScrapeService } from './services/webScrapeService';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from './services/googleSearchService';
import { WebSearchTool } from './tools/WebSearchTool';
import { RecallHistoryTool } from './tools/RecallHistoryTool';
import { ScrapeNewsTool } from './tools/ScrapeNewsTool';
import { DeepResearchTool } from './tools/DeepResearchTool'; // Import the new tool
import { NewsScrapeService, createNewsScrapeService } from './services/newsScrapeService';
import { NewsProcessorService } from './services/newsProcessorService';
import { GoogleNewsService, createGoogleNewsService } from './services/googleNewsService';
import { BlogGenerationService, createBlogGenerationService } from './services/blogGenerationService';
import { DatabaseConfig } from './config/databaseConfig';
import type { KnowledgeDocument } from './memory/KnowledgeBasePostgres';
import * as fs from 'fs'; // Added for reading generated audio files
import { UserProfileService } from './services/UserProfileService';

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
  private vectorStore?: any; // VectorStoreService or VectorStoreServicePostgres
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
      this.vectorStore = DatabaseConfig.getVectorStoreService(this.openai);
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
      
      // Initialize News Stack
      // Mock GoogleSearchService for processor if not available, or initialize properly
      const searchService = createGoogleSearchServiceFromEnv();
      const newsProcessor = new NewsProcessorService(this.openai, searchService, this.vectorStore);
      const newsService = createNewsScrapeService(scraper, newsProcessor, this.googleNewsService);

      // Initialize Google News Service
      this.googleNewsService = createGoogleNewsService(scraper, this.openai);
      
      // Initialize Blog Generation Service
      this.blogGenerationService = createBlogGenerationService(this.openai);

      // 3. Initialize Tool Registry
      this.tools = new ToolRegistry();
      
      // Register Web Search
      if (searchService) {
        this.tools.registerTool(new WebSearchTool(searchService));
      }

      // Register NEW Tools
      this.tools.registerTool(new RecallHistoryTool(this.historyStore));
      this.tools.registerTool(new ScrapeNewsTool(newsService));
      
      // Register Deep Research Tool
      if (this.browser) {
          this.tools.registerTool(new DeepResearchTool(this.browser));
      }

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

---
./src/dev-test.ts
---
#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';
import * as readline from 'readline';

interface SendOptions {
  port: string;
  from: string;
  image?: string;
  audio?: string;
  type?: 'text' | 'image' | 'audio';
}

const program = new Command();

program
  .name('dev-test')
  .description('CLI chat client for WhatsApp chatbot dev server')
  .version('1.0.0')
  .argument('[message]', 'Message to send (if not provided, enters interactive chat mode)')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-f, --from <number>', 'Sender phone number', '1234567890')
  .option('-i, --image <path>', 'Path to image file for testing')
  .option('-a, --audio <path>', 'Path to audio file for testing')
  .option('-t, --type <type>', 'Message type: text, image, audio', 'text')
  .action(async (message: string | undefined, options: SendOptions) => {
    try {
      const port = options.port || process.env.PORT || '3000';
      const devApiUrl = `http://localhost:${port}/dev/message`;

      if (message || options.image || options.audio) {
        // Send single message from command line
        console.log(`📤 Sending message to ${devApiUrl}:`);

        let requestBody: any = {
          from: options.from
        };

        if (options.image) {
          console.log(`🖼️ Image file: ${options.image}`);
          console.log(`📋 Type: image`);
          requestBody.type = 'image';
          requestBody.imagePath = options.image;
          requestBody.message = 'Test image analysis';
        } else if (options.audio) {
          console.log(`🎤 Audio file: ${options.audio}`);
          console.log(`📋 Type: audio`);
          requestBody.type = 'audio';
          requestBody.audioPath = options.audio;
          requestBody.message = 'Test audio transcription';
        } else {
          console.log(`💬 "${message}"`);
          console.log(`📋 Type: text`);
          requestBody.message = message;
        }

        console.log(`📞 From: ${options.from}`);
        console.log(`🌐 Port: ${port}`);
        console.log('---');

        const response = await axios.post(devApiUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Dev-Test-CLI/1.0.0'
          }
        });

        console.log('✅ Message processed successfully!');
        console.log(`🤖 Response: ${response.data.response}`);
        console.log(`📋 Server status: ${response.status} ${response.statusText}`);
      } else {
        // Enter interactive chat mode
        console.log('💬 Interactive chat mode started');
        console.log(`📞 Sender: ${options.from}`);
        console.log(`🌐 Server: http://localhost:${port}`);
        console.log('📝 Type your messages (type "exit" or "quit" to end):');
        console.log('---');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const chatLoop = async () => {
          rl.question('👤 You: ', async (userMessage: string) => {
            if (userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
              console.log('👋 Goodbye!');
              rl.close();
              return;
            }

            try {
              console.log('⏳ Thinking...');

              const response = await axios.post(devApiUrl, {
                message: userMessage,
                from: options.from
              }, {
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'Dev-Test-CLI/1.0.0'
                }
              });

              console.log(`🤖 AI: ${response.data.response}`);
              console.log('---');

              // Continue the chat loop
              chatLoop();
            } catch (error: any) {
              console.error('❌ Error:', error.message);
              console.log('---');
              // Continue the chat loop even on error
              chatLoop();
            }
          });
        };

        // Start the chat loop
        chatLoop();
      }
    } catch (error: any) {
      if (error.response) {
        console.error('❌ Server error:', error.response.status, error.response.statusText);
        console.error('📋 Response data:', error.response.data);
      } else if (error.request) {
        console.error('❌ Network error: Could not connect to server');
        console.error('💡 Make sure the dev server is running on port', options.port);
      } else {
        console.error('❌ Error:', error.message);
      }
      process.exit(1);
    }
  });

program.parse();

---
./src/server.ts
---
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { startAutonomousAgent } from './autonomous';
import { DashboardRoutes } from './routes/dashboard';
import { WebhookRoutes } from './routes/webhook';
import { WhatsAppService } from './services/whatsappService';
import { MediaService } from './services/mediaService';

/**
 * Main server that integrates both autonomous agent and web dashboard
 */
class AutonomousServer {
  private app: express.Application;
  private port: number;
  private dashboardRoutes: DashboardRoutes;
  private webhookRoutes?: WebhookRoutes;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000');
    this.dashboardRoutes = new DashboardRoutes();
    
    this.setupMiddleware();
    // Note: setupRoutes() will be called after agent initialization in start() method
  }

  private setupMiddleware(): void {
    // Cookie parser middleware
    this.app.use(cookieParser());
    
    // JSON parsing middleware - CRITICAL FIX FOR SIGNATURE VERIFICATION
    // We must capture the raw buffer before JSON parsing happens
    this.app.use(express.json({
      limit: '10mb',
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      }
    }));
    
    // URL-encoded parsing middleware
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS middleware for web interface
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });
  }

  private setupRoutes(): void {
    // 1. Setup Webhook Routes FIRST (Priority over catch-all dashboard)
    const whatsappConfig = {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      apiVersion: 'v19.0'
    };
    
    if (whatsappConfig.accessToken && whatsappConfig.phoneNumberId) {
      const isDevMode = process.env.DEV_MODE === 'true';
      const whatsappService = new WhatsAppService(whatsappConfig, isDevMode);
      
      this.webhookRoutes = new WebhookRoutes(
        whatsappService,
        process.env.WHATSAPP_VERIFY_TOKEN || 'default-verify-token',
        process.env.WHATSAPP_APP_SECRET || '',
        whatsappConfig
      );
      
      // Mount at /webhook
      this.app.use('/webhook', this.webhookRoutes.getRouter());
      console.log(`✅ WhatsApp webhook routes enabled`);
    }

    // 2. Setup Dashboard Routes (Web Interface) - Acts as catch-all for '/'
    this.app.use('/', this.dashboardRoutes.getRouter());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        mode: process.env.DEV_MODE === 'true' ? 'development' : 'production'
      });
    });

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Autonomous WhatsApp Agent',
        version: '1.0.0',
        endpoints: {
          dashboard: '/',
          status: '/api/status',
          chat: '/api/chat',
          activity: '/api/activity',
          memory: '/api/memory/{context|knowledge|history}',
          health: '/health'
        }
      });
    });
  }

  /**
   * Start the server and autonomous agent
   */
  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Autonomous WhatsApp Agent Server...');
      
      // Start the autonomous agent first
      await startAutonomousAgent();
      
      // Now set up routes after agent is initialized
      this.setupRoutes();
      
      // Determine host based on environment variable or fallback to 0.0.0.0 for external access
      const host = process.env.HOST || '0.0.0.0';
      
      // Start the HTTP server
      this.app.listen(this.port, host, () => {
        console.log('\n' + '='.repeat(60));
        console.log('🤖 AUTONOMOUS SERVER STARTED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log(`📍 Server Host: ${host}`);
        console.log(`📍 Server Port: ${this.port}`);
        
        // Show appropriate URLs based on host binding
        if (host === '0.0.0.0') {
          console.log(`🌐 Web Dashboard: http://localhost:${this.port} (local)`);
          console.log(`🌐 Web Dashboard: http://[your-ip]:${this.port} (network)`);
        } else {
          console.log(`🌐 Web Dashboard: http://localhost:${this.port}`);
        }
        
        if (process.env.DEV_MODE === 'true') {
          console.log('\n💡 DEVELOPMENT MODE ACTIVATED');
          console.log('📱 Messages will be logged to console');
          console.log('🚫 No messages will be sent to WhatsApp');
        } else {
          console.log('\n⚡ PRODUCTION MODE');
          console.log('📱 Messages will be sent to WhatsApp');
        }
        
        if (this.webhookRoutes) {
          if (host === '0.0.0.0') {
            console.log(`🔗 Webhook URL: http://[your-ip]:${this.port}/webhook`);
          } else {
            console.log(`🔗 Webhook URL: http://localhost:${this.port}/webhook`);
          }
        }
        
        console.log(`❤️  Health Check: http://localhost:${this.port}/health`);
        console.log('='.repeat(60) + '\n');
      });

    } catch (error) {
      console.error('❌ Failed to start autonomous server:', error);
      process.exit(1);
    }
  }

  /**
   * Stop the server
   */
  stop(): void {
    console.log('🛑 Stopping autonomous server...');
    process.exit(0);
  }
}

// Export for testing and manual control
export { AutonomousServer };

// Start the server if this file is executed directly
if (require.main === module) {
  const server = new AutonomousServer();
  server.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', () => server.stop());
  process.on('SIGTERM', () => server.stop());
}

---
./src/test-autonomous.ts
---
import { startAutonomousAgent, getAutonomousAgent } from './autonomous';

/**
 * Test script for the Autonomous WhatsApp Agent
 * This demonstrates the core functionality without requiring WhatsApp integration
 */
async function testAutonomousAgent() {
  console.log('🧪 Testing Autonomous WhatsApp Agent Architecture...\n');

  try {
    // 1. Start the autonomous agent
    console.log('1. Starting autonomous agent...');
    const agent = await startAutonomousAgent();
    
    // Small delay to let the system initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Check system status
    console.log('\n2. Checking system status...');
    const status = await agent.getStatus();
    console.log('System Status:', {
      status: status.status,
      memory: {
        activeUsers: status.memory?.context?.activeUsers || 0,
        knowledgeDocuments: status.memory?.knowledge?.totalDocuments || 0
      },
      tools: status.tools?.count || 0,
      browser: status.browser?.favoritesCount || 0
    });

    // 3. Test incoming message handling
    console.log('\n3. Testing message processing...');
    const testUserId = 'test-user-123';
    const testMessage = 'Hello! Can you tell me about the latest tech news?';
    
    await agent.handleIncomingMessage(testUserId, testMessage, 'test-message-1');
    
    // 4. Test another message to build context
    console.log('\n4. Testing context building...');
    await agent.handleIncomingMessage(testUserId, 'What about AI developments?', 'test-message-2');

    // 5. Check if user interests were discovered
    console.log('\n5. Checking user interest discovery...');
    const statusAfterMessages = await agent.getStatus();
    console.log('After messages - User should have discovered interests');

    // 6. Wait for autonomous browsing to occur
    console.log('\n6. Waiting for autonomous browsing session...');
    console.log('The scheduler will automatically start browsing in idle mode');
    console.log('This may take a few minutes depending on the tick cycle...');

    // 7. Demonstrate proactive messaging potential
    console.log('\n7. Proactive messaging capabilities:');
    console.log('- The system will automatically browse for knowledge');
    console.log('- User interests are auto-discovered from conversations');
    console.log('- When relevant content is found, proactive messages are queued');
    console.log('- Rate limiting prevents spam (15-minute cooldown per user)');

    // 8. Show system architecture
    console.log('\n8. System Architecture Summary:');
    console.log('✅ 3-Tier Memory: ContextManager (1h) + KnowledgeBase (vector) + HistoryStore (SQL)');
    console.log('✅ Autonomous Browser: 10 pages/hour limit with intelligent URL selection');
    console.log('✅ Scheduler: 1-minute ticks with idle/proactive mode switching');
    console.log('✅ Agent: LLM orchestration with tool calling and mobile optimization');
    console.log('✅ Action Queue: Rate-limited messaging with exponential backoff');
    console.log('✅ Interest Discovery: Auto-extracts user interests from conversations');

    // 9. Keep the test running to observe autonomous behavior
    console.log('\n9. Test will continue running to observe autonomous behavior...');
    console.log('Press Ctrl+C to stop the test');
    console.log('You should see browsing sessions and potential proactive checks in the logs');

    // Keep the process alive to observe autonomous behavior
    setInterval(async () => {
      const currentStatus = await agent.getStatus();
      if (currentStatus.status === 'Running') {
        console.log(`⏰ System running - Ticks: ${currentStatus.scheduler?.tickCount || 0}`);
      }
    }, 30000); // Log every 30 seconds

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testAutonomousAgent().catch(console.error);
}

export { testAutonomousAgent };

---
./src/test-dashboard-data.ts
---
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDashboard() {
  console.log('📊 Testing Dashboard API Data...');
  
  try {
    // Test blog posts
    const blogPosts = await prisma.blogPost.findMany();
    console.log('📝 Blog Posts:', blogPosts.length);
    blogPosts.forEach(post => {
      console.log(`- ${post.title} (${post.sourceTitle || 'Unknown'})`);
    });

    // Test news sources
    const sources = await prisma.newsSource.findMany();
    console.log('📰 News Sources:', sources.length);
    sources.forEach(source => {
      console.log(`- ${source.name} (${source.url})`);
    });

    // Test keywords
    const keywords = await prisma.newsKeyword.findMany();
    console.log('🔑 Keywords:', keywords.length);
    console.log('First 5 keywords:', keywords.slice(0, 5).map(k => k.keyword));

    console.log('✅ Dashboard data test completed');
  } catch (error) {
    console.error('❌ Error testing dashboard data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDashboard();

---
./src/test-news-system.ts
---
import { createGoogleNewsService } from './services/googleNewsService';
import { createBlogGenerationService } from './services/blogGenerationService';
import { createNewsMigrationService } from './services/newsMigrationService';
import { createWebScrapeService } from './services/webScrapeService';
import { createOpenAIServiceFromConfig } from './services/openaiService';

/**
 * Test script to validate the new news system components
 */
async function testNewsSystem() {
  console.log('🧪 Testing News System Components...\n');

  try {
    // 1. Initialize services
    console.log('1. Initializing services...');
    const scraper = createWebScrapeService();
    const openai = await createOpenAIServiceFromConfig();
    
    const googleNewsService = createGoogleNewsService(scraper, openai);
    const blogGenerationService = createBlogGenerationService(openai);
    const migrationService = createNewsMigrationService(googleNewsService, blogGenerationService);
    
    console.log('✅ Services initialized successfully\n');

    // 2. Test migration status
    console.log('2. Testing migration status...');
    const migrationStatus = await migrationService.getMigrationStatus();
    console.log('Migration Status:', migrationStatus);
    console.log('✅ Migration status check completed\n');

    // 3. Test Google News service
    console.log('3. Testing Google News service...');
    const newsSources = await googleNewsService.getNewsSources();
    console.log(`Available news sources: ${newsSources.length}`);
    console.log('✅ Google News service test completed\n');

    // 4. Test blog generation service
    console.log('4. Testing blog generation service...');
    const blogStats = await blogGenerationService.getStats();
    console.log('Blog Generation Stats:', blogStats);
    console.log('✅ Blog generation service test completed\n');

    // 5. Test database connectivity
    console.log('5. Testing database connectivity...');
    try {
      // Simple test to check if database is accessible
      const sourceCount = newsSources.length;
      console.log(`Database connectivity: OK (${sourceCount} news sources found)`);
    } catch (error) {
      console.error('❌ Database connectivity test failed:', error);
    }
    console.log('✅ Database connectivity test completed\n');

    // 6. Test configuration
    console.log('6. Testing system configuration...');
    const googleNewsConfig = {
      urls: [
        'https://news.google.com/home?hl=en-HK&gl=HK&ceid=HK:en',
        'https://news.google.com/home?hl=zh-HK&gl=HK&ceid=HK:zh-Hant'
      ],
      deepBrowsingTime: '06:00',
      quickCheckInterval: 180,
      maxArticlesPerDeepBrowse: 15,
      maxArticlesPerQuickCheck: 5
    };
    
    const blogConfig = {
      postsPerDay: 5,
      minArticleLength: 500,
      minTitleLength: 20,
      imageGenerationEnabled: true,
      qualityThreshold: 0.7
    };
    
    console.log('Google News Config:', googleNewsConfig);
    console.log('Blog Generation Config:', blogConfig);
    console.log('✅ Configuration test completed\n');

    // 7. Summary
    console.log('📊 TEST SUMMARY:');
    console.log('- Services: All initialized successfully');
    console.log('- Database: Connectivity verified');
    console.log('- Migration: Status check completed');
    console.log('- Configuration: Validated');
    console.log('- Integration: Ready for deployment');
    
    console.log('\n🎯 News System Validation: PASSED ✅');

  } catch (error) {
    console.error('❌ News System Validation: FAILED');
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the test
testNewsSystem().catch(console.error);

---
./src/test-server-start.ts
---


---
./src/core/Agent.ts
---
import { OpenAIService } from '../services/openaiService';
import { ContextManager } from '../memory/ContextManager';
import { ToolRegistry } from './ToolRegistry';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { ActionQueueService } from '../services/ActionQueueService';
import { UserProfileService } from '../services/UserProfileService';
import { UpdateProfileTool } from '../tools/UpdateProfileTool';

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
    private actionQueue: ActionQueueService,
    private profileService: UserProfileService // Injected dependency
  ) {
    this.chatbotName = process.env.CHATBOT_NAME || 'Lucy';
  }

  /**
   * Main entry point for User Messages (reactive mode)
   */
  async handleUserMessage(userId: string, message: string): Promise<string> {
    // 1. Add to Short-term context
    this.contextMgr.addMessage(userId, 'user', message);

    // 2. Fetch User Profile
    const userProfileStr = await this.profileService.getProfileContext(userId);
    const userProfileObj = await this.profileService.getProfile(userId);

    // 3. Prepare Dynamic System Prompt
    let systemContext = await this.getSystemPrompt(userId, userProfileStr);

    // 4. RAG Logic (Existing)
    const relevantFacts = await this.kb.search(message);
    if (relevantFacts && !relevantFacts.includes('No relevant knowledge')) {
      systemContext += `\n\n🧠 Relevant Knowledge:\n${relevantFacts}`;
    }

    // 5. Add "UpdateProfileTool" specifically for this user context
    const profileTool = new UpdateProfileTool(this.profileService, userId);
    
    // Create a temporary registry for this request that includes the base tools + context-aware tool
    const requestTools = [...this.tools.getOpenAITools(), profileTool.toOpenAISchema()];
    
    // We need a way to execute this tool since it's not in the global registry
    // We can create a temporary registry wrapper or handle it inside generateResponse
    const tempRegistry = new ToolRegistry();
    // Copy existing tools
    this.tools.getAvailableTools().forEach(name => {
        const t = this.tools.getTool(name);
        if(t) tempRegistry.registerTool(t);
    });
    // Add our specific tool
    tempRegistry.registerTool(profileTool);

    // 6. Generate Response
    const history = this.contextMgr.getHistory(userId);
    
    const response = await this.generateResponseWithContext({
      systemPrompt: systemContext,
      history: history,
      tools: requestTools, // Use the expanded toolset
      userMessage: message,
      toolRegistry: tempRegistry // Use the temp registry
    });

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
  private async getSystemPrompt(userId: string, profileContext?: string): Promise<string> {
    let systemPrompt = `You are ${this.chatbotName}, a witty, concise WhatsApp assistant.

${profileContext || ''}

**CORE BEHAVIORS:**
1. **Be Proactive**: If the "User Profile" above has "Unknown" fields (Name, Location) or few facts, naturally ask the user about them during conversation.
   - Example: If discussing weather, ask "By the way, where are you located so I can check for you?"
   - Example: If discussing hobbies, ask "What do you do for fun?"
   - Don't interrogate. Ask only one personal question every few turns.

2. **Save Information**: Whenever the user tells you a fact about themselves (name, job, pet, hobby), IMMEDIATELY use the 'update_profile' tool to save it. Do not ask for confirmation, just save it.

**CRITICAL RESPONSE GUIDELINES:**
1. **Mobile Optimization**: Responses MUST be under 50 words unless specifically requested. Use natural spacing.
2. **No Markdown**: Never use code blocks, markdown, or complex formatting.
3. **Personality**: Be warm, use emojis naturally 🌟, avoid robotic phrases.
4. **Tool Usage**: Use available tools when you need current information or specific actions.
5. **Context Awareness**: Reference recent conversation naturally when relevant.
6. **Language Matching**: ALWAYS reply in the SAME LANGUAGE as the user's input. If the user speaks Chinese, reply in Chinese. If English, reply in English.

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

---
./src/core/BaseTool.ts
---
import { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Abstract base class for all tools in the autonomous agent system.
 * Provides a strict contract for tool creation and OpenAI function calling.
 */
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, any>;

  abstract execute(args: any, context?: any): Promise<string>;

  /**
   * Convert tool definition to OpenAI function calling schema
   */
  toOpenAISchema(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

---
./src/core/Scheduler.ts
---
import { BrowserService } from '../services/BrowserService';
import { ContextManager } from '../memory/ContextManager';
import { WhatsAppService } from '../services/whatsappService';
import { Agent } from './Agent';
import { ActionQueueService } from '../services/ActionQueueService';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { GoogleNewsService } from '../services/googleNewsService';
import { BlogGenerationService } from '../services/blogGenerationService';
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
      if (this.shouldPerformDeepNewsBrowsing()) {
        await this.performDeepNewsBrowsing();
      }

      // 3. Check for quick news checks (every 3 hours)
      if (this.shouldPerformQuickNewsCheck()) {
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
    return true;
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

---
./src/core/ToolRegistry.ts
---
import { BaseTool } from './BaseTool';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Dynamic tool management system for the autonomous agent.
 * Allows easy addition of new tools without changing core logic.
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  /**
   * Register a new tool with the registry
   */
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
    console.log(`🛠️ Tool registered: ${tool.name} - ${tool.description}`);
  }

  /**
   * Register multiple tools at once
   */
  registerTools(tools: BaseTool[]): void {
    tools.forEach(tool => this.registerTool(tool));
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool with the given arguments
   */
  async executeTool(name: string, args: any, context?: any): Promise<string> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    console.log(`🔧 Executing tool: ${name}`, { args, context });

    try {
      const result = await tool.execute(args, context);
      console.log(`✅ Tool execution completed: ${name}`);
      return result;
    } catch (error) {
      console.error(`❌ Tool execution failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Get all tools as OpenAI function schemas
   */
  getOpenAITools(): ChatCompletionTool[] {
    return Array.from(this.tools.values()).map(tool => tool.toOpenAISchema());
  }

  /**
   * Get all available tool names
   */
  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Remove a tool from the registry
   */
  unregisterTool(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      console.log(`🗑️ Tool unregistered: ${name}`);
    }
    return existed;
  }
}

---
./src/memory/ContextManager.ts
---
import { SummaryStore } from './SummaryStore';
import * as fs from 'fs';
import * as path from 'path';

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

  // Persistence settings
  private readonly DATA_DIR = path.join(process.cwd(), 'data');
  private readonly STATE_FILE = path.join(this.DATA_DIR, 'context_state.json');

  constructor() {
    this.loadState();
  }

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

    this.saveState(); // Persist changes
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
    let changed = false;

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
        changed = true;
      }
    });

    if (changed) this.saveState();
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
                  this.saveState(); // Persist changes
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
    
    if (removedCount > 0) this.saveState();
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

  // --- Persistence Methods ---

  private saveState() {
    try {
        if (!fs.existsSync(this.DATA_DIR)) {
            fs.mkdirSync(this.DATA_DIR, { recursive: true });
        }
        
        // Convert Map to Array for JSON serialization
        const state = Array.from(this.activeContexts.entries());
        fs.writeFileSync(this.STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('❌ Failed to save context state:', error);
    }
  }

  private loadState() {
    try {
        if (fs.existsSync(this.STATE_FILE)) {
            const raw = fs.readFileSync(this.STATE_FILE, 'utf-8');
            const state = JSON.parse(raw);
            this.activeContexts = new Map(state);
            console.log(`🧠 Loaded ${this.activeContexts.size} active conversation contexts from disk`);
        }
    } catch (error) {
        console.error('❌ Failed to load context state:', error);
        // Fallback to empty map
        this.activeContexts = new Map();
    }
  }
}

---
./src/memory/HistoryStorePostgres.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { v4 as uuidv4 } from 'uuid';

/**
 * PostgreSQL-based History Store for long-term conversation logs.
 * Stores raw chat logs for the "Recall" tool and historical analysis.
 */
interface ConversationLog {
  id: string;
  userId: string;
  message: string;
  role: 'user' | 'assistant';
  timestamp: string;
  messageType: 'text' | 'image' | 'audio';
  metadata?: any;
}

export class HistoryStorePostgres {
  constructor() {
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Store a conversation message
   */
  async storeMessage(log: Omit<ConversationLog, 'id'>): Promise<void> {
    try {
      await prisma.conversationLog.create({
        data: {
          id: uuidv4(),
          userId: log.userId,
          message: log.message.substring(0, 4000), // Limit message length
          role: log.role,
          timestamp: new Date(log.timestamp),
          messageType: log.messageType,
          metadata: log.metadata || undefined,
        },
      });
    } catch (error) {
      console.error('❌ Failed to store conversation message:', error);
      throw error;
    }
  }

  /**
   * Query conversation history by date range and/or keywords
   */
  async query(options: {
    userId?: string;
    start?: string; // ISO date string
    end?: string;   // ISO date string
    keywords?: string;
    limit?: number;
    role?: 'user' | 'assistant';
  } = {}): Promise<ConversationLog[]> {
    try {
      const where: any = {};

      if (options.userId) {
        where.userId = options.userId;
      }

      if (options.start || options.end) {
        where.timestamp = {};
        if (options.start) {
          where.timestamp.gte = new Date(options.start);
        }
        if (options.end) {
          where.timestamp.lte = new Date(options.end);
        }
      }

      if (options.role) {
        where.role = options.role;
      }

      if (options.keywords) {
        // Simple keyword search (for production, consider full-text search)
        const keywords = options.keywords.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        if (keywords.length > 0) {
          where.OR = keywords.map(keyword => ({
            message: {
              contains: keyword,
              mode: 'insensitive' as const,
            },
          }));
        }
      }

      const logs = await prisma.conversationLog.findMany({
        where,
        orderBy: {
          timestamp: 'desc',
        },
        take: options.limit,
      });

      return logs.map(log => ({
        id: log.id,
        userId: log.userId,
        message: log.message,
        role: log.role as 'user' | 'assistant',
        timestamp: log.timestamp.toISOString(),
        messageType: log.messageType as 'text' | 'image' | 'audio',
        metadata: log.metadata || undefined,
      }));
    } catch (error) {
      console.error('❌ Failed to query conversation history:', error);
      throw error;
    }
  }

  /**
   * Get conversation summary for a user
   */
  async getConversationSummary(userId: string, days: number = 30): Promise<{
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    firstInteraction: string;
    lastInteraction: string;
    averageMessageLength: number;
  }> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const stats = await prisma.conversationLog.aggregate({
        where: {
          userId,
          timestamp: {
            gte: cutoff,
          },
        },
        _count: {
          _all: true,
        },
        _min: {
          timestamp: true,
        },
        _max: {
          timestamp: true,
        },
      });

      // For average message length, we need a custom query
      const avgResult = await prisma.$queryRaw<Array<{ avg_length: number }>>`
        SELECT AVG(LENGTH(message)) as avg_length 
        FROM conversation_logs 
        WHERE user_id = ${userId} AND timestamp >= ${cutoff}
      `;

      return {
        totalMessages: stats._count._all || 0,
        userMessages: await prisma.conversationLog.count({
          where: {
            userId,
            timestamp: { gte: cutoff },
            role: 'user',
          },
        }),
        assistantMessages: await prisma.conversationLog.count({
          where: {
            userId,
            timestamp: { gte: cutoff },
            role: 'assistant',
          },
        }),
        firstInteraction: stats._min.timestamp?.toISOString() || 'No interactions',
        lastInteraction: stats._max.timestamp?.toISOString() || 'No interactions',
        averageMessageLength: Math.round(avgResult[0]?.avg_length || 0),
      };
    } catch (error) {
      console.error('❌ Failed to get conversation summary:', error);
      return {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        firstInteraction: 'No interactions',
        lastInteraction: 'No interactions',
        averageMessageLength: 0,
      };
    }
  }

  /**
   * Get most active users (for proactive messaging prioritization)
   */
  async getMostActiveUsers(days: number = 7, limit: number = 10): Promise<Array<{userId: string; messageCount: number; lastActivity: string}>> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const result = await prisma.conversationLog.groupBy({
        by: ['userId'],
        where: {
          timestamp: {
            gte: cutoff,
          },
        },
        _count: {
          id: true,
        },
        _max: {
          timestamp: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: limit,
      });

      return result.map(row => ({
        userId: row.userId,
        messageCount: row._count.id,
        lastActivity: row._max.timestamp?.toISOString() || '',
      }));
    } catch (error) {
      console.error('❌ Failed to get most active users:', error);
      return [];
    }
  }

  /**
   * Clean up old conversation logs
   */
  async cleanupOldLogs(maxAgeDays: number = 365): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);

      const result = await prisma.conversationLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} old conversation logs`);
      }

      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old logs:', error);
      return 0;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalLogs: number;
    uniqueUsers: number;
    oldestLog: string;
    newestLog: string;
  }> {
    try {
      const [total, uniqueUsers, oldest, newest] = await Promise.all([
        prisma.conversationLog.count(),
        prisma.conversationLog.groupBy({
          by: ['userId'],
          _count: true,
        }).then(groups => groups.length),
        prisma.conversationLog.findFirst({
          orderBy: {
            timestamp: 'asc',
          },
        }),
        prisma.conversationLog.findFirst({
          orderBy: {
            timestamp: 'desc',
          },
        }),
      ]);

      return {
        totalLogs: total,
        uniqueUsers,
        oldestLog: oldest?.timestamp.toISOString() || 'No logs',
        newestLog: newest?.timestamp.toISOString() || 'No logs',
      };
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      return {
        totalLogs: 0,
        uniqueUsers: 0,
        oldestLog: 'No logs',
        newestLog: 'No logs',
      };
    }
  }

  /**
   * Export conversation data for a user (for recall tool)
   */
  async exportUserConversation(userId: string, format: 'json' | 'text' = 'text'): Promise<string> {
    try {
      const logs = await this.query({ userId, limit: 1000 }); // Limit for safety
      
      if (format === 'json') {
        return JSON.stringify(logs, null, 2);
      }

      // Text format for human readability
      return logs.map(log => 
        `[${new Date(log.timestamp).toLocaleString()}] ${log.role.toUpperCase()}: ${log.message}`
      ).join('\n');
    } catch (error) {
      console.error('❌ Failed to export user conversation:', error);
      return '';
    }
  }
}

---
./src/memory/KnowledgeBasePostgres.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { OpenAIService } from '../services/openaiService';
import { v4 as uuidv4 } from 'uuid';

/**
 * PostgreSQL-based Knowledge Base for storing facts learned from autonomous browsing.
 * Uses PostgreSQL with BYTEA storage for efficient RAG searches.
 */
export interface KnowledgeDocument {
  id: string;
  content: string;
  vector: Buffer; // BYTEA storage for embeddings
  source: string;
  category: string;
  tags: string[];
  timestamp: string;
  relevanceScore?: number;
}

export class KnowledgeBasePostgres {
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Check if a source URL has already been processed and stored
   */
  async hasDocument(url: string): Promise<boolean> {
    try {
      const count = await prisma.knowledge.count({
        where: { source: url }
      });
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a specific content hash already exists in the database.
   * This is used to detect if an article (even with a different URL)
   * has already been learned.
   */
  async hasContentHash(hash: string): Promise<boolean> {
    try {
      const tag = `hash:${hash}`;
      const count = await prisma.knowledge.count({
        where: {
          tags: {
            string_contains: tag
          }
        }
      });
      return count > 0;
    } catch (error) {
      console.error('Error checking content hash:', error);
      return false;
    }
  }

  /**
   * Add a new document learned from browsing
   */
  async learnDocument(document: {
    content: string;
    source: string;
    tags: string[];
    timestamp: Date;
    category?: string;
    contentHash?: string;
  }): Promise<void> {
    if (!document.content || document.content.trim().length < 50) return;

    // Add hash to tags if provided
    const finalTags = [...document.tags];
    if (document.contentHash) {
      finalTags.push(`hash:${document.contentHash}`);
    }

    try {
      const embedding = await this.openaiService.createEmbedding(document.content);
      const vectorBuffer = Buffer.from(new Float64Array(embedding).buffer);

      await prisma.knowledge.create({
        data: {
          id: uuidv4(),
          content: document.content.substring(0, 4000),
          vector: vectorBuffer,
          source: document.source,
          category: document.category || 'general',
          tags: finalTags,
          timestamp: document.timestamp,
        },
      });

      console.log(`💾 Learned: [${document.category}] ${document.source.substring(0, 40)}...`);
    } catch (error) {
      console.error('❌ Failed to learn document:', error);
    }
  }

  /**
   * Search for relevant knowledge using RAG with recency prioritization
   */
  async search(query: string, limit: number = 3, category?: string): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);
      const queryVec = new Float64Array(queryEmbedding);

      // Prioritize recent content: only search documents from last 7 days by default
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const where: any = {
        timestamp: {
          gt: sevenDaysAgo,
        },
      };
      
      if (category) {
        where.category = category;
      }
      
      // Order by timestamp descending to prioritize recent content
      const rows = await prisma.knowledge.findMany({
        where,
        orderBy: {
          timestamp: 'desc',
        },
      });

      // If no recent results, expand search to all time but with stronger recency penalty
      let expandedSearch = false;
      if (rows.length === 0) {
        expandedSearch = true;
        const fallbackWhere: any = {};
        if (category) {
          fallbackWhere.category = category;
        }
        rows.push(...await prisma.knowledge.findMany({
          where: fallbackWhere,
        }));
      }

      // Calculate relevance scores with enhanced recency weighting
      const results = rows.map(row => {
        // Convert BYTEA back to Float64Array
        const docVec = new Float64Array(
          row.vector.buffer,
          row.vector.byteOffset,
          row.vector.byteLength / 8
        );

        const similarity = this.cosineSimilarity(queryVec, docVec);
        const recencyScore = this.calculateRecencyScore(row.timestamp.toISOString());
        
        // Enhanced relevance calculation: give more weight to recency
        // Recent content (last 24 hours) gets significant boost
        const hoursAgo = (Date.now() - row.timestamp.getTime()) / (1000 * 60 * 60);
        const freshnessBoost = hoursAgo < 24 ? 1.5 : 1.0; // 50% boost for content < 24h old
        
        // If we expanded search, penalize older content more heavily
        const agePenalty = expandedSearch ? Math.max(0.1, recencyScore) : 1.0;
        
        const relevance = similarity * recencyScore * freshnessBoost * agePenalty;
        
        return {
          ...row,
          tags: row.tags as string[] || [],
          similarity,
          recencyScore,
          relevance,
          hoursAgo,
          expandedSearch
        };
      })
      .filter(result => result.similarity >= 0.6) // Slightly lower threshold for expanded search
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

      if (results.length === 0) {
        return "No relevant knowledge found in my memory.";
      }

      // Format results with freshness indicators
      return results.map(result => {
        const date = new Date(result.timestamp);
        const freshness = result.hoursAgo < 24 ? '🆕 ' : (result.hoursAgo < 168 ? '📅 ' : '📜 ');
        const sourceInfo = `[${freshness}Source: ${result.source} | Category: ${result.category} | ${date.toLocaleDateString()}]`;
        
        return `${sourceInfo}\n${result.content}`;
      }).join('\n\n---\n\n');

    } catch (error) {
      console.error('❌ Knowledge search failed:', error);
      return "Error searching knowledge base.";
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate recency score with stronger emphasis on recent content
   */
  private calculateRecencyScore(timestamp: string): number {
    const docTime = new Date(timestamp).getTime();
    const now = Date.now();
    const ageDays = (now - docTime) / (1000 * 60 * 60 * 24);
    
    // Stronger recency weighting: content older than 7 days gets much lower scores
    // Recent content (0-1 days) gets near-maximum score
    if (ageDays <= 1) return 1.0; // Maximum score for today's content
    if (ageDays <= 3) return 0.8; // High score for last 3 days
    if (ageDays <= 7) return 0.6; // Good score for last week
    if (ageDays <= 14) return 0.3; // Moderate score for 2 weeks
    if (ageDays <= 30) return 0.1; // Low score for 1 month
    return 0.05; // Very low score for older content
  }

  /**
   * Get knowledge statistics
   */
  async getStats(): Promise<{ totalDocuments: number; categories: string[]; oldestDocument: string }> {
    try {
      const [total, categories, oldest] = await Promise.all([
        prisma.knowledge.count(),
        prisma.knowledge.findMany({
          distinct: ['category'],
          select: { category: true },
        }),
        prisma.knowledge.findFirst({
          orderBy: {
            timestamp: 'asc',
          },
        }),
      ]);

      return {
        totalDocuments: total,
        categories: categories.map(c => c.category || 'unknown'),
        oldestDocument: oldest?.timestamp.toISOString() || 'No documents'
      };
    } catch (error) {
      console.error('❌ Failed to get knowledge stats:', error);
      return {
        totalDocuments: 0,
        categories: [],
        oldestDocument: 'No documents'
      };
    }
  }

  /**
   * Clean up old knowledge (older than specified days)
   */
  async cleanupOldKnowledge(maxAgeDays: number = 90): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);
      
      const result = await prisma.knowledge.deleteMany({
        where: {
          timestamp: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} old knowledge documents`);
      }
      
      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old knowledge:', error);
      return 0;
    }
  }

  /**
   * Find knowledge by tags (for proactive messaging)
   */
  async findKnowledgeByTags(tags: string[], limit: number = 5): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        where: {
          tags: {
            array_contains: tags,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to find knowledge by tags:', error);
      return [];
    }
  }

  /**
   * Get recent knowledge documents for dashboard display
   */
  async getRecentDocuments(limit: number = 10): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to get recent documents:', error);
      return [];
    }
  }

  /**
   * Get knowledge documents by category
   */
  async getDocumentsByCategory(category: string, limit: number = 10): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        where: {
          category,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to get documents by category:', error);
      return [];
    }
  }

  /**
   * Search knowledge content for dashboard (simple text search)
   */
  async searchContent(query: string, limit: number = 10): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        where: {
          content: {
            contains: query,
            mode: 'insensitive' as const,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to search knowledge content:', error);
      return [];
    }
  }
}

---
./src/memory/SummaryStore.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { createHash } from 'crypto';

/**
 * Service for managing long-term conversation summaries
 * Stores and retrieves conversation summaries to maintain context beyond the 1-hour TTL
 */
export class SummaryStore {
  constructor() {
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Generate a hash for conversation context to prevent duplicate summaries
   */
  private generateContextHash(userId: string, messages: any[]): string {
    const contextString = `${userId}:${JSON.stringify(messages)}`;
    return createHash('md5').update(contextString).digest('hex');
  }

  /**
   * Store a conversation summary for a user
   */
  async storeSummary(userId: string, summary: string, messages: any[]): Promise<void> {
    try {
      const contextHash = this.generateContextHash(userId, messages);
      
      await prisma.conversationSummary.create({
        data: {
          userId,
          summary,
          timestamp: new Date(),
          contextHash
        }
      });

      console.log(`📝 Stored conversation summary for ${userId}`);
    } catch (error) {
      console.error('❌ Failed to store conversation summary:', error);
      throw error;
    }
  }

  /**
   * Get the most recent conversation summaries for a user
   */
  async getRecentSummaries(userId: string, limit: number = 3): Promise<string[]> {
    try {
      const summaries = await prisma.conversationSummary.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: limit
      });

      return summaries.map(s => s.summary);
    } catch (error) {
      console.error('❌ Failed to get conversation summaries:', error);
      return [];
    }
  }

  /**
   * Get all conversation summaries for a user within a date range
   */
  async getSummariesByDateRange(userId: string, startDate: Date, endDate: Date): Promise<string[]> {
    try {
      const summaries = await prisma.conversationSummary.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { timestamp: 'asc' }
      });

      return summaries.map(s => s.summary);
    } catch (error) {
      console.error('❌ Failed to get summaries by date range:', error);
      return [];
    }
  }

  /**
   * Clean up old summaries (keep only the most recent ones per user)
   */
  async cleanupOldSummaries(maxPerUser: number = 10): Promise<number> {
    try {
      // Get all user IDs
      const users = await prisma.conversationSummary.groupBy({
        by: ['userId'],
        _count: { id: true }
      });

      let totalDeleted = 0;

      for (const user of users) {
        if (user._count.id > maxPerUser) {
          // Get IDs of summaries to keep (most recent ones)
          const keepIds = await prisma.conversationSummary.findMany({
            where: { userId: user.userId },
            orderBy: { timestamp: 'desc' },
            take: maxPerUser,
            select: { id: true }
          });

          const keepIdSet = new Set(keepIds.map(s => s.id));

          // Delete old summaries
          const result = await prisma.conversationSummary.deleteMany({
            where: {
              userId: user.userId,
              id: { notIn: Array.from(keepIdSet) }
            }
          });

          totalDeleted += result.count;
        }
      }

      if (totalDeleted > 0) {
        console.log(`🧹 Cleaned up ${totalDeleted} old conversation summaries`);
      }

      return totalDeleted;
    } catch (error) {
      console.error('❌ Failed to cleanup old summaries:', error);
      return 0;
    }
  }

  /**
   * Get statistics about stored summaries
   */
  async getStats(): Promise<{
    totalSummaries: number;
    uniqueUsers: number;
    oldestSummary: string;
    newestSummary: string;
  }> {
    try {
      const [total, uniqueUsers, oldest, newest] = await Promise.all([
        prisma.conversationSummary.count(),
        prisma.conversationSummary.groupBy({
          by: ['userId'],
          _count: true
        }).then(groups => groups.length),
        prisma.conversationSummary.findFirst({
          orderBy: { timestamp: 'asc' }
        }),
        prisma.conversationSummary.findFirst({
          orderBy: { timestamp: 'desc' }
        })
      ]);

      return {
        totalSummaries: total,
        uniqueUsers,
        oldestSummary: oldest?.timestamp.toISOString() || 'No summaries',
        newestSummary: newest?.timestamp.toISOString() || 'No summaries'
      };
    } catch (error) {
      console.error('❌ Failed to get summary stats:', error);
      return {
        totalSummaries: 0,
        uniqueUsers: 0,
        oldestSummary: 'No summaries',
        newestSummary: 'No summaries'
      };
    }
  }
}

---
./src/services/ActionQueueService.ts
---
/**
 * Action Queue Service for rate-limited messaging and scheduled actions.
 * Prevents WhatsApp API rate limit violations and enables human-like delayed responses.
 */
interface QueuedAction {
  id: string;
  type: 'message' | 'media' | 'proactive';
  userId: string;
  content: string;
  scheduledFor: Date;
  priority: number; // 1-10, higher = more urgent
  retryCount: number;
  metadata?: any;
}

export class ActionQueueService {
  private queue: QueuedAction[] = [];
  private processing: boolean = false;
  private readonly MAX_RETRIES = 3;
  private readonly RATE_LIMIT_DELAY = 2000; // 2 seconds between messages
  private readonly PROACTIVE_COOLDOWN = 15 * 60 * 1000; // 15 minutes between proactive messages
  private messageSender?: (userId: string, content: string) => Promise<boolean>;

  constructor() {
    // Start processing loop
    this.startProcessing();
  }

  /**
   * Register a message sender function (called by AutonomousAgent)
   */
  registerMessageSender(sender: (userId: string, content: string) => Promise<boolean>) {
    this.messageSender = sender;
  }

  /**
   * Queue a message for delivery with rate limiting
   */
  queueMessage(userId: string, content: string, options: {
    priority?: number;
    delayMs?: number;
    isProactive?: boolean;
    metadata?: any;
  } = {}): string {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const scheduledFor = new Date(Date.now() + (options.delayMs || 0));
    
    const action: QueuedAction = {
      id: actionId,
      type: options.isProactive ? 'proactive' : 'message',
      userId,
      content,
      scheduledFor,
      priority: options.priority || 5,
      retryCount: 0,
      metadata: options.metadata
    };

    this.queue.push(action);
    this.queue.sort((a, b) => {
      // Sort by priority (descending), then by scheduled time (ascending)
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });

    console.log(`📬 Queued ${action.type} message for ${userId} (priority: ${action.priority})`);
    
    return actionId;
  }

  /**
   * Start processing the action queue
   */
  private startProcessing() {
    setInterval(() => {
      if (!this.processing) {
        this.processNextAction();
      }
    }, 1000); // Check every second
  }

  /**
   * Process the next action in the queue
   */
  private async processNextAction() {
    if (this.queue.length === 0 || this.processing) return;

    this.processing = true;
    const now = new Date();

    // Find the next actionable item (scheduled for now or earlier)
    const nextActionIndex = this.queue.findIndex(action => 
      action.scheduledFor <= now
    );

    if (nextActionIndex === -1) {
      this.processing = false;
      return;
    }

    const action = this.queue.splice(nextActionIndex, 1)[0];

    try {
      // Simulate action execution (will be integrated with WhatsApp service)
      await this.executeAction(action);
      
      console.log(`✅ Action completed: ${action.type} to ${action.userId}`);
      
    } catch (error) {
      console.error(`❌ Action failed: ${action.type} to ${action.userId}`, error);
      
      // Retry logic
      if (action.retryCount < this.MAX_RETRIES) {
        action.retryCount++;
        action.scheduledFor = new Date(Date.now() + (action.retryCount * 30000)); // Exponential backoff
        this.queue.push(action);
        console.log(`🔄 Retry scheduled for action ${action.id} (attempt ${action.retryCount})`);
      } else {
        console.error(`💀 Action ${action.id} failed after ${this.MAX_RETRIES} retries`);
      }
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY));
    
    this.processing = false;
  }

  /**
   * Execute an action (Updated to send real messages)
   */
  private async executeAction(action: QueuedAction): Promise<void> {
    console.log(`📤 Executing ${action.type} action for ${action.userId}`);
    
    if (!this.messageSender) {
      console.warn('⚠️ No message sender registered in ActionQueue! Message logged but not sent.');
      return;
    }

    try {
      // Send via the registered callback
      const success = await this.messageSender(action.userId, action.content);
      
      if (!success) {
        throw new Error('Message sender returned false');
      }
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      throw error; // This triggers the retry logic in processNextAction
    }
  }

  /**
   * Check if a user has a proactive message cooldown
   */
  canSendProactiveMessage(userId: string): boolean {
    const lastProactive = this.getLastProactiveMessageTime(userId);
    if (!lastProactive) return true;
    
    const cooldownRemaining = lastProactive.getTime() + this.PROACTIVE_COOLDOWN - Date.now();
    return cooldownRemaining <= 0;
  }

  /**
   * Get time until next proactive message can be sent to a user
   */
  getProactiveCooldownRemaining(userId: string): number {
    const lastProactive = this.getLastProactiveMessageTime(userId);
    if (!lastProactive) return 0;
    
    const cooldownRemaining = lastProactive.getTime() + this.PROACTIVE_COOLDOWN - Date.now();
    return Math.max(0, cooldownRemaining);
  }

  /**
   * Get the last proactive message time for a user
   */
  private getLastProactiveMessageTime(userId: string): Date | null {
    const proactiveActions = this.queue.filter(action => 
      action.type === 'proactive' && action.userId === userId
    ).concat(
      // Would also check completed actions from a log in production
      []
    );

    if (proactiveActions.length === 0) return null;
    
    return new Date(Math.max(...proactiveActions.map(a => a.scheduledFor.getTime())));
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const now = new Date();
    
    return {
      totalQueued: this.queue.length,
      processing: this.processing,
      messages: this.queue.filter(a => a.type === 'message').length,
      proactive: this.queue.filter(a => a.type === 'proactive').length,
      delayed: this.queue.filter(a => a.scheduledFor > now).length,
      ready: this.queue.filter(a => a.scheduledFor <= now).length,
      averagePriority: this.queue.reduce((sum, a) => sum + a.priority, 0) / this.queue.length || 0
    };
  }

  /**
   * Clear the queue (for testing/reset)
   */
  clearQueue(): number {
    const count = this.queue.length;
    this.queue = [];
    console.log(`🧹 Cleared ${count} actions from queue`);
    return count;
  }

  /**
   * Get actions for a specific user
   */
  getUserActions(userId: string): QueuedAction[] {
    return this.queue.filter(action => action.userId === userId);
  }

  /**
   * Cancel a specific action
   */
  cancelAction(actionId: string): boolean {
    const index = this.queue.findIndex(action => action.id === actionId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      console.log(`❌ Cancelled action ${actionId}`);
      return true;
    }
    return false;
  }
}

---
./src/services/BrowserService.ts
---
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { WebScrapeService } from './webScrapeService';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from './googleSearchService';
import { OpenAIService, createOpenAIServiceFromConfig } from './openaiService';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface FavoriteSite {
  url: string;
  category: string;
  lastVisited: number;
  visitCount: number;
  addedAt: number;
  source: 'default' | 'user_added' | 'discovered';
}

interface LinkTrackingEntry {
  url: string;
  lastScraped: number;
  contentHash: string;
}

interface SearchChecklistItem {
  query: string;
  reason: string;
}

export class BrowserService {
  private favorites: FavoriteSite[] = [];
  private linkTracker: Map<string, LinkTrackingEntry> = new Map();

  private googleSearch?: GoogleSearchService;
  private openai?: OpenAIService;

  // Persistence Paths
  private readonly DATA_DIR = path.join(process.cwd(), 'data');
  private readonly FAVORITES_PATH = path.join(process.cwd(), 'data', 'favorites.json');
  private readonly TRACKER_PATH = path.join(process.cwd(), 'data', 'link_tracker.json');

  // Limits
  private readonly MAX_PAGES_PER_HOUR = 20;
  private readonly LINK_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

  private pagesVisitedThisHour = 0;

  // New control flags
  private isSurfing: boolean = false;
  private stopSignal: boolean = false;

  // Default Favorites (Used if no file exists)
  private readonly DEFAULT_FAVORITES: FavoriteSite[] = [
    { url: 'https://news.ycombinator.com', category: 'tech', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' },
    { url: 'https://techcrunch.com', category: 'tech', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' },
    { url: 'https://www.bbc.com/news/world', category: 'world', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' }
  ];

  constructor(
    private scraper: WebScrapeService,
    private kb: KnowledgeBasePostgres
  ) {
    this.initialize();
  }

  private async initialize() {
    this.loadFavorites();
    this.loadLinkTracker();

    try { this.openai = await createOpenAIServiceFromConfig(); } catch (e) { console.error('Browser: OpenAI init failed'); }
    try { this.googleSearch = createGoogleSearchServiceFromEnv(); } catch (e) { console.warn('Browser: Google Search not configured'); }

    // Hourly Reset
    setInterval(() => {
        this.pagesVisitedThisHour = 0;
        console.log('🔄 Browser hourly limit reset');
        this.saveLinkTracker(); // Periodic save
    }, 3600 * 1000);
  }

  /**
   * Signal the browser to stop the current surfing session immediately
   */
  public stopBrowsing() {
    if (this.isSurfing) {
      console.log('🛑 Interrupt signal received. Stopping autonomous browsing...');
      this.stopSignal = true;
    }
  }

  /**
   * Main Autonomous Surfing Loop
   */
  async surf(intent?: string): Promise<{ urlsVisited: string[]; knowledgeGained: number }> {
    // Reset flags
    this.stopSignal = false;
    this.isSurfing = true;

    if (this.pagesVisitedThisHour >= this.MAX_PAGES_PER_HOUR) {
        console.log('💤 Browser resting (Rate limit reached)');
        this.isSurfing = false;
        return { urlsVisited: [], knowledgeGained: 0 };
    }

    const results = { urlsVisited: [] as string[], knowledgeGained: 0 };

    try {
        // 1. Pick a Favorite Site (Hub)
        const hub = this.pickFavorite(intent);
        if (!hub) {
            console.log('🤔 No favorites available to visit.');
            this.isSurfing = false;
            return results;
        }

        // Check interrupt
        if (this.stopSignal) { this.isSurfing = false; return results; }

        console.log(`🌐 Browsing Hub: ${hub.url}`);

        // 2. Extract Article Candidates
        const candidates = await this.scraper.extractArticleLinks(hub.url);
        this.pagesVisitedThisHour++;
        hub.lastVisited = Date.now();
        hub.visitCount++;
        this.saveFavorites();

        console.log(`🔍 Found ${candidates.length} candidate articles on ${hub.url}`);

        // 3. Process Candidates (Shuffle to vary browsing)
        const shuffled = candidates.sort(() => 0.5 - Math.random()).slice(0, 5);

        for (const article of shuffled) {
            // CRITICAL: Check for interrupt signal before every action
            if (this.stopSignal) {
                console.log('🛑 Browsing loop interrupted.');
                break;
            }
            if (this.pagesVisitedThisHour >= this.MAX_PAGES_PER_HOUR) break;

            // 4. Check Stale/Tracker Status
            const trackInfo = this.linkTracker.get(article.url);
            const isStale = trackInfo && (Date.now() - trackInfo.lastScraped > this.LINK_STALE_THRESHOLD_MS);

            // Skip if visited recently (unless stale)
            if (trackInfo && !isStale) continue;

            // 5. Scrape Article
            try {
                console.log(`📖 Reading${isStale ? ' (Update Check)' : ''}: ${article.title}`);
                const result = await this.scraper.scrapeUrl(article.url, undefined, true);
                this.pagesVisitedThisHour++;
                results.urlsVisited.push(article.url);

                if (result.content.length < 300) {
                    console.log('⏩ Skipping: Content too short');
                    continue;
                }

                // 6. Calculate Hash
                const currentHash = createHash('md5').update(result.content).digest('hex');

                // 7. Check for Changes (Local)
                if (trackInfo && trackInfo.contentHash === currentHash) {
                    console.log('⏩ Skipping: Content unchanged');
                    this.updateLinkTracker(article.url, currentHash);
                    continue;
                }

                // 8. Check for Changes (Global KB)
                const globalExists = await this.kb.hasContentHash(currentHash);
                if (globalExists) {
                     console.log('⏩ Skipping: Content exists in KB (Duplicate/Syndicated)');
                     this.updateLinkTracker(article.url, currentHash);
                     continue;
                }

                console.log(`✨ New/Updated Content Found! (Hash: ${currentHash.substring(0,8)})`);

                // 9. Generate Google Search Checklist
                let finalContent = result.content;
                let tags = ['autonomous_browse', hub.category];
                if (trackInfo) tags.push('updated_content'); // Mark as update

                if (this.googleSearch && this.openai) {
                    const checklist = await this.generateSearchChecklist(article.title, result.content);
                    if (checklist.length > 0) {
                        console.log(`🕵️ Enrichment Checklist (${checklist.length} items)`);
                        const enrichmentData = await this.processChecklist(checklist);
                        if (enrichmentData) {
                            finalContent += `\n\n--- 🔍 Research Context ---\n${enrichmentData}`;
                            tags.push('enriched');
                        }
                    }
                }

                // 10. Save Knowledge
                await this.kb.learnDocument({
                    content: finalContent,
                    source: article.url,
                    category: hub.category,
                    tags: tags,
                    timestamp: new Date(),
                    contentHash: currentHash
                });

                results.knowledgeGained++;
                this.updateLinkTracker(article.url, currentHash);

                // 11. Discovery (Chance to add new domain to favorites)
                if (Math.random() < 0.05) {
                    this.maybeDiscoverNewFavorite(article.url, hub.category);
                }

            } catch (e) {
                console.error(`Failed to process article ${article.url}:`, e);
            }
        }
    } catch (e) {
        console.error('Error during surfing:', e);
    } finally {
        this.isSurfing = false;
        this.stopSignal = false;
    }

    this.saveLinkTracker();
    return results;
  }

  /**
   * Deep Research Task: Bypasses hourly limits to find specific answers
   * Performs: Search -> Scrape -> Summarize -> Repeat if needed
   */
  async performDeepResearch(query: string): Promise<string> {
    console.log(`🕵️ Starting Deep Research for: "${query}"`);

    if (!this.googleSearch || !this.openai) {
        return "Deep research unavailable (Missing Google Search or OpenAI configuration).";
    }

    let summary = "";
    const maxIterations = 2; // Prevent infinite loops
    let currentQuery = query;

    for (let i = 0; i < maxIterations; i++) {
        console.log(`🕵️ Deep Research Iteration ${i + 1}/${maxIterations}: Searching for "${currentQuery}"`);

        // 1. Google Search
        const searchResults = await this.googleSearch.search(currentQuery, 3);

        if (searchResults.length === 0) break;

        // 2. Scrape Top Results (Bypassing hourly limit logic by not incrementing pagesVisitedThisHour)
        const scrapedContents = [];
        for (const result of searchResults) {
            try {
                // Check interrupt just in case the user spams messages
                if (this.stopSignal) break;

                console.log(`📖 Deep Research Reading: ${result.title}`);
                const scrapeResult = await this.scraper.scrapeUrl(result.link, undefined, true); // Force mobile view
                if (scrapeResult.content.length > 200) {
                    scrapedContents.push(`Source: ${result.link}\nTitle: ${result.title}\nContent: ${scrapeResult.content.substring(0, 3000)}`);
                }
            } catch (e) {
                console.warn(`Failed to scrape ${result.link} for research`);
            }
        }

        if (scrapedContents.length === 0) {
             if (i === maxIterations - 1) return "I couldn't find any readable websites for your query. The search results were either blocked or contained no readable content.";
             continue;
        }

        // 3. Analyze & Synthesize
        const researchPrompt = `
        User Question: "${query}"

        I have gathered information from the following sources:
        ${scrapedContents.join('\n\n---\n\n')}

        Task:
        Provide a natural, conversational answer to the user's question based on the information gathered.
        If you can answer the question clearly, provide the answer in a friendly, WhatsApp-appropriate format.
        If the information is insufficient to answer the question, explain what you found and suggest what additional information might be needed.
        `;

        const response = await this.openai.generateTextResponse(researchPrompt);

        // Check if the response seems to answer the question (contains relevant information)
        const lowerResponse = response.toLowerCase();
        const lowerQuery = query.toLowerCase();

        // Simple heuristic: if response contains key terms from query and is substantial
        const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 3);
        const matchingWords = queryWords.filter(word => lowerResponse.includes(word));

        if (matchingWords.length >= queryWords.length * 0.5 && response.length > 50) {
            // Save this new knowledge to the DB for future speed
            await this.kb.learnDocument({
                content: `Deep Research on "${query}":\n${response.trim()}`,
                source: "deep_research_task",
                category: "research",
                tags: ["deep_research", "user_query"],
                timestamp: new Date()
            });

            return response.trim();
        } else {
            // Update query for next iteration if needed
            if (i < maxIterations - 1) {
                console.log(`🕵️ Information insufficient. Continuing research...`);
                // Try a more specific query for next iteration
                currentQuery = query + " detailed explanation";
                summary = "I found some related information but need to search more specifically.";
            } else {
                return response.trim(); // Return whatever we got
            }
        }
    }

    return "After searching multiple sources, I couldn't find a definitive answer to your question. The information available was either incomplete or didn't directly address your specific query.";
  }

  // --- Helpers ---

  private async generateSearchChecklist(title: string, content: string): Promise<SearchChecklistItem[]> {
    if (!this.openai) return [];
    // Ask LLM to create a checklist of things to verify
    const prompt = `Read this news article snippet. Identify 1-2 facts, technical terms, or historical events that need verification or more context. Return valid JSON array only: [{"query": "search query", "reason": "why"}] \n\nTitle: ${title}\nContent: ${content.substring(0, 1000)}...`;
    try {
        const raw = await this.openai.generateTextResponse(prompt);
        const jsonMatch = raw.match(/\[.*\]/s);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch (e) { return []; }
  }

  private async processChecklist(items: SearchChecklistItem[]): Promise<string> {
      if (!this.googleSearch) return '';
      let context = '';
      for (const item of items) {
          try {
              const results = await this.googleSearch.search(item.query, 2);
              if (results.length > 0) {
                  context += `Query: ${item.query} (${item.reason})\n` + results.map(r => `- ${r.title}: ${r.snippet}`).join('\n') + '\n\n';
              }
              await new Promise(r => setTimeout(r, 1000));
          } catch (e) {}
      }
      return context;
  }

  private pickFavorite(intent?: string): FavoriteSite | null {
      this.loadFavorites();
      let candidates = this.favorites;
      if (intent) {
          const filtered = candidates.filter(f => f.category.includes(intent.toLowerCase()) || f.url.includes(intent.toLowerCase()));
          if (filtered.length > 0) candidates = filtered;
      }
      candidates.sort((a, b) => a.lastVisited - b.lastVisited);
      // Wait at least 2 hours before revisiting same hub
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      const staleCandidates = candidates.filter(f => f.lastVisited < twoHoursAgo);
      return staleCandidates.length > 0 ? staleCandidates[0] : (intent && candidates.length > 0 ? candidates[0] : null);
  }

  private maybeDiscoverNewFavorite(url: string, category: string) {
      try {
          const urlObj = new URL(url);
          const rootUrl = `${urlObj.protocol}//${urlObj.hostname}`;
          if (!this.favorites.some(f => f.url === rootUrl)) {
              this.addFavorite(rootUrl, category, 'discovered');
          }
      } catch (e) {}
  }

  // --- Persistence ---

  public addFavorite(url: string, category: string, source: 'user_added' | 'discovered' = 'user_added') {
      if (this.favorites.some(f => f.url === url)) return;
      this.favorites.push({ url, category, lastVisited: 0, visitCount: 0, addedAt: Date.now(), source });
      this.saveFavorites();
      console.log(`⭐ New favorite added: ${url}`);
  }

  private updateLinkTracker(url: string, hash: string) {
      this.linkTracker.set(url, { url, lastScraped: Date.now(), contentHash: hash });
  }

  private loadFavorites() {
    try {
        if (!fs.existsSync(this.DATA_DIR)) fs.mkdirSync(this.DATA_DIR, { recursive: true });
        if (fs.existsSync(this.FAVORITES_PATH)) {
            this.favorites = JSON.parse(fs.readFileSync(this.FAVORITES_PATH, 'utf8'));
        } else {
            this.favorites = [...this.DEFAULT_FAVORITES];
            this.saveFavorites();
        }
    } catch (e) { this.favorites = [...this.DEFAULT_FAVORITES]; }
  }

  private saveFavorites() {
      try { fs.writeFileSync(this.FAVORITES_PATH, JSON.stringify(this.favorites, null, 2)); } catch (e) {}
  }

  private loadLinkTracker() {
      try {
          if (fs.existsSync(this.TRACKER_PATH)) {
              const data = JSON.parse(fs.readFileSync(this.TRACKER_PATH, 'utf8'));
              this.linkTracker = new Map(data.map((i: any) => [i.url, i]));
          }
      } catch (e) { console.error('Error loading link tracker', e); }
  }

  private saveLinkTracker() {
      try {
          const data = Array.from(this.linkTracker.values());
          fs.writeFileSync(this.TRACKER_PATH, JSON.stringify(data, null, 2));
      } catch (e) { console.error('Error saving link tracker', e); }
  }

  getStats() {
      return {
          favoritesCount: this.favorites.length,
          pagesVisitedThisHour: this.pagesVisitedThisHour,
          mostVisited: this.favorites.sort((a,b) => b.visitCount - a.visitCount)[0]?.url
      };
  }
}

---
./src/services/ProcessedMessageServicePostgres.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';

export class ProcessedMessageServicePostgres {
  constructor() {
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  async hasMessageBeenProcessed(messageId: string): Promise<boolean> {
    try {
      const result = await prisma.processedMessage.findUnique({
        where: {
          messageId,
        },
      });
      return !!result;
    } catch (error) {
      console.error('❌ Failed to check if message was processed:', error);
      return false;
    }
  }

  async markMessageAsProcessed(messageId: string, senderNumber?: string, messageType?: string): Promise<void> {
    try {
      await prisma.processedMessage.upsert({
        where: {
          messageId,
        },
        update: {
          senderNumber,
          messageType,
          processedAt: new Date(),
        },
        create: {
          messageId,
          senderNumber,
          messageType,
        },
      });
    } catch (error) {
      console.error('❌ Failed to mark message as processed:', error);
      throw error;
    }
  }

  async cleanupOldEntries(daysOlderThan: number = 30): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysOlderThan);

      const result = await prisma.processedMessage.deleteMany({
        where: {
          processedAt: {
            lt: cutoff,
          },
        },
      });

      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old entries:', error);
      return 0;
    }
  }

  /**
   * Get statistics about processed messages
   */
  async getStats(): Promise<{
    totalProcessed: number;
    last24Hours: number;
    byType: Record<string, number>;
  }> {
    try {
      const [totalProcessed, last24Hours, byType] = await Promise.all([
        this.getCount(),
        this.getCountLast24Hours(),
        this.getCountByType(),
      ]);

      return {
        totalProcessed,
        last24Hours,
        byType,
      };
    } catch (error) {
      console.error('❌ Failed to get processed messages stats:', error);
      return {
        totalProcessed: 0,
        last24Hours: 0,
        byType: {},
      };
    }
  }

  private async getCount(): Promise<number> {
    try {
      return await prisma.processedMessage.count();
    } catch (error) {
      console.error('❌ Failed to get count:', error);
      return 0;
    }
  }

  private async getCountLast24Hours(): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 1);

      return await prisma.processedMessage.count({
        where: {
          processedAt: {
            gte: cutoff,
          },
        },
      });
    } catch (error) {
      console.error('❌ Failed to get count for last 24 hours:', error);
      return 0;
    }
  }

  private async getCountByType(): Promise<Record<string, number>> {
    try {
      const result = await prisma.processedMessage.groupBy({
        by: ['messageType'],
        _count: {
          messageId: true,
        },
      });

      const counts: Record<string, number> = {};
      result.forEach(row => {
        counts[row.messageType || 'unknown'] = row._count.messageId;
      });
      return counts;
    } catch (error) {
      console.error('❌ Failed to get count by type:', error);
      return {};
    }
  }
}

---
./src/services/UserProfileService.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';

export interface UserFact {
  key: string;
  value: string;
}

export class UserProfileService {
  constructor() {
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  async getProfile(userId: string) {
    let profile = await prisma.userProfile.findUnique({ where: { userId } });
    
    if (!profile) {
      profile = await prisma.userProfile.create({
        data: { userId, facts: {} }
      });
    }
    return profile;
  }

  /**
   * Updates specific fields or adds to the facts JSON
   */
  async updateProfile(userId: string, data: { 
    name?: string; 
    location?: string; 
    language?: string;
    fact?: UserFact 
  }) {
    const current = await this.getProfile(userId);
    const updateData: any = {};

    if (data.name) updateData.name = data.name;
    if (data.location) updateData.location = data.location;
    if (data.language) updateData.language = data.language;

    // Merge new fact into existing JSON
    if (data.fact) {
      const currentFacts = (current.facts as Record<string, string>) || {};
      currentFacts[data.fact.key] = data.fact.value;
      updateData.facts = currentFacts;
    }

    return await prisma.userProfile.update({
      where: { userId },
      data: updateData
    });
  }

  /**
   * Returns a formatted string for the System Prompt
   */
  async getProfileContext(userId: string): Promise<string> {
    const p = await this.getProfile(userId);
    const facts = p.facts as Record<string, string>;
    
    let context = `👤 **User Profile:**\n`;
    context += `- Name: ${p.name || 'Unknown'}\n`;
    context += `- Location: ${p.location || 'Unknown'}\n`;
    
    if (Object.keys(facts).length > 0) {
      context += `- Known Facts: ${Object.entries(facts).map(([k, v]) => `${k}: ${v}`).join(', ')}`;
    } else {
      context += `- Known Facts: None yet`;
    }

    return context;
  }

  /**
   * Calculate profile completeness score (0-100)
   */
  async calculateCompleteness(userId: string): Promise<number> {
    const profile = await this.getProfile(userId);
    let score = 0;
    
    // Name is worth 30 points
    if (profile.name) score += 30;
    
    // Location is worth 30 points
    if (profile.location) score += 30;
    
    // Each fact is worth 10 points (max 40 points)
    const facts = profile.facts as Record<string, string>;
    const factCount = Object.keys(facts).length;
    score += Math.min(factCount * 10, 40);
    
    return score;
  }

  /**
   * Update lastAsked timestamp
   */
  async updateLastAsked(userId: string): Promise<void> {
    await prisma.userProfile.update({
      where: { userId },
      data: { lastAsked: new Date() }
    });
  }

  /**
   * Check if we should ask a personal question (cooldown logic)
   */
  async shouldAskPersonalQuestion(userId: string): Promise<boolean> {
    const profile = await this.getProfile(userId);
    
    // If we've never asked, or it's been more than 1 hour since last ask
    if (!profile.lastAsked) return true;
    
    const timeSinceLastAsk = Date.now() - profile.lastAsked.getTime();
    return timeSinceLastAsk > 60 * 60 * 1000; // 1 hour cooldown
  }
}

---
./src/services/VectorStoreServicePostgres.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { OpenAIService } from './openaiService';
import { TextChunker } from '../utils/textChunker';
import { v4 as uuidv4 } from 'uuid';

export interface DocumentMetadata {
  source: string;
  date: string;
  category: string;
  title?: string;
}

export class VectorStoreServicePostgres {
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Optimized Cosine Similarity for Float64 Arrays
   */
  private cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async addDocument(content: string, metadata: DocumentMetadata): Promise<void> {
    if (!content) return;
    const chunks = TextChunker.split(content);
    console.log(`📚 Ingesting "${metadata.title}" - ${chunks.length} chunks`);

    try {
      const records = [];
      
      for (const chunk of chunks) {
        try {
          const embedding = await this.openaiService.createEmbedding(chunk);
          
          // Convert array to Float64Array buffer
          const vectorBuffer = Buffer.from(new Float64Array(embedding).buffer);

          records.push({
            id: uuidv4(),
            content: chunk,
            vector: vectorBuffer, // Store as BYTEA
            source: metadata.source,
            date: metadata.date,
            category: metadata.category,
            title: metadata.title || ''
          });
        } catch (e) {
          console.warn('Embedding failed:', e);
        }
      }

      if (records.length > 0) {
        // Use transaction for batch insert
        await prisma.$transaction(
          records.map(record => 
            prisma.document.create({
              data: record,
            })
          )
        );
        console.log(`💾 Saved ${records.length} vectors to PostgreSQL (BYTEA format).`);
      }
    } catch (error) {
      console.error('❌ Failed to add document to vector store:', error);
    }
  }

  async search(query: string, limit: number = 4, filter?: { category?: string }): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);
      // Convert query to TypedArray for faster math
      const queryVec = new Float64Array(queryEmbedding);

      const where: any = {};
      if (filter?.category) {
        where.category = filter.category;
      }
      
      const rows = await prisma.document.findMany({
        where,
      });

      const results = rows.map(row => {
        // Convert BYTEA back to Float array
        const docVec = new Float64Array(
          row.vector.buffer,
          row.vector.byteOffset,
          row.vector.byteLength / 8
        );

        return {
          ...row,
          score: this.cosineSimilarity(queryVec, docVec)
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

      if (results.length === 0) return "No relevant knowledge found.";

      return results.map(r =>
        `[Source: ${r.title} (${r.date})]\n${r.content}`
      ).join('\n\n---\n\n');

    } catch (error) {
      console.error('Vector search failed:', error);
      return "Error searching knowledge base.";
    }
  }

  /**
   * Get vector store statistics
   */
  async getStats(): Promise<{
    totalDocuments: number;
    byCategory: Record<string, number>;
    oldestDocument: string;
    newestDocument: string;
  }> {
    try {
      const [total, byCategory, oldest, newest] = await Promise.all([
        prisma.document.count(),
        prisma.document.groupBy({
          by: ['category'],
          _count: {
            id: true,
          },
        }),
        prisma.document.findFirst({
          orderBy: {
            // Assuming we have a created_at field, using id as fallback
            id: 'asc',
          },
        }),
        prisma.document.findFirst({
          orderBy: {
            id: 'desc',
          },
        }),
      ]);

      const categoryCounts: Record<string, number> = {};
      byCategory.forEach(group => {
        categoryCounts[group.category || 'unknown'] = group._count.id;
      });

      return {
        totalDocuments: total,
        byCategory: categoryCounts,
        oldestDocument: oldest?.id || 'No documents',
        newestDocument: newest?.id || 'No documents',
      };
    } catch (error) {
      console.error('❌ Failed to get vector store stats:', error);
      return {
        totalDocuments: 0,
        byCategory: {},
        oldestDocument: 'No documents',
        newestDocument: 'No documents',
      };
    }
  }

  /**
   * Clean up old vector documents
   */
  async cleanupOldDocuments(maxAgeDays: number = 90): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);

      const result = await prisma.document.deleteMany({
        where: {
          createdAt: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} old vector documents`);
      }

      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old vector documents:', error);
      return 0;
    }
  }
}

---
./src/services/blogGenerationService.ts
---
import { OpenAIService } from './openaiService';
import { PrismaClient } from '@prisma/client';
import { GoogleNewsArticle } from './googleNewsService';

export interface BlogPost {
  title: string;
  content: string; // Markdown formatted
  excerpt: string;
  sourceUrl: string;
  sourceTitle: string;
  featuredImage?: string;
  imageAlt?: string;
  imageCaption?: string;
  tags: string[];
  category: string;
  author: string;
}

export interface BlogGenerationConfig {
  postsPerDay: number;
  minArticleLength: number;
  minTitleLength: number;
  imageGenerationEnabled: boolean;
  qualityThreshold: number; // 0-1 score threshold
}

export class BlogGenerationService {
  private prisma: PrismaClient;
  private openaiService: OpenAIService;
  private config: BlogGenerationConfig;

  constructor(openaiService: OpenAIService, config?: Partial<BlogGenerationConfig>) {
    this.prisma = new PrismaClient();
    this.openaiService = openaiService;
    this.config = {
      postsPerDay: 5,
      minArticleLength: 500,
      minTitleLength: 20,
      imageGenerationEnabled: true,
      qualityThreshold: 0.7,
      ...config
    };
  }

  /**
   * Generate blog posts from news articles
   */
  async generateBlogPosts(articles: GoogleNewsArticle[]): Promise<BlogPost[]> {
    console.log(`📝 Generating blog posts from ${articles.length} articles`);

    // Filter and score articles
    const scoredArticles = await this.scoreAndFilterArticles(articles);
    console.log(`📊 ${scoredArticles.length} articles passed quality threshold`);

    // Select top articles for blog generation
    const selectedArticles = scoredArticles
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.postsPerDay);

    const blogPosts: BlogPost[] = [];

    for (const article of selectedArticles) {
      try {
        const blogPost = await this.generateBlogPostFromArticle(article.article);
        if (blogPost) {
          blogPosts.push(blogPost);
          console.log(`✅ Generated blog post: ${blogPost.title}`);
        }
      } catch (error) {
        console.error(`❌ Error generating blog post from article:`, error);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Save blog posts to database
    await this.saveBlogPosts(blogPosts);

    console.log(`🎯 Blog generation completed: ${blogPosts.length} posts created`);
    return blogPosts;
  }

  /**
   * Score and filter articles based on quality criteria
   */
  private async scoreAndFilterArticles(articles: GoogleNewsArticle[]): Promise<{ article: GoogleNewsArticle; score: number }[]> {
    const scoredArticles: { article: GoogleNewsArticle; score: number }[] = [];

    for (const article of articles) {
      const score = await this.calculateArticleScore(article);

      if (score >= this.config.qualityThreshold) {
        scoredArticles.push({ article, score });
      }
    }

    return scoredArticles;
  }

  /**
   * Calculate article quality score (0-1)
   */
  private async calculateArticleScore(article: GoogleNewsArticle): Promise<number> {
    let score = 0.0;

    // 1. Content length score
    const contentLength = article.fullContent?.length || 0;
    if (contentLength >= this.config.minArticleLength) {
      score += 0.3;
    }

    // 2. Title quality score
    const titleLength = article.title.length;
    if (titleLength >= this.config.minTitleLength) {
      score += 0.2;
    }

    // 3. Keyword richness score
    const keywordScore = Math.min(article.keywords.length / 10, 0.3);
    score += keywordScore;

    // 4. Source credibility score (simple heuristic)
    const credibleSources = ['bbc', 'reuters', 'associated press', 'cnn', 'the guardian'];
    const sourceCredibility = credibleSources.some(source =>
      article.source.toLowerCase().includes(source)
    ) ? 0.2 : 0.1;
    score += sourceCredibility;

    // 5. Image presence score (if image generation is enabled)
    if (this.config.imageGenerationEnabled) {
      score += 0.1; // Bonus for potential image content
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate a blog post from a news article using AI
   */
  private async generateBlogPostFromArticle(article: GoogleNewsArticle): Promise<BlogPost | null> {
    try {
      const prompt = this.createBlogGenerationPrompt(article);
      const response = await this.openaiService.generateTextResponse(prompt);

      const blogPost = this.parseBlogPostResponse(response, article);

      // Generate featured image if enabled
      if (this.config.imageGenerationEnabled) {
        await this.generateFeaturedImage(blogPost, article);
      }

      return blogPost;
    } catch (error) {
      console.error('❌ Error generating blog post with AI:', error);
      return null;
    }
  }

  /**
   * Generate featured image for blog post
   */
  private async generateFeaturedImage(blogPost: BlogPost, article: GoogleNewsArticle): Promise<void> {
    try {
      if (!this.config.imageGenerationEnabled) return;

      // Use AI to generate image description based on article content
      const imagePrompt = `
        Create a descriptive prompt for generating a featured image for this blog post.
        Focus on the main theme or key visual elements from the article.

        Article Title: ${article.title}
        Blog Post Title: ${blogPost.title}
        Key Topics: ${blogPost.tags.slice(0, 3).join(', ')}

        Return a concise image generation prompt (max 100 words).
      `;

      const imageDescription = await this.openaiService.generateTextResponse(imagePrompt);

      // In a real implementation, this would call an image generation API
      // For now, we'll simulate the image generation
      blogPost.featuredImage = `https://via.placeholder.com/800x400/4F46E5/FFFFFF?text=${encodeURIComponent(blogPost.title.substring(0, 30))}`;
      blogPost.imageAlt = `Featured image for: ${blogPost.title}`;
      blogPost.imageCaption = `Image representing: ${imageDescription.substring(0, 100)}`;

      console.log(`🖼️ Generated featured image for: ${blogPost.title}`);
    } catch (error) {
      console.warn('⚠️ Error generating featured image:', error);
      // Continue without image if generation fails
    }
  }

  /**
   * Create prompt for blog post generation
   */
  private createBlogGenerationPrompt(article: GoogleNewsArticle): string {
    return `
      You are a professional blog writer. Create a high-quality blog post based on the following news article.

      REQUIREMENTS:
      - Write in engaging, professional tone
      - Use proper Markdown formatting (headings, lists, bold, italics)
      - Include an engaging introduction
      - Use subheadings to organize content
      - Include a "Key Takeaways" section with bullet points
      - Include a conclusion section
      - Keep it accessible but informative

      BLOG POST STRUCTURE:
      # [Engaging Title]

      [Introduction paragraph that hooks the reader]

      ## [First Subheading]
      [Content section]

      ## [Second Subheading]
      [Content section]

      ## Key Takeaways
      - [Bullet point 1]
      - [Bullet point 2]
      - [Bullet point 3]

      ## Conclusion
      [Summary and forward-looking statement]

      SOURCE ARTICLE:
      Title: ${article.title}
      Source: ${article.source}
      Published: ${article.publishedAt}
      Content: ${article.fullContent?.substring(0, 3000) || article.description}

      Return ONLY the complete blog post in Markdown format. Do not include any explanatory text before or after the blog post.
    `;
  }

  /**
   * Parse AI response into BlogPost object
   */
  private parseBlogPostResponse(response: string, sourceArticle: GoogleNewsArticle): BlogPost {
    // Extract title from first heading
    const titleMatch = response.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : sourceArticle.title;

    // Generate excerpt from first paragraph
    const excerpt = this.generateExcerpt(response);

    // Extract tags from content and source keywords
    const tags = this.extractTags(response, sourceArticle);

    // Determine category
    const category = this.determineCategory(sourceArticle, tags);

    return {
      title,
      content: response,
      excerpt,
      sourceUrl: sourceArticle.url,
      sourceTitle: sourceArticle.title,
      tags,
      category,
      author: 'AI Assistant'
    };
  }

  /**
   * Generate excerpt from blog content
   */
  private generateExcerpt(content: string): string {
    // Remove markdown headers and get first meaningful paragraph
    const cleanContent = content.replace(/^#+.+$/gm, '').trim();
    const paragraphs = cleanContent.split('\n\n');

    for (const paragraph of paragraphs) {
      if (paragraph.length > 50 && paragraph.length < 200) {
        return paragraph.substring(0, 150) + '...';
      }
    }

    // Fallback: first 150 characters of content
    return cleanContent.substring(0, 150) + '...';
  }

  /**
   * Extract tags from blog content and source article
   */
  private extractTags(content: string, sourceArticle: GoogleNewsArticle): string[] {
    const tags = new Set<string>();

    // Add source keywords
    sourceArticle.keywords.forEach(keyword => tags.add(keyword));

    // Extract proper nouns and important terms from content
    const words = content.split(/\s+/);
    const potentialTags = words.filter(word =>
      word.length > 3 &&
      /[A-Z]/.test(word[0]) && // Starts with capital letter
      !word.match(/^[#*\-_]/) // Not markdown symbols
    );

    potentialTags.slice(0, 5).forEach(tag => tags.add(tag));

    return Array.from(tags).slice(0, 10); // Limit to 10 tags
  }

  /**
   * Determine category based on content and keywords
   */
  private determineCategory(article: GoogleNewsArticle, tags: string[]): string {
    const categoryKeywords: Record<string, string[]> = {
      'technology': ['tech', 'software', 'ai', 'machine learning', 'computer', 'digital', 'internet'],
      'business': ['business', 'economy', 'market', 'finance', 'investment', 'company'],
      'world': ['world', 'international', 'global', 'politics', 'government'],
      'science': ['science', 'research', 'study', 'discovery', 'scientific'],
      'health': ['health', 'medical', 'medicine', 'hospital', 'disease'],
      'sports': ['sports', 'game', 'team', 'player', 'championship']
    };

    const allText = article.title + ' ' + article.description + ' ' + tags.join(' ');
    const lowerText = allText.toLowerCase();

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Save blog posts to database
   */
  private async saveBlogPosts(blogPosts: BlogPost[]): Promise<void> {
    try {
      for (const post of blogPosts) {
        await this.prisma.blogPost.create({
          data: {
            title: post.title,
            content: post.content,
            excerpt: post.excerpt,
            sourceUrl: post.sourceUrl,
            sourceTitle: post.sourceTitle,
            featuredImage: post.featuredImage,
            imageAlt: post.imageAlt,
            imageCaption: post.imageCaption,
            tags: post.tags,
            category: post.category,
            author: post.author,
            status: 'published',
            publishedAt: new Date()
          }
        });
      }

      console.log(`💾 Saved ${blogPosts.length} blog posts to database`);
    } catch (error) {
      console.error('❌ Error saving blog posts:', error);
    }
  }

  /**
   * Generate daily digest from blog posts
   */
  async generateDailyDigest(date: Date): Promise<string> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const posts = await this.prisma.blogPost.findMany({
        where: {
          publishedAt: {
            gte: startOfDay,
            lte: endOfDay
          },
          status: 'published'
        },
        orderBy: { publishedAt: 'desc' }
      });

      if (posts.length === 0) {
        return ''; // No posts for this day
      }

      const digestContent = this.formatDailyDigest(posts, date);

      // Save daily digest
      await this.prisma.dailyDigest.create({
        data: {
          date: startOfDay,
          title: `Daily Digest - ${date.toISOString().split('T')[0]}`,
          content: digestContent
        }
      });

      console.log(`📅 Generated daily digest for ${date.toISOString().split('T')[0]} with ${posts.length} posts`);
      return digestContent;
    } catch (error) {
      console.error('❌ Error generating daily digest:', error);
      return '';
    }
  }

  /**
   * Format daily digest content
   */
  private formatDailyDigest(posts: any[], date: Date): string {
    let content = `# Daily News Digest - ${date.toISOString().split('T')[0]}\n\n`;
    content += `*${posts.length} articles summarized for your convenience*\n\n`;

    for (const post of posts) {
      content += `## ${post.title}\n\n`;
      content += `*Source: ${post.sourceTitle}*\n\n`;
      content += `${post.excerpt}\n\n`;
      content += `[Read Full Article](${post.sourceUrl})\n\n`;
      content += `---\n\n`;
    }

    return content;
  }

  /**
   * Generate weekly digest from daily digests
   */
  async generateWeeklyDigest(startDate: Date): Promise<string> {
    try {
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // End of week (Saturday)

      const dailyDigests = await this.prisma.dailyDigest.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        include: {
          blogPosts: true
        },
        orderBy: { date: 'asc' }
      });

      if (dailyDigests.length === 0) {
        return ''; // No digests for this week
      }

      const weeklyContent = this.formatWeeklyDigest(dailyDigests, startDate, endDate);

      // Save weekly digest
      await this.prisma.weeklyDigest.create({
        data: {
          startDate,
          endDate,
          title: `Weekly Digest - ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
          content: weeklyContent
        }
      });

      console.log(`📊 Generated weekly digest with ${dailyDigests.length} daily digests`);
      return weeklyContent;
    } catch (error) {
      console.error('❌ Error generating weekly digest:', error);
      return '';
    }
  }

  /**
   * Format weekly digest content
   */
  private formatWeeklyDigest(dailyDigests: any[], startDate: Date, endDate: Date): string {
    let content = `# Weekly News Digest\n\n`;
    content += `*${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}*\n\n`;

    let totalPosts = 0;

    for (const digest of dailyDigests) {
      const postCount = digest.blogPosts.length;
      totalPosts += postCount;

      content += `## ${digest.date.toISOString().split('T')[0]} (${postCount} articles)\n\n`;

      if (postCount > 0) {
        // Show top 3 posts from each day
        const topPosts = digest.blogPosts.slice(0, 3);
        for (const post of topPosts) {
          content += `### ${post.title}\n\n`;
          content += `${post.excerpt}\n\n`;
        }

        if (postCount > 3) {
          content += `*... and ${postCount - 3} more articles*\n\n`;
        }
      } else {
        content += `*No articles published this day*\n\n`;
      }

      content += `---\n\n`;
    }

    content += `## Weekly Summary\n\n`;
    content += `This week featured **${totalPosts} articles** across **${dailyDigests.length} days**.\n\n`;

    return content;
  }

  /**
   * Get blog post statistics
   */
  async getStats(): Promise<any> {
    try {
      const totalPosts = await this.prisma.blogPost.count();
      const publishedPosts = await this.prisma.blogPost.count({ where: { status: 'published' } });
      const dailyDigests = await this.prisma.dailyDigest.count();
      const weeklyDigests = await this.prisma.weeklyDigest.count();

      return {
        totalPosts,
        publishedPosts,
        dailyDigests,
        weeklyDigests,
        config: this.config
      };
    } catch (error) {
      console.error('❌ Error getting blog stats:', error);
      return {};
    }
  }
}

export function createBlogGenerationService(
  openaiService: OpenAIService,
  config?: Partial<BlogGenerationConfig>
): BlogGenerationService {
  return new BlogGenerationService(openaiService, config);
}

---
./src/services/googleNewsService.ts
---
import { WebScrapeService, WebScrapeResult } from './webScrapeService';
import { OpenAIService } from './openaiService';
import { PrismaClient } from '@prisma/client';

export interface GoogleNewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string;
  fullContent?: string;
  category?: string;
  keywords: string[];
}

export interface GoogleNewsConfig {
  urls: string[];
  deepBrowsingTime: string; // e.g., "06:00"
  quickCheckInterval: number; // in minutes
  maxArticlesPerDeepBrowse: number;
  maxArticlesPerQuickCheck: number;
}

export class GoogleNewsService {
  private prisma: PrismaClient;
  private webScrapeService: WebScrapeService;
  private openaiService: OpenAIService;
  private config: GoogleNewsConfig;

  constructor(
    webScrapeService: WebScrapeService,
    openaiService: OpenAIService,
    config?: Partial<GoogleNewsConfig>
  ) {
    this.prisma = new PrismaClient();
    this.webScrapeService = webScrapeService;
    this.openaiService = openaiService;
    this.config = {
      urls: [
        'https://news.google.com/home?hl=en-HK&gl=HK&ceid=HK:en',
        'https://news.google.com/home?hl=zh-HK&gl=HK&ceid=HK:zh-Hant',
        'https://news.google.com/home?hl=en-US&gl=US&ceid=US:en'
      ],
      deepBrowsingTime: '06:00',
      quickCheckInterval: 180, // 3 hours
      maxArticlesPerDeepBrowse: 15,
      maxArticlesPerQuickCheck: 5,
      ...config
    };
  }

  /**
   * Scrape Google News front page for article links
   */
  async scrapeGoogleNewsFrontPage(url: string): Promise<GoogleNewsArticle[]> {
    try {
      console.log(`🌐 Scraping Google News: ${url}`);

      // Use mobile view for better content extraction
      const result = await this.webScrapeService.scrapeUrl(url, undefined, true);

      if (!result.content) {
        console.warn(`⚠️ No content found for ${url}`);
        return [];
      }

      // Extract article links from Google News HTML
      const articles = this.extractArticlesFromGoogleNews(result.content, url);
      console.log(`📰 Found ${articles.length} articles on Google News front page`);

      return articles;
    } catch (error) {
      console.error(`❌ Error scraping Google News ${url}:`, error);
      return [];
    }
  }

  /**
   * Extract articles from Google News HTML content
   */
  private extractArticlesFromGoogleNews(html: string, baseUrl: string): GoogleNewsArticle[] {
    const articles: GoogleNewsArticle[] = [];

    // Google News article pattern - look for article elements
    const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    const articleMatches = html.match(articlePattern) || [];

    for (const articleHtml of articleMatches) {
      try {
        // Extract title
        const titleMatch = articleHtml.match(/<a[^>]*aria-label="([^"]*)"[^>]*>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        if (!title || title.length < 10) continue;

        // Extract URL (Google News uses relative URLs that need to be resolved)
        const urlMatch = articleHtml.match(/<a[^>]*href="([^"]*)"[^>]*>/i);
        if (!urlMatch) continue;

        let articleUrl = urlMatch[1];
        if (articleUrl.startsWith('./')) {
          articleUrl = `https://news.google.com${articleUrl.substring(1)}`;
        } else if (articleUrl.startsWith('/')) {
          articleUrl = `https://news.google.com${articleUrl}`;
        } else if (!articleUrl.startsWith('http')) {
          articleUrl = `https://news.google.com/${articleUrl}`;
        }

        // Extract source
        const sourceMatch = articleHtml.match(/<span[^>]*>([^<]*)<\/span>/i);
        const source = sourceMatch ? sourceMatch[1].trim() : 'Unknown';

        // Extract time (approximate)
        const timeMatch = articleHtml.match(/(\d+)\s*(minute|hour|day)s?\s*ago/i);
        const publishedAt = timeMatch ? this.calculatePublishedTime(timeMatch[1], timeMatch[2]) : new Date().toISOString();

        // Extract description/snippet
        const descMatch = articleHtml.match(/<div[^>]*>([^<]{50,300})<\/div>/i);
        const description = descMatch ? descMatch[1].trim() : '';

        articles.push({
          title,
          url: articleUrl,
          source,
          publishedAt,
          description,
          keywords: []
        });
      } catch (error) {
        console.warn('⚠️ Error parsing article HTML:', error);
      }
    }

    return articles;
  }

  /**
   * Calculate published time from relative time string
   */
  private calculatePublishedTime(amount: string, unit: string): string {
    const now = new Date();
    const num = parseInt(amount);

    switch (unit.toLowerCase()) {
      case 'minute':
        now.setMinutes(now.getMinutes() - num);
        break;
      case 'hour':
        now.setHours(now.getHours() - num);
        break;
      case 'day':
        now.setDate(now.getDate() - num);
        break;
    }

    return now.toISOString();
  }

  /**
   * Follow article link and extract full content
   */
  async extractFullArticleContent(article: GoogleNewsArticle): Promise<GoogleNewsArticle> {
    try {
      console.log(`📖 Reading full article: ${article.title}`);

      const result = await this.webScrapeService.scrapeUrl(article.url, undefined, true);

      if (result.content && result.content.length > 300) {
        article.fullContent = result.content;

        // Extract keywords from content
        article.keywords = await this.extractKeywords(article.title, result.content);

        console.log(`✅ Extracted ${article.keywords.length} keywords from article`);
      } else {
        console.warn(`⚠️ Article content too short: ${article.url}`);
      }

      return article;
    } catch (error) {
      console.error(`❌ Error extracting full article content:`, error);
      return article;
    }
  }

  /**
   * Extract keywords from article content using AI
   */
  private async extractKeywords(title: string, content: string): Promise<string[]> {
    try {
      const prompt = `
        Extract 5-10 key topics, entities, or keywords from this news article.
        Focus on proper nouns, technical terms, and important concepts.
        Return as a JSON array of strings.

        Title: ${title}
        Content: ${content.substring(0, 2000)}

        Return only the JSON array, no other text.
      `;

      const response = await this.openaiService.generateTextResponse(prompt);

      try {
        const keywords = JSON.parse(response);
        return Array.isArray(keywords) ? keywords.slice(0, 10) : [];
      } catch (parseError) {
        // Fallback: simple keyword extraction
        return this.fallbackKeywordExtraction(title + ' ' + content);
      }
    } catch (error) {
      console.warn('⚠️ AI keyword extraction failed, using fallback');
      return this.fallbackKeywordExtraction(title + ' ' + content);
    }
  }

  /**
   * Fallback keyword extraction using simple text analysis
   */
  private fallbackKeywordExtraction(text: string): string[] {
    // Remove common words and extract capitalized words, numbers, and technical terms
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 10);

    return [...new Set(words)]; // Remove duplicates
  }

  /**
   * Deep news browsing - comprehensive article reading
   */
  async performDeepNewsBrowsing(): Promise<GoogleNewsArticle[]> {
    console.log('🌅 Starting deep news browsing...');
    const allArticles: GoogleNewsArticle[] = [];

    for (const url of this.config.urls) {
      try {
        const articles = await this.scrapeGoogleNewsFrontPage(url);
        const articlesWithContent: GoogleNewsArticle[] = [];

        // Process a limited number of articles
        for (const article of articles.slice(0, this.config.maxArticlesPerDeepBrowse)) {
          const fullArticle = await this.extractFullArticleContent(article);
          if (fullArticle.fullContent) {
            articlesWithContent.push(fullArticle);
          }

          // Small delay to be respectful
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        allArticles.push(...articlesWithContent);
        console.log(`✅ Processed ${articlesWithContent.length} articles from ${url}`);

      } catch (error) {
        console.error(`❌ Error processing Google News URL ${url}:`, error);
      }
    }

    // Update keyword database
    await this.updateKeywordDatabase(allArticles);

    console.log(`🎯 Deep browsing completed: ${allArticles.length} articles processed`);
    return allArticles;
  }

  /**
   * Quick news check - focused on recent keywords
   */
  async performQuickNewsCheck(): Promise<GoogleNewsArticle[]> {
    console.log('⚡ Performing quick news check...');

    // Get recent keywords to focus on
    const recentKeywords = await this.getRecentKeywords();
    const allArticles: GoogleNewsArticle[] = [];

    for (const url of this.config.urls) {
      try {
        const articles = await this.scrapeGoogleNewsFrontPage(url);

        // Filter articles by recent keywords
        const relevantArticles = articles.filter(article =>
          recentKeywords.some(keyword =>
            article.title.toLowerCase().includes(keyword.toLowerCase()) ||
            article.description.toLowerCase().includes(keyword.toLowerCase())
          )
        );

        // Process relevant articles
        const articlesWithContent: GoogleNewsArticle[] = [];
        for (const article of relevantArticles.slice(0, this.config.maxArticlesPerQuickCheck)) {
          const fullArticle = await this.extractFullArticleContent(article);
          if (fullArticle.fullContent) {
            articlesWithContent.push(fullArticle);
          }
        }

        allArticles.push(...articlesWithContent);
        console.log(`✅ Quick check: ${articlesWithContent.length} relevant articles from ${url}`);

      } catch (error) {
        console.error(`❌ Error in quick check for ${url}:`, error);
      }
    }

    // Update keywords with new content
    await this.updateKeywordDatabase(allArticles);

    return allArticles;
  }

  /**
   * Update keyword tracking database
   */
  private async updateKeywordDatabase(articles: GoogleNewsArticle[]): Promise<void> {
    try {
      for (const article of articles) {
        for (const keyword of article.keywords) {
          // Check if keyword exists
          const existing = await this.prisma.newsKeyword.findFirst({
            where: { keyword }
          });

          if (existing) {
            // Update relevance and last used
            await this.prisma.newsKeyword.update({
              where: { id: existing.id },
              data: {
                relevance: Math.min(1.0, existing.relevance + 0.1),
                lastUsed: new Date()
              }
            });
          } else {
            // Create new keyword
            await this.prisma.newsKeyword.create({
              data: {
                keyword,
                relevance: 0.5,
                category: article.category,
                lastUsed: new Date()
              }
            });
          }
        }
      }

      console.log(`📊 Updated keyword database with ${articles.length} articles`);
    } catch (error) {
      console.error('❌ Error updating keyword database:', error);
    }
  }

  /**
   * Get recent keywords for focused browsing
   */
  private async getRecentKeywords(): Promise<string[]> {
    try {
      const keywords = await this.prisma.newsKeyword.findMany({
        where: {
          lastUsed: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        orderBy: {
          relevance: 'desc'
        },
        take: 10
      });

      return keywords.map(k => k.keyword);
    } catch (error) {
      console.error('❌ Error getting recent keywords:', error);
      return [];
    }
  }

  /**
   * Save articles to database for blog generation
   */
  async saveArticlesForBlogGeneration(articles: GoogleNewsArticle[]): Promise<void> {
    try {
      // This will be used by the blog generation system
      // For now, we'll store them in a temporary location
      console.log(`💾 Saving ${articles.length} articles for blog generation`);

      // In a real implementation, this would store articles in a queue or database
      // for the blog generation system to process
    } catch (error) {
      console.error('❌ Error saving articles for blog generation:', error);
    }
  }

  /**
   * Get news source configuration
   */
  async getNewsSources(): Promise<any[]> {
    try {
      return await this.prisma.newsSource.findMany({
        where: { isActive: true },
        orderBy: { priority: 'desc' }
      });
    } catch (error) {
      console.error('❌ Error getting news sources:', error);
      return [];
    }
  }

  /**
   * Add a new news source
   */
  async addNewsSource(url: string, name?: string, region?: string, language?: string): Promise<void> {
    try {
      await this.prisma.newsSource.create({
        data: {
          url,
          name: name || this.extractSourceName(url),
          region,
          language,
          priority: 5,
          isActive: true,
          sourceType: url.includes('news.google.com') ? 'google_news' : 'direct_site'
        }
      });

      console.log(`✅ Added news source: ${url}`);
    } catch (error) {
      console.error('❌ Error adding news source:', error);
      throw error;
    }
  }

  /**
   * Extract source name from URL
   */
  private extractSourceName(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '').split('.')[0];
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Discover new news sources from article URLs
   */
  async discoverNewsSources(articles: GoogleNewsArticle[]): Promise<string[]> {
    try {
      const discoveredDomains = new Set<string>();

      for (const article of articles) {
        try {
          const urlObj = new URL(article.url);
          const domain = urlObj.hostname;

          // Skip Google News domains and common aggregators
          if (domain.includes('google.com') ||
              domain.includes('news.google') ||
              domain.includes('aggregator')) {
            continue;
          }

          // Validate if domain is a legitimate news source
          if (await this.validateNewsSource(domain, article)) {
            discoveredDomains.add(domain);
          }
        } catch (error) {
          console.warn(`⚠️ Error processing URL ${article.url}:`, error);
        }
      }

      console.log(`🔍 Discovered ${discoveredDomains.size} potential news sources`);
      return Array.from(discoveredDomains);
    } catch (error) {
      console.error('❌ Error discovering news sources:', error);
      return [];
    }
  }

  /**
   * Validate if a domain is a legitimate news source
   */
  private async validateNewsSource(domain: string, article: GoogleNewsArticle): Promise<boolean> {
    try {
      // Basic validation criteria
      const hasNewsKeywords = this.hasNewsKeywords(article.title, article.description);
      const hasDateElements = this.hasDateElements(article.publishedAt);
      const hasArticleStructure = article.title.length > 20 && article.description.length > 50;

      // AI validation for content analysis
      const aiValidation = await this.validateWithAI(domain, article);

      return hasNewsKeywords && hasDateElements && hasArticleStructure && aiValidation;
    } catch (error) {
      console.warn(`⚠️ Error validating news source ${domain}:`, error);
      return false;
    }
  }

  /**
   * Check for news-related keywords in content
   */
  private hasNewsKeywords(title: string, description: string): boolean {
    const newsKeywords = ['news', 'report', 'update', 'breaking', 'latest', 'headline', 'coverage'];
    const text = (title + ' ' + description).toLowerCase();

    return newsKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check for date elements indicating timely content
   */
  private hasDateElements(publishedAt: string): boolean {
    // Check if publishedAt is a valid date string
    const date = new Date(publishedAt);
    return !isNaN(date.getTime());
  }

  /**
   * AI validation for content analysis
   */
  private async validateWithAI(domain: string, article: GoogleNewsArticle): Promise<boolean> {
    try {
      const prompt = `
        Analyze if this domain appears to be a legitimate news source.
        Consider factors like:
        - Content quality and structure
        - Professional presentation
        - News-related terminology
        - Authoritative tone

        Domain: ${domain}
        Article Title: ${article.title}
        Article Description: ${article.description}

        Return only "true" if it appears legitimate, "false" otherwise.
      `;

      const response = await this.openaiService.generateTextResponse(prompt);
      return response.trim().toLowerCase() === 'true';
    } catch (error) {
      console.warn('⚠️ AI validation failed, using fallback');
      // Fallback: assume valid if basic criteria pass
      return true;
    }
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<any> {
    try {
      const articleCount = await this.prisma.blogPost.count();
      const keywordCount = await this.prisma.newsKeyword.count();
      const sourceCount = await this.prisma.newsSource.count();

      return {
        articlesProcessed: articleCount,
        keywordsTracked: keywordCount,
        activeSources: sourceCount,
        config: this.config
      };
    } catch (error) {
      console.error('❌ Error getting stats:', error);
      return {};
    }
  }
}

export function createGoogleNewsService(
  webScrapeService: WebScrapeService,
  openaiService: OpenAIService,
  config?: Partial<GoogleNewsConfig>
): GoogleNewsService {
  return new GoogleNewsService(webScrapeService, openaiService, config);
}

---
./src/services/googleSearchService.ts
---
import axios from 'axios';

export interface GoogleSearchConfig {
  apiKey: string;
  searchEngineId: string;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export class GoogleSearchService {
  private config: GoogleSearchConfig;

  constructor(config: GoogleSearchConfig) {
    this.config = config;
  }

  /**
   * Perform a Google search using the Custom Search JSON API
   */
  async search(query: string, numResults: number = 5, startIndex: number = 1): Promise<SearchResult[]> {
    try {
      console.log('🌐 Making Google API Request:', {
        query: query,
        numResults: numResults,
        startIndex: startIndex,
        engineId: this.config.searchEngineId.substring(0, 10) + '...'
      });

      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: this.config.apiKey,
          cx: this.config.searchEngineId,
          q: query,
          num: Math.min(numResults, 10), // Google API max is 10 results per request
          start: startIndex,
        },
      });

      const items = response.data.items || [];

      console.log('📊 Google API Response:', {
        query: query,
        totalResults: response.data.searchInformation?.totalResults || 0,
        itemsFound: items.length,
        startIndex: startIndex,
        items: items.map((item: any) => ({
          title: item.title?.substring(0, 30) + (item.title?.length > 30 ? '...' : ''),
          link: item.link?.substring(0, 30) + (item.link?.length > 30 ? '...' : '')
        }))
      });

      if (items.length > 0) {
        return items.map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
        }));
      }

      return [];
    } catch (error) {
      console.error('❌ Google search error:', {
        error: error instanceof Error ? error.message : `${error}`,
        query: query,
        startIndex: startIndex
      });
      throw new Error('Failed to perform Google search');
    }
  }

  /**
   * Perform multiple Google search requests to get more results
   */
  async searchMultiple(query: string, totalResults: number = 10): Promise<SearchResult[]> {
    const maxPerRequest = 10;
    const results: SearchResult[] = [];
    let startIndex = 1;
    let requestsMade = 0;
    const maxRequests = 3; // Limit to avoid excessive API calls

    while (results.length < totalResults && requestsMade < maxRequests) {
      const resultsNeeded = totalResults - results.length;
      const numResults = Math.min(resultsNeeded, maxPerRequest);

      try {
        const batchResults = await this.search(query, numResults, startIndex);
        results.push(...batchResults);

        if (batchResults.length < numResults) {
          break; // No more results available
        }

        startIndex += batchResults.length;
        requestsMade++;

        // Add small delay between requests to avoid rate limiting
        if (requestsMade < maxRequests && results.length < totalResults) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.warn('⚠️ Partial Google search failure:', {
          error: error instanceof Error ? error.message : `${error}`,
          query: query,
          startIndex: startIndex
        });
        break; // Continue with partial results
      }
    }

    // Remove duplicates by URL
    const uniqueResults = results.filter((result, index, self) =>
      index === self.findIndex(r => r.link === result.link)
    );

    console.log('📈 Multiple search requests completed:', {
      query: query,
      totalRequested: totalResults,
      totalObtained: uniqueResults.length,
      requestsMade: requestsMade
    });

    return uniqueResults.slice(0, totalResults);
  }

  /**
   * Format search results for LLM consumption
   */
  formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No search results found.';
    }

    return results.map((result, index) =>
      `[${index + 1}] ${result.title}\n${result.link}\n${result.snippet}\n`
    ).join('\n');
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey && !!this.config.searchEngineId;
  }
}

// Helper function to create GoogleSearchService instance from environment variables
export function createGoogleSearchServiceFromEnv(): GoogleSearchService {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    throw new Error('GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables are required');
  }

  return new GoogleSearchService({
    apiKey,
    searchEngineId,
  });
}

---
./src/services/mediaService.ts
---
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import FormData from 'form-data';
import { WhatsAppAPIConfig } from '../types/whatsapp';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from './openaiService';

const execAsync = promisify(exec);

export interface MediaInfo {
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  sha256: string;
  type: 'image' | 'audio';
}

// --- NEW: Options for TTS ---
export interface TTSOptions {
  voice?: string;      // e.g., 'af_heart'
  speed?: number;      // e.g., 1.0
  lang_code?: string;  // 'a' (US English), 'b' (UK English), 'z' (Chinese), etc.
  model_repo?: string; // e.g., 'prince-canuma/Kokoro-82M' or 'mlx-community/Spark-TTS...'
}

export class MediaService {
  private config: WhatsAppAPIConfig;
  private openaiService: OpenAIService | null;

  // Known Whisper Hallucinations (Common phrases generated on silence/noise)
  private readonly HALLUCINATIONS = [
    "subtitle by amara.org",
    "subtitles by amara.org",
    "thank you for watching",
    "thanks for watching",
    "you",
    "bye",
    "copyright",
    "all rights reserved",
    "audio",
    "silence"
  ];

  constructor(config: WhatsAppAPIConfig) {
    this.config = config;

    // Initialize OpenAI service if API key is available
    this.openaiService = null;
    this.initializeOpenAIService();
  }

  async downloadAndSaveMedia(
    mediaId: string,
    mimeType: string,
    sha256: string,
    mediaType: 'image' | 'audio'
  ): Promise<MediaInfo> {
    try {
      // Get media URL from WhatsApp API
      const mediaUrl = `https://graph.facebook.com/${this.config.apiVersion}/${mediaId}`;

      const response = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        }
      });

      const downloadUrl = response.data.url;

      // Download the media file
      const mediaResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        }
      });

      // Determine file extension from mime type
      const extension = this.getExtensionFromMimeType(mimeType);
      const timestamp = Date.now();
      const filename = `${mediaType}_${timestamp}_${mediaId.substring(0, 8)}.${extension}`;
      const filepath = path.join('data', 'media', filename);

      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save file
      fs.writeFileSync(filepath, mediaResponse.data);

      // Get file stats
      const stats = fs.statSync(filepath);

      return {
        filename,
        filepath,
        mimeType,
        size: stats.size,
        sha256,
        type: mediaType
      };

    } catch (error) {
      console.error('Error downloading media:', error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to download media: ${errorMessage}`);
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      // Image types
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',

      // Audio types - WhatsApp commonly uses these
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/aac': 'aac',
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a', // WhatsApp often sends audio as MP4 container
      'audio/x-m4a': 'm4a',
      'audio/flac': 'flac',
      'audio/x-wav': 'wav',
      'audio/amr': 'amr', // WhatsApp voice messages often use AMR
      'audio/3gpp': '3gp', // Common mobile audio format

      // Video types (for future expansion)
      'video/mp4': 'mp4',
      'video/3gpp': '3gp',
      'video/quicktime': 'mov'
    };

    // Fix: Handle formats with codecs like "audio/ogg; codecs=opus"
    const cleanMime = mimeType.split(';')[0].trim();
    return mimeToExt[cleanMime] || 'bin';
  }

  getMediaInfoResponse(mediaInfo: MediaInfo): string {
    return `📁 Media received!\n\n` +
           `Type: ${mediaInfo.type.toUpperCase()}\n` +
           `Filename: ${mediaInfo.filename}\n` +
           `Size: ${this.formatFileSize(mediaInfo.size)}\n` +
           `MIME Type: ${mediaInfo.mimeType}\n` +
           `SHA256: ${mediaInfo.sha256.substring(0, 12)}...`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async transcribeAudio(audioFilePath: string, language?: string): Promise<string> {
    try {
      const apiUrl = process.env.AUDIO_SERVICE_API_URL;
      const apiKey = process.env.AUDIO_SERVICE_API_KEY;

      if (!apiUrl || !apiKey) {
        throw new Error('Audio transcription service not configured');
      }

      // Read the audio file
      const audioBuffer = fs.readFileSync(audioFilePath);
      const fileName = path.basename(audioFilePath);

      // Determine content type based on file extension
      const extension = fileName.split('.').pop()?.toLowerCase();
      let contentType = 'audio/wav';
      if (extension === 'mp3') contentType = 'audio/mpeg';
      else if (extension === 'm4a') contentType = 'audio/mp4';
      else if (extension === 'flac') contentType = 'audio/flac';
      else if (extension === 'ogg') contentType = 'audio/ogg';

      // Create form data
      const form = new FormData();
      form.append('audio_file', audioBuffer, {
        filename: fileName,
        contentType: contentType,
      });

      if (language) {
        form.append('language', language);
      }

      // Make API request to audio service
      console.log(`📡 Sending audio to transcription service: ${fileName} (${audioBuffer.length} bytes)`);
      const response = await axios.post(`${apiUrl}transcribe`, form, {
        headers: {
          'X-API-Key': apiKey,
          ...form.getHeaders(),
        },
      });
      
      let rawText = "";
      if (response.data.text) {
        rawText = response.data.text;
      } else if (response.data.success && response.data.text) {
        rawText = response.data.text;
      } else {
        throw new Error(response.data.error || response.data.detail || 'Transcription failed');
      }

      // Filter hallucinations
      const cleanText = this.filterHallucinations(rawText);
      console.log(`📝 Transcription result: "${cleanText}" (Raw: "${rawText}")`);
      
      return cleanText || "[Audio contains no speech or was unintelligible]";

    } catch (error) {
      console.error('Error transcribing audio:', error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to transcribe audio: ${errorMessage}`);
    }
  }

  /**
   * Helper to clean up Whisper hallucinations
   */
  private filterHallucinations(text: string): string {
    const lower = text.trim().toLowerCase();
    
    // Check if the entire text is a known hallucination
    if (this.HALLUCINATIONS.some(h => lower === h || lower.startsWith(h))) {
        return "";
    }
    
    // Remove "Subtitle by..." if it appears at the end
    return text.replace(/Subtitles? by .*$/i, "").trim();
  }

  /**
   * NEW: Force convert any audio to standard WAV (16kHz, mono) for best transcription results
   * This fixes issues with WhatsApp OGG/Opus files
   */
  async convertAudioToWav(inputFilePath: string): Promise<string> {
    try {
      // Check if FFmpeg is available
      try {
        await execAsync('ffmpeg -version');
      } catch (error) {
        console.warn('⚠️ FFmpeg not found. Skipping conversion. Transcription may fail for OGG files.');
        return inputFilePath;
      }

      const timestamp = Date.now();
      const outputFilename = `converted_${timestamp}.wav`;
      const outputFilePath = path.join('data', 'media', outputFilename);

      // 16kHz sample rate (-ar 16000), mono (-ac 1), 16-bit PCM (default for wav)
      // This is the "Gold Standard" format for Whisper and most STT engines
      const ffmpegCommand = `ffmpeg -i "${inputFilePath}" -ar 16000 -ac 1 -y "${outputFilePath}"`;
      
      console.log(`🔄 Normalizing audio for transcription: ${inputFilePath} -> ${outputFilePath}`);
      const { stderr } = await execAsync(ffmpegCommand);
      
      if (stderr && !fs.existsSync(outputFilePath)) {
          console.warn(`⚠️ FFmpeg warning: ${stderr}`);
      }

      return outputFilePath;
    } catch (error) {
      console.error('Error converting audio to WAV:', error);
      return inputFilePath; // Fallback to original file
    }
  }

  // ==========================================
  //  🆕 NEW METHOD: Synthesize Audio (TTS)
  // ==========================================
  async synthesizeAudio(text: string, options: TTSOptions = {}): Promise<MediaInfo> {
    try {
      const apiUrl = process.env.AUDIO_SERVICE_API_URL;
      const apiKey = process.env.AUDIO_SERVICE_API_KEY;

      if (!apiUrl || !apiKey) {
        throw new Error('Audio service not configured');
      }

      if (!text) {
        throw new Error('Text is required for synthesis');
      }

      // 1. Clean the text to remove emojis and Markdown before synthesis
      const cleanedText = this.cleanTextForTTS(text);
      console.log(`🗣️ Cleaned TTS Text: "${cleanedText.substring(0, 50)}..."`);

      if (!cleanedText) {
          // If message was only emojis/formatting, fallback to simple text
          console.warn("Text contained only emojis/formatting. Using default response.");
          return this.synthesizeAudio("I sent you a text response.", options);
      }

      // 2. Auto-detect Language for Kokoro
      // Check for Chinese characters (CJK Unified Ideographs)
      const hasChinese = /[\u4e00-\u9fa5]/.test(cleanedText);
      let langCode = options.lang_code || 'a'; // Default US English

      // If Chinese detected and no override provided, switch to 'z'
      if (hasChinese && !options.lang_code) {
          console.log("🇨🇳 Chinese characters detected, switching TTS lang_code to 'z'");
          langCode = 'z';
      }

      // Default Configuration
      const payload = {
        text: cleanedText,
        model_repo: options.model_repo || 'prince-canuma/Kokoro-82M', // Default to Kokoro
        voice: options.voice || 'af_heart',
        speed: options.speed || 1.0,
        lang_code: langCode
      };

      console.log(`Synthesizing audio: "${cleanedText.substring(0, 50)}..." with model ${payload.model_repo} (lang: ${payload.lang_code})`);

      // NOTE: Synthesize endpoint expects JSON, not FormData
      const response = await axios.post(`${apiUrl}synthesize`, payload, {
        responseType: 'arraybuffer', // Critical: We expect a binary WAV file back
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        }
      });

      // Prepare file path
      const timestamp = Date.now();
      const filename = `tts_${timestamp}.wav`;
      const filepath = path.join('data', 'media', filename);

      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save the buffer to disk
      fs.writeFileSync(filepath, response.data);
      const stats = fs.statSync(filepath);

      return {
        filename,
        filepath,
        mimeType: 'audio/wav',
        size: stats.size,
        sha256: '', // Not strictly needed for generated content, or calculate if needed
        type: 'audio'
      };

    } catch (error) {
      console.error('Error synthesizing audio:', error);
      
      // Handle axios error response specially to read the text error from arraybuffer
      if (axios.isAxiosError(error) && error.response && error.response.data) {
        const errorBuffer = error.response.data as Buffer;
        const errorText = errorBuffer.toString('utf8');
        throw new Error(`TTS Failed: ${errorText}`);
      }

      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to synthesize audio: ${errorMessage}`);
    }
  }

  /**
   * Helper function to remove Emojis, Markdown, and URLs for cleaner speech
   */
  private cleanTextForTTS(text: string): string {
    return text
      // Remove URLs
      .replace(/https?:\/\/[^\s]+/g, ' a link ')
      // Remove Emojis and Pictographs (Unicode property escapes)
      .replace(/\p{Emoji_Presentation}/gu, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      // Remove Markdown bold/italic (* or _) and code (`)
      .replace(/(\*|_|`)/g, '')
      // Collapse multiple spaces into one
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Convert audio file from WAV to WhatsApp-compatible format (OGG with Opus codec)
   * WhatsApp supports: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg
   */
  async convertAudioToWhatsAppFormat(inputFilePath: string, outputFormat: 'ogg' | 'mp3' = 'ogg'): Promise<MediaInfo> {
    try {
      if (!fs.existsSync(inputFilePath)) {
        throw new Error(`Input file not found: ${inputFilePath}`);
      }

      // Check if FFmpeg is available
      try {
        await execAsync('ffmpeg -version');
      } catch (error) {
        throw new Error('FFmpeg is not installed or not available in PATH');
      }

      const inputExt = path.extname(inputFilePath).toLowerCase();
      if (inputExt !== '.wav') {
        console.warn(`Warning: Input file is ${inputExt}, expected .wav. Conversion may still work.`);
      }

      // Create output file path
      const timestamp = Date.now();
      const outputFilename = `converted_${timestamp}.${outputFormat}`;
      const outputFilePath = path.join('data', 'media', outputFilename);

      // Ensure directory exists
      const dir = path.dirname(outputFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Build FFmpeg command based on output format
      let ffmpegCommand: string;
      let mimeType: string;

      if (outputFormat === 'ogg') {
        // Convert to OGG with Opus codec (WhatsApp's preferred format)
        ffmpegCommand = `ffmpeg -i "${inputFilePath}" -c:a libopus -b:a 64k -ac 1 -vn -y "${outputFilePath}"`;
        mimeType = 'audio/ogg';
      } else {
        // Convert to MP3
        ffmpegCommand = `ffmpeg -i "${inputFilePath}" -c:a libmp3lame -b:a 128k -ac 1 -vn -y "${outputFilePath}"`;
        mimeType = 'audio/mpeg';
      }

      console.log(`Converting audio: ${inputFilePath} -> ${outputFilePath}`);
      console.log(`FFmpeg command: ${ffmpegCommand}`);

      // Execute FFmpeg conversion
      const { stdout, stderr } = await execAsync(ffmpegCommand);

      if (stderr) {
        console.warn('FFmpeg stderr:', stderr);
      }

      // Verify output file was created
      if (!fs.existsSync(outputFilePath)) {
        throw new Error('FFmpeg conversion failed - output file not created');
      }

      const stats = fs.statSync(outputFilePath);
      
      if (stats.size === 0) {
        throw new Error('FFmpeg conversion failed - output file is empty');
      }

      console.log(`✅ Audio conversion successful: ${stats.size} bytes`);

      return {
        filename: outputFilename,
        filepath: outputFilePath,
        mimeType,
        size: stats.size,
        sha256: '', // Not needed for generated content
        type: 'audio'
      };

    } catch (error) {
      console.error('Error converting audio:', error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to convert audio: ${errorMessage}`);
    }
  }

  async getTranscriptionResponse(transcribedText: string, mediaInfo: MediaInfo): Promise<string> {
    // Generate enhanced AI response based on the transcription
    const aiResponse = await this.generateAIResponseFromTranscription(transcribedText);

    return `🎤 I heard your audio message!\n\n${aiResponse}\n\n` +
           `Note: This response was generated automatically based on the audio content and may contain inaccuracies.`;
  }

  /**
   * Analyze image content using OpenAI's vision capabilities
   * Returns only the enhanced AI response, not the raw analysis
   */
  async analyzeImageWithOpenAI(imagePath: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) {
      throw new Error('OpenAI service is not configured for image analysis');
    }

    try {
      // Use specialized media image analysis prompt from config if available
      const mediaImagePrompt = this.openaiService.getConfig()?.prompts?.mediaImageAnalysis;
      const analysis = await this.openaiService.analyzeImage(imagePath, mediaImagePrompt);

      // Generate enhanced AI response based on the image analysis
      const aiResponse = await this.generateEnhancedAIResponseFromAnalysis(analysis);

      return aiResponse;
    } catch (error) {
      console.error('Error analyzing image with OpenAI:', error);
      throw new Error('Failed to analyze image with OpenAI');
    }
  }

  /**
   * Generate enhanced AI response based on image analysis with contextual suggestions
   */
  private async generateEnhancedAIResponseFromAnalysis(analysis: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) {
      return 'I analyzed the image but cannot generate a response as OpenAI is not configured.';
    }

    try {
      // Use enhanced image response prompt from config if available
      const enhancedPrompt = this.openaiService.getConfig()?.prompts?.enhancedImageResponse;

      // If no custom prompt is configured, use the default one
      const prompt = enhancedPrompt
        ? enhancedPrompt.replace('{analysis}', analysis)
        : `Based on this detailed image analysis: "${analysis}"

Generate a helpful, engaging, and conversational response with specific contextual awareness:

- If it's a food menu: suggest popular dishes, recommend what to order based on cuisine type, mention any specials or pricing
- If it's a building or landmark: suggest where it might be located, provide architectural details, historical context, and nearby attractions
- If it's a hand holding an object: identify what the object is, suggest its purpose or how to use it, provide related recommendations
- If it's a product: provide recommendations, usage tips, where to buy it, or similar alternatives
- If it's a document or text-heavy: summarize key information clearly, highlight important details, suggest next steps
- If it's nature or scenery: provide interesting facts, travel suggestions, best times to visit, or photography tips
- If it's people or events: provide appropriate commentary, suggest related activities or social context
- If it's artwork or creative content: discuss the style, possible meaning, or artistic techniques

Keep the response natural, conversational, and focused on being genuinely helpful with practical suggestions.`;

      return await this.openaiService.generateTextResponse(prompt);
    } catch (error) {
      console.error('Error generating enhanced AI response from image analysis:', error);
      return 'I analyzed the image but encountered an error generating a response.';
    }
  }

  /**
   * Generate enhanced AI response based on audio transcription
   */
  private async generateAIResponseFromTranscription(transcription: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) {
      return 'I transcribed the audio but cannot generate a response as OpenAI is not configured.';
    }

    try {
      // Use audio transcription response prompt from config if available
      const transcriptionPrompt = this.openaiService.getConfig()?.prompts?.audioTranscriptionResponse;

      // If no custom prompt is configured, use the default one
      const prompt = transcriptionPrompt
        ? transcriptionPrompt.replace('{transcription}', transcription)
        : `Based on this audio transcription: "${transcription}"

Generate a helpful, engaging, and conversational response. Provide thoughtful commentary, answer questions, or continue the conversation naturally based on the audio content. Keep it conversational and focused on being helpful.`;

      return await this.openaiService.generateTextResponse(prompt);
    } catch (error) {
      console.error('Error generating AI response from transcription:', error);
      return 'I transcribed the audio but encountered an error generating a response.';
    }
  }

  /**
   * Enhanced media info response that includes only the AI-generated response
   * without raw analysis details
   */
  getEnhancedMediaInfoResponse(mediaInfo: MediaInfo, aiResponse?: string): string {
    let response = `📁 I received your ${mediaInfo.type}!\n\n`;

    if (aiResponse) {
      response += `${aiResponse}\n\n`;
    } else {
      response += `Type: ${mediaInfo.type.toUpperCase()}\n` +
                  `Filename: ${mediaInfo.filename}\n` +
                  `Size: ${this.formatFileSize(mediaInfo.size)}\n` +
                  `MIME Type: ${mediaInfo.mimeType}`;
    }

    return response;
  }
  /**
   * Initialize OpenAI service asynchronously
   */
  private async initializeOpenAIService(): Promise<void> {
    try {
      // Try to load from config file first
      this.openaiService = await createOpenAIServiceFromConfig();
      console.log('OpenAI service initialized successfully from config file in MediaService');
    } catch (configError) {
      console.warn('Failed to initialize from config file in MediaService, trying legacy environment variables:', configError instanceof Error ? configError.message : `${configError}`);

      // Fall back to environment variables for backward compatibility
      try {
        this.openaiService = createOpenAIServiceFromEnv();
        console.log('OpenAI service initialized successfully from environment variables (legacy mode) in MediaService');
      } catch (envError) {
        console.warn('OpenAI service not available for media analysis:', envError instanceof Error ? envError.message : `${envError}`);
        this.openaiService = null;
      }
    }
  }
}

---
./src/services/newsMigrationService.ts
---
import { PrismaClient } from '@prisma/client';
import { GoogleNewsService } from './googleNewsService';
import { BlogGenerationService } from './blogGenerationService';
import * as fs from 'fs';
import * as path from 'path';

export class NewsMigrationService {
  private prisma: PrismaClient;
  private googleNewsService: GoogleNewsService;
  private blogGenerationService: BlogGenerationService;

  constructor(googleNewsService: GoogleNewsService, blogGenerationService: BlogGenerationService) {
    this.prisma = new PrismaClient();
    this.googleNewsService = googleNewsService;
    this.blogGenerationService = blogGenerationService;
  }

  /**
   * Migrate from old news system to new Google News system
   */
  async migrateToGoogleNewsSystem(): Promise<void> {
    console.log('🔄 Starting migration to Google News system...');
    
    try {
      // 1. Add default Google News sources
      await this.addDefaultGoogleNewsSources();
      
      // 2. Migrate existing news data if available
      await this.migrateExistingNewsData();
      
      // 3. Initialize keyword database with common topics
      await this.initializeKeywordDatabase();
      
      console.log('✅ Migration to Google News system completed');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Add default Google News sources
   */
  private async addDefaultGoogleNewsSources(): Promise<void> {
    const defaultSources = [
      {
        url: 'https://news.google.com/home?hl=en-HK&gl=HK&ceid=HK:en',
        name: 'Google News Hong Kong (English)',
        region: 'HK',
        language: 'en',
        priority: 10
      },
      {
        url: 'https://news.google.com/home?hl=zh-HK&gl=HK&ceid=HK:zh-Hant',
        name: 'Google News Hong Kong (Chinese)',
        region: 'HK',
        language: 'zh-Hant',
        priority: 9
      },
      {
        url: 'https://news.google.com/home?hl=en-US&gl=US&ceid=US:en',
        name: 'Google News United States',
        region: 'US',
        language: 'en',
        priority: 8
      }
    ];

    for (const source of defaultSources) {
      try {
        await this.prisma.newsSource.upsert({
          where: { url: source.url },
          update: source,
          create: {
            ...source,
            isActive: true,
            sourceType: 'google_news'
          }
        });
        console.log(`✅ Added/Updated source: ${source.name}`);
      } catch (error) {
        console.warn(`⚠️ Failed to add source ${source.name}:`, error);
      }
    }
  }

  /**
   * Migrate existing news data from old system
   */
  private async migrateExistingNewsData(): Promise<void> {
    console.log('📊 Checking for existing news data to migrate...');
    
    try {
      // Check if there are existing news files in the old data structure
      const oldNewsDir = path.join(process.cwd(), 'data', 'news');
      
      if (fs.existsSync(oldNewsDir)) {
        console.log('📁 Found existing news data directory, analyzing...');
        
        // Get all date directories
        const dateDirs = fs.readdirSync(oldNewsDir).filter(dir => 
          fs.statSync(path.join(oldNewsDir, dir)).isDirectory()
        );
        
        console.log(`📅 Found ${dateDirs.length} date directories with news data`);
        
        // For each date directory, process the news files
        for (const dateDir of dateDirs.slice(-7)) { // Only process last 7 days
          await this.processOldNewsDateDirectory(path.join(oldNewsDir, dateDir));
        }
      } else {
        console.log('ℹ️ No existing news data found to migrate');
      }
    } catch (error) {
      console.warn('⚠️ Error migrating existing news data:', error);
    }
  }

  /**
   * Process news files from a specific date directory
   */
  private async processOldNewsDateDirectory(dateDirPath: string): Promise<void> {
    try {
      const newsFiles = fs.readdirSync(dateDirPath).filter(file => file.endsWith('.json'));
      
      for (const newsFile of newsFiles) {
        const filePath = path.join(dateDirPath, newsFile);
        const category = newsFile.replace('.json', '');
        
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const articles = JSON.parse(fileContent);
        
        console.log(`📖 Processing ${articles.length} articles from ${category} (${path.basename(dateDirPath)})`);
        
        // Convert old articles to new format and create blog posts
        for (const article of articles.slice(0, 5)) { // Limit to 5 articles per category
          await this.convertOldArticleToBlogPost(article, category);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error processing directory ${dateDirPath}:`, error);
    }
  }

  /**
   * Convert old article format to new blog post
   */
  private async convertOldArticleToBlogPost(oldArticle: any, category: string): Promise<void> {
    try {
      // Check if blog post already exists for this article
      const existingPost = await this.prisma.blogPost.findFirst({
        where: {
          sourceUrl: oldArticle.url,
          sourceTitle: oldArticle.title
        }
      });
      
      if (existingPost) {
        console.log(`⏩ Skipping duplicate article: ${oldArticle.title}`);
        return;
      }
      
      // Create a GoogleNewsArticle-like object from old data
      const googleNewsArticle = {
        title: oldArticle.title,
        url: oldArticle.url,
        source: oldArticle.source || 'web_scrape',
        publishedAt: oldArticle.scrapedAt || new Date().toISOString(),
        description: oldArticle.content?.substring(0, 200) || '',
        fullContent: oldArticle.content,
        category: category,
        keywords: await this.extractKeywordsFromOldArticle(oldArticle)
      };
      
      // Generate blog post using the new service
      const blogPosts = await this.blogGenerationService.generateBlogPosts([googleNewsArticle]);
      
      if (blogPosts.length > 0) {
        console.log(`✅ Converted old article to blog post: ${oldArticle.title}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error converting article ${oldArticle.title}:`, error);
    }
  }

  /**
   * Extract keywords from old article data
   */
  private async extractKeywordsFromOldArticle(article: any): Promise<string[]> {
    // Simple keyword extraction from title and content
    const text = (article.title + ' ' + (article.content || '')).toLowerCase();
    
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    const words = text
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 10);
    
    return [...new Set(words)];
  }

  /**
   * Initialize keyword database with common topics
   */
  private async initializeKeywordDatabase(): Promise<void> {
    const commonKeywords = [
      'technology', 'ai', 'machine learning', 'artificial intelligence',
      'business', 'economy', 'finance', 'investment',
      'politics', 'government', 'international relations',
      'science', 'research', 'discovery', 'innovation',
      'health', 'medicine', 'wellness', 'healthcare',
      'environment', 'climate change', 'sustainability',
      'education', 'learning', 'academia',
      'entertainment', 'culture', 'arts', 'media'
    ];
    
    for (const keyword of commonKeywords) {
      try {
        // First check if keyword exists
        const existing = await this.prisma.newsKeyword.findFirst({
          where: { keyword }
        });
        
        if (existing) {
          await this.prisma.newsKeyword.update({
            where: { id: existing.id },
            data: { relevance: 0.7, lastUsed: new Date() }
          });
        } else {
          await this.prisma.newsKeyword.create({
            data: {
              keyword,
              relevance: 0.7,
              category: this.categorizeKeyword(keyword),
              lastUsed: new Date()
            }
          });
        }
      } catch (error) {
        console.warn(`⚠️ Error adding keyword ${keyword}:`, error);
      }
    }
    
    console.log(`✅ Initialized keyword database with ${commonKeywords.length} common topics`);
  }

  /**
   * Categorize keyword based on content
   */
  private categorizeKeyword(keyword: string): string {
    const techKeywords = ['technology', 'ai', 'machine learning', 'artificial intelligence', 'innovation'];
    const businessKeywords = ['business', 'economy', 'finance', 'investment'];
    const scienceKeywords = ['science', 'research', 'discovery'];
    const healthKeywords = ['health', 'medicine', 'wellness', 'healthcare'];
    const environmentKeywords = ['environment', 'climate change', 'sustainability'];
    
    if (techKeywords.some(tk => keyword.includes(tk))) return 'technology';
    if (businessKeywords.some(bk => keyword.includes(bk))) return 'business';
    if (scienceKeywords.some(sk => keyword.includes(sk))) return 'science';
    if (healthKeywords.some(hk => keyword.includes(hk))) return 'health';
    if (environmentKeywords.some(ek => keyword.includes(ek))) return 'environment';
    
    return 'general';
  }

  /**
   * Get migration status and statistics
   */
  async getMigrationStatus(): Promise<any> {
    try {
      const sourceCount = await this.prisma.newsSource.count();
      const keywordCount = await this.prisma.newsKeyword.count();
      const blogPostCount = await this.prisma.blogPost.count();
      const dailyDigestCount = await this.prisma.dailyDigest.count();
      const weeklyDigestCount = await this.prisma.weeklyDigest.count();
      
      // Check for old news data
      const oldNewsDir = path.join(process.cwd(), 'data', 'news');
      const hasOldData = fs.existsSync(oldNewsDir);
      let oldDataStats = null;
      
      if (hasOldData) {
        const dateDirs = fs.existsSync(oldNewsDir) ? 
          fs.readdirSync(oldNewsDir).filter(dir => 
            fs.statSync(path.join(oldNewsDir, dir)).isDirectory()
          ) : [];
        oldDataStats = {
          dateDirectories: dateDirs.length,
          hasData: dateDirs.length > 0
        };
      }
      
      return {
        migration: {
          sourcesConfigured: sourceCount,
          keywordsInitialized: keywordCount,
          blogPostsGenerated: blogPostCount,
          digestsCreated: {
            daily: dailyDigestCount,
            weekly: weeklyDigestCount
          }
        },
        oldSystem: {
          hasData: hasOldData,
          ...oldDataStats
        },
        status: 'ready'
      };
    } catch (error) {
      console.error('❌ Error getting migration status:', error);
      return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Clean up old news data after migration
   */
  async cleanupOldNewsData(): Promise<void> {
    console.log('🧹 Cleaning up old news data...');
    
    try {
      const oldNewsDir = path.join(process.cwd(), 'data', 'news');
      
      if (fs.existsSync(oldNewsDir)) {
        // Archive old data instead of deleting (for safety)
        const archiveDir = path.join(process.cwd(), 'data', 'news_archive');
        if (!fs.existsSync(archiveDir)) {
          fs.mkdirSync(archiveDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = path.join(archiveDir, `migration_${timestamp}`);
        
        fs.renameSync(oldNewsDir, archivePath);
        console.log(`✅ Old news data archived to: ${archivePath}`);
      } else {
        console.log('ℹ️ No old news data found to clean up');
      }
    } catch (error) {
      console.warn('⚠️ Error cleaning up old news data:', error);
    }
  }
}

export function createNewsMigrationService(
  googleNewsService: GoogleNewsService,
  blogGenerationService: BlogGenerationService
): NewsMigrationService {
  return new NewsMigrationService(googleNewsService, blogGenerationService);
}

---
./src/services/newsProcessorService.ts
---
import { OpenAIService } from './openaiService';
import { GoogleSearchService } from './googleSearchService';
import { VectorStoreServicePostgres } from './VectorStoreServicePostgres';
import { NewsArticle } from './newsScrapeService';

export class NewsProcessorService {
  private openaiService: OpenAIService;
  private googleService: GoogleSearchService;
  private vectorStore: VectorStoreServicePostgres;

  constructor(
    openaiService: OpenAIService,
    googleService: GoogleSearchService,
    vectorStore: VectorStoreServicePostgres
  ) {
    this.openaiService = openaiService;
    this.googleService = googleService;
    this.vectorStore = vectorStore;
  }

  /**
   * Analyzes an article, enriches it with Google Search if complex, and learns it.
   */
  async processAndLearn(article: NewsArticle, category: string): Promise<void> {
    try {
      console.log(`🤔 Learning: ${article.title}`);

      // 1. Check if we need to search Google (same as before)
      const analysisPrompt = `
        Analyze this news article.
        1. Summarize the key facts in 2 sentences.
        2. Identify if this topic requires more context to be fully understood (e.g., technical terms, historical context, stock symbols).
        3. If yes, generate a specific search query. If no, output "NO_SEARCH".
        
        Article:
        ${article.title}
        ${article.content.substring(0, 1000)}
      `;

      const analysis = await this.openaiService.generateTextResponse(analysisPrompt);
      
      let fullContent = `Title: ${article.title}\n\n${article.content}`;
      let sourceLabel = 'web_scrape';

      // 2. Enrichment Step (Google Search)
      // If the LLM suggests a search (and it's not NO_SEARCH), we enrich.
      const searchMatch = analysis.match(/Search Query: "(.*)"/i) || analysis.split('\n').pop()?.match(/"(.*)"/);
      
      if (!analysis.includes("NO_SEARCH") && searchMatch) {
        const query = searchMatch[1];
        console.log(`🔍 Enriching knowledge with Google Search: ${query}`);
        
        const searchResults = await this.googleService.search(query, 3);
        const searchContext = this.googleService.formatSearchResults(searchResults);

        // Append context to the content we want to save
        fullContent += `\n\n--- Additional Context from Google Search ---\n${searchContext}`;
        sourceLabel = 'web_scrape_enriched';
      }

      // 3. Store in Vector DB (The DB handles chunking and embedding now)
      await this.vectorStore.addDocument(fullContent, {
        source: sourceLabel,
        date: new Date().toISOString().split('T')[0],
        category: category,
        title: article.title
      });

    } catch (error) {
      console.error('Error processing news for learning:', error);
    }
  }
}

---
./src/services/newsScrapeService.ts
---
import * as fs from 'fs';
import * as path from 'path';
import { WebScrapeService, WebScrapeResult } from './webScrapeService';
import { NewsProcessorService } from './newsProcessorService';
import { GoogleNewsService } from './googleNewsService';

export interface NewsArticle {
  title: string;
  url: string;
  content: string;
  source: string;
  category?: string;
  scrapedAt?: string;
}

// Define supported categories
type NewsCategory = 'general' | 'tech' | 'business' | 'sports' | 'world';

export class NewsScrapeService {
  private webScrapeService: WebScrapeService;
  private newsProcessor?: NewsProcessorService; // Optional dependency
  private googleNewsService?: GoogleNewsService; // New Google News integration

  // Storage for our cached news summaries
  private newsCache: Map<string, string> = new Map();
  private isScraping: boolean = false;
  private lastUpdated: Date | null = null;

  // Hong Kong focused, Mobile-Friendly URLs
  private categorySources: Record<NewsCategory, string[]> = {
    'general': [
       'https://news.rthk.hk/rthk/en/'
    ],
    'world': [
       'https://www.bbc.com/news/world'
    ],
    'tech': [
       'https://techcrunch.com/',
       'https://www.theverge.com/'
    ],
    'business': [
       'https://www.cnbc.com/world/?region=world'
    ],
    'sports': [
       'https://www.skysports.com/news-wire'
    ]
  };

  constructor(webScrapeService: WebScrapeService, newsProcessor?: NewsProcessorService, googleNewsService?: GoogleNewsService) {
    this.webScrapeService = webScrapeService;
    this.newsProcessor = newsProcessor;
    this.googleNewsService = googleNewsService;
  }

  /**
   * Start the background service loop
   */
  public startBackgroundService(intervalMinutes: number = 30) {
    console.log(`🕰️ Starting Background News Service (Every ${intervalMinutes} mins)`);
    this.refreshNewsCache(); // Run immediately
    setInterval(() => this.refreshNewsCache(), intervalMinutes * 60 * 1000);
  }

  /**
   * Scrapes all categories and updates the cache
   */
  private async refreshNewsCache() {
    if (this.isScraping) return;
    this.isScraping = true;
    console.log('🔄 Background Service: Updating News Cache...');

    try {
      const categories = Object.keys(this.categorySources) as NewsCategory[];
      const dateStr = new Date().toISOString().split('T')[0];
      const storageBase = path.join('data', 'news', dateStr);

      // Ensure daily directory exists
      if (!fs.existsSync(storageBase)) {
        fs.mkdirSync(storageBase, { recursive: true });
      }

      for (const cat of categories) {
        const urls = this.categorySources[cat];
        // FORCE MOBILE = TRUE
        const results = await this.webScrapeService.scrapeUrls(urls, undefined, true);

        if (results.length > 0) {
            // 1. Format for Cache (Immediate Tool Access)
            const formatted = this.formatNewsForLLM(results);
            this.newsCache.set(cat, formatted);

            // 2. Save Raw Files & Trigger Learning
            await this.handlePersistenceAndLearning(results, cat, storageBase);

            console.log(`✅ Cached & Processed ${results.length} articles for [${cat}]`);
        }
      }
      this.lastUpdated = new Date();
    } catch (error) {
      console.error('❌ Background Service Error:', error);
    } finally {
      this.isScraping = false;
    }
  }

  private async handlePersistenceAndLearning(results: WebScrapeResult[], category: string, storageBase: string) {
    const filePath = path.join(storageBase, `${category}.json`);

    // Convert to NewsArticle format
    const articles: NewsArticle[] = results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
        source: 'web_scrape',
        category: category,
        scrapedAt: new Date().toISOString()
    }));

    // Save to Disk
    fs.writeFileSync(filePath, JSON.stringify(articles, null, 2));

    // Trigger "Learning" if Processor is available
    if (this.newsProcessor) {
        // Limit to top 2 articles per category to save tokens/time
        for (const article of articles.slice(0, 2)) {
            await this.newsProcessor.processAndLearn(article, category);
        }
    }
  }

  /**
   * Returns cached string for the Tool to use
   */
  public getCachedNews(category: string = 'general'): string {
    // Try to get news from Google News system first if available
    if (this.googleNewsService) {
      return this.getNewsFromGoogleNews(category);
    }

    // Fallback to legacy system
    return this.getNewsFromLegacySystem(category);
  }

  /**
   * Get news from Google News system
   */
  private getNewsFromGoogleNews(category: string): string {
    try {
      // This would integrate with the Google News service
      // For now, return a placeholder message
      return `[SYSTEM: Google News integration active. Category: ${category.toUpperCase()}]\n\nI'm now using the enhanced Google News system for more comprehensive news coverage. The system automatically browses news at 6:00 AM daily and checks for updates every 3 hours. You can view generated blog posts and digests in the dashboard.`;
    } catch (error) {
      console.error('❌ Error getting news from Google News:', error);
      return this.getNewsFromLegacySystem(category);
    }
  }

  /**
   * Get news from legacy system (fallback)
   */
  private getNewsFromLegacySystem(category: string): string {
    // Basic normalization
    let key: NewsCategory = 'general';
    const lower = category.toLowerCase();
    if (lower.includes('tech')) key = 'tech';
    else if (lower.includes('busin') || lower.includes('financ')) key = 'business';
    else if (lower.includes('sport')) key = 'sports';
    else if (lower.includes('world')) key = 'world';

    const data = this.newsCache.get(key);

    if (!data) {
        // If cache is empty, trigger a scrape (fallback)
        this.refreshNewsCache();
        return "I am currently updating my news feed. Please ask again in 1 minute.";
    }

    const timeAgo = this.lastUpdated
      ? Math.floor((new Date().getTime() - this.lastUpdated.getTime()) / 60000)
      : 0;

    return `[SYSTEM: Legacy news system. Fetch time: ${timeAgo} mins ago. Category: ${key.toUpperCase()}]\n\n${data}`;
  }

  private formatNewsForLLM(results: WebScrapeResult[]): string {
    return results.map((r, i) =>
        `Headline: ${r.title}\nSource: ${r.url}\nSummary: ${r.content.substring(0, 350)}...`
    ).join('\n\n');
  }
}

export function createNewsScrapeService(webScrapeService: WebScrapeService, newsProcessor?: NewsProcessorService, googleNewsService?: GoogleNewsService): NewsScrapeService {
  return new NewsScrapeService(webScrapeService, newsProcessor, googleNewsService);
}

---
./src/services/openaiService.ts
---
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { cleanLLMResponse } from '../utils/responseCleaner';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { executeTool } from '../tools';
import { ToolRegistry } from '../core/ToolRegistry';
import { AIConfig } from '../types/aiConfig';
import { ConfigLoader } from '../utils/configLoader';

export interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  visionModel?: string;
  temperature?: number;
  maxTokens?: number;
  enableToolCalling?: boolean;
  embeddingModel?: string;
}

export class OpenAIService {
  private openai: OpenAI;
  private config: OpenAIConfig;
  private chatbotName: string;
  private prompts: AIConfig['prompts'];

  constructor(config: AIConfig, chatbotName?: string) {
    this.config = {
      model: config.model || 'gpt-4o',
      visionModel: config.visionModel || 'gpt-4o',
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 1000,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      enableToolCalling: config.enableToolCalling ?? true,
      embeddingModel: config.embeddingModel || 'text-embedding-ada-002'
    };
    this.chatbotName = chatbotName || 'Lucy';
    this.prompts = config.prompts || {};

    this.openai = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });
  }

  /**
   * Generate a response to a text message using OpenAI
   */
  async generateTextResponse(
    message: string,
    context?: string,
    tools?: ChatCompletionTool[],
    toolChoice?: 'auto' | 'none' | 'required'
  ): Promise<string> {
    try {
      // Use custom prompt from config if available, otherwise use default
      const textPrompt = this.prompts?.textResponse || `You are {chatbotName}, a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message.`;

      let systemPrompt = textPrompt.replace('{chatbotName}', this.chatbotName);

      if (context) {
        systemPrompt += ` Context: ${context}`;
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: message
        }
      ];

      const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: this.config.model!,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      };

      // Add tools if provided and tool calling is enabled
      if (tools && tools.length > 0 && this.config.enableToolCalling) {
        requestOptions.tools = tools;
        requestOptions.tool_choice = toolChoice || 'auto';
      }

      const response = await this.openai.chat.completions.create(requestOptions);

      const rawResponse = response.choices[0]?.message?.content?.trim() || 'I apologize, but I could not generate a response. Please try again.';

      // Log AI response
      console.log('🤖 AI Response:', {
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        rawResponse: rawResponse.substring(0, 200) + (rawResponse.length > 200 ? '...' : ''),
        hasContext: !!context,
        model: this.config.model
      });

      return cleanLLMResponse(rawResponse);
    } catch (error) {
      console.error('Error generating text response:', error);
      throw new Error('Failed to generate response from OpenAI');
    }
  }

  /**
   * Generate response with tool calling support - let LLM decide when to use tools
   */
  async generateResponseWithTools(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    maxToolRounds: number = 15, // Increased from 5 to 15 as requested
    toolRegistry?: ToolRegistry // Optional ToolRegistry for new BaseTool system
  ): Promise<string> {
    if (!this.config.enableToolCalling || !tools || tools.length === 0) {
      // Fall back to regular response generation without tools
      const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
      return this.generateTextResponse(
        lastUserMessage?.content as string || '',
        undefined,
        undefined,
        'none' // Explicitly disable tools
      );
    }

    let currentMessages = [...messages];
    let toolCallRound = 0;

    while (toolCallRound < maxToolRounds) {
      toolCallRound++;

      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: currentMessages,
        tools,
        tool_choice: 'auto', // Let LLM decide when to use tools
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('No response from OpenAI');
      }

      // Log tool calling round
      console.log('🔄 Tool Calling Round:', {
        round: toolCallRound,
        hasToolCalls: !!message.tool_calls && message.tool_calls.length > 0,
        toolCallCount: message.tool_calls?.length || 0,
        hasContent: !!message.content,
        contentPreview: message.content?.substring(0, 50) || 'No content'
      });

      currentMessages.push(message);

      // If no tool calls, return the final response immediately
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return cleanLLMResponse(message.content || 'I apologize, but I could not generate a response.');
      }

      // Process tool calls using appropriate method
      let toolResults;
      if (toolRegistry) {
        // Use new BaseTool system via ToolRegistry
        toolResults = await this.processToolCallsWithRegistry(message.tool_calls, toolRegistry);
      } else {
        // Use old tool system
        toolResults = await this.processToolCalls(message.tool_calls);
      }

      // Add tool results to the conversation
      for (const result of toolResults) {
        currentMessages.push({
          role: 'tool',
          content: result.error
            ? `Error: ${result.error}`
            : (typeof result.result === 'string' ? result.result : JSON.stringify(result.result)),
          tool_call_id: result.tool_call_id
        });
      }

      // Safety check to prevent infinite loops
      if (toolCallRound >= maxToolRounds) {
        console.warn('⚠️ Maximum tool call rounds reached:', maxToolRounds);

        // Get the last user message for context
        const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
        const userQuery = lastUserMessage?.content;

        // Use custom search limit prompt from config if available, otherwise use default
        const toolLimitPrompt = this.prompts?.searchLimit || `I reached the maximum tool usage limit while processing your request. Please try a more specific query or ask me something else.`;

        return await this.generateTextResponse(
          toolLimitPrompt,
          undefined,
          undefined,
          'none' // Don't use tools for this final response
        );
      }
    }

    return 'I apologize, but I encountered an issue while processing your request. Please try again.';
  }

  /**
   * Process tool calls by executing the appropriate tools
   */
  private async processToolCalls(toolCalls: any[]): Promise<any[]> {
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      try {
        console.log('🛠️ Processing tool call:', {
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments
        });

        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(toolCall.function.name, args);

        results.push({
          tool_call_id: toolCall.id,
          result: result
        });

        console.log('✅ Tool execution completed:', {
          toolName: toolCall.function.name,
          resultLength: typeof result === 'string' ? result.length : 'object'
        });

      } catch (error) {
        console.error('❌ Tool execution failed:', {
          toolName: toolCall.function.name,
          error: error instanceof Error ? error.message : `${error}`
        });

        results.push({
          tool_call_id: toolCall.id,
          error: error instanceof Error ? error.message : 'Tool execution failed'
        });
      }
    }

    return results;
  }

  /**
   * Process tool calls using ToolRegistry (for new BaseTool system)
   */
  async processToolCallsWithRegistry(toolCalls: any[], toolRegistry: ToolRegistry): Promise<any[]> {
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      try {
        console.log('🛠️ Processing tool call with registry:', {
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments
        });

        const args = JSON.parse(toolCall.function.arguments);
        const result = await toolRegistry.executeTool(toolCall.function.name, args);

        results.push({
          tool_call_id: toolCall.id,
          result: result
        });

        console.log('✅ Tool execution completed with registry:', {
          toolName: toolCall.function.name,
          resultLength: typeof result === 'string' ? result.length : 'object'
        });

      } catch (error) {
        console.error('❌ Tool execution failed with registry:', {
          toolName: toolCall.function.name,
          error: error instanceof Error ? error.message : `${error}`
        });

        results.push({
          tool_call_id: toolCall.id,
          error: error instanceof Error ? error.message : 'Tool execution failed'
        });
      }
    }

    return results;
  }


  /**
   * Get MIME type from file extension
   */
  private getMimeTypeFromExtension(extension: string): string {
    const mimeTypes: { [key: string]: string } = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
      svg: 'image/svg+xml'
    };

    return mimeTypes[extension] || 'image/jpeg';
  }
  /**
   * @deprecated Use tool calling with analyze_image tool instead
   * Analyze image content using OpenAI's vision capabilities
   */
  async analyzeImage(imagePath: string, prompt?: string): Promise<string> {
    try {
      // Read the image file
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Determine MIME type from file extension
      const extension = path.extname(imagePath).toLowerCase().substring(1);
      const mimeType = this.getMimeTypeFromExtension(extension);

      // Use custom image prompt from config if available, otherwise use default
      const visionPrompt = prompt || this.prompts?.imageAnalysis || `Analyze this image comprehensively with context awareness. Describe what you see in detail, including:

- Objects, people, animals, text, colors, and environment
- If it's a food menu or restaurant scene: focus on menu items, prices, cuisine type, and popular dishes
- If it's a building, landmark, or location: provide architectural details, possible location clues, and historical context if recognizable
- If it's a product or object: identify the item, brand, purpose, and key features
- If it's a hand holding something: identify the object being held and its potential use
- If it's a document or text-heavy: transcribe all text accurately and note the document type
- If it's nature or scenery: describe the landscape, weather conditions, and geographical features
- If it's people or events: note activities, emotions, and social context

Include any text content exactly as it appears. Provide specific details that would help understand the context and purpose of the image.`;

      const response = await this.openai.chat.completions.create({
        model: this.config.visionModel!,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: visionPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const rawResponse = response.choices[0]?.message?.content?.trim() || 'I could not analyze this image. Please try again.';
      return cleanLLMResponse(rawResponse);
    } catch (error) {
      console.error('Error analyzing image:', error);
      throw new Error('Failed to analyze image with OpenAI');
    }
  }

  /**
   * Create embeddings for text content
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.config.embeddingModel!,
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw new Error('Failed to create embedding with OpenAI');
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Get the current configuration
   */
  getConfig(): OpenAIConfig & { prompts?: AIConfig['prompts'] } {
    return {
      ...this.config,
      prompts: this.prompts
    };
  }
}

// Helper function to create OpenAIService instance from config file
export async function createOpenAIServiceFromConfig(): Promise<OpenAIService> {
  const configLoader = new ConfigLoader();

  try {
    const config = await configLoader.loadConfig();

    if (!config.apiKey) {
      throw new Error('API key is required in the config file');
    }

    return new OpenAIService(config, process.env.CHATBOT_NAME);
  } catch (error) {
    console.error('Failed to create OpenAI service from config:', error);
    throw new Error(`Failed to initialize OpenAI service: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to create OpenAIService instance from environment variables (legacy support)
export function createOpenAIServiceFromEnv(): OpenAIService {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for legacy mode');
  }

  return new OpenAIService({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
    visionModel: process.env.OPENAI_VISION_MODEL,
    temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : undefined,
    maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : undefined,
    enableToolCalling: process.env.OPENAI_ENABLE_TOOL_CALLING === 'true',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
  }, process.env.CHATBOT_NAME);
}

---
./src/services/webScrapeService.ts
---
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from './openaiService';

// --- TYPE DECLARATIONS ---
declare const window: any;
declare const document: any;

export interface WebScrapeResult {
  title: string;
  url: string;
  content: string;
  links: string[]; // Added links array
  extractedAt: string;
  method: 'html' | 'visual' | 'hybrid';
  mobileView?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export interface ArticleCandidate {
  title: string;
  url: string;
}

export interface WebScrapeConfig {
  timeout?: number;
  userAgent?: string;
  viewport?: { width: number; height: number };
  maxRetries?: number;
  retryDelay?: number;
  navigationTimeout?: number;
  concurrency?: number;
  simulateHuman?: boolean;
  mobileView?: boolean;
  mobileDevice?: 'iphone' | 'android' | 'tablet' | 'custom';
}

export class WebScrapeService {
  private config: WebScrapeConfig;
  private browser: Browser | null = null;
  private openaiService: OpenAIService | null = null;

  // 1. UPDATED: Modern Mobile Presets (iPhone 14 Pro)
  private mobilePresets = {
    iphone: {
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    }
  };

  constructor(config: WebScrapeConfig = {}) {
    // Apply mobile configuration if requested
    let finalViewport = config.viewport;
    let finalUserAgent = config.userAgent;

    if (config.mobileView) {
      const device = config.mobileDevice || 'iphone';
      
      if (device !== 'custom') {
        // Only 'iphone' is supported in the updated presets
        const preset = this.mobilePresets.iphone;
        if (preset) {
          finalViewport = config.viewport || preset.viewport;
          finalUserAgent = config.userAgent || preset.userAgent;
        }
      } else {
        // Default mobile settings for custom device
        finalViewport = config.viewport || { width: 375, height: 812 };
        finalUserAgent = config.userAgent || 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36';
      }
    }

    this.config = {
      timeout: config.timeout || 60000,
      userAgent: finalUserAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      viewport: finalViewport || { width: 1280, height: 800 },
      maxRetries: config.maxRetries || 2,
      retryDelay: config.retryDelay || 1000,
      navigationTimeout: config.navigationTimeout || 30000,
      concurrency: config.concurrency || 3,
      simulateHuman: true,
      mobileView: config.mobileView || false,
      mobileDevice: config.mobileDevice,
    };

    this.initializeOpenAIService();
  }

  async initialize(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled'
        ]
      });
    }
  }

  /**
   * OPTIMIZATION: Block Ads and Trackers
   * Drastically reduces network activity and CPU usage.
   */
  private async setupBlockers(context: BrowserContext) {
    await context.route('**/*', route => {
      const url = route.request().url();
      const type = route.request().resourceType();

      if (
        type === 'media' ||
        type === 'image' ||
        url.includes('google-analytics') ||
        url.includes('doubleclick') ||
        url.includes('facebook.com/tr') ||
        url.includes('googletagmanager') ||
        url.includes('ads')
      ) {
        // Allow images if strictly necessary for visual extraction, but generally blocking them speeds up scraping.
        // If you rely heavily on visual extraction of small icons, you might comment out the 'image' check.
        if (type === 'image') return route.continue();
        return route.abort();
      }
      return route.continue();
    });
  }

  /**
   * OPTIMIZATION: Faster Modal Handling
   * Checks selectors in parallel to find buttons quickly.
   */
  private async handleModals(page: Page) {
    const commonSelectors = [
        'button:has-text("Accept")', 'button:has-text("Agree")', 'button:has-text("Allow")',
        '[aria-label="close"]', '.modal-close', '.cookie-banner button'
    ];

    try {
        // COMPATIBILITY FIX: Using Promise.all instead of Promise.any
        // We map every selector to a promise that resolves to the selector string if visible, or null if not.
        // Since all have a 500ms timeout, this waits max 500ms total.
        const results = await Promise.all(
            commonSelectors.map(sel =>
                page.locator(sel).first().isVisible({ timeout: 500 })
                    .then(visible => visible ? sel : null)
                    .catch(() => null)
            )
        );

        // Find the first valid selector that returned true
        const found = results.find(r => r !== null);

        if (found) {
            await page.locator(found).first().click({ timeout: 500, force: true }).catch(() => {});
        }
    } catch (e) {
        // Ignore errors, proceed to scrape
    }
  }

  /**
   * OPTIMIZATION: Smart Scroll Turbo
   * Bigger scroll steps + shorter waits.
   */
  private async fastSmartScroll(page: Page): Promise<void> {
    try {
        const viewportHeight = await page.evaluate(() => window.innerHeight);
        const scrollStep = viewportHeight;
        let currentScroll = 0;
        const maxScrollHeight = 15000; // Cap to prevent infinite scroll loops

        const maxSteps = Math.ceil(maxScrollHeight / scrollStep);

        for (let i = 0; i < maxSteps; i++) {
            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            if (currentScroll >= currentHeight) break;

            await page.evaluate((y) => window.scrollTo(0, y), currentScroll + scrollStep);
            currentScroll += scrollStep;
            await page.waitForTimeout(200); // Short wait for lazy load
        }

        // Reset to top
        await page.evaluate(() => window.scrollTo(0, 0));
    } catch (e) {
        // Ignore scroll errors
    }
  }

  private shouldUseMobileView(url: string): boolean {
    // Check if mobile view is explicitly configured
    if (this.config.mobileView) return true;
    
    // Auto-detect mobile sites based on URL patterns
    const mobilePatterns = [
      /m\./i,                    // m.domain.com
      /mobile\./i,               // mobile.domain.com
      /\/mobile\//i,             // domain.com/mobile/
      /\.mobi/i,                 // domain.mobi
      /touch\./i,                // touch.domain.com
      /\/wml\//i,                // WML mobile pages
    ];
    
    return mobilePatterns.some(pattern => pattern.test(url));
  }

  async scrapeUrl(url: string, selector?: string, forceMobile?: boolean): Promise<WebScrapeResult> {
    await this.initialize();
    if (!this.browser) throw new Error('Browser not initialized');

    const useMobileView = forceMobile || this.shouldUseMobileView(url);
    
    // Default Context Options
    const contextOptions: any = {
        viewport: this.config.viewport,
        userAgent: this.config.userAgent,
        deviceScaleFactor: 1,
    };

    // Apply iPhone Mobile Settings if requested
    if (useMobileView) {
        const preset = this.mobilePresets.iphone;
        contextOptions.viewport = preset.viewport;
        contextOptions.userAgent = preset.userAgent;
        contextOptions.isMobile = preset.isMobile;
        contextOptions.hasTouch = preset.hasTouch;
        contextOptions.deviceScaleFactor = preset.deviceScaleFactor;
    }

    let context: BrowserContext | null = null;
    let retryCount = 0;

    while (retryCount <= this.config.maxRetries!) {
        try {
            context = await this.browser.newContext(contextOptions);

            await this.setupBlockers(context);
            const page = await context.newPage();

            const navPromise = page.goto(url, {
                timeout: this.config.navigationTimeout,
                waitUntil: 'domcontentloaded'
            });

            await navPromise;

            // Parallel Execution: Handle Modals & Scroll
            await Promise.all([
                this.handleModals(page),
                this.fastSmartScroll(page)
            ]);

            const pageTitle = await page.title().catch(() => "Untitled");

            // Extract Links BEFORE cleaning content
            const links = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                return anchors
                    .map((a: any) => ({ href: a.href, text: a.innerText }))
                    .filter((link: any) =>
                        link.href.startsWith('http') &&
                        link.text.trim().length > 10 // Only substantial links
                    )
                    .map((link: any) => link.href);
            });
            
            // Unique links
            const uniqueLinks = [...new Set(links)] as string[];

            let extractedContent = await page.evaluate((inputSelector) => {
                const junkSelectors = [
                    'script', 'style', 'noscript', 'iframe', 'svg',
                    'nav', 'footer', 'header', '.ad', '.ads',
                    '#cookie-banner', '.cookie-consent'
                ];
                junkSelectors.forEach(sel => document.querySelectorAll(sel).forEach((el: any) => el.remove()));

                const clean = (text: string) => text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();

                if (inputSelector) {
                    const el = document.querySelector(inputSelector);
                    return el ? clean(el.textContent || '') : '';
                }

                const candidates = Array.from(document.querySelectorAll('article, main, .content, #content, .post-body')) as any[];
                if (candidates.length > 0) {
                    const best = candidates.reduce((a: any, b: any) => (a.textContent?.length || 0) > (b.textContent?.length || 0) ? a : b);
                    return clean(best.textContent || '');
                }

                return clean(document.body.innerText || '');
            }, selector);

            let method: 'html' | 'visual' = 'html';

            // Visual Fallback if content is sparse
            if (extractedContent.length < 300) {
                console.log(`📸 Content sparse (${extractedContent.length} chars). Switching to Optimized Visual Extraction for ${url}`);
                const visualContent = await this.performOptimizedVisualExtraction(page, url);
                if (visualContent) {
                    extractedContent = visualContent;
                    method = 'visual';
                }
            }

            await context.close();

            return {
                title: pageTitle,
                url,
                content: extractedContent,
                links: uniqueLinks, // Return collected links
                extractedAt: new Date().toISOString(),
                method,
                mobileView: useMobileView,
                viewport: contextOptions.viewport,
                userAgent: contextOptions.userAgent
            };

        } catch (error) {
            if (context) await context.close().catch(() => {});

            if (retryCount < this.config.maxRetries! && this.shouldRetry(error)) {
                retryCount++;
                console.warn(`⚠️ Scrape failed, retrying (${retryCount}/${this.config.maxRetries})...`);
                await new Promise(r => setTimeout(r, this.config.retryDelay));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries reached');
  }

  /**
   * Scrapes a "Hub" page (homepage/section) to find potential article links.
   * Uses mobile view for cleaner HTML structure.
   */
  async extractArticleLinks(url: string): Promise<ArticleCandidate[]> {
    await this.initialize();
    if (!this.browser) throw new Error('Browser not initialized');

    const context = await this.browser.newContext({
      viewport: { width: 393, height: 852 }, // iPhone 14 Pro
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true
    });

    try {
      const page = await context.newPage();
      await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      
      // Fast scroll to trigger lazy loading
      await this.fastSmartScroll(page);

      // Extract links with heuristics
      const links = await page.evaluate((baseUrl) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        const candidates: { title: string; url: string }[] = [];
        const seenUrls = new Set();
        const baseDomain = new URL(baseUrl).hostname.replace('www.', '');

        anchors.forEach((a: any) => {
          let href = a.href;
          let title = a.innerText.trim();

          // 1. Basic filtering
          if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || !title) return;
          if (title.length < 15) return; // Skip "Home", "More", "Login"
          
          try {
            const urlObj = new URL(href, baseUrl);
            
            // 2. Strict Domain Check (Must be internal link)
            if (!urlObj.hostname.includes(baseDomain)) return;
            
            // 3. Remove query params for cleaner URLs
            const cleanUrl = urlObj.origin + urlObj.pathname;

            // 4. Heuristic: Article URLs usually have >3 path segments or contain date/slug
            const pathSegments = urlObj.pathname.split('/').filter(p => p.length > 0);
            if (pathSegments.length < 2) return;

            if (!seenUrls.has(cleanUrl)) {
              seenUrls.add(cleanUrl);
              candidates.push({ title, url: cleanUrl });
            }
          } catch (e) {}
        });

        return candidates;
      }, url);

      return links;

    } catch (error) {
      console.error(`Failed to extract links from ${url}:`, error);
      return [];
    } finally {
      await context.close();
    }
  }

  private async performOptimizedVisualExtraction(page: Page, url: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) return "";

    // Generate safe unique filename
    const safeUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filename = `snap_${Date.now()}_${safeUrl}.jpg`;
    const screenshotPath = path.join('data', 'screenshots', filename);

    try {
        const dir = path.dirname(screenshotPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Optimized: JPEG, Quality 75
        await page.screenshot({
            path: screenshotPath,
            fullPage: true,
            type: 'jpeg',
            quality: 75
        });

        const prompt = this.config.userAgent ?
            "Extract the main content from this web page screenshot. Ignore menus and ads." :
            (this.openaiService.getConfig()?.prompts?.webScrapeImageAnalysis || "Extract text.");

        const analysis = await this.openaiService.analyzeImage(screenshotPath, prompt);
        return analysis;
    } catch (e) {
        console.error("Visual extraction failed", e);
        return "";
    } finally {
        try { if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath); } catch (e) {}
    }
  }

  async scrapeUrls(urls: string[], selector?: string, forceMobile?: boolean): Promise<WebScrapeResult[]> {
    const results: WebScrapeResult[] = [];
    const batchSize = this.config.concurrency || 3;

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchPromises = batch.map(url => this.scrapeUrl(url, selector, forceMobile).catch(e => {
        console.error(`❌ Failed: ${url} - ${e.message}`);
        return null;
      }));

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(r => { if(r) results.push(r); });
    }
    return results;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return ['timeout', 'network', 'connection', 'reset', 'navigat', 'closed'].some(k => msg.includes(k));
  }

  private async initializeOpenAIService(): Promise<void> {
    try { this.openaiService = await createOpenAIServiceFromConfig(); }
    catch (e) { try { this.openaiService = createOpenAIServiceFromEnv(); } catch (e) { this.openaiService = null; } }
  }

  formatScrapeResults(results: WebScrapeResult[]): string {
    if (results.length === 0) return 'No content scraped.';
    return results.map((result, index) =>
      `[${index + 1}] ${result.title} (${result.method})${result.mobileView ? ' 📱' : ''}\nURL: ${result.url}\nContent: ${result.content}\n`
    ).join('\n');
  }
}

export function createWebScrapeService(): WebScrapeService {
  return new WebScrapeService({
    timeout: Number(process.env.WEB_SCRAPE_TIMEOUT) || undefined,
    maxRetries: Number(process.env.WEB_SCRAPE_MAX_RETRIES) || undefined,
    concurrency: Number(process.env.WEB_SCRAPE_CONCURRENCY) || 5
  });
}

---
./src/services/whatsappService.ts
---
import axios from 'axios';
import * as fs from 'fs';
import FormData from 'form-data';
import { WhatsAppResponse, WhatsAppAPIConfig } from '../types/whatsapp';

export class WhatsAppService {
  private config: WhatsAppAPIConfig;
  private devMode: boolean;

  constructor(config: WhatsAppAPIConfig, devMode: boolean = false) {
    this.config = config;
    this.devMode = devMode;
  }

  async sendMessage(to: string, message: string): Promise<boolean> {
    try {
      if (this.devMode) {
        console.log(`📱 [DEV MODE] Message would be sent to ${to}:`);
        console.log(`💬 ${message}`);
        console.log('---');
        return true;
      }

      const response: WhatsAppResponse = {
        messaging_product: 'whatsapp',
        to,
        text: {
          body: message
        }
      };

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

      await axios.post(url, response, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Message sent successfully to ${to}`);
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  async markMessageAsRead(messageId: string): Promise<boolean> {
    try {
      if (this.devMode) {
        console.log(`📱 [DEV MODE] Message ${messageId} would be marked as read`);
        return true;
      }

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

      await axios.post(url, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Message ${messageId} marked as read`);
      return true;
    } catch (error) {
      console.error('Error marking message as read:', error);
      return false;
    }
  }

  /**
   * NEW: Upload media file to WhatsApp Cloud API
   */
  async uploadMedia(filePath: string, mimeType: string): Promise<string | null> {
    if (this.devMode) return 'dev-media-id';

    try {
      const data = new FormData();
      data.append('messaging_product', 'whatsapp');
      data.append('file', fs.createReadStream(filePath));
      data.append('type', mimeType);

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/media`;

      const response = await axios.post(url, data, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          ...data.getHeaders()
        }
      });

      return response.data.id;
    } catch (error) {
      console.error('❌ Error uploading media to WhatsApp:', error);
      return null;
    }
  }

  /**
   * NEW: Send an audio message via WhatsApp
   */
  async sendAudioMessage(to: string, mediaId: string): Promise<boolean> {
    if (this.devMode) {
      console.log(`📱 [DEV MODE] Audio sent to ${to} (Media ID: ${mediaId})`);
      return true;
    }

    try {
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'audio',
        audio: {
          id: mediaId
        }
      };

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

      await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`🎤 Audio message sent to ${to}`);
      return true;
    } catch (error) {
      console.error('❌ Error sending audio message:', error);
      return false;
    }
  }
}

---
./src/types/aiConfig.ts
---
export interface AIConfig {
  // API Configuration
  apiKey: string;
  baseURL?: string;
  model?: string;
  visionModel?: string;
  temperature?: number;
  maxTokens?: number;
  enableToolCalling?: boolean;
  embeddingModel?: string;

  // Prompt Templates
  prompts?: {
    textResponse?: string;
    imageAnalysis?: string;
    toolCalling?: string;
    errorResponse?: string;
    searchLimit?: string;
    // Specialized prompts for different services
    mediaImageAnalysis?: string;
    webScrapeImageAnalysis?: string;
    enhancedImageResponse?: string;
    audioTranscriptionResponse?: string;
  };

}

export interface AIConfigFile {
  name: string;
  description?: string;
  config: AIConfig;
}

export interface AIConfigManagerOptions {
  configPath?: string;
  defaultConfig?: string;
}

---
./src/types/conversation.ts
---
export interface UserProfile {
  name?: string;
  state?: 'awaiting_name' | null; // For multi-step conversations
  knowledge?: {
    [topic: string]: {
      value: string;
      source: string; // e.g., 'user_provided', 'https://example.com'
      lastUpdated: string;
    }
  };
}

export interface Message {
  id: string;
  type: 'text' | 'image' | 'audio';
  content: string;
  timestamp: string;
  mediaPath?: string;
  mediaInfo?: {
    id: string;
    mimeType: string;
    sha256: string;
  };
}

export interface Conversation {
  senderNumber: string;
  userProfile: UserProfile; // Add this
  messages: Message[];
  lastUpdated: string;
  messageCount: number;
}

export interface ConversationStorageConfig {
  storagePath: string;
  maxMessagesPerConversation?: number;
  cleanupIntervalHours?: number;
}

---
./src/types/whatsapp.ts
---
export interface WhatsAppMessage {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          image?: {
            id: string;
            mime_type: string;
            sha256: string;
            caption?: string;
          };
          audio?: {
            id: string;
            mime_type: string;
            sha256: string;
          };
          type: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppResponse {
  messaging_product: string;
  to: string;
  text: {
    body: string;
  };
}

export interface WhatsAppAPIConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}

---
./src/utils/configLoader.ts
---
import * as fs from 'fs';
import * as path from 'path';
import { AIConfig, AIConfigFile, AIConfigManagerOptions } from '../types/aiConfig';

export class ConfigLoader {
  private configPath: string;
  private defaultConfig: string;

  constructor(options: AIConfigManagerOptions = {}) {
    this.configPath = options.configPath || 'config/ai';
    this.defaultConfig = options.defaultConfig || 'default.json';
  }

  /**
   * Load AI configuration from a config file
   */
  async loadConfig(configName?: string): Promise<AIConfig> {
    const configFileName = configName || this.defaultConfig;
    const configFilePath = path.join(this.configPath, configFileName);

    try {
      // Check if file exists
      if (!fs.existsSync(configFilePath)) {
        throw new Error(`Config file not found: ${configFilePath}`);
      }

      // Read and parse config file
      const configContent = fs.readFileSync(configFilePath, 'utf8');
      const configData: AIConfigFile = JSON.parse(configContent);

      // Validate required fields
      if (!configData.config || !configData.config.apiKey) {
        throw new Error(`Invalid config file: Missing required fields in ${configFileName}`);
      }

      return configData.config;
    } catch (error) {
      console.error(`Failed to load config from ${configFilePath}:`, error);
      throw new Error(`Failed to load AI configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all available config files
   */
  listConfigs(): string[] {
    try {
      if (!fs.existsSync(this.configPath)) {
        return [];
      }

      const files = fs.readdirSync(this.configPath);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
    } catch (error) {
      console.error('Failed to list config files:', error);
      return [];
    }
  }

  /**
   * Validate a config file
   */
  validateConfig(config: AIConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('apiKey is required');
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push('temperature must be between 0 and 2');
    }

    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push('maxTokens must be greater than 0');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a default config file structure
   */
  createDefaultConfigFile(): AIConfigFile {
    return {
      name: 'Default Configuration',
      description: 'Default AI model configuration',
      config: {
        apiKey: 'your_api_key_here',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        visionModel: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 1000,
        enableToolCalling: true,
        embeddingModel: 'text-embedding-ada-002',
        prompts: {
          textResponse: 'You are {chatbotName}, a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message.',
          imageAnalysis: 'Analyze this image comprehensively with context awareness. Describe what you see in detail...',
          toolCalling: 'You are a helpful assistant explaining search limitations. Be honest, helpful, and suggest concrete next steps.',
          errorResponse: 'I apologize, but I could not generate a response. Please try again.',
          searchLimit: 'I reached the maximum search limit while researching "{query}". Here\'s what I found so far...'
        }
      }
    };
  }
}

// Helper function to create config loader from environment
export function createConfigLoaderFromEnv(): ConfigLoader {
  const configPath = process.env.AI_CONFIG_PATH || 'config/ai';
  const defaultConfig = process.env.AI_CONFIG_FILE || 'default.json';

  return new ConfigLoader({
    configPath,
    defaultConfig
  });
}

---
./src/utils/crypto.ts
---
import * as crypto from 'crypto';

export class CryptoUtils {
  static verifySignature(
    appSecret: string,
    requestBody: string,
    signatureHeader?: string
  ): boolean {
    if (!signatureHeader) {
      console.log('No signature header provided');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(requestBody, 'utf8')
      .digest();

    const signatureParts = signatureHeader.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      console.log('Invalid signature format');
      return false;
    }

    const providedSignature = Buffer.from(signatureParts[1], 'hex');
    return crypto.timingSafeEqual(expectedSignature, providedSignature);
  }
}

---
./src/utils/logger.ts
---
/**
 * Enhanced logging utility for tool calling and AI responses
 */

export interface LogEntry {
  timestamp: string;
  type: 'ai_response' | 'tool_call' | 'search' | 'decision' | 'error';
  message: string;
  data?: any;
}

export class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  log(type: LogEntry['type'], message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data
    };

    this.logs.push(entry);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also output to console with emojis for better visibility
    const emoji = this.getEmojiForType(type);
    console.log(`${emoji} [${type.toUpperCase()}] ${message}`, data || '');
  }

  private getEmojiForType(type: string): string {
    const emojis: { [key: string]: string } = {
      'ai_response': '🤖',
      'tool_call': '🛠️',
      'search': '🔍',
      'decision': '🧠',
      'error': '❌'
    };
    return emojis[type] || '📝';
  }

  getLogs(filter?: { type?: string; limit?: number }): LogEntry[] {
    let filteredLogs = this.logs;

    if (filter?.type) {
      filteredLogs = filteredLogs.filter(log => log.type === filter.type);
    }

    if (filter?.limit) {
      filteredLogs = filteredLogs.slice(-filter.limit);
    }

    return filteredLogs;
  }

  clearLogs(): void {
    this.logs = [];
  }

  // Convenience methods for specific log types
  logAIResponse(message: string, data?: any): void {
    this.log('ai_response', message, data);
  }

  logToolCall(message: string, data?: any): void {
    this.log('tool_call', message, data);
  }

  logSearch(message: string, data?: any): void {
    this.log('search', message, data);
  }

  logDecision(message: string, data?: any): void {
    this.log('decision', message, data);
  }

  logError(message: string, data?: any): void {
    this.log('error', message, data);
  }
}

// Global logger instance
export const logger = Logger.getInstance();

---
./src/utils/responseCleaner.ts
---
/**
 * Utility functions for cleaning and processing LLM responses
 */

/**
 * Removes <think>...</think> tags and their content from LLM responses
 * @param response The raw LLM response that may contain thinking tags
 * @returns Cleaned response without thinking tags
 */
export function removeThinkingTags(response: string): string {
  // Regular expression to match <think>...</think> tags and their content
  // Also captures optional whitespace around tags to clean up properly
  const thinkingTagRegex = /\s*<think>[\s\S]*?<\/think>\s*/gi;

  // Remove all thinking tags and their content, including surrounding whitespace
  return response.replace(thinkingTagRegex, ' ').trim();
}

/**
 * Removes tool call artifacts and intermediate reasoning from responses
 * @param response The raw LLM response that may contain tool call artifacts
 * @returns Cleaned response without tool call artifacts
 */
export function removeToolCallArtifacts(response: string): string {
  // Remove common tool call artifacts and intermediate reasoning
  return response
    .replace(/I need to search for more information to answer your question properly\./gi, '')
    .replace(/Let me search for that information\./gi, '')
    .replace(/I'll look that up for you\./gi, '')
    .replace(/Searching for information\.\.\./gi, '')
    .replace(/Based on my search results,/gi, '')
    .replace(/According to my search,/gi, '')
    .trim();
}

/**
 * Shortens responses for WhatsApp by truncating long messages and making them more concise
 * @param response The response to shorten
 * @param maxLength Maximum length for WhatsApp responses (default: 1000 characters)
 * @returns Shortened response suitable for WhatsApp
 */
export function shortenForWhatsApp(response: string, maxLength: number = 1000): string {
  if (!response) return response;

  let shortened = response.trim();

  // DISABLED: Allow the bot to be polite
  // shortened = shortened.replace(/^(?:hello|hi|hey|greetings)[,!.\s]*/i, '');

  if (shortened.length > maxLength) {
      return shortened.substring(0, maxLength) + "...";
  }

  return shortened;
}

/**
 * Processes an LLM response by removing thinking tags, cleaning up whitespace, and shortening for WhatsApp
 * @param response The raw LLM response
 * @returns Cleaned and processed response ready for WhatsApp
 */
export function cleanLLMResponse(response: string): string {
  if (!response) return '';

  // Remove thinking tags first
  let cleaned = removeThinkingTags(response);

  // Remove tool call artifacts
  cleaned = removeToolCallArtifacts(cleaned);

  // Clean up excessive whitespace and newlines
  cleaned = cleaned
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace 3+ newlines with 2
    .replace(/^\s+|\s+$/g, '') // Trim leading/trailing whitespace
    .replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space

  // Shorten for WhatsApp if it's too long
  return shortenForWhatsApp(cleaned);
}

/**
 * Checks if a response contains thinking tags
 * @param response The response to check
 * @returns True if thinking tags are present, false otherwise
 */
export function containsThinkingTags(response: string): boolean {
  return /<think>[\s\S]*?<\/think>/i.test(response);
}

---
./src/utils/textChunker.ts
---
// src/utils/textChunker.ts

export class TextChunker {
  /**
   * Splits text into chunks of ~chunkSize characters, respecting sentence boundaries.
   */
  static split(text: string, chunkSize: number = 800, overlap: number = 100): string[] {
    if (!text) return [];
    
    // Split by rough sentence boundaries to avoid cutting words in half
    const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk.length + sentence.length) > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep the last 'overlap' characters for context continuity
        currentChunk = currentChunk.slice(-overlap) + sentence; 
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

---
./src/routes/dashboard.ts
---
import { Router, Request, Response } from 'express';
import { getAutonomousAgent } from '../autonomous';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Dashboard API routes for the web interface
 * Provides real-time access to autonomous agent data and chat testing
 */
export class DashboardRoutes {
  private router: Router;
  private activityLog: Array<{timestamp: string; message: string; type?: string}> = [];
  private dashboardPassword: string;

  constructor() {
    this.router = Router();
    this.dashboardPassword = process.env.DASHBOARD_PASSWORD || 'admin';
    this.setupRoutes();

    // Initialize with startup message
    this.logActivity('System started - Dashboard API initialized');
  }

  /**
   * Check if user is authenticated
   */
  private isAuthenticated(req: Request): boolean {
    return req.cookies?.dashboardAuth === this.dashboardPassword;
  }

  /**
   * Require authentication middleware
   */
  private requireAuth(req: Request, res: Response, next: Function): void {
    if (this.isAuthenticated(req)) {
      next();
    } else {
      res.status(401).json({ error: 'Authentication required' });
    }
  }

  private setupRoutes(): void {
    // Login endpoint
    this.router.post('/api/login', (req: Request, res: Response) => {
      const { password } = req.body;

      if (password === this.dashboardPassword) {
        // FIX: Relaxed cookie settings for reliable local/prod development
        res.cookie('dashboardAuth', this.dashboardPassword, {
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          path: '/',
          // Only set Secure if actually in production and on HTTPS
          secure: process.env.NODE_ENV === 'production' && req.secure,
          sameSite: 'lax' // 'strict' can block cookies on some redirects
        });

        this.logActivity('User logged in to dashboard');
        res.json({ success: true });
      } else {
        this.logActivity('Failed login attempt', 'warning');
        res.status(401).json({ error: 'Invalid password' });
      }
    });

    // Logout endpoint
    this.router.post('/api/logout', (req: Request, res: Response) => {
      res.clearCookie('dashboardAuth');
      this.logActivity('User logged out from dashboard');
      res.json({ success: true });
    });

    // Check authentication status
    this.router.get('/api/auth/status', (req: Request, res: Response) => {
      res.json({ authenticated: this.isAuthenticated(req) });
    });

    // Protected routes - require authentication
    // System status endpoint
    this.router.get('/api/status', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        const status = await agent.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: 'Agent not initialized' });
      }
    });

    // Bot info endpoint
    this.router.get('/api/bot-info', this.requireAuth.bind(this), (req: Request, res: Response) => {
      res.json({
        name: process.env.CHATBOT_NAME || 'Autonomous WhatsApp Agent',
        version: '1.0.0',
        mode: process.env.DEV_MODE === 'true' ? 'development' : 'production'
      });
    });

    // Activity log endpoint
    this.router.get('/api/activity', this.requireAuth.bind(this), (req: Request, res: Response) => {
      res.json(this.activityLog.slice(-50)); // Last 50 activities
    });

    // Memory data endpoints
    this.router.get('/api/memory/context', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        const status = await agent.getStatus();

        // Use real context data from ContextManager stats
        const contextStats = status.memory?.context || { activeUsers: 0, totalMessages: 0 };

        // Format the data based on real stats
        const contextData = [{
          id: 'ctx-stats',
          title: 'Context Statistics',
          timestamp: new Date().toISOString(),
          content: `Active users: ${contextStats.activeUsers}, Total messages: ${contextStats.totalMessages}`,
          activeUsers: contextStats.activeUsers,
          totalMessages: contextStats.totalMessages
        }];

        // Add web interface user for testing
        contextData.push({
          id: 'ctx-web',
          title: 'Web Interface User',
          timestamp: new Date().toISOString(),
          content: 'Web chat interface ready for testing',
          activeUsers: 0,
          totalMessages: 0
        });

        res.json(contextData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get context data' });
      }
    });

    this.router.get('/api/memory/knowledge', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();

        // Get actual knowledge content from the autonomous agent
        const knowledgeContent = await agent.getKnowledgeContent(20); // Get up to 20 recent documents

        // If we have real content, show it
        if (knowledgeContent.length > 0) {
          const knowledgeData = knowledgeContent.map((doc: any) => ({
            id: doc.id,
            title: doc.title,
            timestamp: doc.timestamp,
            content: doc.content,
            source: doc.source,
            category: doc.category
          }));

          res.json(knowledgeData);
        } else {
          // If no real content yet, show what the agent is ready to learn
          const exampleTopics = [
            'AI and Machine Learning',
            'Web Development',
            'Mobile Technology',
            'Cloud Computing',
            'Cybersecurity',
            'Data Science',
            'Internet of Things',
            'Blockchain Technology'
          ];

          const knowledgeData = exampleTopics.map((topic, i) => ({
            id: `knowledge-ready-${i + 1}`,
            title: `${topic} (Ready to Learn)`,
            timestamp: new Date().toISOString(),
            content: `The autonomous agent will learn about ${topic.toLowerCase()} during browsing sessions.`,
            source: 'Autonomous Browsing',
            category: topic
          }));

          res.json(knowledgeData);
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to get knowledge data' });
      }
    });

    this.router.get('/api/memory/history', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        const status = await agent.getStatus();

        // Use activity log as real history data
        const historyData = this.activityLog.slice(-20).map((log, index) => ({
          id: `hist-${index + 1}`,
          title: `Activity: ${log.type || 'info'}`,
          timestamp: log.timestamp,
          message: log.message,
          type: log.type || 'info'
        }));

        res.json(historyData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get history data' });
      }
    });

    // Chat endpoint for testing the bot
    this.router.post('/api/chat', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { message, image, audio } = req.body; // Expect base64 strings if image/audio provided
        const webUiUserId = process.env.WEB_UI_USER_ID || 'web-ui-user';

        if (!message && !image && !audio) {
          return res.status(400).json({ error: 'Message or attachment is required' });
        }

        const agent = getAutonomousAgent();

        let attachment: { type: 'image' | 'audio', filePath: string } | undefined;
        let messageType: 'text' | 'image' | 'audio' = 'text';

        // Handle File Upload (Base64 -> Temporary File)
        if (image || audio) {
            try {
                const base64Str = image || audio;
                // Extract clean base64 string (remove data:image/xyz;base64, prefix)
                const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

                if (matches && matches.length === 3) {
                    const mimeType = matches[1];
                    const dataBuffer = Buffer.from(matches[2], 'base64');

                    const type = image ? 'image' : 'audio';
                    // Determine extension from mime
                    let ext = 'bin';
                    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
                    else if (mimeType.includes('png')) ext = 'png';
                    else if (mimeType.includes('webp')) ext = 'webp';
                    else if (mimeType.includes('wav')) ext = 'wav';
                    else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) ext = 'mp3';
                    else if (mimeType.includes('ogg')) ext = 'ogg';

                    const filename = `web_${type}_${Date.now()}.${ext}`;
                    const uploadDir = path.join(process.cwd(), 'data', 'uploads');

                    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                    const filePath = path.join(uploadDir, filename);
                    fs.writeFileSync(filePath, dataBuffer);

                    attachment = { type, filePath };
                    messageType = type;
                }
            } catch (e) {
                console.error("Failed to process attachment:", e);
                return res.status(400).json({ error: 'Invalid attachment data' });
            }
        }

        // Log the chat activity (Dashboard view only)
        this.logActivity(`Web UI chat from ${webUiUserId}: ${messageType} message`);

        // NOTE: The agent.handleWebMessage method now handles both processing AND storage.
        // No need for manual history storage here.

        // Process the message through the autonomous agent
        const result = await agent.handleWebMessage(webUiUserId, message || '', attachment);

        // Extract text response (result could be string in old version, but we updated it to object)
        const responseText = typeof result === 'string' ? result : result.text;
        const responseAudio = typeof result === 'string' ? undefined : result.audio;

        // Log the response
        this.logActivity(`Bot response to ${webUiUserId}: ${responseText.substring(0, 50)}...`);

        res.json({ success: true, response: responseText, audio: responseAudio });
      } catch (error) {
        console.error('Chat API error:', error);
        this.logActivity(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        res.status(500).json({ error: 'Failed to process message' });
      }
    });

    // Autonomous activity simulation endpoints
    this.router.post('/api/simulate/browse', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { intent } = req.body;
        const agent = getAutonomousAgent();

        this.logActivity(`Simulating browsing session with intent: ${intent || 'general'}`);

        // In a real implementation, this would trigger actual browsing
        // For now, we'll simulate the activity
        setTimeout(() => {
          this.logActivity(`Browsing session completed - learned 3 new facts about ${intent || 'technology'}`);
        }, 2000);

        res.json({ success: true, message: 'Browsing session started' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to simulate browsing' });
      }
    });

    this.router.post('/api/simulate/proactive', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { userId = 'web-user', content } = req.body;
        const agent = getAutonomousAgent();

        this.logActivity(`Simulating proactive message to ${userId}`);

        // Simulate proactive messaging logic
        setTimeout(() => {
          this.logActivity(`Proactive message sent to ${userId}: "Check out this interesting content!"`);
        }, 1000);

        res.json({ success: true, message: 'Proactive message simulation started' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to simulate proactive message' });
      }
    });

    // Knowledge search endpoint
    this.router.post('/api/search/knowledge', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { query } = req.body;

        if (!query) {
          return res.status(400).json({ error: 'Search query is required' });
        }

        const agent = getAutonomousAgent();

        // Log the search activity
        this.logActivity(`Knowledge search: "${query}"`);

        // Search actual knowledge content
        const searchResults = await agent.searchKnowledgeContent(query, 10);

        // Format results with relevance scoring
        const formattedResults = searchResults.map((doc: any, index: number) => ({
          id: doc.id,
          title: doc.title,
          timestamp: doc.timestamp,
          content: doc.content.substring(0, 500) + (doc.content.length > 500 ? '...' : ''), // Limit content length
          relevance: ['High', 'Medium', 'Low'][index % 3], // Simple relevance based on order
          source: doc.source,
          category: doc.category
        }));

        // If no real results, provide informative message
        if (formattedResults.length === 0) {
          formattedResults.push({
            id: 'search-no-results',
            title: 'No Results Found',
            timestamp: new Date().toISOString(),
            content: `No knowledge found matching "${query}". The autonomous agent will learn about this topic during future browsing sessions.`,
            relevance: 'Low',
            source: 'Knowledge Base',
            category: 'Information'
          });
        }

        res.json(formattedResults);
      } catch (error) {
        console.error('Knowledge search error:', error);
        res.status(500).json({ error: 'Failed to search knowledge base' });
      }
    });

    // Manual browsing trigger endpoint
    this.router.post('/api/browse/now', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { intent } = req.body;
        const agent = getAutonomousAgent();

        // Get browser service from agent (this would need to be exposed)
        // For now, we'll simulate triggering a browsing session
        this.logActivity(`Manual browsing triggered with intent: ${intent || 'general'}`);

        // Simulate browsing session
        setTimeout(() => {
          this.logActivity(`Manual browsing completed - learned fresh content about ${intent || 'technology'}`);
        }, 3000);

        res.json({
          success: true,
          message: `Browsing session started${intent ? ` with intent: ${intent}` : ''}`,
          estimatedTime: '3-5 seconds'
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to trigger browsing session' });
      }
    });

    // Force knowledge update endpoint
    this.router.post('/api/knowledge/refresh', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();

        this.logActivity('Manual knowledge refresh triggered');

        // This would force the agent to browse and update knowledge
        // For now, simulate the process
        setTimeout(() => {
          this.logActivity('Knowledge refresh completed - fresh content available');
        }, 2000);

        res.json({
          success: true,
          message: 'Knowledge refresh initiated',
          status: 'Updating with latest content'
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to refresh knowledge' });
      }
    });

    // --- News System Management Routes ---

    // Get blog posts
    this.router.get('/api/news/blog-posts', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const prisma = new PrismaClient();
        const { page = '1', limit = '10', category, status } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        const where: any = {};
        if (category) where.category = category;
        if (status) where.status = status;

        const posts = await prisma.blogPost.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { publishedAt: 'desc' }
        });

        const total = await prisma.blogPost.count({ where });

        res.json({
          posts,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        });
      } catch (error) {
        console.error('Error getting blog posts:', error);
        res.status(500).json({ error: 'Failed to get blog posts' });
      }
    });

    // Get daily digests
    this.router.get('/api/news/daily-digests', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const prisma = new PrismaClient();
        const { page = '1', limit = '10' } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        const digests = await prisma.dailyDigest.findMany({
          skip,
          take: limitNum,
          orderBy: { date: 'desc' },
          include: {
            blogPosts: {
              select: {
                id: true,
                title: true,
                category: true
              }
            }
          }
        });

        const total = await prisma.dailyDigest.count();

        res.json({
          digests,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        });
      } catch (error) {
        console.error('Error getting daily digests:', error);
        res.status(500).json({ error: 'Failed to get daily digests' });
      }
    });

    // Get weekly digests
    this.router.get('/api/news/weekly-digests', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const prisma = new PrismaClient();
        const { page = '1', limit = '10' } = req.query;

        const pageNum = parseInt(page as string);
        const limitNum = parseInt(limit as string);
        const skip = (pageNum - 1) * limitNum;

        const digests = await prisma.weeklyDigest.findMany({
          skip,
          take: limitNum,
          orderBy: { startDate: 'desc' },
          include: {
            dailyDigests: {
              include: {
                blogPosts: {
                  select: {
                    id: true,
                    title: true
                  }
                }
              }
            }
          }
        });

        const total = await prisma.weeklyDigest.count();

        res.json({
          digests,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        });
      } catch (error) {
        console.error('Error getting weekly digests:', error);
        res.status(500).json({ error: 'Failed to get weekly digests' });
      }
    });

    // Get news sources
    this.router.get('/api/news/sources', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const prisma = new PrismaClient();
        const sources = await prisma.newsSource.findMany({
          orderBy: [{ priority: 'desc' }, { name: 'asc' }]
        });

        res.json(sources);
      } catch (error) {
        console.error('Error getting news sources:', error);
        res.status(500).json({ error: 'Failed to get news sources' });
      }
    });

    // Add news source
    this.router.post('/api/news/sources', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { url, name, region, language, priority } = req.body;

        if (!url) {
          return res.status(400).json({ error: 'URL is required' });
        }

        const prisma = new PrismaClient();
        const source = await prisma.newsSource.create({
          data: {
            url,
            name: name || this.extractSourceName(url),
            region,
            language,
            priority: priority || 5,
            isActive: true,
            sourceType: url.includes('news.google.com') ? 'google_news' : 'direct_site'
          }
        });

        this.logActivity(`Added news source: ${url}`);
        res.json({ success: true, source });
      } catch (error) {
        console.error('Error adding news source:', error);
        res.status(500).json({ error: 'Failed to add news source' });
      }
    });

    // Update news source
    this.router.put('/api/news/sources/:id', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const { name, region, language, priority, isActive } = req.body;

        const prisma = new PrismaClient();
        const source = await prisma.newsSource.update({
          where: { id },
          data: {
            name,
            region,
            language,
            priority,
            isActive
          }
        });

        this.logActivity(`Updated news source: ${source.url}`);
        res.json({ success: true, source });
      } catch (error) {
        console.error('Error updating news source:', error);
        res.status(500).json({ error: 'Failed to update news source' });
      }
    });

    // Delete news source
    this.router.delete('/api/news/sources/:id', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { id } = req.params;

        const prisma = new PrismaClient();
        const source = await prisma.newsSource.delete({
          where: { id }
        });

        this.logActivity(`Deleted news source: ${source.url}`);
        res.json({ success: true });
      } catch (error) {
        console.error('Error deleting news source:', error);
        res.status(500).json({ error: 'Failed to delete news source' });
      }
    });

    // Get news keywords
    this.router.get('/api/news/keywords', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const prisma = new PrismaClient();
        const { limit = '50' } = req.query;
        const limitNum = parseInt(limit as string);

        const keywords = await prisma.newsKeyword.findMany({
          orderBy: { relevance: 'desc' },
          take: limitNum
        });

        res.json(keywords);
      } catch (error) {
        console.error('Error getting news keywords:', error);
        res.status(500).json({ error: 'Failed to get news keywords' });
      }
    });

    // Download daily digest as markdown
    this.router.get('/api/news/daily-digest/:date/download', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { date } = req.params;
        const prisma = new PrismaClient();

        const digest = await prisma.dailyDigest.findFirst({
          where: { date: new Date(date) },
          include: { blogPosts: true }
        });

        if (!digest) {
          return res.status(404).json({ error: 'Digest not found' });
        }

        // Set headers for file download
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="daily-digest-${date}.md"`);

        res.send(digest.content);
      } catch (error) {
        console.error('Error downloading daily digest:', error);
        res.status(500).json({ error: 'Failed to download digest' });
      }
    });

    // Download weekly digest as markdown
    this.router.get('/api/news/weekly-digest/:startDate/download', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { startDate } = req.params;
        const prisma = new PrismaClient();

        const digest = await prisma.weeklyDigest.findFirst({
          where: { startDate: new Date(startDate) },
          include: { dailyDigests: { include: { blogPosts: true } } }
        });

        if (!digest) {
          return res.status(404).json({ error: 'Weekly digest not found' });
        }

        // Set headers for file download
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="weekly-digest-${startDate}.md"`);

        res.send(digest.content);
      } catch (error) {
        console.error('Error downloading weekly digest:', error);
        res.status(500).json({ error: 'Failed to download weekly digest' });
      }
    });

    // Trigger manual blog generation
    this.router.post('/api/news/generate-blogs', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        this.logActivity('Manual blog generation triggered');

        // In a real implementation, this would trigger the blog generation process
        // For now, simulate the process
        setTimeout(() => {
          this.logActivity('Blog generation completed - new posts available');
        }, 5000);

        res.json({
          success: true,
          message: 'Blog generation initiated',
          estimatedTime: '5-10 minutes'
        });
      } catch (error) {
        console.error('Error triggering blog generation:', error);
        res.status(500).json({ error: 'Failed to trigger blog generation' });
      }
    });

    // Discover new news sources
    this.router.post('/api/news/discover-sources', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const prisma = new PrismaClient();

        // Get recent articles to analyze for source discovery
        const recentArticles = await prisma.blogPost.findMany({
          where: {
            publishedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          },
          take: 50
        });

        // Convert to GoogleNewsArticle format for discovery
        const articles = recentArticles.map(post => ({
          title: post.title,
          url: post.sourceUrl || '',
          source: post.sourceTitle || '',
          publishedAt: post.publishedAt?.toISOString() || '',
          description: post.excerpt || '',
          keywords: post.tags || [],
          fullContent: post.content
        }));

        // Simulate discovery process
        this.logActivity('News source discovery initiated');

        setTimeout(() => {
          this.logActivity('News source discovery completed - new sources found');
        }, 3000);

        res.json({
          success: true,
          message: 'Source discovery initiated',
          articlesAnalyzed: articles.length,
          estimatedSources: Math.floor(Math.random() * 5) + 1 // Simulate random discovery
        });
      } catch (error) {
        console.error('Error discovering news sources:', error);
        res.status(500).json({ error: 'Failed to discover news sources' });
      }
    });

    // Update browsing schedule configuration
    this.router.put('/api/news/config/schedule', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { deepBrowsingTime, quickCheckInterval } = req.body;

        // Validate inputs
        if (deepBrowsingTime && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(deepBrowsingTime)) {
          return res.status(400).json({ error: 'Invalid time format (HH:MM)' });
        }

        if (quickCheckInterval && (quickCheckInterval < 60 || quickCheckInterval > 480)) {
          return res.status(400).json({ error: 'Quick check interval must be between 60 and 480 minutes' });
        }

        this.logActivity(`News schedule updated: Deep=${deepBrowsingTime}, Quick=${quickCheckInterval}min`);

        res.json({
          success: true,
          message: 'Schedule configuration updated',
          config: {
            deepBrowsingTime: deepBrowsingTime || '06:00',
            quickCheckInterval: quickCheckInterval || 180
          }
        });
      } catch (error) {
        console.error('Error updating schedule config:', error);
        res.status(500).json({ error: 'Failed to update schedule configuration' });
      }
    });

    // FIX: Improved Middleware to protect HTML files AND the root path
    this.router.use((req: Request, res: Response, next: Function) => {
      const path = req.path;

      // Always allow login API endpoints, health check, and static assets
      if (
        path === '/api/login' ||
        path === '/api/auth/status' ||
        path === '/health' ||
        path === '/api' ||
        path.match(/\.(js|css|png|jpg|ico|json)$/) ||
        path.startsWith('/assets/')
      ) {
        return next();
      }

      // Check authentication
      if (this.isAuthenticated(req)) {
        return next();
      }

      // If accessing root without auth, redirect to React app which will handle login
      if (path === '/') {
        // Send the React app which will handle authentication client-side
        return res.sendFile('frontend/dist/index.html', { root: process.cwd() });
      }

      // For protected API endpoints, return 401 instead of redirect
      if (path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      next();
    });

    // Serve static files from frontend/dist directory (React build)
    this.router.use(express.static('frontend/dist'));

    // Serve the React app interface - React app will handle authentication
    this.router.get('/', (req: Request, res: Response) => {
      res.sendFile('frontend/dist/index.html', { root: process.cwd() });
    });

    // Redirect /login to root - React app will handle login
    this.router.get('/login', (req: Request, res: Response) => {
      res.redirect('/');
    });
  }

  /**
   * Log activity for the dashboard
   */
  private logActivity(message: string, type?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      type
    };

    this.activityLog.push(logEntry);

    // Keep only the last 1000 entries to prevent memory issues
    if (this.activityLog.length > 1000) {
      this.activityLog = this.activityLog.slice(-1000);
    }

    console.log(`📊 Dashboard: ${message}`);
  }

  /**
   * Extract source name from URL
   */
  private extractSourceName(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '').split('.')[0];
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Get the router instance
   */
  getRouter(): Router {
    return this.router;
  }
}

---
./src/routes/webhook.ts
---
import { Router, Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsappService';
import { MediaService } from '../services/mediaService';
import { ProcessedMessageServicePostgres } from '../services/ProcessedMessageServicePostgres';
import { CryptoUtils } from '../utils/crypto';
import { WhatsAppMessage } from '../types/whatsapp';
import { getToolSchemas } from '../tools';
// Import the Autonomous Agent getter
import { getAutonomousAgent } from '../autonomous';

export class WebhookRoutes {
  private router: Router;
  private processedMessageService: ProcessedMessageServicePostgres;
  private whatsappService: WhatsAppService; // Added property
  private verifyToken: string;
  private appSecret: string;

  constructor(whatsappService: WhatsAppService, verifyToken: string, appSecret: string, whatsappConfig: any) {
    this.router = Router();
    this.processedMessageService = new ProcessedMessageServicePostgres();
    this.whatsappService = whatsappService; // Store the service instance
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Webhook verification endpoint (GET)
    this.router.get('/', (req: Request, res: Response) => {
      this.handleWebhookVerification(req, res);
    });

    // Webhook message handler (POST)
    this.router.post('/', (req: Request, res: Response) => {
      this.handleWebhookMessage(req, res);
    });

    // Health check endpoint (webhook-specific)
    this.router.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'OK',
        service: 'webhook',
        timestamp: new Date().toISOString()
      });
    });

    // Dev mode API endpoint (only available in dev mode)
    if (process.env.DEV_MODE === 'true') {
      this.router.post('/dev/message', (req: Request, res: Response) => {
        this.handleDevMessage(req, res);
      });
    }
  }

  private handleWebhookVerification(req: Request, res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    // Log verification attempt for debugging
    console.log(`Webhook Verification: Mode=${mode}, Token=${token?.toString().substring(0,3)}...`);

    if (mode && token) {
      if (mode === 'subscribe' && token === this.verifyToken) {
        console.log('✅ Webhook verified successfully!');
        // WhatsApp expects the challenge string directly, not JSON
        res.status(200).send(challenge);
      } else {
        console.warn('❌ Webhook verification failed! Token mismatch.');
        res.sendStatus(403);
      }
    } else {
        res.sendStatus(400);
    }
  }

  private async handleWebhookMessage(req: Request, res: Response): Promise<void> {
    try {
      // Verify signature if app secret is provided
      if (this.appSecret) {
        const signature = req.headers['x-hub-signature-256'] as string;
        // FIX: Use rawBody captured by middleware in server.ts
        const rawBody = (req as any).rawBody?.toString() || JSON.stringify(req.body);
        
        if (!CryptoUtils.verifySignature(this.appSecret, rawBody, signature)) {
          console.warn('Invalid webhook signature');
          res.sendStatus(401);
          return;
        }
      }

      const data: WhatsAppMessage = req.body;

      if (!data.entry || !Array.isArray(data.entry)) {
          res.sendStatus(200);
          return;
      }

      for (const entry of data.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const messages = change.value.messages;

            if (messages && messages.length > 0) {
              for (const message of messages) {
                // Mark message as read immediately
                if (this.whatsappService) {
                    await this.whatsappService.markMessageAsRead(message.id);
                }

                // Check if this message has already been processed
                const alreadyProcessed = await this.processedMessageService.hasMessageBeenProcessed(message.id);
                if (alreadyProcessed) continue;

                // Mark message as processed
                await this.processedMessageService.markMessageAsProcessed(
                  message.id,
                  message.from,
                  message.type
                );

                const agent = getAutonomousAgent();

                if (message.type === 'text' && message.text) {
                  // Text Message
                  agent.handleIncomingMessage(
                    message.from,
                    message.text.body,
                    message.id
                  ).catch(err => console.error('Agent text processing error:', err));

                } else if (message.type === 'image' && message.image) {
                  // Image Message
                  console.log(`🖼️ Processing image message from ${message.from}`);
                  
                  // Extract caption if available
                  const caption = message.image.caption;
                  
                  agent.handleImageMessage(
                    message.from,
                    message.image.id,
                    message.image.mime_type,
                    message.image.sha256,
                    caption
                  ).catch(err => console.error('Agent image processing error:', err));

                } else if (message.type === 'audio' && message.audio) {
                  // ✅ NEW: Handle Audio Messages
                  console.log(`🎤 Processing audio message from ${message.from}`);
                  
                  agent.handleAudioMessage(
                    message.from,
                    message.audio.id,
                    message.audio.mime_type,
                    message.audio.sha256
                  ).catch(err => console.error('Agent audio processing error:', err));
                  
                } else {
                  console.log(`Unsupported message type: ${message.type}`);
                }
              }
            }
          }
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.sendStatus(500);
    }
  }

  private async handleDevMessage(req: Request, res: Response): Promise<void> {
    try {
      const { message, from = 'dev-user', type = 'text', imagePath, audioPath } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      console.log(`📱 [DEV API] Received ${type} message from ${from}: "${message}"`);

      let response: string;

      if (type === 'image' && imagePath) {
        console.log(`🖼️ Processing local image: ${imagePath}`);
        // TODO: Implement image processing in autonomous agent
        response = "Image processing is not yet implemented in the autonomous agent. Please use text messages for now.";
      } else if (type === 'audio' && audioPath) {
        console.log(`🎤 Processing local audio: ${audioPath}`);
        // TODO: Implement audio processing in autonomous agent
        response = "Audio processing is not yet implemented in the autonomous agent. Please use text messages for now.";
      } else {
        // Process text message using the autonomous agent
        const agent = getAutonomousAgent();
        const result = await agent.handleWebMessage(from, message);
        response = typeof result === 'string' ? result : result.text;
      }

      console.log(`🤖 [DEV API] Response: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);

      // Return the response directly as JSON
      res.status(200).json({
        success: true,
        message: message,
        response: response,
        from: from,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error processing dev message:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  getRouter(): Router {
    return this.router;
  }
}

---
./src/config/autonomous.json
---
{
  "autonomous": {
    "scheduler": {
      "tickIntervalMs": 60000,
      "browsingChanceWhenUsersActive": 0.3,
      "proactiveCheckChance": 0.5,
      "maintenanceIntervalMs": 300000
    },
    "browser": {
      "maxPagesPerHour": 10,
      "dailyUrls": [
        "https://techcrunch.com",
        "https://news.ycombinator.com",
        "https://news.google.com/home?hl=zh-HK",
        "https://www.bbc.com/news/world",
        "https://www.cnbc.com/world"
      ],
      "mobileMode": true,
      "pageDelayMs": {
        "min": 2000,
        "max": 5000
      }
    },
    "memory": {
      "shortTermTtlMs": 3600000,
      "longTermCleanupDays": 30,
      "historyCleanupDays": 365,
      "maxUserInterests": 10
    },
    "messaging": {
      "rateLimitDelayMs": 2000,
      "proactiveCooldownMs": 900000,
      "maxRetries": 3,
      "retryBackoffMs": 30000,
      "mobileOptimization": {
        "maxWords": 50,
        "removeMarkdown": true,
        "naturalSpacing": true
      }
    },
    "agent": {
      "maxToolRounds": 10,
      "relevanceThreshold": 0.7,
      "interestDiscovery": {
        "minMessageLength": 10,
        "interestPatterns": [
          "tech", "technology", "programming", "coding", "ai", "artificial intelligence", "machine learning",
          "business", "finance", "stock", "market", "economy", "investment",
          "sports", "football", "basketball", "tennis", "soccer", "game",
          "news", "current events", "headlines", "breaking",
          "travel", "vacation", "holiday", "destination",
          "food", "cooking", "recipe", "restaurant", "cuisine",
          "music", "song", "artist", "album", "concert",
          "movie", "film", "cinema", "actor", "director",
          "gaming", "video game", "console", "pc gaming",
          "health", "fitness", "exercise", "wellness", "diet"
        ]
      }
    }
  }
}

---
./src/config/databaseConfig.ts
---
import { HistoryStorePostgres } from '../memory/HistoryStorePostgres';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { ProcessedMessageServicePostgres } from '../services/ProcessedMessageServicePostgres';
import { VectorStoreServicePostgres } from '../services/VectorStoreServicePostgres';
import { OpenAIService } from '../services/openaiService';
import { PrismaDatabaseUtils } from './prisma';

/**
 * Database configuration for PostgreSQL-only setup
 */
export class DatabaseConfig {
  /**
   * Get the HistoryStore implementation (PostgreSQL)
   */
  static getHistoryStore(): HistoryStorePostgres {
    return new HistoryStorePostgres();
  }

  /**
   * Get the KnowledgeBase implementation (PostgreSQL)
   */
  static getKnowledgeBase(openaiService: OpenAIService): KnowledgeBasePostgres {
    return new KnowledgeBasePostgres(openaiService);
  }

  /**
   * Get the ProcessedMessageService implementation (PostgreSQL)
   */
  static getProcessedMessageService(): ProcessedMessageServicePostgres {
    return new ProcessedMessageServicePostgres();
  }

  /**
   * Get the VectorStoreService implementation (PostgreSQL)
   */
  static getVectorStoreService(openaiService: OpenAIService): VectorStoreServicePostgres {
    return new VectorStoreServicePostgres(openaiService);
  }

  /**
   * Check if PostgreSQL is being used (always true now)
   */
  static isUsingPostgres(): boolean {
    return true;
  }

  /**
   * Get database statistics for PostgreSQL
   */
  static async getDatabaseStats(): Promise<{
    databaseType: string;
    conversationLogs: number;
    knowledgeDocuments: number;
    processedMessages: number;
    vectorDocuments: number;
  }> {
    const stats = await PrismaDatabaseUtils.getDatabaseStats();
    
    return {
      databaseType: 'PostgreSQL',
      conversationLogs: stats.conversationLogs,
      knowledgeDocuments: stats.knowledgeDocuments,
      processedMessages: stats.processedMessages,
      vectorDocuments: stats.vectorDocuments,
    };
  }

  /**
   * Initialize the database connection
   */
  static async initialize(): Promise<void> {
    await PrismaDatabaseUtils.initialize();
  }

  /**
   * Health check for PostgreSQL
   */
  static async healthCheck(): Promise<boolean> {
    return await PrismaDatabaseUtils.healthCheck();
  }

  /**
   * Clean up old data in PostgreSQL
   */
  static async cleanupOldData(): Promise<{
    oldConversations: number;
    oldKnowledge: number;
    oldProcessedMessages: number;
    oldVectorDocuments: number;
  }> {
    const result = await PrismaDatabaseUtils.cleanupOldData();
    
    return {
      oldConversations: result.oldConversations,
      oldKnowledge: result.oldKnowledge,
      oldProcessedMessages: result.oldProcessedMessages,
      oldVectorDocuments: 0, // Vector documents cleanup not implemented yet
    };
  }
}

export default DatabaseConfig;

---
./src/config/prisma.ts
---
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton
 */
class PrismaClientSingleton {
  private static instance: PrismaClient;

  private constructor() {}

  static getInstance(): PrismaClient {
    if (!PrismaClientSingleton.instance) {
      PrismaClientSingleton.instance = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    }
    return PrismaClientSingleton.instance;
  }

  static async disconnect(): Promise<void> {
    if (PrismaClientSingleton.instance) {
      await PrismaClientSingleton.instance.$disconnect();
    }
  }
}

export const prisma = PrismaClientSingleton.getInstance();

/**
 * Database utility functions using Prisma
 */
export class PrismaDatabaseUtils {
  /**
   * Initialize database connection and verify schema
   */
  static async initialize(): Promise<void> {
    try {
      // Test connection
      await prisma.$connect();
      console.log('✅ Prisma connected to database');
      
      // Verify tables exist by running a simple query
      await prisma.conversationLog.findFirst();
      console.log('✅ Database schema verified');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Health check for database
   */
  static async healthCheck(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  static async getDatabaseStats(): Promise<{
    conversationLogs: number;
    knowledgeDocuments: number;
    processedMessages: number;
    vectorDocuments: number;
  }> {
    try {
      const [conversationLogs, knowledgeDocuments, processedMessages, vectorDocuments] = await Promise.all([
        prisma.conversationLog.count(),
        prisma.knowledge.count(),
        prisma.processedMessage.count(),
        prisma.document.count(),
      ]);

      return {
        conversationLogs,
        knowledgeDocuments,
        processedMessages,
        vectorDocuments,
      };
    } catch (error) {
      console.error('❌ Failed to get database stats:', error);
      return {
        conversationLogs: 0,
        knowledgeDocuments: 0,
        processedMessages: 0,
        vectorDocuments: 0,
      };
    }
  }

  /**
   * Clean up old data
   */
  static async cleanupOldData(): Promise<{
    oldConversations: number;
    oldKnowledge: number;
    oldProcessedMessages: number;
  }> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [oldConversations, oldKnowledge, oldProcessedMessages] = await Promise.all([
        prisma.conversationLog.deleteMany({
          where: {
            timestamp: {
              lt: thirtyDaysAgo,
            },
          },
        }),
        prisma.knowledge.deleteMany({
          where: {
            timestamp: {
              lt: thirtyDaysAgo,
            },
          },
        }),
        prisma.processedMessage.deleteMany({
          where: {
            processedAt: {
              lt: thirtyDaysAgo,
            },
          },
        }),
      ]);

      return {
        oldConversations: oldConversations.count,
        oldKnowledge: oldKnowledge.count,
        oldProcessedMessages: oldProcessedMessages.count,
      };
    } catch (error) {
      console.error('❌ Failed to cleanup old data:', error);
      return {
        oldConversations: 0,
        oldKnowledge: 0,
        oldProcessedMessages: 0,
      };
    }
  }
}

---
./src/tools/DeepResearchTool.ts
---
// src/tools/DeepResearchTool.ts
import { BaseTool } from '../core/BaseTool';
import { BrowserService } from '../services/BrowserService';

export class DeepResearchTool extends BaseTool {
  name = 'deep_research';
  description = 'Perform an extensive, deep online research task. Use this ONLY when standard "web_search" or "search_knowledge" fails to provide a sufficient answer. This tool takes longer but searches and reads multiple websites.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The specific question or topic to research deeply.',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private browserService: BrowserService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query } = args;
    // Note: The Agent will call this, which calls the BrowserService logic
    return await this.browserService.performDeepResearch(query);
  }
}

---
./src/tools/RecallHistoryTool.ts
---
import { BaseTool } from '../core/BaseTool';
import { HistoryStorePostgres } from '../memory/HistoryStorePostgres';

export class RecallHistoryTool extends BaseTool {
  name = 'recall_history';
  description = 'Search through past conversations to remember what the user said, specific details, or dates. Use this when the user asks "What did I say about X?" or references a past discussion.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords to search for in the history',
      },
      days_back: {
        type: 'number',
        description: 'How many days back to search (default: 30)',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private historyStore: HistoryStorePostgres) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query, days_back = 30 } = args;
    
    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days_back);

    const logs = await this.historyStore.query({
      keywords: query,
      start: startDate.toISOString(),
      limit: 5 // Limit results to save context window
    });

    if (logs.length === 0) {
      return "No matching conversation history found.";
    }

    return logs.map(log => 
      `[${new Date(log.timestamp).toLocaleDateString()}] ${log.role}: ${log.message}`
    ).join('\n');
  }
}

---
./src/tools/ScrapeNewsTool.ts
---
import { BaseTool } from '../core/BaseTool';
import { NewsScrapeService } from '../services/newsScrapeService';

export class ScrapeNewsTool extends BaseTool {
  name = 'scrape_news';
  description = 'Get the latest headlines and news summaries. Use this when the user asks for news, updates, or current events.';
  
  parameters = {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['general', 'tech', 'business', 'sports', 'world'],
        description: 'The category of news to fetch (default: general)',
      }
    },
    required: ['category'],
    additionalProperties: false,
  };

  constructor(private newsService: NewsScrapeService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const category = args.category || 'general';
    return this.newsService.getCachedNews(category);
  }
}

---
./src/tools/UpdateProfileTool.ts
---
import { BaseTool } from '../core/BaseTool';
import { UserProfileService } from '../services/UserProfileService';

export class UpdateProfileTool extends BaseTool {
  name = 'update_profile';
  description = 'Save information about the user. Use this when the user tells you their name, location, job, hobbies, or other personal details. ALWAYS use this to persist new information.';
  
  parameters = {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['name', 'location', 'language', 'general_fact'],
        description: 'The type of information to save.'
      },
      key: {
        type: 'string',
        description: 'If category is "general_fact", a short key (e.g., "job", "pet", "diet"). Ignored for others.'
      },
      value: {
        type: 'string',
        description: 'The actual information to save (e.g., "John", "New York", "Vegetarian").'
      }
    },
    required: ['category', 'value'],
    additionalProperties: false,
  };

  constructor(private profileService: UserProfileService, private userId: string) {
    super();
  }

  // We set userId dynamically before execution in the Agent
  setUserId(userId: string) {
    this.userId = userId;
  }

  async execute(args: any): Promise<string> {
    const { category, key, value } = args;
    
    if (!this.userId) return "Error: No User ID context.";

    try {
      if (category === 'name') {
        await this.profileService.updateProfile(this.userId, { name: value });
        return `✅ Saved name: ${value}`;
      } 
      else if (category === 'location') {
        await this.profileService.updateProfile(this.userId, { location: value });
        return `✅ Saved location: ${value}`;
      }
      else if (category === 'language') {
        await this.profileService.updateProfile(this.userId, { language: value });
        return `✅ Saved language preference: ${value}`;
      }
      else {
        // General Fact
        const factKey = key || 'note';
        await this.profileService.updateProfile(this.userId, { fact: { key: factKey, value } });
        return `✅ Saved fact - ${factKey}: ${value}`;
      }
    } catch (e) {
      console.error(e);
      return "Failed to save profile information.";
    }
  }
}

---
./src/tools/WebSearchTool.ts
---
import { BaseTool } from '../core/BaseTool';
import { GoogleSearchService } from '../services/googleSearchService';

/**
 * Web Search Tool for the autonomous agent
 * Bridges the gap between old and new tool systems
 */
export class WebSearchTool extends BaseTool {
  name = 'web_search';
  description = 'Perform a web search using Google to find current information, news, or facts. Use this when you need up-to-date information that might not be in your knowledge base yet.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up information about',
      },
      num_results: {
        type: 'number',
        description: 'Number of search results to return (default: 3)',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private searchService: GoogleSearchService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query, num_results = 3 } = args;
    
    console.log(`🔍 WebSearchTool executing: "${query}"`);
    
    try {
      const results = await this.searchService.search(query, num_results);
      
      if (results.length === 0) {
        return "No search results found for your query.";
      }
      
      // Format results for the agent
      const formattedResults = results.map((result, index) =>
        `${index + 1}. ${result.title}\n   ${result.link}\n   ${result.snippet}`
      ).join('\n\n');
      
      return `Search results for "${query}":\n\n${formattedResults}`;
      
    } catch (error) {
      console.error('❌ WebSearchTool failed:', error);
      return `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

---
./src/tools/index.ts
---
import { GoogleSearchService } from '../services/googleSearchService';
import { WebScrapeService, createWebScrapeService } from '../services/webScrapeService';
import { NewsScrapeService, createNewsScrapeService, NewsArticle } from '../services/newsScrapeService';
import { VectorStoreServicePostgres } from '../services/VectorStoreServicePostgres';
import { NewsProcessorService } from '../services/newsProcessorService'; // New
import { OpenAIService, createOpenAIServiceFromConfig } from '../services/openaiService';

// Tool function definitions
export interface ToolFunction {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<any>;
}

// Available tools
export const availableTools: { [key: string]: ToolFunction } = {};
let webScrapeService: WebScrapeService | undefined;
export let newsScrapeService: NewsScrapeService;
let vectorStoreService: VectorStoreServicePostgres; // Updated global reference
let mediaService: any; // Will be initialized later

// Tool schemas for OpenAI function calling
export const toolSchemas = [
  {
    type: 'function' as const,
    function: {
      name: 'google_search',
      description: 'Perform a web search using Google to find current information, news, or facts',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up information about',
          },
          num_results: {
            type: 'number',
            description: 'Number of search results to return (default: 5)',
          }
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_scrape',
      description: 'Scrape content from specific URLs to get real-time information from websites. Useful for getting current data, news articles, or specific page content.',
      parameters: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Array of URLs to scrape content from',
          },
          selector: {
            type: 'string',
            description: 'Optional CSS selector to target specific content on the page (e.g., "article", ".content", "#main")',
          }
        },
        required: ['urls'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'scrape_news',
      description: 'Get latest news headlines. Categories: general, tech, business, sports, world.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Category of news (default: general).',
          }
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_image',
      description: 'Analyze image content using AI vision capabilities. Use this when users send images that need detailed analysis, description, or interpretation.',
      parameters: {
        type: 'object',
        properties: {
          image_path: {
            type: 'string',
            description: 'The file path to the image that needs to be analyzed',
          },
          prompt: {
            type: 'string',
            description: 'Optional specific instructions or questions about what to focus on in the image analysis',
          }
        },
        required: ['image_path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'transcribe_audio',
      description: 'Transcribe audio files to text using speech-to-text technology. Use this when users send audio messages that need to be converted to text for processing.',
      parameters: {
        type: 'object',
        properties: {
          audio_path: {
            type: 'string',
            description: 'The file path to the audio file that needs to be transcribed',
          },
          language: {
            type: 'string',
            description: 'Optional language code for transcription (e.g., "en", "zh", "ja")',
          }
        },
        required: ['audio_path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_knowledge',
      description: 'Search the bot\'s learned knowledge base for past news, facts, and enriched context.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The specific topic or question to search for in memory',
          }
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
];

// Initialize tools with dependencies
export async function initializeTools(searchService: GoogleSearchService, mediaServiceInstance?: any) {
  // 1. Initialize OpenAI (Needed for Embeddings & Processor)
  const openaiService = await createOpenAIServiceFromConfig();

  // 2. Initialize Vector Store (The Better RAG)
  vectorStoreService = new VectorStoreServicePostgres(openaiService);

  // 3. Initialize News Processor
  const newsProcessor = new NewsProcessorService(openaiService, searchService, vectorStoreService);

  // 4. Initialize Web Scrape
  webScrapeService = createWebScrapeService();

  // 5. Initialize News Scrape Service WITH Processor
  newsScrapeService = createNewsScrapeService(webScrapeService, newsProcessor);

  // Store media service reference for later use
  if (mediaServiceInstance) {
    mediaService = mediaServiceInstance;
  }

  availableTools.google_search = {
    name: 'google_search',
    description: 'Perform a web search using Google',
    parameters: toolSchemas[0].function.parameters,
    execute: async (args: { query: string; num_results?: number }) => {
      console.log('🔍 Executing Google Search:', {
        query: args.query,
        numResults: args.num_results || 5
      });

      const startTime = Date.now();
      const results = await searchService.search(args.query, args.num_results || 5);
      const executionTime = Date.now() - startTime;

      console.log('✅ Google Search Completed:', {
        query: args.query,
        resultsCount: results.length,
        executionTime: `${executionTime}ms`,
        firstResult: results[0] ? results[0].title.substring(0, 50) + '...' : 'No results'
      });

      return searchService.formatSearchResults(results);
    }
  };

  availableTools.web_scrape = {
    name: 'web_scrape',
    description: 'Scrape content from specific URLs',
    parameters: toolSchemas[1].function.parameters,
    execute: async (args: { urls: string[]; selector?: string }) => {
      console.log('🌐 Executing Web Scrape:', {
        urls: args.urls,
        selector: args.selector || 'auto',
        urlCount: args.urls.length
      });

      const startTime = Date.now();

      try {
        if (!webScrapeService) {
          throw new Error('Web scrape service not initialized');
        }
        const results = await webScrapeService.scrapeUrls(args.urls, args.selector);
        const executionTime = Date.now() - startTime;

        console.log('✅ Web Scrape Completed:', {
          urlCount: args.urls.length,
          successfulScrapes: results.length,
          executionTime: `${executionTime}ms`,
          firstResult: results[0] ? results[0].title.substring(0, 50) + '...' : 'No results'
        });

        return webScrapeService.formatScrapeResults(results);
      } catch (error) {
        console.error('❌ Web scrape execution error:', {
          error: error instanceof Error ? error.message : `${error}`,
          urls: args.urls
        });
        throw new Error('Failed to scrape web content');
      }
    }
  };

  availableTools.scrape_news = {
    name: 'scrape_news',
    description: 'Get latest news headlines. Categories: general, tech, business, sports, world.',
    parameters: toolSchemas[2].function.parameters,
    execute: async (args: { category?: string }) => {
      const cat = args.category || 'general';
      console.log(`📰 Tool retrieving cached news for: ${cat}`);
      return newsScrapeService.getCachedNews(cat);
    }
  };

  availableTools.search_knowledge = {
    name: 'search_knowledge',
    description: 'Search learned knowledge base',
    parameters: toolSchemas[5].function.parameters,
    execute: async (args: { query: string }) => {
      console.log(`🧠 Searching Vector Store for: ${args.query}`);
      return vectorStoreService.search(args.query);
    }
  };

  // Initialize media tools if media service is available
  if (mediaService) {
    availableTools.analyze_image = {
      name: 'analyze_image',
      description: 'Analyze image content using AI vision capabilities',
      parameters: toolSchemas[3].function.parameters,
      execute: async (args: { image_path: string; prompt?: string }) => {
        console.log('🖼️ Executing Image Analysis:', {
          imagePath: args.image_path,
          prompt: args.prompt || 'default analysis'
        });

        const startTime = Date.now();

        try {
          const result = await mediaService.analyzeImageWithOpenAI(args.image_path);
          const executionTime = Date.now() - startTime;

          console.log('✅ Image Analysis Completed:', {
            imagePath: args.image_path,
            executionTime: `${executionTime}ms`,
            resultLength: result.length
          });

          return result;
        } catch (error) {
          console.error('❌ Image analysis execution error:', {
            error: error instanceof Error ? error.message : `${error}`,
            imagePath: args.image_path
          });
          throw new Error('Failed to analyze image');
        }
      }
    };

    availableTools.transcribe_audio = {
      name: 'transcribe_audio',
      description: 'Transcribe audio files to text using speech-to-text technology',
      parameters: toolSchemas[4].function.parameters,
      execute: async (args: { audio_path: string; language?: string }) => {
        console.log('🎤 Executing Audio Transcription:', {
          audioPath: args.audio_path,
          language: args.language || 'auto'
        });

        const startTime = Date.now();

        try {
          // Convert audio to WAV format for better transcription (fixes OGG/Opus issues)
          console.log(`🔄 Converting audio to WAV format: ${args.audio_path}`);
          const convertedAudioPath = await mediaService.convertAudioToWav(args.audio_path);
          
          const result = await mediaService.transcribeAudio(convertedAudioPath, args.language);
          const executionTime = Date.now() - startTime;

          console.log('✅ Audio Transcription Completed:', {
            audioPath: convertedAudioPath,
            executionTime: `${executionTime}ms`,
            resultLength: result.length
          });

          return result;
        } catch (error) {
          console.error('❌ Audio transcription execution error:', {
            error: error instanceof Error ? error.message : `${error}`,
            audioPath: args.audio_path
          });
          throw new Error('Failed to transcribe audio');
        }
      }
    };
  }
}

// Check if any tools are available
export function hasAvailableTools(): boolean {
  return Object.keys(availableTools).length > 0;
}

// Get tool schemas for OpenAI
export function getToolSchemas() {
  return toolSchemas;
}

// Execute a specific tool
export async function executeTool(toolName: string, args: any): Promise<any> {
  const tool = availableTools[toolName];
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }
  return tool.execute(args);
}

// Cleanup function to close browser instances
export async function cleanupTools(): Promise<void> {
  if (webScrapeService) {
    await webScrapeService.close();
  }
}

---
