import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { OpenAIService } from './openaiService';
import { TextChunker } from '../utils/textChunker';
import { v4 as uuidv4 } from 'uuid';

export interface DocumentMetadata {
  source: string;
  date: string;
  category: string;
  title?: string;
}

export class VectorStoreServicePostgres {
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Optimized Cosine Similarity for Float64 Arrays
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

  async addDocument(content: string, metadata: DocumentMetadata): Promise<void> {
    if (!content) return;
    const chunks = TextChunker.split(content);
    console.log(`📚 Ingesting "${metadata.title}" - ${chunks.length} chunks`);

    try {
      const records = [];
      
      for (const chunk of chunks) {
        try {
          const embedding = await this.openaiService.createEmbedding(chunk);
          
          // Convert array to Float64Array buffer
          const vectorBuffer = Buffer.from(new Float64Array(embedding).buffer);

          records.push({
            id: uuidv4(),
            content: chunk,
            vector: vectorBuffer, // Store as BYTEA
            source: metadata.source,
            date: metadata.date,
            category: metadata.category,
            title: metadata.title || ''
          });
        } catch (e) {
          console.warn('Embedding failed:', e);
        }
      }

      if (records.length > 0) {
        // Use transaction for batch insert
        await prisma.$transaction(
          records.map(record => 
            prisma.document.create({
              data: record,
            })
          )
        );
        console.log(`💾 Saved ${records.length} vectors to PostgreSQL (BYTEA format).`);
      }
    } catch (error) {
      console.error('❌ Failed to add document to vector store:', error);
    }
  }

  async search(query: string, limit: number = 4, filter?: { category?: string }): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);
      // Convert query to TypedArray for faster math
      const queryVec = new Float64Array(queryEmbedding);

      const where: any = {};
      if (filter?.category) {
        where.category = filter.category;
      }
      
      const rows = await prisma.document.findMany({
        where,
      });

      const results = rows.map(row => {
        // Convert BYTEA back to Float array
        const docVec = new Float64Array(
          row.vector.buffer,
          row.vector.byteOffset,
          row.vector.byteLength / 8
        );

        return {
          ...row,
          score: this.cosineSimilarity(queryVec, docVec)
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

      if (results.length === 0) return "No relevant knowledge found.";

      return results.map(r =>
        `[Source: ${r.title} (${r.date})]\n${r.content}`
      ).join('\n\n---\n\n');

    } catch (error) {
      console.error('Vector search failed:', error);
      return "Error searching knowledge base.";
    }
  }

  /**
   * Get vector store statistics
   */
  async getStats(): Promise<{
    totalDocuments: number;
    byCategory: Record<string, number>;
    oldestDocument: string;
    newestDocument: string;
  }> {
    try {
      const [total, byCategory, oldest, newest] = await Promise.all([
        prisma.document.count(),
        prisma.document.groupBy({
          by: ['category'],
          _count: {
            id: true,
          },
        }),
        prisma.document.findFirst({
          orderBy: {
            // Assuming we have a created_at field, using id as fallback
            id: 'asc',
          },
        }),
        prisma.document.findFirst({
          orderBy: {
            id: 'desc',
          },
        }),
      ]);

      const categoryCounts: Record<string, number> = {};
      byCategory.forEach(group => {
        categoryCounts[group.category || 'unknown'] = group._count.id;
      });

      return {
        totalDocuments: total,
        byCategory: categoryCounts,
        oldestDocument: oldest?.id || 'No documents',
        newestDocument: newest?.id || 'No documents',
      };
    } catch (error) {
      console.error('❌ Failed to get vector store stats:', error);
      return {
        totalDocuments: 0,
        byCategory: {},
        oldestDocument: 'No documents',
        newestDocument: 'No documents',
      };
    }
  }

  /**
   * Clean up old vector documents
   */
  async cleanupOldDocuments(maxAgeDays: number = 90): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);

      const result = await prisma.document.deleteMany({
        where: {
          createdAt: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} old vector documents`);
      }

      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old vector documents:', error);
      return 0;
    }
  }
}