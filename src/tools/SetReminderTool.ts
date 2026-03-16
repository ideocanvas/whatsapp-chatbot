import { BaseTool } from '../core/BaseTool';
import { ActionQueueService } from '../services/ActionQueueService';
import { ReminderService, CreateReminderDto } from '../services/ReminderService';
import { RecurrenceType, ReminderStatus } from '@prisma/client';

interface ReminderArgs {
  action: 'create' | 'list' | 'update' | 'delete' | 'pause' | 'resume';
  // For create
  title?: string;
  description?: string;
  scheduled_at?: string;  // ISO date string or natural language
  delay_minutes?: number;  // Alternative: delay from now
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  // For list
  status?: 'pending' | 'sent' | 'active' | 'paused' | 'all';
  upcoming?: boolean;
  // For update/delete/pause/resume
  reminder_id?: string;
}

/**
 * Enhanced tool for managing reminders with support for:
 * - Specific date/time scheduling
 * - Recurring reminders (daily, weekly, monthly)
 * - List, update, pause, resume, and delete operations
 */
export class SetReminderTool extends BaseTool {
  name = 'set_reminder';
  description = `Manage reminders with various actions:
- Create reminders with specific date/time or delay
- Support recurring reminders (daily, weekly, monthly)
- List, update, pause, resume, and delete reminders

Examples:
- "remind me tomorrow at 3pm to call mom" -> action: create, scheduled_at: "tomorrow at 3pm"
- "remind me in 30 minutes" -> action: create, delay_minutes: 30
- "remind me every day at 9am to take medicine" -> action: create, recurrence: daily
- "show my reminders" -> action: list
- "cancel reminder <id>" -> action: delete, reminder_id: <id>`;

  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'update', 'delete', 'pause', 'resume'],
        description: 'The action to perform on the reminder'
      },
      title: {
        type: 'string',
        description: 'The reminder title/text (for create/update)'
      },
      description: {
        type: 'string',
        description: 'Optional detailed description of the reminder'
      },
      scheduled_at: {
        type: 'string',
        description: 'When to send the reminder. Can be ISO date string or natural language like "tomorrow at 3pm", "next monday at 9am"'
      },
      delay_minutes: {
        type: 'number',
        description: 'Alternative to scheduled_at: delay from now in minutes'
      },
      recurrence: {
        type: 'string',
        enum: ['none', 'daily', 'weekly', 'monthly'],
        description: 'Recurrence type for repeating reminders'
      },
      status: {
        type: 'string',
        enum: ['pending', 'sent', 'active', 'paused', 'all'],
        description: 'Filter by status when listing reminders'
      },
      upcoming: {
        type: 'boolean',
        description: 'When listing, only show upcoming reminders'
      },
      reminder_id: {
        type: 'string',
        description: 'ID of the reminder for update/delete/pause/resume operations'
      }
    },
    required: ['action']
  };

  private actionQueue?: ActionQueueService;
  private reminderService?: ReminderService;
  private userId?: string;

  constructor() {
    super();
  }

  // ActionQueue will be injected by the Agent
  setActionQueue(actionQueue: ActionQueueService): void {
    this.actionQueue = actionQueue;
  }

  // ReminderService will be injected by the Agent
  setReminderService(reminderService: ReminderService): void {
    this.reminderService = reminderService;
  }

  // Set userId dynamically before execution in the Agent
  setUserId(userId: string): void {
    this.userId = userId;
  }

  async execute(args: ReminderArgs): Promise<string> {
    if (!this.userId) {
      return "Error: No User ID context.";
    }

    if (!this.reminderService) {
      return "Error: ReminderService not configured.";
    }

    switch (args.action) {
      case 'create':
        return this.createReminder(args);
      case 'list':
        return this.listReminders(args);
      case 'update':
        return this.updateReminder(args);
      case 'delete':
        return this.deleteReminder(args);
      case 'pause':
        return this.pauseReminder(args);
      case 'resume':
        return this.resumeReminder(args);
      default:
        return `Unknown action: ${args.action}. Valid actions are: create, list, update, delete, pause, resume.`;
    }
  }

  private async createReminder(args: ReminderArgs): Promise<string> {
    if (!args.title) {
      return "Error: Reminder title is required for creating a reminder.";
    }

    let scheduledAt: Date;

    // Parse scheduled time
    if (args.delay_minutes) {
      scheduledAt = new Date(Date.now() + args.delay_minutes * 60 * 1000);
    } else if (args.scheduled_at) {
      // Try natural language parsing first
      const parsed = this.reminderService!.parseNaturalDateTime(args.scheduled_at);
      if (parsed) {
        scheduledAt = parsed;
      } else {
        // Try ISO date parsing
        scheduledAt = new Date(args.scheduled_at);
        if (isNaN(scheduledAt.getTime())) {
          return `Error: Could not parse date/time: "${args.scheduled_at}". Try formats like "tomorrow at 3pm", "in 2 hours", or ISO date format.`;
        }
      }
    } else {
      return "Error: Either scheduled_at or delay_minutes is required for creating a reminder.";
    }

    // Check if the scheduled time is in the past
    if (scheduledAt <= new Date()) {
      return "Error: The scheduled time must be in the future.";
    }

    const recurrence = args.recurrence ? args.recurrence as RecurrenceType : RecurrenceType.none;

    const createData: CreateReminderDto = {
      title: args.title,
      description: args.description,
      scheduledAt,
      recurrence,
    };

    try {
      const reminder = await this.reminderService!.createReminder(this.userId!, createData);

      const timeStr = scheduledAt.toLocaleString();
      const recurrenceStr = recurrence !== RecurrenceType.none ? ` (recurring: ${recurrence})` : '';

      return `✅ Reminder created successfully!\n` +
             `📝 "${args.title}"\n` +
             `⏰ ${timeStr}${recurrenceStr}\n` +
             `ID: ${reminder.id}`;
    } catch (error) {
      console.error('Failed to create reminder:', error);
      return `Failed to create reminder: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async listReminders(args: ReminderArgs): Promise<string> {
    try {
      const filters: any = {};
      
      if (args.status && args.status !== 'all') {
        filters.status = args.status as ReminderStatus;
      }
      
      if (args.upcoming) {
        filters.upcoming = true;
      }

      const reminders = await this.reminderService!.getReminders(this.userId!, filters);

      if (reminders.length === 0) {
        return "You have no reminders.";
      }

      const lines = [`📋 You have ${reminders.length} reminder(s):\n`];
      
      reminders.forEach((reminder, index) => {
        const statusEmoji = this.getStatusEmoji(reminder.status);
        const recurrenceStr = reminder.recurrence !== RecurrenceType.none ? ` [${reminder.recurrence}]` : '';
        const timeStr = reminder.scheduledAt.toLocaleString();
        
        lines.push(`${index + 1}. ${statusEmoji} "${reminder.title}"`);
        lines.push(`   ⏰ ${timeStr}${recurrenceStr}`);
        lines.push(`   ID: ${reminder.id}`);
        if (reminder.description) {
          lines.push(`   📝 ${reminder.description}`);
        }
        lines.push('');
      });

      return lines.join('\n');
    } catch (error) {
      console.error('Failed to list reminders:', error);
      return `Failed to list reminders: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async updateReminder(args: ReminderArgs): Promise<string> {
    if (!args.reminder_id) {
      return "Error: reminder_id is required for updating a reminder.";
    }

    try {
      // Verify the reminder belongs to the user
      const existing = await this.reminderService!.getReminder(args.reminder_id);
      if (!existing) {
        return "Error: Reminder not found.";
      }
      if (existing.userId !== this.userId) {
        return "Error: You don't have permission to update this reminder.";
      }

      const updateData: any = {};
      if (args.title) updateData.title = args.title;
      if (args.description !== undefined) updateData.description = args.description;
      if (args.recurrence) updateData.recurrence = args.recurrence as RecurrenceType;
      if (args.scheduled_at) {
        const parsed = this.reminderService!.parseNaturalDateTime(args.scheduled_at);
        if (parsed) {
          updateData.scheduledAt = parsed;
        } else {
          const date = new Date(args.scheduled_at);
          if (!isNaN(date.getTime())) {
            updateData.scheduledAt = date;
          }
        }
      }

      await this.reminderService!.updateReminder(args.reminder_id, updateData);

      return `✅ Reminder updated successfully!\nID: ${args.reminder_id}`;
    } catch (error) {
      console.error('Failed to update reminder:', error);
      return `Failed to update reminder: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async deleteReminder(args: ReminderArgs): Promise<string> {
    if (!args.reminder_id) {
      return "Error: reminder_id is required for deleting a reminder.";
    }

    try {
      // Verify the reminder belongs to the user
      const existing = await this.reminderService!.getReminder(args.reminder_id);
      if (!existing) {
        return "Error: Reminder not found.";
      }
      if (existing.userId !== this.userId) {
        return "Error: You don't have permission to delete this reminder.";
      }

      await this.reminderService!.deleteReminder(args.reminder_id);

      return `✅ Reminder deleted successfully!\nID: ${args.reminder_id}`;
    } catch (error) {
      console.error('Failed to delete reminder:', error);
      return `Failed to delete reminder: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async pauseReminder(args: ReminderArgs): Promise<string> {
    if (!args.reminder_id) {
      return "Error: reminder_id is required for pausing a reminder.";
    }

    try {
      const existing = await this.reminderService!.getReminder(args.reminder_id);
      if (!existing) {
        return "Error: Reminder not found.";
      }
      if (existing.userId !== this.userId) {
        return "Error: You don't have permission to pause this reminder.";
      }
      if (existing.recurrence === RecurrenceType.none) {
        return "Error: Only recurring reminders can be paused.";
      }

      await this.reminderService!.pauseReminder(args.reminder_id);

      return `⏸️ Reminder paused successfully!\nID: ${args.reminder_id}`;
    } catch (error) {
      console.error('Failed to pause reminder:', error);
      return `Failed to pause reminder: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async resumeReminder(args: ReminderArgs): Promise<string> {
    if (!args.reminder_id) {
      return "Error: reminder_id is required for resuming a reminder.";
    }

    try {
      const existing = await this.reminderService!.getReminder(args.reminder_id);
      if (!existing) {
        return "Error: Reminder not found.";
      }
      if (existing.userId !== this.userId) {
        return "Error: You don't have permission to resume this reminder.";
      }

      await this.reminderService!.resumeReminder(args.reminder_id);

      return `▶️ Reminder resumed successfully!\nID: ${args.reminder_id}`;
    } catch (error) {
      console.error('Failed to resume reminder:', error);
      return `Failed to resume reminder: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private getStatusEmoji(status: ReminderStatus): string {
    switch (status) {
      case ReminderStatus.pending:
        return '⏳';
      case ReminderStatus.sent:
        return '✅';
      case ReminderStatus.active:
        return '🔔';
      case ReminderStatus.paused:
        return '⏸️';
      case ReminderStatus.cancelled:
        return '❌';
      default:
        return '📝';
    }
  }
}