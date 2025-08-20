import { WhatsAppService } from '../services/whatsappService';
import { MediaService, MediaInfo } from '../services/mediaService';

export class MessageHandler {
  private whatsappService: WhatsAppService;
  private mediaService: MediaService;

  constructor(whatsappService: WhatsAppService, mediaService: MediaService) {
    this.whatsappService = whatsappService;
    this.mediaService = mediaService;
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

      return this.mediaService.getMediaInfoResponse(mediaInfo);
    } catch (error) {
      console.error('Error processing media message:', error);
      return `Sorry, I couldn't process the ${mediaType} file. Please try again.`;
    }
  }

  private async generateResponse(messageText: string): Promise<string> {
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