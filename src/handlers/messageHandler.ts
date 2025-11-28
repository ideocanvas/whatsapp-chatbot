import { WhatsAppService } from '../services/whatsappService';
import { MediaService, MediaInfo } from '../services/mediaService';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from '../services/openaiService';
import { ConversationStorageService } from '../services/conversationStorageService';
import { KnowledgeExtractionService } from '../services/knowledgeExtractionService';
import { Message } from '../types/conversation';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../services/googleSearchService';
import { initializeTools, getToolSchemas, executeTool, hasAvailableTools } from '../tools';

export class MessageHandler {
  private whatsappService: WhatsAppService;
  private mediaService: MediaService;
  public openaiService: OpenAIService | null;
  private googleSearchService: GoogleSearchService | null;
  private conversationStorage: ConversationStorageService;
  private knowledgeExtractionService: KnowledgeExtractionService;
  private toolsAvailable: boolean = false;
  private chatbotName: string;

  constructor(whatsappService: WhatsAppService, mediaService: MediaService) {
    this.whatsappService = whatsappService;
    this.mediaService = mediaService;
    this.openaiService = null;
    this.googleSearchService = null;

    // Initialize conversation storage
    this.conversationStorage = new ConversationStorageService({
      storagePath: 'data/conversations',
      maxMessagesPerConversation: 50,
      cleanupIntervalHours: 24
    });

    // Initialize knowledge extraction service
    this.knowledgeExtractionService = new KnowledgeExtractionService(
      null, // Will be set after OpenAI service initialization
      this.conversationStorage
    );

    // Get chatbot name from environment variable
    this.chatbotName = process.env.CHATBOT_NAME || 'Lucy';

    // Initialize services (OpenAI will be initialized asynchronously)
    this.initializeServices();
  }

  /**
   * Initialize services asynchronously
   */
  private async initializeServices(): Promise<void> {
    // Initialize OpenAI service from config file
    try {
      // Try to load from config file first
      this.openaiService = await createOpenAIServiceFromConfig();
      console.log('OpenAI service initialized successfully from config file');
    } catch (configError) {
      console.warn('Failed to initialize from config file, trying legacy environment variables:', configError instanceof Error ? configError.message : `${configError}`);

      // Fall back to environment variables for backward compatibility
      try {
        this.openaiService = createOpenAIServiceFromEnv();
        console.log('OpenAI service initialized successfully from environment variables (legacy mode)');
      } catch (envError) {
        console.warn('OpenAI service not available:', envError instanceof Error ? envError.message : `${envError}`);
        this.openaiService = null;
      }
    }

    // Update knowledge extraction service with OpenAI service
    this.knowledgeExtractionService = new KnowledgeExtractionService(
      this.openaiService,
      this.conversationStorage
    );

    // Initialize Google Search service if API keys are available
    try {
      this.googleSearchService = createGoogleSearchServiceFromEnv();
      console.log('Google Search service initialized successfully');

      // Initialize tools if both services are available
      if (this.openaiService && this.googleSearchService) {
        initializeTools(this.googleSearchService, this.mediaService);
        this.toolsAvailable = hasAvailableTools();
        console.log('Tools initialized:', this.toolsAvailable);
      }
    } catch (error) {
      console.warn('Google Search service not available:', error instanceof Error ? error.message : `${error}`);
      this.googleSearchService = null;
    }
  }

