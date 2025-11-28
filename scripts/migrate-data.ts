import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Comprehensive data migration from SQLite to PostgreSQL
 */
class DataMigrator {
  private prisma: PrismaClient;
  public sqliteDbs: Map<string, Database.Database> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Initialize SQLite connections
   */
  private initializeSqliteConnections(): void {
    const dataDir = path.resolve(process.cwd(), 'data');
    
    // Conversation logs
    const historyDir = path.join(dataDir, 'history');
    if (fs.existsSync(path.join(historyDir, 'conversations.sqlite'))) {
      this.sqliteDbs.set('conversations', new Database(path.join(historyDir, 'conversations.sqlite')));
    }

    // Knowledge base
    const knowledgeDir = path.join(dataDir, 'knowledge');
    if (fs.existsSync(path.join(knowledgeDir, 'knowledge.sqlite'))) {
      this.sqliteDbs.set('knowledge', new Database(path.join(knowledgeDir, 'knowledge.sqlite')));
    }

    // Processed messages - check both possible locations
    const processedMessagesPaths = [
      path.join(dataDir, 'processed_messages.db'),
      path.join(dataDir, 'test_processed_messages.db')
    ];
    
    for (const dbPath of processedMessagesPaths) {
      if (fs.existsSync(dbPath)) {
        const dbName = path.basename(dbPath, '.db');
        this.sqliteDbs.set(dbName, new Database(dbPath));
        console.log(`📨 Found processed messages database: ${dbPath}`);
      }
    }

    // Vector store
    const vectorDir = path.join(dataDir, 'lancedb');
    if (fs.existsSync(path.join(vectorDir, 'vectors.sqlite'))) {
      this.sqliteDbs.set('vectors', new Database(path.join(vectorDir, 'vectors.sqlite')));
    }
  }

  /**
   * Check if SQLite databases exist
   */
  private checkSqliteDatabases(): boolean {
    const hasData = this.sqliteDbs.size > 0;
    console.log(`📊 Found ${this.sqliteDbs.size} SQLite databases`);
    this.sqliteDbs.forEach((db, name) => {
      console.log(`   - ${name}`);
    });
    return hasData;
  }

  /**
   * Migrate conversation logs
   */
  private async migrateConversationLogs(): Promise<number> {
    const sqliteDb = this.sqliteDbs.get('conversations');
    if (!sqliteDb) {
      console.log('⚠️ No conversation logs database found');
      return 0;
    }

    try {
      const rows = sqliteDb.prepare('SELECT * FROM conversation_logs ORDER BY timestamp').all() as any[];
      console.log(`📚 Migrating ${rows.length} conversation logs...`);

      let migratedCount = 0;
      for (const row of rows) {
        try {
          await this.prisma.conversationLog.create({
            data: {
              id: row.id || uuidv4(),
              userId: row.userId,
              message: row.message,
              role: row.role as 'user' | 'assistant',
              timestamp: new Date(row.timestamp),
              messageType: row.messageType as 'text' | 'image' | 'audio',
              metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            },
          });
          migratedCount++;
        } catch (error) {
          console.warn(`⚠️ Failed to migrate conversation log ${row.id}:`, error);
        }
      }

      console.log(`✅ Migrated ${migratedCount}/${rows.length} conversation logs`);
      return migratedCount;
    } catch (error) {
      console.error('❌ Error migrating conversation logs:', error);
      return 0;
    }
  }

  /**
   * Migrate knowledge base
   */
  private async migrateKnowledgeBase(): Promise<number> {
    const sqliteDb = this.sqliteDbs.get('knowledge');
    if (!sqliteDb) {
      console.log('⚠️ No knowledge base database found');
      return 0;
    }

    try {
      const rows = sqliteDb.prepare('SELECT * FROM knowledge ORDER BY timestamp').all() as any[];
      console.log(`🧠 Migrating ${rows.length} knowledge documents...`);

      let migratedCount = 0;
      for (const row of rows) {
        try {
          await this.prisma.knowledge.create({
            data: {
              id: row.id || uuidv4(),
              content: row.content,
              vector: row.embedding ? Buffer.from(row.embedding) : Buffer.alloc(0),
              source: row.source,
              category: row.category,
              tags: row.tags ? JSON.parse(row.tags) : undefined,
              timestamp: new Date(row.timestamp),
              relevanceScore: row.relevance_score,
            },
          });
          migratedCount++;
        } catch (error) {
          console.warn(`⚠️ Failed to migrate knowledge document ${row.id}:`, error);
        }
      }

      console.log(`✅ Migrated ${migratedCount}/${rows.length} knowledge documents`);
      return migratedCount;
    } catch (error) {
      console.error('❌ Error migrating knowledge base:', error);
      return 0;
    }
  }

