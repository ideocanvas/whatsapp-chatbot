import { BaseTool } from '../core/BaseTool';
import { ActionQueueService } from '../services/ActionQueueService';

interface ReminderArgs {
  reminder_text: string;
  delay_minutes: number;
}

interface ReminderMetadata {
  type: 'reminder';
  originalText: string;
}

/**
 * Tool for setting reminders that will be sent after a specified delay
 */
export class SetReminderTool extends BaseTool {
  name = 'set_reminder';
  description = 'Set a reminder that will be sent to the user after a specified delay (in minutes). Example: "remind me in 1 hour to take a break" would use delay_minutes=60';
  parameters = {
    type: 'object',
    properties: {
      reminder_text: {
        type: 'string',
        description: 'The reminder text to send to the user'
      },
      delay_minutes: {
        type: 'number',
        description: 'How many minutes from now to send the reminder'
      }
    },
    required: ['reminder_text', 'delay_minutes']
  };

  private actionQueue?: ActionQueueService;
  private userId?: string;

  constructor() {
    super();
  }

  // ActionQueue will be injected by the Agent
  setActionQueue(actionQueue: ActionQueueService): void {
    this.actionQueue = actionQueue;
  }

  // Set userId dynamically before execution in the Agent
  setUserId(userId: string): void {
    this.userId = userId;
  }

  async execute(args: ReminderArgs): Promise<string> {
    const { reminder_text, delay_minutes } = args;

    if (!this.actionQueue) {
      throw new Error('ActionQueue not configured for SetReminderTool');
    }

    if (!this.userId) {
      return "Error: No User ID context.";
    }

    if (delay_minutes <= 0) {
      throw new Error('Delay must be positive');
    }

    // Convert minutes to milliseconds
    const delayMs = delay_minutes * 60 * 1000;

    try {
      // Queue the reminder message
      const actionId = this.actionQueue.queueMessage(
        this.userId,
        `⏰ Reminder: ${reminder_text}`,
        {
          delayMs,
          priority: 6, // Medium priority for reminders
          metadata: { type: 'reminder', originalText: reminder_text } as ReminderMetadata
        }
      );

      return `Reminder set successfully! I'll remind you in ${delay_minutes} minute${delay_minutes !== 1 ? 's' : ''} about: "${reminder_text}"`;
    } catch (error) {
      console.error('Failed to set reminder:', error);
      throw new Error(`Failed to set reminder: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}