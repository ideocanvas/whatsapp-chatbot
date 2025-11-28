import { BaseTool } from '../core/BaseTool';
import { HistoryStore } from '../memory/HistoryStore';

export class RecallHistoryTool extends BaseTool {
  name = 'recall_history';
  description = 'Search through past conversations to remember what the user said, specific details, or dates. Use this when the user asks "What did I say about X?" or references a past discussion.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords to search for in the history',
      },
      days_back: {
        type: 'number',
        description: 'How many days back to search (default: 30)',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private historyStore: HistoryStore) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query, days_back = 30 } = args;
    
    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days_back);

    const logs = await this.historyStore.query({
      keywords: query,
      start: startDate.toISOString(),
      limit: 5 // Limit results to save context window
    });

    if (logs.length === 0) {
      return "No matching conversation history found.";
    }

    return logs.map(log => 
      `[${new Date(log.timestamp).toLocaleDateString()}] ${log.role}: ${log.message}`
    ).join('\n');
  }
}