  /**
   * Migrate processed messages
   */
  private async migrateProcessedMessages(): Promise<number> {
    let totalMigrated = 0;
    
    // Check both possible processed messages databases
    const processedDbNames = ['processed_messages', 'test_processed_messages'];
    
    for (const dbName of processedDbNames) {
      const sqliteDb = this.sqliteDbs.get(dbName);
      if (!sqliteDb) continue;

      try {
        const rows = sqliteDb.prepare('SELECT * FROM processed_messages ORDER BY processed_at').all() as any[];
        console.log(`📨 Migrating ${rows.length} processed messages from ${dbName}...`);

        let migratedCount = 0;
        for (const row of rows) {
          try {
            await this.prisma.processedMessage.create({
              data: {
                messageId: row.message_id,
                senderNumber: row.sender_number || undefined,
                messageType: row.message_type || undefined,
                processedAt: new Date(row.processed_at),
              },
            });
            migratedCount++;
          } catch (error) {
            console.warn(`⚠️ Failed to migrate processed message ${row.message_id}:`, error);
          }
        }

        console.log(`✅ Migrated ${migratedCount}/${rows.length} processed messages from ${dbName}`);
        totalMigrated += migratedCount;
      } catch (error) {
        console.error(`❌ Error migrating processed messages from ${dbName}:`, error);
      }
    }

    if (totalMigrated === 0) {
      console.log('⚠️ No processed messages databases found with data');
    }
    
    return totalMigrated;
  }

  /**
   * Migrate vector store documents
   */
  private async migrateVectorStore(): Promise<number> {
    const sqliteDb = this.sqliteDbs.get('vectors');
    if (!sqliteDb) {
      console.log('⚠️ No vector store database found');
      return 0;
    }

    try {
      const rows = sqliteDb.prepare('SELECT * FROM documents').all() as any[];
      console.log(`🔍 Migrating ${rows.length} vector documents...`);

      let migratedCount = 0;
      for (const row of rows) {
        try {
          await this.prisma.document.create({
            data: {
              id: row.id || uuidv4(),
              content: row.content,
              vector: row.embedding ? Buffer.from(row.embedding) : Buffer.alloc(0),
              source: row.source,
              date: row.date,
              category: row.category,
              title: row.title,
              createdAt: new Date(row.created_at || Date.now()),
            },
          });
          migratedCount++;
        } catch (error) {
          console.warn(`⚠️ Failed to migrate vector document ${row.id}:`, error);
        }
      }

      console.log(`✅ Migrated ${migratedCount}/${rows.length} vector documents`);
      return migratedCount;
    } catch (error) {
      console.error('❌ Error migrating vector store:', error);
      return 0;
    }
  }

  /**
   * Perform the complete migration
   */
  async migrate(): Promise<{
    conversationLogs: number;
    knowledgeDocuments: number;
    processedMessages: number;
    vectorDocuments: number;
    success: boolean;
  }> {
    console.log('🚀 Starting comprehensive SQLite to PostgreSQL migration...');
    
    try {
      // Initialize connections
      this.initializeSqliteConnections();
      
      // Check if we have data to migrate
      if (!this.checkSqliteDatabases()) {
        console.log('❌ No SQLite databases found to migrate');
        return {
          conversationLogs: 0,
          knowledgeDocuments: 0,
          processedMessages: 0,
          vectorDocuments: 0,
          success: false
        };
      }

      // Connect to PostgreSQL
      await this.prisma.$connect();
      console.log('✅ Connected to PostgreSQL');

      // Perform migrations
      const [conversationLogs, knowledgeDocuments, processedMessages, vectorDocuments] = await Promise.all([
        this.migrateConversationLogs(),
        this.migrateKnowledgeBase(),
        this.migrateProcessedMessages(),
        this.migrateVectorStore(),
      ]);

      console.log('\n🎉 Migration Summary:');
      console.log(`📚 Conversation Logs: ${conversationLogs} migrated`);
      console.log(`🧠 Knowledge Documents: ${knowledgeDocuments} migrated`);
      console.log(`📨 Processed Messages: ${processedMessages} migrated`);
      console.log(`🔍 Vector Documents: ${vectorDocuments} migrated`);

      return {
        conversationLogs,
        knowledgeDocuments,
        processedMessages,
        vectorDocuments,
        success: true
      };

    } catch (error) {
      console.error('❌ Migration failed:', error);
      return {
        conversationLogs: 0,
        knowledgeDocuments: 0,
        processedMessages: 0,
        vectorDocuments: 0,
        success: false
      };
    } finally {
      // Note: Don't close SQLite connections here as they're needed for verification
      await this.prisma.$disconnect();
    }
  }

