import { prisma } from '../config/prisma';
import { OpenAIService } from '../services/OpenAIService';
import { v4 as uuidv4 } from 'uuid';
import pgvector from 'pgvector';

/**
 * PostgreSQL-based Knowledge Base for storing facts learned from autonomous browsing.
 * Uses PostgreSQL with pgvector for efficient RAG searches.
 */
export interface KnowledgeDocument {
  id: string;
  content: string;
  embedding?: number[] | null; // pgvector storage for embeddings
  source: string;
  category: string;
  tags: string[];
  timestamp: string;
  relevanceScore?: number;
}

export class KnowledgeBasePostgres {
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
  }

  /**
   * Check if a source URL has already been processed and stored
   */
  async hasDocument(url: string): Promise<boolean> {
    try {
      const count = await prisma.knowledge.count({
        where: { source: url }
      });
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a specific content hash already exists in the database.
   * This is used to detect if an article (even with a different URL)
   * has already been learned.
   */
  async hasContentHash(hash: string): Promise<boolean> {
    try {
      const tag = `hash:${hash}`;
      const count = await prisma.knowledge.count({
        where: {
          tags: {
            string_contains: tag
          }
        }
      });
      return count > 0;
    } catch (error) {
      console.error('Error checking content hash:', error);
      return false;
    }
  }

  /**
   * Add a new document learned from browsing
   */
  async learnDocument(document: {
    content: string;
    source: string;
    tags: string[];
    timestamp: Date;
    category?: string;
    contentHash?: string;
  }): Promise<void> {
    if (!document.content || document.content.trim().length < 50) return;

    // Add hash to tags if provided
    const finalTags = [...document.tags];
    if (document.contentHash) {
      finalTags.push(`hash:${document.contentHash}`);
    }

    try {
      // Use the large text embedding method which handles chunking automatically
      const embedding = await this.openaiService.createEmbeddingForLargeText(document.content);
      const embeddingSql = pgvector.toSql(embedding);
      const id = uuidv4();

      // Use raw SQL to insert with pgvector embedding
      await prisma.$executeRaw`
        INSERT INTO "Knowledge" (id, content, embedding, source, category, tags, timestamp)
        VALUES (
          ${id}::uuid,
          ${document.content.substring(0, 4000)}::text,
          ${embeddingSql}::vector,
          ${document.source}::text,
          ${document.category || 'general'}::text,
          ${JSON.stringify(finalTags)}::jsonb,
          ${document.timestamp}::timestamp
        )
      `;

      console.log(`💾 Learned: [${document.category}] ${document.source.substring(0, 40)}...`);
    } catch (error) {
      console.error('❌ Failed to learn document:', error);
    }
  }

  /**
   * Search for relevant knowledge using RAG with pgvector similarity search
   */
  async search(query: string, limit: number = 3, category?: string): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);
      const embeddingSql = pgvector.toSql(queryEmbedding);

      // Prioritize recent content: only search documents from last 7 days by default
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const where: any = {
        timestamp: {
          gt: sevenDaysAgo,
        },
      };
      
      if (category) {
        where.category = category;
      }

      // Use pgvector's <=> operator for cosine distance search on the new embedding column
      // Cosine distance = 1 - cosine similarity, so we order by distance ASC
      let results: any[];
      
      try {
        const rawQuery = `
          SELECT
            id,
            content,
            source,
            category,
            tags,
            timestamp,
            1 - (embedding <=> $1::vector) as similarity
          FROM "Knowledge"
          WHERE embedding IS NOT NULL
          AND ${category ? '"category" = $2 AND ' : ''}"timestamp" > $${category ? 3 : 2}::timestamp
          ORDER BY embedding <=> $1::vector ASC
          LIMIT $${category ? 4 : 3}::int
        `;

        const params: (string | number)[] = [embeddingSql];
        if (category) {
          params.push(category, sevenDaysAgo.toISOString(), limit);
        } else {
          params.push(sevenDaysAgo.toISOString(), limit);
        }

        results = await prisma.$queryRawUnsafe(rawQuery, ...params);
      } catch (dbError) {
        // Fallback to expanded search if no recent results
        const rawQuery = `
          SELECT
            id,
            content,
            source,
            category,
            tags,
            timestamp,
            1 - (embedding <=> $1::vector) as similarity
          FROM "Knowledge"
          WHERE embedding IS NOT NULL
          AND ${category ? '"category" = $2' : '1=1'}
          ORDER BY embedding <=> $1::vector ASC
          LIMIT $2::int
        `;

        const params: (string | number)[] = category ? [embeddingSql, category, limit] : [embeddingSql, limit];
        results = await prisma.$queryRawUnsafe(rawQuery, ...params);
      }

      // Filter by similarity threshold and apply recency weighting
      const filteredResults = results
        .filter((result: any) => result.similarity >= 0.6)
        .map((result: any) => {
          const recencyScore = this.calculateRecencyScore(result.timestamp);
          const hoursAgo = (Date.now() - new Date(result.timestamp).getTime()) / (1000 * 60 * 60);
          const freshnessBoost = hoursAgo < 24 ? 1.5 : 1.0;
          
          const relevance = result.similarity * recencyScore * freshnessBoost;
          
          return {
            ...result,
            tags: result.tags as string[] || [],
            recencyScore,
            relevance,
            hoursAgo
          };
        })
        .sort((a: any, b: any) => b.relevance - a.relevance)
        .slice(0, limit);

      if (filteredResults.length === 0) {
        return "No relevant knowledge found in my memory.";
      }

      // Format results with freshness indicators
      return filteredResults.map(result => {
        const date = new Date(result.timestamp);
        const freshness = result.hoursAgo < 24 ? '🆕 ' : (result.hoursAgo < 168 ? '📅 ' : '📜 ');
        const sourceInfo = `[${freshness}Source: ${result.source} | Category: ${result.category} | ${date.toLocaleDateString()}]`;
        
        return `${sourceInfo}\n${result.content}`;
      }).join('\n\n---\n\n');

    } catch (error) {
      console.error('❌ Knowledge search failed:', error);
      return "Error searching knowledge base.";
    }
  }

  /**
   * Calculate recency score with stronger emphasis on recent content
   */
  private calculateRecencyScore(timestamp: string): number {
    const docTime = new Date(timestamp).getTime();
    const now = Date.now();
    const ageDays = (now - docTime) / (1000 * 60 * 60 * 24);
    
    // Stronger recency weighting: content older than 7 days gets much lower scores
    // Recent content (0-1 days) gets near-maximum score
    if (ageDays <= 1) return 1.0; // Maximum score for today's content
    if (ageDays <= 3) return 0.8; // High score for last 3 days
    if (ageDays <= 7) return 0.6; // Good score for last week
    if (ageDays <= 14) return 0.3; // Moderate score for 2 weeks
    if (ageDays <= 30) return 0.1; // Low score for 1 month
    return 0.05; // Very low score for older content
  }

  /**
   * Get knowledge statistics
   */
  async getStats(): Promise<{ totalDocuments: number; categories: string[]; oldestDocument: string }> {
    try {
      const [total, categories, oldest] = await Promise.all([
        prisma.knowledge.count(),
        prisma.knowledge.findMany({
          distinct: ['category'],
          select: { category: true },
        }),
        prisma.knowledge.findFirst({
          orderBy: {
            timestamp: 'asc',
          },
        }),
      ]);

      return {
        totalDocuments: total,
        categories: categories.map((c: { category?: string | null }) => c.category || 'unknown'),
        oldestDocument: oldest?.timestamp.toISOString() || 'No documents'
      };
    } catch (error) {
      console.error('❌ Failed to get knowledge stats:', error);
      return {
        totalDocuments: 0,
        categories: [],
        oldestDocument: 'No documents'
      };
    }
  }

  /**
   * Clean up old knowledge (older than specified days)
   */
  async cleanupOldKnowledge(maxAgeDays: number = 90): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);
      
      const result = await prisma.knowledge.deleteMany({
        where: {
          timestamp: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} old knowledge documents`);
      }
      
      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old knowledge:', error);
      return 0;
    }
  }

  /**
   * Find knowledge by tags (for proactive messaging)
   */
  async findKnowledgeByTags(tags: string[], limit: number = 5): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        where: {
          tags: {
            array_contains: tags,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        embedding: row.embedding as number[] | null | undefined,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to find knowledge by tags:', error);
      return [];
    }
  }

  /**
   * Get recent knowledge documents for dashboard display
   */
  async getRecentDocuments(limit: number = 10): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        embedding: row.embedding as number[] | null | undefined,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to get recent documents:', error);
      return [];
    }
  }

  /**
   * Get knowledge documents by category
   */
  async getDocumentsByCategory(category: string, limit: number = 10): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        where: {
          category,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        embedding: row.embedding as number[] | null | undefined,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to get documents by category:', error);
      return [];
    }
  }

  /**
   * Search knowledge content for dashboard (simple text search)
   */
  async searchContent(query: string, limit: number = 10): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        where: {
          content: {
            contains: query,
            mode: 'insensitive' as const,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map((row: any) => ({
        id: row.id,
        content: row.content,
        embedding: row.embedding as number[] | null | undefined,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to search knowledge content:', error);
      return [];
    }
  }
}