import { WhatsAppService } from '../services/whatsappService';
import { MediaService, MediaInfo } from '../services/mediaService';
import { OpenAIService, createOpenAIServiceFromEnv } from '../services/openaiService';
import { ConversationStorageService } from '../services/conversationStorageService';
import { Message } from '../types/conversation';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../services/googleSearchService';
import { initializeTools, getToolSchemas, executeTool, hasAvailableTools } from '../tools';

export class MessageHandler {
  private whatsappService: WhatsAppService;
  private mediaService: MediaService;
  private openaiService: OpenAIService | null;
  private googleSearchService: GoogleSearchService | null;
  private conversationStorage: ConversationStorageService;
  private toolsAvailable: boolean = false;

  constructor(whatsappService: WhatsAppService, mediaService: MediaService) {
    this.whatsappService = whatsappService;
    this.mediaService = mediaService;

    // Initialize conversation storage
    this.conversationStorage = new ConversationStorageService({
      storagePath: 'data/conversations',
      maxMessagesPerConversation: 50,
      cleanupIntervalHours: 24
    });

    // Initialize OpenAI service if API key is available
    try {
      this.openaiService = createOpenAIServiceFromEnv();
      console.log('OpenAI service initialized successfully');
    } catch (error) {
      console.warn('OpenAI service not available:', error instanceof Error ? error.message : 'Unknown error');
      this.openaiService = null;
    }

    // Initialize Google Search service if API keys are available
    try {
      this.googleSearchService = createGoogleSearchServiceFromEnv();
      console.log('Google Search service initialized successfully');

      // Initialize tools if both services are available
      if (this.openaiService && this.googleSearchService) {
        initializeTools(this.googleSearchService);
        this.toolsAvailable = hasAvailableTools();
        console.log('Tools initialized:', this.toolsAvailable);
      }
    } catch (error) {
      console.warn('Google Search service not available:', error instanceof Error ? error.message : 'Unknown error');
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
    // Mark message as read
    await this.whatsappService.markMessageAsRead(messageId);

    let response: string;

    if (messageType === 'text') {
      // Process text message
      response = await this.generateResponse(messageText, from);
    } else if (messageType === 'image' && mediaData) {
      // Process image message
      response = await this.processMediaMessage(mediaData, 'image');
    } else if (messageType === 'audio' && mediaData) {
      // Process audio message
      response = await this.processMediaMessage(mediaData, 'audio');
    } else {
      response = 'I received your message, but I can only process text, images, and audio files.';
    }

    // Store the incoming message
    await this.storeIncomingMessage(from, messageText, messageId, messageType, mediaData);

    // Send response back to user
    await this.whatsappService.sendMessage(from, response);

    // Store the outgoing response
    await this.storeOutgoingMessage(from, response, messageId);
  }

  private async processMediaMessage(
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

      if (mediaType === 'audio') {
        try {
          // Try to transcribe audio and get enhanced AI response
          const transcribedText = await this.mediaService.transcribeAudio(mediaInfo.filepath);
          return await this.mediaService.getTranscriptionResponse(transcribedText, mediaInfo);
        } catch (transcriptionError) {
          console.error('Audio transcription failed, falling back to basic info:', transcriptionError);
          // Fall back to basic media info if transcription fails
          return this.mediaService.getMediaInfoResponse(mediaInfo) +
                 '\n\n❌ Audio transcription is not available at the moment.';
        }
      } else {
        // For images, try to analyze with OpenAI if available
        try {
          const aiResponse = await this.mediaService.analyzeImageWithOpenAI(mediaInfo.filepath);
          return this.mediaService.getEnhancedMediaInfoResponse(mediaInfo, aiResponse);
        } catch (analysisError) {
          console.error('Image analysis failed, falling back to basic info:', analysisError);
          // Fall back to basic media info if analysis fails
          return this.mediaService.getMediaInfoResponse(mediaInfo) +
                 '\n\n❌ Image analysis is not available at the moment.';
        }
      }
    } catch (error) {
      console.error('Error processing media message:', error);
      return `Sorry, I couldn't process the ${mediaType} file. Please try again.`;
    }
  }

  private async generateResponse(messageText: string, senderNumber?: string): Promise<string> {
    // Use OpenAI for intelligent responses if available
    if (this.openaiService?.isConfigured()) {
      try {
        let context = '';

        // Include conversation history if sender number is provided
        if (senderNumber) {
          context = await this.conversationStorage.getFormattedMessageHistory(senderNumber, 5);
        }

        // Use tool calling if available and the message seems to require search
        if (this.toolsAvailable && this.shouldUseSearch(messageText)) {
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
      const systemPrompt = context
        ? `You are a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. Use tools when you need to search for current information. Context: ${context}`
        : 'You are a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. Use tools when you need to search for current information. Be direct and avoid formal language.';

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
      const response = await this.openaiService.generateResponseWithTools(messages, tools);

      return response;
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

    // Keywords that indicate need for current information
    const searchKeywords = [
      'current', 'latest', 'news', 'today', 'recent', 'update',
      'what is', 'who is', 'when is', 'where is', 'how to',
      'search', 'find', 'look up', 'information about',
      'weather', 'stock', 'price', 'score', 'results'
    ];

    return searchKeywords.some(keyword => lowerMessage.includes(keyword));
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
}