  async processMessage(
    from: string,
    messageText: string,
    messageId: string,
    messageType: string,
    mediaData?: { id: string; mimeType: string; sha256: string; type: 'image' | 'audio' }
  ): Promise<void> {
    await this.whatsappService.markMessageAsRead(messageId);

    // Get the full conversation object, including the user profile
    let conversation = await this.conversationStorage.getConversation(from);
    if (!conversation) {
        // This is a first-time user. Create an initial conversation entry.
        // The storeIncomingMessage will create the file with a default profile.
        await this.storeIncomingMessage(from, messageText, messageId, messageType, mediaData);
        conversation = await this.conversationStorage.getConversation(from);
    }

    const userProfile = conversation?.userProfile;
    let response: string;

    // --- State-based conversation logic ---
    if (userProfile?.state === 'awaiting_name') {
        // The user is responding with their name
        const name = messageText.trim();
        await this.conversationStorage.updateUserProfile(from, { name, state: null });
        response = `Great to meet you, ${name}! How can I help you today?`;
    } else if (!userProfile?.name) {
        // It's the first interaction and we don't know the name
        await this.conversationStorage.updateUserProfile(from, { state: 'awaiting_name' });
        response = `Hello! I'm ${this.chatbotName}, your personal assistant. What should I call you?`;
    } else {
        // --- Normal message processing ---
        if (messageType === 'text') {
            response = await this.generateResponse(messageText, from);
        } else if (messageType === 'image' && mediaData) {
            response = await this.processMediaMessage(mediaData, 'image');
        } else if (messageType === 'audio' && mediaData) {
            response = await this.processMediaMessage(mediaData, 'audio');
        } else {
            response = 'I can only process text, images, and audio files.';
        }
    }

    // Store the incoming message (if not already stored)
    await this.storeIncomingMessage(from, messageText, messageId, messageType, mediaData);

    await this.whatsappService.sendMessage(from, response);
    await this.storeOutgoingMessage(from, response, messageId);

    // After responding, scan conversation history for knowledge extraction
    await this.scanConversationForKnowledge(from);
  }

