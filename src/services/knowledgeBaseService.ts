import * as fs from 'fs';
import * as path from 'path';
import { OpenAIService } from './openaiService';

export interface KnowledgeDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    source: string;
    date: string;
    category: string;
    topics: string[];
  };
}

export class KnowledgeBaseService {
  private storagePath: string;
  private documents: KnowledgeDocument[] = [];
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService, storageDir: string = 'data/knowledge') {
    this.openaiService = openaiService;
    this.storagePath = path.join(storageDir, 'vectors.json');
    this.ensureDirectory(storageDir);
    this.loadDatabase();
  }

  private ensureDirectory(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private loadDatabase() {
    if (fs.existsSync(this.storagePath)) {
      const data = fs.readFileSync(this.storagePath, 'utf-8');
      this.documents = JSON.parse(data);
    }
  }

  private saveDatabase() {
    fs.writeFileSync(this.storagePath, JSON.stringify(this.documents, null, 2));
  }

  /**
   * Calculates Cosine Similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Check if similar content already exists to prevent duplicates
   */
  async hasDuplicate(content: string): Promise<boolean> {
    // Simple check: strict string matching or high similarity
    // Here we use strict matching for efficiency
    return this.documents.some(doc => doc.content === content);
  }

  /**
   * Add a new piece of knowledge
   */
  async addKnowledge(content: string, metadata: KnowledgeDocument['metadata']): Promise<void> {
    if (await this.hasDuplicate(content)) {
      console.log('Duplicate knowledge skipped.');
      return;
    }

    try {
      const embedding = await this.openaiService.createEmbedding(content);
      
      const doc: KnowledgeDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        content,
        embedding,
        metadata
      };

      this.documents.push(doc);
      this.saveDatabase();
      console.log(`🧠 Knowledge saved: [${metadata.category}] ${content.substring(0, 50)}...`);
    } catch (error) {
      console.error('Failed to add knowledge:', error);
    }
  }

  /**
   * RAG Search: Find relevant context for a query
   */
  async search(query: string, limit: number = 3, threshold: number = 0.75): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);

      const results = this.documents
        .map(doc => ({
          ...doc,
          similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
        }))
        .filter(doc => doc.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      if (results.length === 0) return "No relevant knowledge found in the database.";

      return results.map(r => 
        `[Date: ${r.metadata.date} | Source: ${r.metadata.source}]\n${r.content}`
      ).join('\n\n');

    } catch (error) {
      console.error('Knowledge search failed:', error);
      return "Error searching knowledge base.";
    }
  }
}