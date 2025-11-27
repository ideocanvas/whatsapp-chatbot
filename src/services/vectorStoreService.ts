import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { OpenAIService } from './openaiService';
import { TextChunker } from '../utils/textChunker';

export interface DocumentMetadata {
  source: string;
  date: string;
  category: string;
  title?: string;
}

interface VectorRow {
  id: string;
  content: string;
  vector: Buffer; // Changed from String to Buffer (BLOB)
  title: string;
  date: string;
}

export class VectorStoreService {
  private db: Database.Database;
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService, storageDir: string = 'data/lancedb') {
    this.openaiService = openaiService;
    
    const dbPath = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
    
    this.db = new Database(path.join(dbPath, 'vectors.sqlite'));
    this.initDB();
  }

  private initDB() {
    this.db.pragma('journal_mode = WAL');
    // We store 'vector' as BLOB now
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        vector BLOB NOT NULL,
        source TEXT,
        date TEXT,
        category TEXT,
        title TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_category ON documents(category);
    `);
    console.log('✅ SQLite Vector Store Initialized (BLOB Mode)');
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

    const insertStmt = this.db.prepare(`
      INSERT INTO documents (id, content, vector, source, date, category, title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items) => {
      for (const item of items) insertStmt.run(item.id, item.content, item.vector, item.source, item.date, item.category, item.title);
    });

    const records = [];
    
    for (const chunk of chunks) {
      try {
        const embedding = await this.openaiService.createEmbedding(chunk);
        
        // CONVERT ARRAY TO BUFFER (Float64)
        const vectorBuffer = Buffer.from(new Float64Array(embedding).buffer);

        records.push({
          id: uuidv4(),
          content: chunk,
          vector: vectorBuffer, // Store as BLOB
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
      insertMany(records);
      console.log(`💾 Saved ${records.length} vectors to SQLite (BLOB format).`);
    }
  }

  async search(query: string, limit: number = 4, filter?: { category?: string }): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);
      // Convert query to TypedArray for faster math
      const queryVec = new Float64Array(queryEmbedding);

      let sql = 'SELECT content, vector, title, date FROM documents';
      if (filter?.category) sql += ` WHERE category = '${filter.category}'`;
      
      const rows = this.db.prepare(sql).all() as VectorRow[];

      const results = rows.map(row => {
        // CONVERT BLOB BACK TO FLOAT ARRAY
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
}