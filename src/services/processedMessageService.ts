import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class ProcessedMessageService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = 'data/processed_messages.db') {
    this.dbPath = path.resolve(process.cwd(), dbPath);
    this.ensureDatabaseDirectory();
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  private ensureDatabaseDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initializeDatabase(): void {
    // WAL mode is better for concurrency
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id TEXT PRIMARY KEY,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sender_number TEXT,
        message_type TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_processed_at ON processed_messages(processed_at);
    `);
    
    console.log('✅ Processed messages database ready (better-sqlite3)');
    
    // Cleanup old entries on startup
    this.cleanupOldEntries(30);
  }

  async hasMessageBeenProcessed(messageId: string): Promise<boolean> {
    const stmt = this.db.prepare('SELECT message_id FROM processed_messages WHERE message_id = ?');
    const result = stmt.get(messageId);
    return !!result;
  }

  async markMessageAsProcessed(messageId: string, senderNumber?: string, messageType?: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO processed_messages (message_id, sender_number, message_type)
      VALUES (?, ?, ?)
    `);
    stmt.run(messageId, senderNumber, messageType);
  }

  async cleanupOldEntries(daysOlderThan: number = 30): Promise<number> {
    const stmt = this.db.prepare(`DELETE FROM processed_messages WHERE processed_at < datetime('now', '-${daysOlderThan} days')`);
    const info = stmt.run();
    return info.changes;
  }

  /**
   * Get statistics about processed messages
   */
  async getStats(): Promise<{
    totalProcessed: number;
    last24Hours: number;
    byType: Record<string, number>;
  }> {
    const totalProcessed = this.getCount();
    const last24Hours = this.getCountLast24Hours();
    const byType = this.getCountByType();

    return {
      totalProcessed,
      last24Hours,
      byType
    };
  }

  private getCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM processed_messages');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  private getCountLast24Hours(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM processed_messages WHERE processed_at > datetime('now', '-1 day')");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  private getCountByType(): Record<string, number> {
    const stmt = this.db.prepare('SELECT message_type, COUNT(*) as count FROM processed_messages GROUP BY message_type');
    const rows = stmt.all() as Array<{ message_type: string | null, count: number }>;
    
    const result: Record<string, number> = {};
    rows.forEach(row => {
      result[row.message_type || 'unknown'] = row.count;
    });
    return result;
  }

  close(): void {
    this.db.close();
  }
}