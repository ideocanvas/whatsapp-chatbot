/**
 * Enhanced logging utility for tool calling and AI responses
 */

export interface LogEntry {
  timestamp: string;
  type: 'ai_response' | 'tool_call' | 'search' | 'decision' | 'error';
  message: string;
  data?: any;
}

export class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  log(type: LogEntry['type'], message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data
    };

    this.logs.push(entry);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also output to console with emojis for better visibility
    const emoji = this.getEmojiForType(type);
    console.log(`${emoji} [${type.toUpperCase()}] ${message}`, data || '');
  }

  private getEmojiForType(type: string): string {
    const emojis: { [key: string]: string } = {
      'ai_response': '🤖',
      'tool_call': '🛠️',
      'search': '🔍',
      'decision': '🧠',
      'error': '❌'
    };
    return emojis[type] || '📝';
  }

  getLogs(filter?: { type?: string; limit?: number }): LogEntry[] {
    let filteredLogs = this.logs;

    if (filter?.type) {
      filteredLogs = filteredLogs.filter(log => log.type === filter.type);
    }

    if (filter?.limit) {
      filteredLogs = filteredLogs.slice(-filter.limit);
    }

    return filteredLogs;
  }

  clearLogs(): void {
    this.logs = [];
  }

  // Convenience methods for specific log types
  logAIResponse(message: string, data?: any): void {
    this.log('ai_response', message, data);
  }

  logToolCall(message: string, data?: any): void {
    this.log('tool_call', message, data);
  }

  logSearch(message: string, data?: any): void {
    this.log('search', message, data);
  }

  logDecision(message: string, data?: any): void {
    this.log('decision', message, data);
  }

  logError(message: string, data?: any): void {
    this.log('error', message, data);
  }
}

// Global logger instance
export const logger = Logger.getInstance();