  /**
   * Verify migration results
   */
  async verifyMigration(): Promise<{
    postgresCounts: {
      conversationLogs: number;
      knowledgeDocuments: number;
      processedMessages: number;
      vectorDocuments: number;
    };
    sqliteCounts: {
      conversationLogs: number;
      knowledgeDocuments: number;
      processedMessages: number;
      vectorDocuments: number;
    };
  }> {
    try {
      // Get PostgreSQL counts
      const [pgConversationLogs, pgKnowledge, pgProcessedMessages, pgVectorDocuments] = await Promise.all([
        this.prisma.conversationLog.count(),
        this.prisma.knowledge.count(),
        this.prisma.processedMessage.count(),
        this.prisma.document.count(),
      ]);

      // Get SQLite counts
      let sqliteConversationLogs = 0;
      let sqliteKnowledge = 0;
      let sqliteProcessedMessages = 0;
      let sqliteVectorDocuments = 0;

      this.sqliteDbs.forEach((db, name) => {
        try {
          if (name === 'conversations') {
            const result = db.prepare('SELECT COUNT(*) as count FROM conversation_logs').get() as any;
            sqliteConversationLogs = result.count;
          } else if (name === 'knowledge') {
            const result = db.prepare('SELECT COUNT(*) as count FROM knowledge').get() as any;
            sqliteKnowledge = result.count;
          } else if (name === 'processed_messages' || name === 'test_processed_messages') {
            const result = db.prepare('SELECT COUNT(*) as count FROM processed_messages').get() as any;
            sqliteProcessedMessages += result.count; // Sum both databases
          } else if (name === 'vectors') {
            const result = db.prepare('SELECT COUNT(*) as count FROM documents').get() as any;
            sqliteVectorDocuments = result.count;
          }
        } catch (error) {
          console.warn(`⚠️ Error counting ${name}:`, error);
        }
      });

      return {
        postgresCounts: {
          conversationLogs: pgConversationLogs,
          knowledgeDocuments: pgKnowledge,
          processedMessages: pgProcessedMessages,
          vectorDocuments: pgVectorDocuments,
        },
        sqliteCounts: {
          conversationLogs: sqliteConversationLogs,
          knowledgeDocuments: sqliteKnowledge,
          processedMessages: sqliteProcessedMessages,
          vectorDocuments: sqliteVectorDocuments,
        },
      };
    } catch (error) {
      console.error('❌ Verification failed:', error);
      throw error;
    }
  }
}

// Run migration if this file is executed directly
async function main() {
  const migrator = new DataMigrator();
  
  console.log('='.repeat(60));
  console.log('🤖 SQLite to PostgreSQL Data Migration');
  console.log('='.repeat(60));
  
  try {
    // Perform migration
    const result = await migrator.migrate();
    
    if (result.success) {
      console.log('\n🔍 Verifying migration...');
      const verification = await migrator.verifyMigration();
      
      console.log('\n📊 Verification Results:');
      console.log('SQLite -> PostgreSQL:');
      console.log(`  Conversation Logs: ${verification.sqliteCounts.conversationLogs} -> ${verification.postgresCounts.conversationLogs}`);
      console.log(`  Knowledge Documents: ${verification.sqliteCounts.knowledgeDocuments} -> ${verification.postgresCounts.knowledgeDocuments}`);
      console.log(`  Processed Messages: ${verification.sqliteCounts.processedMessages} -> ${verification.postgresCounts.processedMessages}`);
      console.log(`  Vector Documents: ${verification.sqliteCounts.vectorDocuments} -> ${verification.postgresCounts.vectorDocuments}`);
      
      console.log('\n✅ Migration completed successfully!');
      console.log('💡 Note: Vector data will be rebuilt naturally through usage');
    } else {
      console.log('\n❌ Migration failed');
      process.exit(1);
    }
  } finally {
    // Clean up SQLite connections
    migrator.sqliteDbs.forEach(db => {
      try {
        db.close();
      } catch (error) {
        // Ignore errors during cleanup
      }
    });
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { DataMigrator };