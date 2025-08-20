import { WhatsAppService } from '../services/whatsappService';
import { MediaService, MediaInfo } from '../services/mediaService';
import { OpenAIService, createOpenAIServiceFromEnv } from '../services/openaiService';

export class MessageHandler {
  private whatsappService: WhatsAppService;
  private mediaService: MediaService;
  private openaiService: OpenAIService | null;

  constructor(whatsappService: WhatsAppService, mediaService: MediaService) {
    this.whatsappService = whatsappService;
    this.mediaService = mediaService;

    // Initialize OpenAI service if API key is available
    try {
      this.openaiService = createOpenAIServiceFromEnv();
      console.log('OpenAI service initialized successfully');
    } catch (error) {
      console.warn('OpenAI service not available:', error instanceof Error ? error.message : 'Unknown error');
      this.openaiService = null;
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
      response = await this.generateResponse(messageText);
    } else if (messageType === 'image' && mediaData) {
      // Process image message
      response = await this.processMediaMessage(mediaData, 'image');
    } else if (messageType === 'audio' && mediaData) {
      // Process audio message
      response = await this.processMediaMessage(mediaData, 'audio');
    } else {
      response = 'I received your message, but I can only process text, images, and audio files.';
    }

    // Send response back to user
    await this.whatsappService.sendMessage(from, response);
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
          // Try to transcribe audio
          const transcribedText = await this.mediaService.transcribeAudio(mediaInfo.filepath);
          return this.mediaService.getTranscriptionResponse(transcribedText, mediaInfo);
        } catch (transcriptionError) {
          console.error('Audio transcription failed, falling back to basic info:', transcriptionError);
          // Fall back to basic media info if transcription fails
          return this.mediaService.getMediaInfoResponse(mediaInfo) +
                 '\n\n❌ Audio transcription is not available at the moment.';
        }
      } else {
        // For images, try to analyze with OpenAI if available
        try {
          const analysis = await this.mediaService.analyzeImageWithOpenAI(mediaInfo.filepath);
          return this.mediaService.getEnhancedMediaInfoResponse(mediaInfo, analysis);
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

  private async generateResponse(messageText: string): Promise<string> {
    // Use OpenAI for intelligent responses if available
    if (this.openaiService?.isConfigured()) {
      try {
        return await this.openaiService.generateTextResponse(messageText);
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
}