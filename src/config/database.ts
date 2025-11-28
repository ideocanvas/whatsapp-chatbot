import { Pool, PoolConfig } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * PostgreSQL database configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

/**
 * Get database configuration from environment variables
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'whatsapp_chatbot',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true',
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000')
  };
}

/**
 * PostgreSQL connection pool
 */
export class DatabasePool {
  private static instance: Pool;
  
  static getInstance(): Pool {
    if (!DatabasePool.instance) {
      const config = getDatabaseConfig();
      DatabasePool.instance = new Pool(config);
      
      // Log connection events
      DatabasePool.instance.on('connect', () => {
        console.log('🔌 PostgreSQL connection established');
      });
      
      DatabasePool.instance.on('error', (err) => {
        console.error('❌ PostgreSQL connection error:', err);
      });
    }
    
    return DatabasePool.instance;
  }
  
  static async close(): Promise<void> {
    if (DatabasePool.instance) {
      await DatabasePool.instance.end();
      console.log('🔌 PostgreSQL connection pool closed');
    }
  }
}

/**
 * Database utility functions
 */
export class DatabaseUtils {
  /**
   * Initialize database tables
   */
  static async initializeTables(): Promise<void> {
    const pool = DatabasePool.getInstance();
    
    try {
      // Create conversation_logs table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS conversation_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          userId TEXT NOT NULL,
          message TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
          timestamp TIMESTAMPTZ NOT NULL,
          messageType TEXT NOT NULL CHECK(messageType IN ('text', 'image', 'audio')),
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      
      // Create knowledge table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS knowledge (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          vector BYTEA NOT NULL,
          source TEXT,
          category TEXT,
          tags JSONB,
          timestamp TIMESTAMPTZ,
          relevance_score REAL DEFAULT 0.0
        )
      `);
      
      // Create processed_messages table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS processed_messages (
          message_id TEXT PRIMARY KEY,
          processed_at TIMESTAMPTZ DEFAULT NOW(),
          sender_number TEXT,
          message_type TEXT
        )
      `);
      
      // Create documents table (for vector store)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          vector BYTEA NOT NULL,
          source TEXT,
          date TEXT,
          category TEXT,
          title TEXT
        )
      `);
      
      // Create indexes
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversation_logs_user_id ON conversation_logs(userId);
        CREATE INDEX IF NOT EXISTS idx_conversation_logs_timestamp ON conversation_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_conversation_logs_role ON conversation_logs(role);
        
        CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge(category);
        CREATE INDEX IF NOT EXISTS idx_knowledge_timestamp ON knowledge(timestamp);
        CREATE INDEX IF NOT EXISTS idx_knowledge_relevance ON knowledge(relevance_score);
        
        CREATE INDEX IF NOT EXISTS idx_processed_messages_processed_at ON processed_messages(processed_at);
        
        CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
      `);
      
      console.log('✅ PostgreSQL tables initialized');
    } catch (error) {
      console.error('❌ Failed to initialize PostgreSQL tables:', error);
      throw error;
    }
  }
  
  /**
   * Check if database connection is healthy
   */
  static async healthCheck(): Promise<boolean> {
    try {
      const pool = DatabasePool.getInstance();
      const result = await pool.query('SELECT 1 as health_check');
      return result.rows.length > 0;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }
  
  /**
   * Get database statistics
   */
  static async getDatabaseStats(): Promise<{
    totalTables: number;
    tableSizes: Record<string, number>;
    connectionCount: number;
  }> {
    const pool = DatabasePool.getInstance();
    
    try {
      // Get table sizes
      const tableSizesResult = await pool.query(`
        SELECT 
          table_name,
          (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as total_tables,
          (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) as connection_count
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      const tableSizes: Record<string, number> = {};
      for (const table of ['conversation_logs', 'knowledge', 'processed_messages', 'documents']) {
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        tableSizes[table] = parseInt(countResult.rows[0].count);
      }
      
      return {
        totalTables: tableSizesResult.rows.length,
        tableSizes,
        connectionCount: parseInt(tableSizesResult.rows[0]?.connection_count || '0')
      };
    } catch (error) {
      console.error('❌ Failed to get database stats:', error);
      return {
        totalTables: 0,
        tableSizes: {},
        connectionCount: 0
      };
    }
  }
}