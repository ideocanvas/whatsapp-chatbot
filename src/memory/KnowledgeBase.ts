import { OpenAIService } from '../services/openaiService';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Long-term vector database for storing facts learned from autonomous browsing.
 * Uses SQLite with BLOB storage for efficient RAG searches.
 */
export interface KnowledgeDocument {
  id: string;
  content: string;
  vector: Buffer; // BLOB storage for embeddings
  source: string;
  category: string;
  tags: string[];
  timestamp: string;
  relevanceScore?: number;
}

export class KnowledgeBase {
  private db: Database.Database;
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService, storageDir: string = 'data/knowledge') {
    this.openaiService = openaiService;
    
    const dbPath = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
    
    this.db = new Database(path.join(dbPath, 'knowledge.sqlite'));
    this.initDB();
  }

  private initDB() {
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        vector BLOB NOT NULL,
        source TEXT,
        category TEXT,
        tags TEXT, -- JSON array of tags
        timestamp TEXT,
        relevance_score REAL DEFAULT 0.0
      );
      
      CREATE INDEX IF NOT EXISTS idx_category ON knowledge(category);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON knowledge(timestamp);
      CREATE INDEX IF NOT EXISTS idx_relevance ON knowledge(relevance_score);
    `);
    console.log('🧠 Knowledge Base (SQLite Vector Store) Initialized');
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
      const stmt = this.db.prepare(`
        INSERT INTO knowledge (id, content, vector, source, category, tags, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        uuidv4(),
        document.content.substring(0, 2000), // Limit content length
        vectorBuffer,
        document.source,
        document.category || 'general',
        JSON.stringify(document.tags),
        document.timestamp.toISOString()
      );

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
      
      let sql = 'SELECT id, content, vector, source, category, tags, timestamp FROM knowledge WHERE timestamp > ?';
      const params: any[] = [sevenDaysAgo.toISOString()];
      
      if (category) {
        sql += ' AND category = ?';
        params.push(category);
      }
      
      // Order by timestamp descending to prioritize recent content
      sql += ' ORDER BY timestamp DESC';
      
      const rows = this.db.prepare(sql).all(params) as any[];

      // If no recent results, expand search to all time but with stronger recency penalty
      let expandedSearch = false;
      if (rows.length === 0) {
        expandedSearch = true;
        let fallbackSql = 'SELECT id, content, vector, source, category, tags, timestamp FROM knowledge';
        const fallbackParams: any[] = [];
        
        if (category) {
          fallbackSql += ' WHERE category = ?';
          fallbackParams.push(category);
        }
        
        rows.push(...this.db.prepare(fallbackSql).all(fallbackParams) as any[]);
      }

      // Calculate relevance scores with enhanced recency weighting
      const results = rows.map(row => {
        // Convert BLOB back to Float64Array
        const docVec = new Float64Array(
          row.vector.buffer,
          row.vector.byteOffset,
          row.vector.byteLength / 8
        );

        const similarity = this.cosineSimilarity(queryVec, docVec);
        const recencyScore = this.calculateRecencyScore(row.timestamp);
        
        // Enhanced relevance calculation: give more weight to recency
        // Recent content (last 24 hours) gets significant boost
        const hoursAgo = (Date.now() - new Date(row.timestamp).getTime()) / (1000 * 60 * 60);
        const freshnessBoost = hoursAgo < 24 ? 1.5 : 1.0; // 50% boost for content < 24h old
        
        // If we expanded search, penalize older content more heavily
        const agePenalty = expandedSearch ? Math.max(0.1, recencyScore) : 1.0;
        
        const relevance = similarity * recencyScore * freshnessBoost * agePenalty;
        
        return {
          ...row,
          tags: JSON.parse(row.tags || '[]'),
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
  getStats(): { totalDocuments: number; categories: string[]; oldestDocument: string } {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM knowledge');
    const categoryStmt = this.db.prepare('SELECT DISTINCT category FROM knowledge');
    const oldestStmt = this.db.prepare('SELECT timestamp FROM knowledge ORDER BY timestamp ASC LIMIT 1');

    const total = totalStmt.get() as { count: number };
    const categories = categoryStmt.all() as { category: string }[];
    const oldest = oldestStmt.get() as { timestamp: string } | undefined;

    return {
      totalDocuments: total.count,
      categories: categories.map(c => c.category),
      oldestDocument: oldest?.timestamp || 'No documents'
    };
  }

  /**
   * Clean up old knowledge (older than specified days)
   */
  cleanupOldKnowledge(maxAgeDays: number = 90): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    
    const stmt = this.db.prepare('DELETE FROM knowledge WHERE timestamp < ?');
    const result = stmt.run(cutoff.toISOString());
    
    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} old knowledge documents`);
    }
    
    return result.changes;
  }

  /**
   * Find knowledge by tags (for proactive messaging)
   */
  async findKnowledgeByTags(tags: string[], limit: number = 5): Promise<KnowledgeDocument[]> {
    const tagConditions = tags.map(tag => `tags LIKE '%"${tag}"%'`).join(' OR ');
    const sql = `SELECT * FROM knowledge WHERE ${tagConditions} ORDER BY timestamp DESC LIMIT ?`;
    
    const rows = this.db.prepare(sql).all(limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      content: row.content,
      vector: row.vector,
      source: row.source,
      category: row.category,
      tags: JSON.parse(row.tags || '[]'),
      timestamp: row.timestamp
    }));
  }

  /**
   * Get recent knowledge documents for dashboard display
   */
  getRecentDocuments(limit: number = 10): KnowledgeDocument[] {
    const sql = `SELECT * FROM knowledge ORDER BY timestamp DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      content: row.content,
      vector: row.vector,
      source: row.source,
      category: row.category,
      tags: JSON.parse(row.tags || '[]'),
      timestamp: row.timestamp
    }));
  }

  /**
   * Get knowledge documents by category
   */
  getDocumentsByCategory(category: string, limit: number = 10): KnowledgeDocument[] {
    const sql = `SELECT * FROM knowledge WHERE category = ? ORDER BY timestamp DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(category, limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      content: row.content,
      vector: row.vector,
      source: row.source,
      category: row.category,
      tags: JSON.parse(row.tags || '[]'),
      timestamp: row.timestamp
    }));
  }

  /**
   * Search knowledge content for dashboard (simple text search)
   */
  searchContent(query: string, limit: number = 10): KnowledgeDocument[] {
    const sql = `SELECT * FROM knowledge WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?`;
    const rows = this.db.prepare(sql).all(`%${query}%`, limit) as any[];
    
    return rows.map(row => ({
      id: row.id,
      content: row.content,
      vector: row.vector,
      source: row.source,
      category: row.category,
      tags: JSON.parse(row.tags || '[]'),
      timestamp: row.timestamp
    }));
  }
}