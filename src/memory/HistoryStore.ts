import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * SQL-based History Store for long-term conversation logs.
 * Stores raw chat logs for the "Recall" tool and historical analysis.
 */
interface ConversationLog {
  id: string;
  userId: string;
  message: string;
  role: 'user' | 'assistant';
  timestamp: string;
  messageType: 'text' | 'image' | 'audio';
  metadata?: string; // JSON string for additional data
}

export class HistoryStore {
  private db: Database.Database;

  constructor(storageDir: string = 'data/history') {
    const dbPath = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
    
    this.db = new Database(path.join(dbPath, 'conversations.sqlite'));
    this.initDB();
  }

  private initDB() {
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_logs (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        message TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        timestamp TEXT NOT NULL,
        messageType TEXT NOT NULL CHECK(messageType IN ('text', 'image', 'audio')),
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_id ON conversation_logs(userId);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON conversation_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_role ON conversation_logs(role);
    `);
    console.log('📚 History Store (SQLite) Initialized');
  }

  /**
   * Store a conversation message
   */
  async storeMessage(log: Omit<ConversationLog, 'id'>): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO conversation_logs (id, userId, message, role, timestamp, messageType, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(),
      log.userId,
      log.message.substring(0, 4000), // Limit message length
      log.role,
      log.timestamp,
      log.messageType,
      log.metadata || null
    );
  }

  /**
   * Query conversation history by date range and/or keywords
   */
  async query(options: {
    userId?: string;
    start?: string; // ISO date string
    end?: string;   // ISO date string
    keywords?: string;
    limit?: number;
    role?: 'user' | 'assistant';
  } = {}): Promise<ConversationLog[]> {
    let sql = 'SELECT * FROM conversation_logs WHERE 1=1';
    const params: any[] = [];

    if (options.userId) {
      sql += ' AND userId = ?';
      params.push(options.userId);
    }

    if (options.start) {
      sql += ' AND timestamp >= ?';
      params.push(options.start);
    }

    if (options.end) {
      sql += ' AND timestamp <= ?';
      params.push(options.end);
    }

    if (options.role) {
      sql += ' AND role = ?';
      params.push(options.role);
    }

    if (options.keywords) {
      // Simple keyword search (for production, consider full-text search)
      const keywords = options.keywords.toLowerCase().split(/\s+/).filter(k => k.length > 2);
      if (keywords.length > 0) {
        const conditions = keywords.map(() => 'LOWER(message) LIKE ?').join(' AND ');
        sql += ` AND (${conditions})`;
        keywords.forEach(keyword => params.push(`%${keyword}%`));
      }
    }

    sql += ' ORDER BY timestamp DESC';

    if (options.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(params) as any[];
    
    return rows.map(row => ({
      id: row.id,
      userId: row.userId,
      message: row.message,
      role: row.role as 'user' | 'assistant',
      timestamp: row.timestamp,
      messageType: row.messageType as 'text' | 'image' | 'audio',
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    }));
  }

  /**
   * Get conversation summary for a user
   */
  async getConversationSummary(userId: string, days: number = 30): Promise<{
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    firstInteraction: string;
    lastInteraction: string;
    averageMessageLength: number;
  }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as totalMessages,
        COUNT(CASE WHEN role = 'user' THEN 1 END) as userMessages,
        COUNT(CASE WHEN role = 'assistant' THEN 1 END) as assistantMessages,
        MIN(timestamp) as firstInteraction,
        MAX(timestamp) as lastInteraction,
        AVG(LENGTH(message)) as averageMessageLength
      FROM conversation_logs 
      WHERE userId = ? AND timestamp >= ?
    `).get(userId, cutoff.toISOString()) as any;

    return {
      totalMessages: stats.totalMessages || 0,
      userMessages: stats.userMessages || 0,
      assistantMessages: stats.assistantMessages || 0,
      firstInteraction: stats.firstInteraction || 'No interactions',
      lastInteraction: stats.lastInteraction || 'No interactions',
      averageMessageLength: Math.round(stats.averageMessageLength || 0)
    };
  }

  /**
   * Get most active users (for proactive messaging prioritization)
   */
  getMostActiveUsers(days: number = 7, limit: number = 10): Array<{userId: string; messageCount: number; lastActivity: string}> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const rows = this.db.prepare(`
      SELECT 
        userId,
        COUNT(*) as messageCount,
        MAX(timestamp) as lastActivity
      FROM conversation_logs 
      WHERE timestamp >= ?
      GROUP BY userId 
      ORDER BY messageCount DESC 
      LIMIT ?
    `).all(cutoff.toISOString(), limit) as any[];

    return rows.map(row => ({
      userId: row.userId,
      messageCount: row.messageCount,
      lastActivity: row.lastActivity
    }));
  }

  /**
   * Clean up old conversation logs
   */
  cleanupOldLogs(maxAgeDays: number = 365): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    
    const stmt = this.db.prepare('DELETE FROM conversation_logs WHERE timestamp < ?');
    const result = stmt.run(cutoff.toISOString());
    
    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} old conversation logs`);
    }
    
    return result.changes;
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalLogs: number;
    uniqueUsers: number;
    oldestLog: string;
    newestLog: string;
  } {
    const total = this.db.prepare('SELECT COUNT(*) as count FROM conversation_logs').get() as { count: number };
    const users = this.db.prepare('SELECT COUNT(DISTINCT userId) as count FROM conversation_logs').get() as { count: number };
    const oldest = this.db.prepare('SELECT timestamp FROM conversation_logs ORDER BY timestamp ASC LIMIT 1').get() as { timestamp: string } | undefined;
    const newest = this.db.prepare('SELECT timestamp FROM conversation_logs ORDER BY timestamp DESC LIMIT 1').get() as { timestamp: string } | undefined;

    return {
      totalLogs: total.count,
      uniqueUsers: users.count,
      oldestLog: oldest?.timestamp || 'No logs',
      newestLog: newest?.timestamp || 'No logs'
    };
  }

  /**
   * Export conversation data for a user (for recall tool)
   */
  async exportUserConversation(userId: string, format: 'json' | 'text' = 'text'): Promise<string> {
    const logs = await this.query({ userId, limit: 1000 }); // Limit for safety
    
    if (format === 'json') {
      return JSON.stringify(logs, null, 2);
    }

    // Text format for human readability
    return logs.map(log => 
      `[${new Date(log.timestamp).toLocaleString()}] ${log.role.toUpperCase()}: ${log.message}`
    ).join('\n');
  }
}