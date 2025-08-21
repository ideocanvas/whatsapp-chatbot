import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class ProcessedMessageService {
  private db!: sqlite3.Database;
  private dbPath: string;

  constructor(dbPath: string = 'data/processed_messages.db') {
    this.dbPath = path.resolve(process.cwd(), dbPath);
    this.ensureDatabaseDirectory();
    // Database initialization will be handled asynchronously
    // The first operation will trigger table creation if needed
  }

  private ensureDatabaseDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created database directory: ${dir}`);
    }
  }

  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
          return;
        }
        console.log(`Connected to processed messages database: ${this.dbPath}`);

        // Create table if it doesn't exist
        this.db.run(`
          CREATE TABLE IF NOT EXISTS processed_messages (
            message_id TEXT PRIMARY KEY,
            processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            sender_number TEXT,
            message_type TEXT
          )
        `, (err) => {
          if (err) {
            console.error('Error creating table:', err);
            reject(err);
            return;
          }
          console.log('Processed messages table ready');

          // Create index for faster lookups
          this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_processed_at
            ON processed_messages(processed_at)
          `, (err) => {
            if (err) {
              console.error('Error creating index:', err);
              reject(err);
              return;
            }

            // Clean up old entries periodically (older than 30 days)
            setInterval(() => {
              this.cleanupOldEntries(30);
            }, 24 * 60 * 60 * 1000); // Run every 24 hours

            resolve();
          });
        });
      });
    });
  }

  /**
   * Check if a message has already been processed
   * @param messageId The WhatsApp message ID to check
   * @returns Promise<boolean> indicating if message was already processed
   */
  async hasMessageBeenProcessed(messageId: string): Promise<boolean> {
    // Ensure database is initialized
    if (!this.db) {
      await this.initializeDatabase();
    }

    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT message_id FROM processed_messages WHERE message_id = ?',
        [messageId],
        (err, row) => {
          if (err) {
            console.error('Error checking processed message:', err);
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  }

  /**
   * Mark a message as processed to prevent duplicate handling
   * @param messageId The WhatsApp message ID to mark as processed
   * @param senderNumber The sender's phone number
   * @param messageType The type of message (text, image, audio)
   */
  async markMessageAsProcessed(
    messageId: string,
    senderNumber?: string,
    messageType?: string
  ): Promise<void> {
    // Ensure database is initialized
    if (!this.db) {
      await this.initializeDatabase();
    }

    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO processed_messages
         (message_id, sender_number, message_type)
         VALUES (?, ?, ?)`,
        [messageId, senderNumber, messageType],
        function(err) {
          if (err) {
            console.error('Error marking message as processed:', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Clean up old processed message entries
   * @param daysOlderThan Delete entries older than this many days
   */
  async cleanupOldEntries(daysOlderThan: number = 30): Promise<number> {
    // Ensure database is initialized
    if (!this.db) {
      await this.initializeDatabase();
    }

    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM processed_messages WHERE processed_at < datetime("now", ?)',
        [`-${daysOlderThan} days`],
        function(err) {
          if (err) {
            console.error('Error cleaning up old entries:', err);
            reject(err);
          } else {
            console.log(`Cleaned up ${this.changes} old processed message entries`);
            resolve(this.changes);
          }
        }
      );
    });
  }

  /**
   * Get statistics about processed messages
   */
  async getStats(): Promise<{
    totalProcessed: number;
    last24Hours: number;
    byType: Record<string, number>;
  }> {
    const totalProcessed = await this.getCount();
    const last24Hours = await this.getCountLast24Hours();
    const byType = await this.getCountByType();

    return {
      totalProcessed,
      last24Hours,
      byType
    };
  }

  private async getCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM processed_messages',
        (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
  }

  private async getCountLast24Hours(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM processed_messages WHERE processed_at > datetime("now", "-1 day")',
        (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.count);
          }
        }
      );
    });
  }

  private async getCountByType(): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT message_type, COUNT(*) as count FROM processed_messages GROUP BY message_type',
        (err, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            const result: Record<string, number> = {};
            rows.forEach(row => {
              result[row.message_type || 'unknown'] = row.count;
            });
            resolve(result);
          }
        }
      );
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}