  async processMediaMessage(
    mediaData: { id: string; mimeType: string; sha256: string; type: 'image' | 'audio' },
    mediaType: 'image' | 'audio'
  ): Promise<string> {
    try {
      const mediaInfo = await this.mediaService.downloadAndSaveMedia(
        mediaData.id,
        mediaData.mimeType,
        mediaData.sha256,
        mediaType
      );

      // For both audio and images, use tool calling approach
      // The LLM will decide whether to use analyze_image or transcribe_audio tools
      const userMessage = mediaType === 'audio'
        ? "I've sent you an audio message. Please transcribe and respond to it."
        : "I've sent you an image. Please analyze and describe what you see.";

      try {
        const systemPrompt = `You are ${this.chatbotName}, a helpful WhatsApp assistant. The user has sent a ${mediaType} file.

For audio messages: Use the transcribe_audio tool to convert the audio to text, then respond conversationally.
For images: Use the analyze_image tool to understand the image content, then provide a helpful description.

File path: ${mediaInfo.filepath}
File type: ${mediaType}`;

        const messages: any[] = [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userMessage
          }
        ];

        const tools = getToolSchemas();
        const response = await this.openaiService!.generateResponseWithTools(messages, tools);

        return this.mediaService.getEnhancedMediaInfoResponse(mediaInfo, response);
      } catch (error) {
        console.error(`${mediaType} processing via tool calling failed:`, error);
        // Fall back to basic media info if tool calling fails
        return this.mediaService.getMediaInfoResponse(mediaInfo) +
               `\n\n❌ ${mediaType === 'audio' ? 'Audio transcription' : 'Image analysis'} is not available at the moment.`;
      }
    } catch (error) {
      console.error('Error processing media message:', error);
      return `Sorry, I couldn't process the ${mediaType} file. Please try again.`;
    }
  }

  async generateResponse(messageText: string, senderNumber?: string): Promise<string> {
    // Use OpenAI for intelligent responses if available
    if (this.openaiService?.isConfigured()) {
      try {
        let context = '';

        // Include conversation history if sender number is provided
        if (senderNumber) {
          context = await this.conversationStorage.getFormattedMessageHistory(senderNumber, 5);

          // Add user's name and learned knowledge to the context for the LLM
          const conversation = await this.conversationStorage.getConversation(senderNumber);
          const userName = conversation?.userProfile?.name || 'the user';
          const userKnowledge = conversation?.userProfile?.knowledge || {};

          context += `\n\n--- User Information ---
Name: ${userName}
Learned Knowledge: ${JSON.stringify(userKnowledge, null, 2)}`;
        }

        // Use tool calling if available and the message seems to require search
        const shouldUseSearch = this.toolsAvailable && this.shouldUseSearch(messageText);

        console.log('🧠 Response Generation Decision:', {
          message: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : ''),
          hasContext: !!context,
          toolsAvailable: this.toolsAvailable,
          shouldUseSearch: shouldUseSearch,
          searchKeywords: this.getSearchKeywords(messageText)
        });

        if (shouldUseSearch) {
          return await this.generateResponseWithTools(messageText, context, senderNumber);
        }

        return await this.openaiService.generateTextResponse(messageText, context);
      } catch (error) {
        console.error('OpenAI response generation failed, falling back to basic responses:', error);
        // Fall back to basic responses
      }
    }

    const lowerMessage = messageText.toLowerCase().trim();

    // Simple chatbot responses
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return 'Hello! Welcome to our WhatsApp bot. How can I help you today?';
    }

    if (lowerMessage.includes('help')) {
      return 'Here are some commands you can use:\n\n' +
             '• "hello" - Get a greeting\n' +
             '• "time" - Get current time\n' +
             '• "info" - Get information about this bot\n' +
             '• "help" - Show this help message';
    }

    if (lowerMessage.includes('time')) {
      const now = new Date();
      return `The current time is: ${now.toLocaleString()}`;
    }

    if (lowerMessage.includes('info')) {
      return 'This is a WhatsApp chat bot built with TypeScript and Express.js.\n' +
             'It can respond to basic commands and provide helpful information.';
    }

    // Default response
    return `You said: "${messageText}"\n\n` +
           'I can help you with:\n' +
           '• Type "hello" for a greeting\n' +
           '• Type "help" for available commands\n' +
           '• Type "time" for current time\n' +
           '• Type "info" for bot information';
  }

  // Helper for current time
  private getCurrentDateTime(): string {
    return new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Hong_Kong',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
  }

  /**
   * Generate response using tool calling for enhanced capabilities
   */
  private async generateResponseWithTools(
    messageText: string,
    context: string,
    senderNumber?: string
  ): Promise<string> {
    if (!this.openaiService || !this.toolsAvailable) {
      return this.generateResponse(messageText, senderNumber);
    }

    try {
      // --- DIRECT NEWS HANDLING: Bypass AI tool calling for news requests ---
      const lowerMessage = messageText.toLowerCase();
      const isNewsRequest = lowerMessage.includes('news') ||
                           lowerMessage.includes('新聞') ||
                           lowerMessage.includes('港聞') ||
                           lowerMessage.includes('頭條') ||
                           lowerMessage.includes('today') ||
                           lowerMessage.includes('今日') ||
                           lowerMessage.includes('有咩');

      if (isNewsRequest) {
        console.log('📰 Direct news request detected, bypassing AI tool calling');
        return await this.handleNewsRequestDirectly(messageText, senderNumber);
      }

      let userName = 'the user';
      let userKnowledge = {};

      if (senderNumber) {
        const conversation = await this.conversationStorage.getConversation(senderNumber);
        userName = conversation?.userProfile?.name || 'the user';
        userKnowledge = conversation?.userProfile?.knowledge || {};
      }

      const now = this.getCurrentDateTime();
      
      // UPDATED PROMPT
      const systemPrompt = `You are ${this.chatbotName}, a friendly and witty Hong Kong assistant.
    
    Current Time: ${now}

    **BEHAVIOR GUIDELINES:**
    1. **Personality:** Be warm, use emojis naturally 🌏, and avoid robotic phrases like "Here is the output".
    2. **News Handling:**
       - If user asks for general news, call 'scrape_news' with category="general".
       - Summarize the top 3 stories briefly.
       - **IMPORTANT:** At the end, ask: "I also have updates on **Tech**, **Business**, and **Sports**. Want to hear about those?"
    3. **Accuracy:** Never invent news. Only use the data provided by the tools.
    4. **Context:** Ignore old news in the chat history. Always use tools for fresh data.

    Context: ${context}`;

      const messages: any[] = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: messageText
        }
      ];

      const tools = getToolSchemas();
      const rawAiResponse = await this.openaiService.generateResponseWithTools(messages, tools);

      // --- New logic to process and save learned knowledge ---
      const learnTagRegex = /<learn topic="([^"]+)" source="([^"]+)">([\s\S]*?)<\/learn>/;
      const match = rawAiResponse.match(learnTagRegex);

      if (match && senderNumber) {
          const [, topic, source, value] = match;
          const knowledgeUpdate = {
              [topic]: {
                  value: value.trim(),
                  source: source.trim(),
                  lastUpdated: new Date().toISOString()
              }
          };

          // Get the current profile and merge knowledge
          const conversation = await this.conversationStorage.getConversation(senderNumber);
          const existingKnowledge = conversation?.userProfile?.knowledge || {};
          await this.conversationStorage.updateUserProfile(senderNumber, {
              knowledge: { ...existingKnowledge, ...knowledgeUpdate }
          });

          console.log(`🧠 Learned new knowledge for user ${senderNumber}:`, knowledgeUpdate);
      }

      // Clean the <learn> tag from the response before sending it to the user
      const finalResponse = rawAiResponse.replace(learnTagRegex, '').trim();

      return finalResponse;
    } catch (error) {
      console.error('Error generating response with tools:', error);
      // Fall back to regular response generation
      return this.generateResponse(messageText, senderNumber);
    }
  }

  /**
   * Directly handle news requests without relying on AI tool calling
   */
  private async handleNewsRequestDirectly(messageText: string, senderNumber?: string): Promise<string> {
    try {
      // Import the news scrape service directly
      const { newsScrapeService } = await import('../tools/index');
      
      if (!newsScrapeService) {
        throw new Error('News scrape service not available');
      }
      
      // Determine category based on message
      let category = 'general';
      const lowerMessage = messageText.toLowerCase();
      
      if (lowerMessage.includes('tech') || lowerMessage.includes('技術')) category = 'tech';
      else if (lowerMessage.includes('business') || lowerMessage.includes('商業') || lowerMessage.includes('財經')) category = 'business';
      else if (lowerMessage.includes('sport') || lowerMessage.includes('體育')) category = 'sports';
      else if (lowerMessage.includes('world') || lowerMessage.includes('國際')) category = 'world';
      
      // Get fresh news data directly
      const newsData = newsScrapeService.getCachedNews(category);
      
      // Parse and format the news for the user
      const formattedNews = this.formatNewsForUser(newsData, category, messageText);
      
      return formattedNews;
    } catch (error) {
      console.error('Error handling news request directly:', error);
      return '抱歉，我暫時無法獲取最新新聞。請稍後再試。';
    }
  }

  /**
   * Format news data into a user-friendly response
   */
  private formatNewsForUser(newsData: string, category: string, originalMessage: string): string {
    // Extract the actual news content (remove system info)
    const newsContent = newsData.replace(/\[SYSTEM:.*?\]\n\n/, '');
    
    // Check if this is a Chinese language request
    const isChineseRequest = originalMessage.includes('新聞') ||
                            originalMessage.includes('港聞') ||
                            originalMessage.includes('有咩') ||
                            originalMessage.includes('今日');
    
    if (newsContent.includes('I am currently updating my news feed')) {
      return isChineseRequest
        ? '我正在更新新聞資訊，請稍等一分鐘再問我。🌟'
        : 'I am currently updating my news feed. Please ask again in 1 minute.';
    }
    
    // Parse the news content and create a summary
    const headlines = newsContent.split('\n\n').slice(0, 3); // Get top 3 headlines
    
    if (isChineseRequest) {
      let response = `嗨！👋 今日${this.getChineseCategoryName(category)}頭條：\n\n`;
      
      headlines.forEach((headline, index) => {
        const titleMatch = headline.match(/Headline: (.*?)\n/);
        const summaryMatch = headline.match(/Summary: (.*?)(\.\.\.)?$/);
        
        if (titleMatch && summaryMatch) {
          response += `${index + 1}️⃣ ${titleMatch[1]}\n`;
          response += `   ${summaryMatch[1].substring(0, 100)}...\n\n`;
        }
      });
      
      response += '想深入了解哪一個故事嗎？或者想看看其他類別的新聞？💬';
      return response;
    } else {
      let response = `Hi! 👋 Today's top ${category} headlines:\n\n`;
      
      headlines.forEach((headline, index) => {
        const titleMatch = headline.match(/Headline: (.*?)\n/);
        const summaryMatch = headline.match(/Summary: (.*?)(\.\.\.)?$/);
        
        if (titleMatch && summaryMatch) {
          response += `${index + 1}️⃣ ${titleMatch[1]}\n`;
          response += `   ${summaryMatch[1].substring(0, 100)}...\n\n`;
        }
      });
      
      response += 'Want more details on any story? Or check out other categories? 💬';
      return response;
    }
  }

  /**
   * Get Chinese category name
   */
  private getChineseCategoryName(category: string): string {
    const categoryMap: { [key: string]: string } = {
      'general': '綜合',
      'tech': '科技',
      'business': '商業',
      'sports': '體育',
      'world': '國際'
    };
    return categoryMap[category] || '綜合';
  }

  /**
   * Determine if a message should trigger search functionality
   */
  private shouldUseSearch(messageText: string): boolean {
    const lowerMessage = messageText.toLowerCase();

    // Keywords that indicate need for current information and web scraping
    const searchKeywords = [
      'current', 'latest', 'news', 'today', 'recent', 'update',
      'what is', 'who is', 'when is', 'where is', 'how to',
      'search', 'find', 'look up', 'information about',
      'weather', 'stock', 'price', 'score', 'results',
      // Web scraping specific keywords
      'website', 'webpage', 'page', 'article', 'blog', 'post',
      'url', 'link', 'http', 'https', 'www', '.com', '.org',
      'read', 'content', 'extract', 'scrape', 'information from',
      'check this', 'look at this', 'visit this', 'go to',
      'product', 'review', 'manual', 'documentation', 'guide',
      'tutorial', 'instructions', 'specifications', 'details'
    ];

    return searchKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Get matching search keywords for logging
   */
  private getSearchKeywords(messageText: string): string[] {
    const lowerMessage = messageText.toLowerCase();
    const searchKeywords = [
      'current', 'latest', 'news', 'today', 'recent', 'update',
      'what is', 'who is', 'when is', 'where is', 'how to',
      'search', 'find', 'look up', 'information about',
      'weather', 'stock', 'price', 'score', 'results',
      // Web scraping specific keywords
      'website', 'webpage', 'page', 'article', 'blog', 'post',
      'url', 'link', 'http', 'https', 'www', '.com', '.org',
      'read', 'content', 'extract', 'scrape', 'information from',
      'check this', 'look at this', 'visit this', 'go to',
      'product', 'review', 'manual', 'documentation', 'guide',
      'tutorial', 'instructions', 'specifications', 'details'
    ];

    return searchKeywords.filter(keyword => lowerMessage.includes(keyword));
  }

 private async storeIncomingMessage(
   senderNumber: string,
   messageText: string,
   messageId: string,
   messageType: string,
   mediaData?: { id: string; mimeType: string; sha256: string; type: 'image' | 'audio' }
 ): Promise<void> {
   try {
     const message: Message = {
       id: messageId,
       type: messageType as 'text' | 'image' | 'audio',
       content: messageText,
       timestamp: new Date().toISOString(),
       mediaInfo: mediaData ? {
         id: mediaData.id,
         mimeType: mediaData.mimeType,
         sha256: mediaData.sha256
       } : undefined
     };

     await this.conversationStorage.storeMessage(senderNumber, message);
   } catch (error) {
     console.error('Error storing incoming message:', error);
   }
 }

 private async storeOutgoingMessage(
   senderNumber: string,
   response: string,
   originalMessageId: string
 ): Promise<void> {
   try {
     const message: Message = {
       id: `response_${Date.now()}_${originalMessageId}`,
       type: 'text',
       content: response,
       timestamp: new Date().toISOString()
     };

     await this.conversationStorage.storeMessage(senderNumber, message);
   } catch (error) {
     console.error('Error storing outgoing message:', error);
   }
 }

  /**
   * Get the chatbot name for external access
   */

  /**
   * Scan conversation history for knowledge extraction after responding
   */
  private async scanConversationForKnowledge(senderNumber: string): Promise<void> {
    try {
      // Only scan if we have enough conversation history (at least 3 messages)
      const conversation = await this.conversationStorage.getConversation(senderNumber);
      if (!conversation || conversation.messages.length < 3) {
        return;
      }

      // Only scan periodically to avoid excessive API calls
      // Scan every 5th message or if conversation has grown significantly
      const shouldScan = conversation.messages.length % 5 === 0 ||
                        conversation.messages.length > 20;

      if (shouldScan) {
        console.log(`🧠 Starting knowledge extraction scan for user ${senderNumber}`);
        await this.knowledgeExtractionService.scanConversationForKnowledge(senderNumber);
      }
    } catch (error) {
      console.error('Error in knowledge extraction scan:', error);
    }
  }
  getChatbotName(): string {
    return this.chatbotName;
  }
}