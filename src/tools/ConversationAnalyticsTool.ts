import { BaseTool } from '../core/BaseTool';
import { HistoryStorePostgres } from '../memory/HistoryStorePostgres';

export class ConversationAnalyticsTool extends BaseTool {
  name = 'conversation_analytics';
  description = 'Get conversation statistics and analytics about your chat history, including message counts, interaction patterns, and conversation metrics. Use this when you want to understand conversation patterns or get summary statistics about your chat history.';

  parameters = {
    type: 'object',
    properties: {
      days_back: {
        type: 'number',
        description: 'Number of days to analyze (default: 30, max: 365)',
        minimum: 1,
        maximum: 365
      },
      include_details: {
        type: 'boolean',
        description: 'Whether to include detailed breakdown (default: true)',
        default: true
      }
    },
    required: [],
    additionalProperties: false,
  };

  constructor(private historyStore: HistoryStorePostgres) {
    super();
  }

  async execute(args: any, context?: any): Promise<string> {
    const { days_back = 30, include_details = true } = args;
    const userId = context?.userId || 'current_user';

    const summary = await this.historyStore.getConversationSummary(userId, days_back);

    if (summary.totalMessages === 0) {
      return `No conversation history found for the last ${days_back} days.`;
    }

    let result = `📊 Conversation Analytics (Last ${days_back} days):\n`;
    result += `• Total Messages: ${summary.totalMessages}\n`;
    result += `• Your Messages: ${summary.userMessages}\n`;
    result += `• Assistant Messages: ${summary.assistantMessages}\n`;
    result += `• First Interaction: ${summary.firstInteraction}\n`;
    result += `• Last Interaction: ${summary.lastInteraction}\n`;
    result += `• Avg Message Length: ${summary.averageMessageLength} characters\n`;

    if (include_details) {
      result += '\n📈 Detailed Analysis:\n';

      // Calculate ratios and percentages
      const userRatio = (summary.userMessages / summary.totalMessages * 100).toFixed(1);
      const assistantRatio = (summary.assistantMessages / summary.totalMessages * 100).toFixed(1);
      const messagesPerDay = (summary.totalMessages / days_back).toFixed(1);

      result += `• User/Assistant Ratio: ${userRatio}% you / ${assistantRatio}% assistant\n`;
      result += `• Average Messages per Day: ${messagesPerDay}\n`;

      // Add engagement insights
      if (summary.totalMessages > 50) {
        result += `• Engagement Level: High (over 50 messages)\n`;
      } else if (summary.totalMessages > 10) {
        result += `• Engagement Level: Moderate\n`;
      } else {
        result += `• Engagement Level: Low\n`;
      }

      // Add message length insights
      if (summary.averageMessageLength > 100) {
        result += `• Conversation Style: Detailed discussions\n`;
      } else if (summary.averageMessageLength > 30) {
        result += `• Conversation Style: Balanced\n`;
      } else {
        result += `• Conversation Style: Quick exchanges\n`;
      }
    }

    return result;
  }
}