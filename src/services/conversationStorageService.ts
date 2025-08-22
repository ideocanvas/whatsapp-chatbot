import * as fs from 'fs';
import * as path from 'path';
import { Conversation, Message, ConversationStorageConfig } from '../types/conversation';

export class ConversationStorageService {
  private config: ConversationStorageConfig;
  private storageDir: string;

  constructor(config: ConversationStorageConfig) {
    this.config = {
      storagePath: config.storagePath,
      maxMessagesPerConversation: config.maxMessagesPerConversation || 100,
      cleanupIntervalHours: config.cleanupIntervalHours || 24
    };

    this.storageDir = path.resolve(process.cwd(), this.config.storagePath);
    this.ensureStorageDirectory();

    // Start cleanup interval
    this.startCleanupInterval();
  }

  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
      console.log(`Created conversation storage directory: ${this.storageDir}`);
    }
  }

  private getConversationFilePath(senderNumber: string): string {
    // Sanitize sender number for filename
    const sanitizedNumber = senderNumber.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(this.storageDir, `${sanitizedNumber}.json`);
  }

  async storeMessage(senderNumber: string, message: Message): Promise<void> {
    try {
      const filePath = this.getConversationFilePath(senderNumber);
      let conversation: Conversation;

      // Load existing conversation or create new one
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        conversation = JSON.parse(fileContent);
      } else {
        conversation = {
          senderNumber,
          messages: [],
          lastUpdated: new Date().toISOString(),
          messageCount: 0
        };
      }

      // Add new message
      conversation.messages.push(message);
      conversation.lastUpdated = new Date().toISOString();
      conversation.messageCount = conversation.messages.length;

      // Apply message limit
      if (conversation.messages.length > this.config.maxMessagesPerConversation!) {
        conversation.messages = conversation.messages.slice(-this.config.maxMessagesPerConversation!);
        conversation.messageCount = conversation.messages.length;
      }

      // Save to file
      fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));

    } catch (error) {
      console.error(`Error storing message for ${senderNumber}:`, error);
      throw new Error(`Failed to store message: ${error instanceof Error ? error.message : `${error}`}`);
    }
  }

  async getConversation(senderNumber: string): Promise<Conversation | null> {
    try {
      const filePath = this.getConversationFilePath(senderNumber);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      console.error(`Error loading conversation for ${senderNumber}:`, error);
      return null;
    }
  }

  async getMessageHistory(senderNumber: string, limit?: number): Promise<Message[]> {
    const conversation = await this.getConversation(senderNumber);
    if (!conversation) {
      return [];
    }

    const messages = conversation.messages;
    return limit ? messages.slice(-limit) : messages;
  }

  async getFormattedMessageHistory(senderNumber: string, limit: number = 10): Promise<string> {
    const messages = await this.getMessageHistory(senderNumber, limit);

    if (messages.length === 0) {
      return 'No previous conversation history.';
    }

    return messages.map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleString();
      let content = msg.content;

      if (msg.type === 'image' && msg.mediaPath) {
        content = '[Image message]';
      } else if (msg.type === 'audio' && msg.mediaPath) {
        content = '[Audio message]';
      }

      return `${timestamp} - ${msg.type.toUpperCase()}: ${content}`;
    }).join('\n');
  }

  async deleteConversation(senderNumber: string): Promise<boolean> {
    try {
      const filePath = this.getConversationFilePath(senderNumber);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error deleting conversation for ${senderNumber}:`, error);
      return false;
    }
  }

  async cleanupOldConversations(maxAgeHours: number = 168): Promise<number> {
    try {
      const files = fs.readdirSync(this.storageDir);
      const now = new Date();
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.storageDir, file);
          const stats = fs.statSync(filePath);
          const ageHours = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60);

          if (ageHours > maxAgeHours) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      }

      console.log(`Cleaned up ${deletedCount} old conversation files`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old conversations:', error);
      return 0;
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupOldConversations(this.config.cleanupIntervalHours! * 24); // Convert hours to days
    }, 24 * 60 * 60 * 1000); // Run every 24 hours
  }

  getStorageStats(): { totalConversations: number; totalMessages: number } {
    try {
      const files = fs.readdirSync(this.storageDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      let totalMessages = 0;

      for (const file of jsonFiles) {
        const filePath = path.join(this.storageDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const conversation = JSON.parse(fileContent);
        totalMessages += conversation.messageCount;
      }

      return {
        totalConversations: jsonFiles.length,
        totalMessages
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { totalConversations: 0, totalMessages: 0 };
    }
  }
}