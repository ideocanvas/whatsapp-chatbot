import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { OpenAIService } from '../services/openaiService';
import { v4 as uuidv4 } from 'uuid';

/**
 * PostgreSQL-based Knowledge Base for storing facts learned from autonomous browsing.
 * Uses PostgreSQL with BYTEA storage for efficient RAG searches.
 */
export interface KnowledgeDocument {
  id: string;
  content: string;
  vector: Buffer; // BYTEA storage for embeddings
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
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
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
  }): Promise<void> {
    if (!document.content || document.content.trim().length < 10) {
      console.log('📝 Skipping empty or too short document');
      return;
    }

    try {
      // Create embedding for the content
      const embedding = await this.openaiService.createEmbedding(document.content);
      
      // Convert array to Float64Array buffer
      const vectorBuffer = Buffer.from(new Float64Array(embedding).buffer);

      // Insert into database
      await prisma.knowledge.create({
        data: {
          id: uuidv4(),
          content: document.content.substring(0, 2000), // Limit content length
          vector: vectorBuffer,
          source: document.source,
          category: document.category || 'general',
          tags: document.tags,
          timestamp: document.timestamp,
        },
      });

      console.log(`💾 Learned new knowledge: [${document.category || 'general'}] ${document.source}`);
    } catch (error) {
      console.error('❌ Failed to learn document:', error);
    }
  }

  /**
   * Search for relevant knowledge using RAG with recency prioritization
   */
  async search(query: string, limit: number = 3, category?: string): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);
      const queryVec = new Float64Array(queryEmbedding);

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
      
      // Order by timestamp descending to prioritize recent content
      const rows = await prisma.knowledge.findMany({
        where,
        orderBy: {
          timestamp: 'desc',
        },
      });

      // If no recent results, expand search to all time but with stronger recency penalty
      let expandedSearch = false;
      if (rows.length === 0) {
        expandedSearch = true;
        const fallbackWhere: any = {};
        if (category) {
          fallbackWhere.category = category;
        }
        rows.push(...await prisma.knowledge.findMany({
          where: fallbackWhere,
        }));
      }

      // Calculate relevance scores with enhanced recency weighting
      const results = rows.map(row => {
        // Convert BYTEA back to Float64Array
        const docVec = new Float64Array(
          row.vector.buffer,
          row.vector.byteOffset,
          row.vector.byteLength / 8
        );

        const similarity = this.cosineSimilarity(queryVec, docVec);
        const recencyScore = this.calculateRecencyScore(row.timestamp.toISOString());
        
        // Enhanced relevance calculation: give more weight to recency
        // Recent content (last 24 hours) gets significant boost
        const hoursAgo = (Date.now() - row.timestamp.getTime()) / (1000 * 60 * 60);
        const freshnessBoost = hoursAgo < 24 ? 1.5 : 1.0; // 50% boost for content < 24h old
        
        // If we expanded search, penalize older content more heavily
        const agePenalty = expandedSearch ? Math.max(0.1, recencyScore) : 1.0;
        
        const relevance = similarity * recencyScore * freshnessBoost * agePenalty;
        
        return {
          ...row,
          tags: row.tags as string[] || [],
          similarity,
          recencyScore,
          relevance,
          hoursAgo,
          expandedSearch
        };
      })
      .filter(result => result.similarity >= 0.6) // Slightly lower threshold for expanded search
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

      if (results.length === 0) {
        return "No relevant knowledge found in my memory.";
      }

      // Format results with freshness indicators
      return results.map(result => {
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
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
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
        categories: categories.map(c => c.category || 'unknown'),
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
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
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
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
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
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
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
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
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