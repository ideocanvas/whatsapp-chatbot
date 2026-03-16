import { prisma } from '../config/prisma';
import { Reminder, RecurrenceType, ReminderStatus } from '@prisma/client';

/**
 * DTOs for Reminder operations
 */
export interface CreateReminderDto {
  title: string;
  description?: string;
  scheduledAt: Date;
  recurrence?: RecurrenceType;
  recurrenceConfig?: any;
}

export interface UpdateReminderDto {
  title?: string;
  description?: string;
  scheduledAt?: Date;
  recurrence?: RecurrenceType;
  recurrenceConfig?: any;
  status?: ReminderStatus;
}

export interface ReminderFilters {
  status?: ReminderStatus;
  upcoming?: boolean;
  from?: Date;
  to?: Date;
}

/**
 * ReminderService handles CRUD operations and scheduling for reminders
 */
export class ReminderService {
  /**
   * Create a new reminder
   */
  async createReminder(userId: string, data: CreateReminderDto): Promise<Reminder> {
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        title: data.title,
        description: data.description,
        scheduledAt: data.scheduledAt,
        recurrence: data.recurrence || RecurrenceType.none,
        recurrenceConfig: data.recurrenceConfig,
        status: data.recurrence && data.recurrence !== RecurrenceType.none 
          ? ReminderStatus.active 
          : ReminderStatus.pending,
        nextSendAt: data.recurrence && data.recurrence !== RecurrenceType.none 
          ? data.scheduledAt 
          : null,
      },
    });

    console.log(`📝 Created reminder ${reminder.id} for user ${userId}: "${data.title}"`);
    return reminder;
  }

  /**
   * Get all reminders for a user with optional filters
   */
  async getReminders(userId: string, filters?: ReminderFilters): Promise<Reminder[]> {
    const where: any = { userId };

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.upcoming) {
      where.scheduledAt = {
        gte: new Date(),
      };
      where.status = {
        in: [ReminderStatus.pending, ReminderStatus.active],
      };
    }

    if (filters?.from || filters?.to) {
      where.scheduledAt = {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      };
    }

    return prisma.reminder.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /**
   * Get a single reminder by ID
   */
  async getReminder(id: string): Promise<Reminder | null> {
    return prisma.reminder.findUnique({
      where: { id },
    });
  }

  /**
   * Update a reminder
   */
  async updateReminder(id: string, data: UpdateReminderDto): Promise<Reminder> {
    const reminder = await prisma.reminder.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    console.log(`📝 Updated reminder ${id}`);
    return reminder;
  }

  /**
   * Delete a reminder
   */
  async deleteReminder(id: string): Promise<boolean> {
    try {
      await prisma.reminder.delete({
        where: { id },
      });
      console.log(`🗑️ Deleted reminder ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting reminder:', error);
      return false;
    }
  }

  /**
   * Get reminders that are due to be sent
   */
  async getDueReminders(): Promise<Reminder[]> {
    const now = new Date();

    // Get one-time reminders that are due
    const oneTimeReminders = await prisma.reminder.findMany({
      where: {
        status: ReminderStatus.pending,
        scheduledAt: { lte: now },
      },
    });

    // Get recurring reminders that are due
    const recurringReminders = await prisma.reminder.findMany({
      where: {
        status: ReminderStatus.active,
        nextSendAt: { lte: now },
      },
    });

    return [...oneTimeReminders, ...recurringReminders];
  }

  /**
   * Mark a reminder as sent
   */
  async markAsSent(id: string): Promise<void> {
    const reminder = await prisma.reminder.findUnique({
      where: { id },
    });

    if (!reminder) return;

    if (reminder.recurrence === RecurrenceType.none) {
      // One-time reminder - mark as sent
      await prisma.reminder.update({
        where: { id },
        data: {
          status: ReminderStatus.sent,
          lastSentAt: new Date(),
        },
      });
    } else {
      // Recurring reminder - schedule next occurrence
      const nextSendAt = this.calculateNextOccurrence(reminder);
      await prisma.reminder.update({
        where: { id },
        data: {
          lastSentAt: new Date(),
          nextSendAt,
        },
      });
    }
  }

  /**
   * Calculate the next occurrence for a recurring reminder
   */
  calculateNextOccurrence(reminder: Reminder): Date {
    const current = reminder.nextSendAt || reminder.scheduledAt;
    const next = new Date(current);

    switch (reminder.recurrence) {
      case RecurrenceType.daily:
        next.setDate(next.getDate() + 1);
        break;

      case RecurrenceType.weekly:
        next.setDate(next.getDate() + 7);
        break;

      case RecurrenceType.monthly:
        next.setMonth(next.getMonth() + 1);
        break;

      case RecurrenceType.custom:
        // Custom recurrence - parse recurrenceConfig
        if (reminder.recurrenceConfig) {
          const config = reminder.recurrenceConfig as any;
          if (config.intervalDays) {
            next.setDate(next.getDate() + config.intervalDays);
          } else if (config.cronExpression) {
            // For future: support cron expressions
            // For now, default to daily
            next.setDate(next.getDate() + 1);
          }
        }
        break;

      default:
        // Should not happen for recurring reminders
        next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * Pause a recurring reminder
   */
  async pauseReminder(id: string): Promise<Reminder> {
    return prisma.reminder.update({
      where: { id },
      data: {
        status: ReminderStatus.paused,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Resume a paused recurring reminder
   */
  async resumeReminder(id: string): Promise<Reminder> {
    const reminder = await prisma.reminder.findUnique({
      where: { id },
    });

    if (!reminder) {
      throw new Error('Reminder not found');
    }

    // Calculate next send time from now
    const nextSendAt = new Date();
    nextSendAt.setHours(reminder.scheduledAt.getHours());
    nextSendAt.setMinutes(reminder.scheduledAt.getMinutes());

    // If the time has passed today, schedule for tomorrow
    if (nextSendAt <= new Date()) {
      nextSendAt.setDate(nextSendAt.getDate() + 1);
    }

    return prisma.reminder.update({
      where: { id },
      data: {
        status: ReminderStatus.active,
        nextSendAt,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Cancel a reminder
   */
  async cancelReminder(id: string): Promise<Reminder> {
    return prisma.reminder.update({
      where: { id },
      data: {
        status: ReminderStatus.cancelled,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get upcoming reminders for a user (next 24 hours)
   */
  async getUpcomingReminders(userId: string, hours: number = 24): Promise<Reminder[]> {
    const now = new Date();
    const endTime = new Date(now.getTime() + hours * 60 * 60 * 1000);

    return prisma.reminder.findMany({
      where: {
        userId,
        status: { in: [ReminderStatus.pending, ReminderStatus.active] },
        scheduledAt: {
          gte: now,
          lte: endTime,
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /**
   * Get reminder statistics for a user
   */
  async getReminderStats(userId: string): Promise<{
    total: number;
    pending: number;
    sent: number;
    active: number;
    paused: number;
  }> {
    const [total, pending, sent, active, paused] = await Promise.all([
      prisma.reminder.count({ where: { userId } }),
      prisma.reminder.count({ where: { userId, status: ReminderStatus.pending } }),
      prisma.reminder.count({ where: { userId, status: ReminderStatus.sent } }),
      prisma.reminder.count({ where: { userId, status: ReminderStatus.active } }),
      prisma.reminder.count({ where: { userId, status: ReminderStatus.paused } }),
    ]);

    return { total, pending, sent, active, paused };
  }

  /**
   * Parse natural language date/time to Date object
   * Supports: "tomorrow at 3pm", "in 2 hours", "next monday at 9am", etc.
   */
  parseNaturalDateTime(input: string): Date | null {
    const now = new Date();
    const lowerInput = input.toLowerCase().trim();

    // "in X minutes/hours/days"
    const inMatch = lowerInput.match(/^in\s+(\d+)\s+(minute|hour|day)s?$/);
    if (inMatch) {
      const amount = parseInt(inMatch[1]);
      const unit = inMatch[2];
      const result = new Date(now);
      
      if (unit === 'minute') result.setMinutes(result.getMinutes() + amount);
      else if (unit === 'hour') result.setHours(result.getHours() + amount);
      else if (unit === 'day') result.setDate(result.getDate() + amount);
      
      return result;
    }

    // "tomorrow at 3pm" or "tomorrow"
    if (lowerInput.startsWith('tomorrow')) {
      const result = new Date(now);
      result.setDate(result.getDate() + 1);
      result.setHours(9, 0, 0, 0); // Default to 9am

      const timeMatch = lowerInput.match(/at\s+(\d+)(?::(\d+))?\s*(am|pm)?/);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const meridiem = timeMatch[3];

        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;

        result.setHours(hours, minutes, 0, 0);
      }

      return result;
    }

    // "next monday", "next tuesday", etc.
    const nextDayMatch = lowerInput.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+(\d+)(?::(\d+))?\s*(am|pm)?)?$/);
    if (nextDayMatch) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = days.indexOf(nextDayMatch[1]);
      const result = new Date(now);
      
      let daysUntil = targetDay - result.getDay();
      if (daysUntil <= 0) daysUntil += 7;
      result.setDate(result.getDate() + daysUntil);
      result.setHours(9, 0, 0, 0); // Default to 9am

      if (nextDayMatch[2]) {
        let hours = parseInt(nextDayMatch[2]);
        const minutes = nextDayMatch[3] ? parseInt(nextDayMatch[3]) : 0;
        const meridiem = nextDayMatch[4];

        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;

        result.setHours(hours, minutes, 0, 0);
      }

      return result;
    }

    // ISO date string
    const isoDate = new Date(input);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    return null;
  }
}