import { prisma } from '../config/prisma';
import { ProcessedArticle } from '../types/article';

export interface ProcessedArticleCreateData {
  title: string;
  url: string;
  source: string;
  feedUrl?: string;
  publishedAt: string;
  originalContent: string;
  processedContent: string;
  imagePaths: string[];
  imageDescriptions?: any; // JSON data
  keywords: string[];
  tags?: string[];
  category?: string;
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
}

export interface ProcessedArticleUpdateData {
  title?: string;
  feedUrl?: string;
  originalContent?: string;
  processedContent?: string;
  imagePaths?: string[];
  imageDescriptions?: any;
  keywords?: string[];
  tags?: string[];
  category?: string;
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  retryCount?: number;
}

export class ProcessedArticleService {
  constructor() {
    // Database connection is initialized via prisma singleton
  }

  /**
   * Create a new processed article
   */
  async createProcessedArticle(data: ProcessedArticleCreateData): Promise<string> {
    try {
      const article = await prisma.processedArticle.create({
        data: {
          title: data.title,
          url: data.url,
          source: data.source,
          feedUrl: data.feedUrl,
          publishedAt: data.publishedAt,
          originalContent: data.originalContent,
          processedContent: data.processedContent,
          imagePaths: data.imagePaths,
          imageDescriptions: data.imageDescriptions,
          keywords: data.keywords,
          tags: data.tags || [],
          category: data.category,
          processingStatus: data.processingStatus || 'pending',
          errorMessage: data.errorMessage,
        }
      });

      console.log(`💾 Saved processed article: ${data.title}`);
      return article.id;
    } catch (error) {
      console.error('❌ Error creating processed article:', error);
      throw new Error(`Failed to create processed article: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing processed article
   */
  async updateProcessedArticle(id: string, data: ProcessedArticleUpdateData): Promise<void> {
    try {
      await prisma.processedArticle.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        }
      });

      console.log(`📝 Updated processed article: ${id}`);
    } catch (error) {
      console.error('❌ Error updating processed article:', error);
      throw new Error(`Failed to update processed article: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a processed article by ID
   */
  async getProcessedArticle(id: string): Promise<ProcessedArticle | null> {
    try {
      const article = await prisma.processedArticle.findUnique({
        where: { id }
      });

      if (!article) {
        return null;
      }

      return this.mapToProcessedArticle(article);
    } catch (error) {
      console.error('❌ Error getting processed article:', error);
      throw new Error(`Failed to get processed article: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a processed article by URL
   */
  async getProcessedArticleByUrl(url: string): Promise<{ id: string } & ProcessedArticle | null> {
    try {
      const article = await prisma.processedArticle.findUnique({
        where: { url }
      });

      if (!article) {
        return null;
      }

      return {
        id: article.id,
        ...this.mapToProcessedArticle(article)
      };
    } catch (error) {
      console.error('❌ Error getting processed article by URL:', error);
      throw new Error(`Failed to get processed article by URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Search processed articles with comprehensive filtering, pagination, and ordering
   */
  async searchProcessedArticles(query?: string, options: {
    page?: number;
    limit?: number;
    category?: string;
    source?: string;
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    dateFrom?: string;
    dateTo?: string;
    orderBy?: 'publishedAt' | 'createdAt' | 'title' | 'source';
    orderDirection?: 'asc' | 'desc';
  } = {}): Promise<{ articles: ProcessedArticle[]; total: number; page: number; pages: number }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 10;
      const skip = (page - 1) * limit;

      const where: any = {};

      // Add search query filter
      if (query) {
        where.OR = [
          { title: { contains: query, mode: 'insensitive' as any } },
          { processedContent: { contains: query, mode: 'insensitive' as any } },
          { keywords: { has: query } }
        ];
      }

      // Add filtering options
      if (options.category) where.category = options.category;
      if (options.source) where.source = options.source;
      if (options.status) where.processingStatus = options.status;

      if (options.dateFrom || options.dateTo) {
        where.publishedAt = {};
        if (options.dateFrom) where.publishedAt.gte = options.dateFrom;
        if (options.dateTo) where.publishedAt.lte = options.dateTo;
      }

      // Determine ordering
      const orderBy: any = {};
      const orderField = options.orderBy || 'publishedAt';
      const orderDir = options.orderDirection || 'desc';
      orderBy[orderField] = orderDir;

      const [articles, total] = await Promise.all([
        prisma.processedArticle.findMany({
          where,
          skip,
          take: limit,
          orderBy
        }),
        prisma.processedArticle.count({ where })
      ]);

      return {
        articles: articles.map((article: any) => this.mapToProcessedArticle(article)),
        total,
        page,
        pages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('❌ Error searching processed articles:', error);
      throw new Error(`Failed to search processed articles: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Check if article already exists by URL and get its creation date
   */
  async articleExistsWithDate(url: string): Promise<{ exists: boolean; createdAt?: Date; updatedAt?: Date }> {
    try {
      const article = await prisma.processedArticle.findFirst({
        where: { url },
        select: { createdAt: true, updatedAt: true }
      });

      if (!article) {
        return { exists: false };
      }

      return {
        exists: true,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt
      };
    } catch (error) {
      console.error('❌ Error checking if article exists:', error);
      return { exists: false };
    }
  }

  /**
   * Check if article already exists by URL
   */
  async articleExists(url: string): Promise<boolean> {
    const result = await this.articleExistsWithDate(url);
    return result.exists;
  }

  /**
   * Check if article already exists by title
   */
  async articleExistsByTitle(title: string): Promise<boolean> {
    try {
      const count = await prisma.processedArticle.count({
        where: { title }
      });
      return count > 0;
    } catch (error) {
      console.error('❌ Error checking if article exists by title:', error);
      return false;
    }
  }

  /**
   * Delete a processed article
   */
  async deleteProcessedArticle(id: string): Promise<void> {
    try {
      await prisma.processedArticle.delete({
        where: { id }
      });

      console.log(`🗑️ Deleted processed article: ${id}`);
    } catch (error) {
      console.error('❌ Error deleting processed article:', error);
      throw new Error(`Failed to delete processed article: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get processing statistics
   */
  async getStatistics(): Promise<{
    totalArticles: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
  }> {
    try {
      const totalArticles = await prisma.processedArticle.count();

      const byStatus = await prisma.processedArticle.groupBy({
        by: ['processingStatus'],
        _count: true
      });

      const byCategory = await prisma.processedArticle.groupBy({
        by: ['category'],
        _count: true
      });

      const bySource = await prisma.processedArticle.groupBy({
        by: ['source'],
        _count: true
      });

      return {
        totalArticles,
        byStatus: this.arrayToRecord(byStatus, 'processingStatus', '_count'),
        byCategory: this.arrayToRecord(byCategory, 'category', '_count'),
        bySource: this.arrayToRecord(bySource, 'source', '_count')
      };
    } catch (error) {
      console.error('❌ Error getting statistics:', error);
      throw new Error(`Failed to get statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Helper to convert groupBy results to record
   */
  private arrayToRecord(array: any[], keyField: string, valueField: string): Record<string, number> {
    const record: Record<string, number> = {};
    array.forEach(item => {
      const key = item[keyField] || 'unknown';
      record[key] = item[valueField];
    });
    return record;
  }

  /**
   * Map database model to ProcessedArticle interface
   */
  private mapToProcessedArticle(dbArticle: any): ProcessedArticle {
    return {
      title: dbArticle.title,
      url: dbArticle.url,
      source: dbArticle.source,
      publishedAt: dbArticle.publishedAt,
      originalContent: dbArticle.originalContent,
      processedContent: dbArticle.processedContent,
      keywords: dbArticle.keywords,
      tags: dbArticle.tags || [],
      category: dbArticle.category || undefined,
      imagePaths: dbArticle.imagePaths,
      imageDescriptions: dbArticle.imageDescriptions || undefined
    };
  }

}

export function createProcessedArticleService(): ProcessedArticleService {
  return new ProcessedArticleService();
}