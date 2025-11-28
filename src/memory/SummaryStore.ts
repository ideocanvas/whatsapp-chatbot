import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { createHash } from 'crypto';

/**
 * Service for managing long-term conversation summaries
 * Stores and retrieves conversation summaries to maintain context beyond the 1-hour TTL
 */
export class SummaryStore {
  constructor() {
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Generate a hash for conversation context to prevent duplicate summaries
   */
  private generateContextHash(userId: string, messages: any[]): string {
    const contextString = `${userId}:${JSON.stringify(messages)}`;
    return createHash('md5').update(contextString).digest('hex');
  }

  /**
   * Store a conversation summary for a user
   */
  async storeSummary(userId: string, summary: string, messages: any[]): Promise<void> {
    try {
      const contextHash = this.generateContextHash(userId, messages);
      
      await prisma.conversationSummary.create({
        data: {
          userId,
          summary,
          timestamp: new Date(),
          contextHash
        }
      });

      console.log(`📝 Stored conversation summary for ${userId}`);
    } catch (error) {
      console.error('❌ Failed to store conversation summary:', error);
      throw error;
    }
  }

  /**
   * Get the most recent conversation summaries for a user
   */
  async getRecentSummaries(userId: string, limit: number = 3): Promise<string[]> {
    try {
      const summaries = await prisma.conversationSummary.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: limit
      });

      return summaries.map(s => s.summary);
    } catch (error) {
      console.error('❌ Failed to get conversation summaries:', error);
      return [];
    }
  }

  /**
   * Get all conversation summaries for a user within a date range
   */
  async getSummariesByDateRange(userId: string, startDate: Date, endDate: Date): Promise<string[]> {
    try {
      const summaries = await prisma.conversationSummary.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { timestamp: 'asc' }
      });

      return summaries.map(s => s.summary);
    } catch (error) {
      console.error('❌ Failed to get summaries by date range:', error);
      return [];
    }
  }

  /**
   * Clean up old summaries (keep only the most recent ones per user)
   */
  async cleanupOldSummaries(maxPerUser: number = 10): Promise<number> {
    try {
      // Get all user IDs
      const users = await prisma.conversationSummary.groupBy({
        by: ['userId'],
        _count: { id: true }
      });

      let totalDeleted = 0;

      for (const user of users) {
        if (user._count.id > maxPerUser) {
          // Get IDs of summaries to keep (most recent ones)
          const keepIds = await prisma.conversationSummary.findMany({
            where: { userId: user.userId },
            orderBy: { timestamp: 'desc' },
            take: maxPerUser,
            select: { id: true }
          });

          const keepIdSet = new Set(keepIds.map(s => s.id));

          // Delete old summaries
          const result = await prisma.conversationSummary.deleteMany({
            where: {
              userId: user.userId,
              id: { notIn: Array.from(keepIdSet) }
            }
          });

          totalDeleted += result.count;
        }
      }

      if (totalDeleted > 0) {
        console.log(`🧹 Cleaned up ${totalDeleted} old conversation summaries`);
      }

      return totalDeleted;
    } catch (error) {
      console.error('❌ Failed to cleanup old summaries:', error);
      return 0;
    }
  }

  /**
   * Get statistics about stored summaries
   */
  async getStats(): Promise<{
    totalSummaries: number;
    uniqueUsers: number;
    oldestSummary: string;
    newestSummary: string;
  }> {
    try {
      const [total, uniqueUsers, oldest, newest] = await Promise.all([
        prisma.conversationSummary.count(),
        prisma.conversationSummary.groupBy({
          by: ['userId'],
          _count: true
        }).then(groups => groups.length),
        prisma.conversationSummary.findFirst({
          orderBy: { timestamp: 'asc' }
        }),
        prisma.conversationSummary.findFirst({
          orderBy: { timestamp: 'desc' }
        })
      ]);

      return {
        totalSummaries: total,
        uniqueUsers,
        oldestSummary: oldest?.timestamp.toISOString() || 'No summaries',
        newestSummary: newest?.timestamp.toISOString() || 'No summaries'
      };
    } catch (error) {
      console.error('❌ Failed to get summary stats:', error);
      return {
        totalSummaries: 0,
        uniqueUsers: 0,
        oldestSummary: 'No summaries',
        newestSummary: 'No summaries'
      };
    }
  }
}