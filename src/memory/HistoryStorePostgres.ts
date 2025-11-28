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