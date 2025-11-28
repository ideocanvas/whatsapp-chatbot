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