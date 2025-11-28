import { HistoryStore } from '../memory/HistoryStore';
import { KnowledgeBase } from '../memory/KnowledgeBase';
import { ProcessedMessageService } from '../services/processedMessageService';
import { VectorStoreService } from '../services/vectorStoreService';
import { HistoryStorePostgres } from '../memory/HistoryStorePostgres';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { ProcessedMessageServicePostgres } from '../services/ProcessedMessageServicePostgres';
import { VectorStoreServicePostgres } from '../services/VectorStoreServicePostgres';
import { OpenAIService } from '../services/openaiService';

/**
 * Database configuration that allows switching between SQLite and PostgreSQL
 */
export class DatabaseConfig {
  private static usePostgres: boolean;

  static {
    // Determine which database to use based on environment
    this.usePostgres = process.env.DATABASE_URL !== undefined || 
                      process.env.DB_HOST !== undefined;
    
    console.log(`📊 Database Configuration: ${this.usePostgres ? 'PostgreSQL' : 'SQLite'}`);
  }

  /**
   * Get the appropriate HistoryStore implementation
   */
  static getHistoryStore(): HistoryStore | HistoryStorePostgres {
    if (this.usePostgres) {
      return new HistoryStorePostgres();
    } else {
      return new HistoryStore();
    }
  }

  /**
   * Get the appropriate KnowledgeBase implementation
   */
  static getKnowledgeBase(openaiService: OpenAIService): KnowledgeBase | KnowledgeBasePostgres {
    if (this.usePostgres) {
      return new KnowledgeBasePostgres(openaiService);
    } else {
      return new KnowledgeBase(openaiService);
    }
  }

  /**
   * Get the appropriate ProcessedMessageService implementation
   */
  static getProcessedMessageService(): ProcessedMessageService | ProcessedMessageServicePostgres {
    if (this.usePostgres) {
      return new ProcessedMessageServicePostgres();
    } else {
      return new ProcessedMessageService();
    }
  }

  /**
   * Get the appropriate VectorStoreService implementation
   */
  static getVectorStoreService(openaiService: OpenAIService): VectorStoreService | VectorStoreServicePostgres {
    if (this.usePostgres) {
      return new VectorStoreServicePostgres(openaiService);
    } else {
      return new VectorStoreService(openaiService);
    }
  }

  /**
   * Check if PostgreSQL is being used
   */
  static isUsingPostgres(): boolean {
    return this.usePostgres;
  }

  /**
   * Get database statistics for the active database
   */
  static async getDatabaseStats(): Promise<{
    databaseType: string;
    conversationLogs: number;
    knowledgeDocuments: number;
    processedMessages: number;
    vectorDocuments: number;
  }> {
    if (this.usePostgres) {
      const { PrismaDatabaseUtils } = await import('./prisma');
      const stats = await PrismaDatabaseUtils.getDatabaseStats();
      
      return {
        databaseType: 'PostgreSQL',
        conversationLogs: stats.conversationLogs,
        knowledgeDocuments: stats.knowledgeDocuments,
        processedMessages: stats.processedMessages,
        vectorDocuments: stats.vectorDocuments,
      };
    } else {
      // For SQLite, we would need to implement similar stats collection
      // For now, return placeholder values
      return {
        databaseType: 'SQLite',
        conversationLogs: 0,
        knowledgeDocuments: 0,
        processedMessages: 0,
        vectorDocuments: 0,
      };
    }
  }

  /**
   * Initialize the database connection
   */
  static async initialize(): Promise<void> {
    if (this.usePostgres) {
      const { PrismaDatabaseUtils } = await import('./prisma');
      await PrismaDatabaseUtils.initialize();
    } else {
      console.log('✅ SQLite databases initialized (automatic)');
    }
  }

  /**
   * Health check for the active database
   */
  static async healthCheck(): Promise<boolean> {
    if (this.usePostgres) {
      const { PrismaDatabaseUtils } = await import('./prisma');
      return await PrismaDatabaseUtils.healthCheck();
    } else {
      // SQLite health check - always return true as SQLite files are local
      return true;
    }
  }

  /**
   * Clean up old data in the active database
   */
  static async cleanupOldData(): Promise<{
    oldConversations: number;
    oldKnowledge: number;
    oldProcessedMessages: number;
    oldVectorDocuments: number;
  }> {
    if (this.usePostgres) {
      const { PrismaDatabaseUtils } = await import('./prisma');
      const result = await PrismaDatabaseUtils.cleanupOldData();
      
      return {
        oldConversations: result.oldConversations,
        oldKnowledge: result.oldKnowledge,
        oldProcessedMessages: result.oldProcessedMessages,
        oldVectorDocuments: 0, // Vector documents cleanup not implemented yet
      };
    } else {
      // For SQLite, implement cleanup using the SQLite services
      const historyStore = new HistoryStore();
      const knowledgeBase = new KnowledgeBase({} as any); // Placeholder
      const processedMessageService = new ProcessedMessageService();
      const vectorStoreService = new VectorStoreService({} as any); // Placeholder
      
      const [oldConversations, oldKnowledge, oldProcessedMessages, oldVectorDocuments] = await Promise.all([
        historyStore.cleanupOldLogs(30),
        knowledgeBase.cleanupOldKnowledge(30),
        processedMessageService.cleanupOldEntries(30),
        Promise.resolve(0), // Vector store cleanup not implemented for SQLite
      ]);
      
      return {
        oldConversations,
        oldKnowledge,
        oldProcessedMessages,
        oldVectorDocuments,
      };
    }
  }
}

export default DatabaseConfig;