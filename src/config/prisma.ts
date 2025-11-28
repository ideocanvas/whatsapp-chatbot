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