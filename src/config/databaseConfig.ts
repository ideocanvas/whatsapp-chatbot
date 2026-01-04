import { HistoryStorePostgres } from '../memory/HistoryStorePostgres';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { ProcessedMessageServicePostgres } from '../services/ProcessedMessageServicePostgres';
import { OpenAIService } from '../services/OpenAIService';
import { prisma } from './prisma';

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
  }> {
    const [conversationLogs, knowledgeDocuments, processedMessages] = await Promise.all([
      prisma.conversationLog.count(),
      prisma.knowledge.count(),
      prisma.processedMessage.count(),
    ]);

    return {
      databaseType: 'PostgreSQL',
      conversationLogs,
      knowledgeDocuments,
      processedMessages,
    };
  }

  /**
   * Initialize the database connection
   */
  static async initialize(): Promise<void> {
    try {
      await prisma.$connect();
      console.log('✅ Prisma connected to database');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Health check for PostgreSQL
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
   * Clean up old data in PostgreSQL
   */
  static async cleanupOldData(): Promise<{
    oldConversations: number;
    oldKnowledge: number;
    oldProcessedMessages: number;
  }> {
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
  }
}

export default DatabaseConfig;