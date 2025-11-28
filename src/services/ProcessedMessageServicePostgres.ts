import { prisma, PrismaDatabaseUtils } from '../config/prisma';

export class ProcessedMessageServicePostgres {
  constructor() {
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  async hasMessageBeenProcessed(messageId: string): Promise<boolean> {
    try {
      const result = await prisma.processedMessage.findUnique({
        where: {
          messageId,
        },
      });
      return !!result;
    } catch (error) {
      console.error('❌ Failed to check if message was processed:', error);
      return false;
    }
  }

  async markMessageAsProcessed(messageId: string, senderNumber?: string, messageType?: string): Promise<void> {
    try {
      await prisma.processedMessage.upsert({
        where: {
          messageId,
        },
        update: {
          senderNumber,
          messageType,
          processedAt: new Date(),
        },
        create: {
          messageId,
          senderNumber,
          messageType,
        },
      });
    } catch (error) {
      console.error('❌ Failed to mark message as processed:', error);
      throw error;
    }
  }

  async cleanupOldEntries(daysOlderThan: number = 30): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysOlderThan);

      const result = await prisma.processedMessage.deleteMany({
        where: {
          processedAt: {
            lt: cutoff,
          },
        },
      });

      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old entries:', error);
      return 0;
    }
  }

  /**
   * Get statistics about processed messages
   */
  async getStats(): Promise<{
    totalProcessed: number;
    last24Hours: number;
    byType: Record<string, number>;
  }> {
    try {
      const [totalProcessed, last24Hours, byType] = await Promise.all([
        this.getCount(),
        this.getCountLast24Hours(),
        this.getCountByType(),
      ]);

      return {
        totalProcessed,
        last24Hours,
        byType,
      };
    } catch (error) {
      console.error('❌ Failed to get processed messages stats:', error);
      return {
        totalProcessed: 0,
        last24Hours: 0,
        byType: {},
      };
    }
  }

  private async getCount(): Promise<number> {
    try {
      return await prisma.processedMessage.count();
    } catch (error) {
      console.error('❌ Failed to get count:', error);
      return 0;
    }
  }

  private async getCountLast24Hours(): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 1);

      return await prisma.processedMessage.count({
        where: {
          processedAt: {
            gte: cutoff,
          },
        },
      });
    } catch (error) {
      console.error('❌ Failed to get count for last 24 hours:', error);
      return 0;
    }
  }

  private async getCountByType(): Promise<Record<string, number>> {
    try {
      const result = await prisma.processedMessage.groupBy({
        by: ['messageType'],
        _count: {
          messageId: true,
        },
      });

      const counts: Record<string, number> = {};
      result.forEach(row => {
        counts[row.messageType || 'unknown'] = row._count.messageId;
      });
      return counts;
    } catch (error) {
      console.error('❌ Failed to get count by type:', error);
      return {};
    }
  }
}