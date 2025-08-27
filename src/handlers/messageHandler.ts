import { WhatsAppService } from '../services/whatsappService';
import { MediaService, MediaInfo } from '../services/mediaService';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from '../services/openaiService';
import { ConversationStorageService } from '../services/conversationStorageService';
import { Message } from '../types/conversation';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../services/googleSearchService';
import { initializeTools, getToolSchemas, executeTool, hasAvailableTools } from '../tools';

export class MessageHandler {
  private whatsappService: WhatsAppService;
  private mediaService: MediaService;
  public openaiService: OpenAIService | null;
  private googleSearchService: GoogleSearchService | null;
  private conversationStorage: ConversationStorageService;
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
      let userName = 'the user';
      let userKnowledge = {};

      if (senderNumber) {
        const conversation = await this.conversationStorage.getConversation(senderNumber);
        userName = conversation?.userProfile?.name || 'the user';
        userKnowledge = conversation?.userProfile?.knowledge || {};
      }

      const systemPrompt = context
        ? `You are ${this.chatbotName}, a helpful and friendly WhatsApp assistant for ${userName}. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message.

AVAILABLE TOOLS:
- scrape_news: Get current news articles from major news websites
- google_search: Search the web for current information
- web_scrape: Extract content from specific URLs
- analyze_image: Analyze image content (describe objects, text, context, etc.)
- transcribe_audio: Convert audio messages to text

TOOL USAGE GUIDELINES:
• Use scrape_news for news-related queries (breaking news, current events, latest updates)
• Use google_search + web_scrape for specific website content, products, or technical information
• Use analyze_image when users send images that need description, interpretation, or analysis
• Use transcribe_audio when users send audio messages that need to be converted to text

DECISION MAKING:
You decide which tools to use based on the user's message. If a user sends an image or audio, you can use the appropriate tool to process it. For text queries, use your judgment to determine if web search or news scraping is needed.

**Knowledge Acquisition Rule:**
If the user provides a specific URL and asks you to find information from it, and the information seems useful for future reference, you MUST do two things:
1. Answer the user's current question using the provided source.
2. After answering, output a special XML tag to save this knowledge. The tag should look like this:
<learn topic="[a short, descriptive topic key]" source="[the URL the user provided]">
[A concise summary of the information found]
</learn>

Example:
User says: "Can you check the latest announcements on https://my-favorite-blog.com/news?"
Your response should be:
"Sure! The latest announcement is about their new product launch. [more details...]
<learn topic="latest_announcements_from_blog" source="https://my-favorite-blog.com/news">
The blog's news page contains the company's latest product announcements.
</learn>"

Your final response to the user should NOT include the <learn> tag. It is for my internal processing.
Always check the 'Learned Knowledge' from the context first before searching the web.

Context: ${context}`
        : `You are ${this.chatbotName}, a helpful and friendly WhatsApp assistant for ${userName}. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message.

AVAILABLE TOOLS:
- scrape_news: Get current news articles from major news websites
- google_search: Search the web for current information
- web_scrape: Extract content from specific URLs
- analyze_image: Analyze image content (describe objects, text, context, etc.)
- transcribe_audio: Convert audio messages to text

TOOL USAGE GUIDELINES:
• Use scrape_news for news-related queries (breaking news, current events, latest updates)
• Use google_search + web_scrape for specific website content, products, or technical information
• Use analyze_image when users send images that need description, interpretation, or analysis
• Use transcribe_audio when users send audio messages that need to be converted to text

DECISION MAKING:
You decide which tools to use based on the user's message. If a user sends an image or audio, you can use the appropriate tool to process it. For text queries, use your judgment to determine if web search or news scraping is needed.

**Knowledge Acquisition Rule:**
If the user provides a specific URL and asks you to find information from it, and the information seems useful for future reference, you MUST do two things:
1. Answer the user's current question using the provided source.
2. After answering, output a special XML tag to save this knowledge. The tag should look like this:
<learn topic="[a short, descriptive topic key]" source="[the URL the user provided]">
[A concise summary of the information found]
</learn>

Example:
User says: "Can you check the latest announcements on https://my-favorite-blog.com/news?"
Your response should be:
"Sure! The latest announcement is about their new product launch. [more details...]
<learn topic="latest_announcements_from_blog" source="https://my-favorite-blog.com/news">
The blog's news page contains the company's latest product announcements.
</learn>"

Your final response to the user should NOT include the <learn> tag. It is for my internal processing.
Always check the 'Learned Knowledge' from the context first before searching the web.

Be direct and avoid formal language.`;

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
  getChatbotName(): string {
    return this.chatbotName;
  }
}