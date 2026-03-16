import { Router, Request, Response } from 'express';
import { requireUserAuth, UserRequest } from '../middleware/userAuth';
import { ReminderService, CreateReminderDto, UpdateReminderDto, ReminderFilters } from '../services/ReminderService';
import { NoteService, CreateNoteDto, UpdateNoteDto, NoteFilters } from '../services/NoteService';
import { ExpenseService, CreateExpenseDto, UpdateExpenseDto, ExpenseFilters } from '../services/ExpenseService';
import { RecurrenceType, ReminderStatus, ExpenseType } from '@prisma/client';

/**
 * User data routes for reminders, notes, and expenses
 * All routes require user authentication via OTP
 */
export class UserDataRoutes {
  private readonly router: Router;
  private readonly reminderService: ReminderService;
  private readonly noteService: NoteService;
  private readonly expenseService: ExpenseService;

  constructor() {
    this.router = Router();
    this.reminderService = new ReminderService();
    this.noteService = new NoteService();
    this.expenseService = new ExpenseService();
    this.setupRoutes();
  }

  /**
   * Get the router instance
   */
  getRouter(): Router {
    return this.router;
  }

  private setupRoutes(): void {
    // ============================================
    // REMINDER ROUTES
    // ============================================

    /**
     * Get all reminders for user
     * GET /api/reminders
     */
    this.router.get('/api/reminders', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const filters: ReminderFilters = {};

        if (req.query.status) {
          filters.status = req.query.status as ReminderStatus;
        }
        if (req.query.upcoming === 'true') {
          filters.upcoming = true;
        }
        if (req.query.from) {
          filters.from = new Date(req.query.from as string);
        }
        if (req.query.to) {
          filters.to = new Date(req.query.to as string);
        }

        const reminders = await this.reminderService.getReminders(userId, filters);
        res.json({ success: true, reminders });
      } catch (error) {
        console.error('Error getting reminders:', error);
        res.status(500).json({ error: 'Failed to get reminders' });
      }
    });

    /**
     * Get upcoming reminders
     * GET /api/reminders/upcoming
     */
    this.router.get('/api/reminders/upcoming', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const hours = parseInt(req.query.hours as string) || 24;

        const reminders = await this.reminderService.getUpcomingReminders(userId, hours);
        res.json({ success: true, reminders });
      } catch (error) {
        console.error('Error getting upcoming reminders:', error);
        res.status(500).json({ error: 'Failed to get upcoming reminders' });
      }
    });

    /**
     * Get reminder statistics
     * GET /api/reminders/stats
     */
    this.router.get('/api/reminders/stats', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const stats = await this.reminderService.getReminderStats(userId);
        res.json({ success: true, stats });
      } catch (error) {
        console.error('Error getting reminder stats:', error);
        res.status(500).json({ error: 'Failed to get reminder stats' });
      }
    });

    /**
     * Get single reminder
     * GET /api/reminders/:id
     */
    this.router.get('/api/reminders/:id', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const reminder = await this.reminderService.getReminder(req.params.id);

        if (!reminder) {
          return res.status(404).json({ error: 'Reminder not found' });
        }

        if (reminder.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ success: true, reminder });
      } catch (error) {
        console.error('Error getting reminder:', error);
        res.status(500).json({ error: 'Failed to get reminder' });
      }
    });

    /**
     * Create new reminder
     * POST /api/reminders
     */
    this.router.post('/api/reminders', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const { title, description, scheduledAt, recurrence } = req.body;

        if (!title || !scheduledAt) {
          return res.status(400).json({ error: 'Title and scheduledAt are required' });
        }

        const createData: CreateReminderDto = {
          title,
          description,
          scheduledAt: new Date(scheduledAt),
          recurrence: recurrence as RecurrenceType || RecurrenceType.none,
        };

        const reminder = await this.reminderService.createReminder(userId, createData);
        res.status(201).json({ success: true, reminder });
      } catch (error) {
        console.error('Error creating reminder:', error);
        res.status(500).json({ error: 'Failed to create reminder' });
      }
    });

    /**
     * Update reminder
     * PUT /api/reminders/:id
     */
    this.router.put('/api/reminders/:id', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const existing = await this.reminderService.getReminder(req.params.id);

        if (!existing) {
          return res.status(404).json({ error: 'Reminder not found' });
        }

        if (existing.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const updateData: UpdateReminderDto = {};
        if (req.body.title) updateData.title = req.body.title;
        if (req.body.description !== undefined) updateData.description = req.body.description;
        if (req.body.scheduledAt) updateData.scheduledAt = new Date(req.body.scheduledAt);
        if (req.body.recurrence) updateData.recurrence = req.body.recurrence as RecurrenceType;
        if (req.body.status) updateData.status = req.body.status as ReminderStatus;

        const reminder = await this.reminderService.updateReminder(req.params.id, updateData);
        res.json({ success: true, reminder });
      } catch (error) {
        console.error('Error updating reminder:', error);
        res.status(500).json({ error: 'Failed to update reminder' });
      }
    });

    /**
     * Delete reminder
     * DELETE /api/reminders/:id
     */
    this.router.delete('/api/reminders/:id', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const existing = await this.reminderService.getReminder(req.params.id);

        if (!existing) {
          return res.status(404).json({ error: 'Reminder not found' });
        }

        if (existing.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        await this.reminderService.deleteReminder(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error('Error deleting reminder:', error);
        res.status(500).json({ error: 'Failed to delete reminder' });
      }
    });

    /**
     * Pause recurring reminder
     * POST /api/reminders/:id/pause
     */
    this.router.post('/api/reminders/:id/pause', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const existing = await this.reminderService.getReminder(req.params.id);

        if (!existing) {
          return res.status(404).json({ error: 'Reminder not found' });
        }

        if (existing.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const reminder = await this.reminderService.pauseReminder(req.params.id);
        res.json({ success: true, reminder });
      } catch (error) {
        console.error('Error pausing reminder:', error);
        res.status(500).json({ error: 'Failed to pause reminder' });
      }
    });

    /**
     * Resume paused reminder
     * POST /api/reminders/:id/resume
     */
    this.router.post('/api/reminders/:id/resume', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const existing = await this.reminderService.getReminder(req.params.id);

        if (!existing) {
          return res.status(404).json({ error: 'Reminder not found' });
        }

        if (existing.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const reminder = await this.reminderService.resumeReminder(req.params.id);
        res.json({ success: true, reminder });
      } catch (error) {
        console.error('Error resuming reminder:', error);
        res.status(500).json({ error: 'Failed to resume reminder' });
      }
    });

    // ============================================
    // NOTE ROUTES
    // ============================================

    /**
     * Get all notes for user
     * GET /api/notes
     */
    this.router.get('/api/notes', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const filters: NoteFilters = {};

        if (req.query.category) {
          filters.category = req.query.category as string;
        }
        if (req.query.tag) {
          filters.tag = req.query.tag as string;
        }
        if (req.query.isPinned !== undefined) {
          filters.isPinned = req.query.isPinned === 'true';
        }
        if (req.query.search) {
          filters.search = req.query.search as string;
        }

        const notes = await this.noteService.getNotes(userId, Object.keys(filters).length > 0 ? filters : undefined);
        res.json({ success: true, notes });
      } catch (error) {
        console.error('Error getting notes:', error);
        res.status(500).json({ error: 'Failed to get notes' });
      }
    });

    /**
     * Search notes
     * GET /api/notes/search
     */
    this.router.get('/api/notes/search', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const query = req.query.q as string;

        if (!query) {
          return res.status(400).json({ error: 'Search query is required' });
        }

        const notes = await this.noteService.searchNotes(userId, query);
        res.json({ success: true, notes });
      } catch (error) {
        console.error('Error searching notes:', error);
        res.status(500).json({ error: 'Failed to search notes' });
      }
    });

    /**
     * Get note categories
     * GET /api/notes/categories
     */
    this.router.get('/api/notes/categories', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const categories = await this.noteService.getCategories(userId);
        res.json({ success: true, categories });
      } catch (error) {
        console.error('Error getting categories:', error);
        res.status(500).json({ error: 'Failed to get categories' });
      }
    });

    /**
     * Get note tags
     * GET /api/notes/tags
     */
    this.router.get('/api/notes/tags', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const tags = await this.noteService.getTags(userId);
        res.json({ success: true, tags });
      } catch (error) {
        console.error('Error getting tags:', error);
        res.status(500).json({ error: 'Failed to get tags' });
      }
    });

    /**
     * Get note statistics
     * GET /api/notes/stats
     */
    this.router.get('/api/notes/stats', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const stats = await this.noteService.getNoteStats(userId);
        res.json({ success: true, stats });
      } catch (error) {
        console.error('Error getting note stats:', error);
        res.status(500).json({ error: 'Failed to get note stats' });
      }
    });

    /**
     * Get single note
     * GET /api/notes/:id
     */
    this.router.get('/api/notes/:id', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const note = await this.noteService.getNote(req.params.id);

        if (!note) {
          return res.status(404).json({ error: 'Note not found' });
        }

        if (note.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ success: true, note });
      } catch (error) {
        console.error('Error getting note:', error);
        res.status(500).json({ error: 'Failed to get note' });
      }
    });

    /**
     * Create new note
     * POST /api/notes
     */
    this.router.post('/api/notes', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const { title, content, category, tags, isPinned } = req.body;

        if (!title || !content) {
          return res.status(400).json({ error: 'Title and content are required' });
        }

        const createData: CreateNoteDto = {
          title,
          content,
          category,
          tags: tags || [],
          isPinned: isPinned || false,
        };

        const note = await this.noteService.createNote(userId, createData);
        res.status(201).json({ success: true, note });
      } catch (error) {
        console.error('Error creating note:', error);
        res.status(500).json({ error: 'Failed to create note' });
      }
    });

    /**
     * Update note
     * PUT /api/notes/:id
     */
    this.router.put('/api/notes/:id', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const existing = await this.noteService.getNote(req.params.id);

        if (!existing) {
          return res.status(404).json({ error: 'Note not found' });
        }

        if (existing.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const updateData: UpdateNoteDto = {};
        if (req.body.title) updateData.title = req.body.title;
        if (req.body.content !== undefined) updateData.content = req.body.content;
        if (req.body.category !== undefined) updateData.category = req.body.category;
        if (req.body.tags) updateData.tags = req.body.tags;
        if (req.body.isPinned !== undefined) updateData.isPinned = req.body.isPinned;

        const note = await this.noteService.updateNote(req.params.id, updateData);
        res.json({ success: true, note });
      } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).json({ error: 'Failed to update note' });
      }
    });

    /**
     * Delete note
     * DELETE /api/notes/:id
     */
    this.router.delete('/api/notes/:id', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const existing = await this.noteService.getNote(req.params.id);

        if (!existing) {
          return res.status(404).json({ error: 'Note not found' });
        }

        if (existing.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        await this.noteService.deleteNote(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).json({ error: 'Failed to delete note' });
      }
    });

    /**
     * Toggle pin status
     * POST /api/notes/:id/pin
     */
    this.router.post('/api/notes/:id/pin', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const existing = await this.noteService.getNote(req.params.id);

        if (!existing) {
          return res.status(404).json({ error: 'Note not found' });
        }

        if (existing.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const note = await this.noteService.togglePin(req.params.id);
        res.json({ success: true, note });
      } catch (error) {
        console.error('Error toggling pin:', error);
        res.status(500).json({ error: 'Failed to toggle pin' });
      }
    });

    // ============================================
    // EXPENSE ROUTES
    // ============================================

    /**
     * Get all expenses for user
     * GET /api/expenses
     */
    this.router.get('/api/expenses', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const filters: ExpenseFilters = {};

        if (req.query.type) {
          filters.type = req.query.type as ExpenseType;
        }
        if (req.query.category) {
          filters.category = req.query.category as string;
        }
        if (req.query.from) {
          filters.from = new Date(req.query.from as string);
        }
        if (req.query.to) {
          filters.to = new Date(req.query.to as string);
        }

        const expenses = await this.expenseService.getExpenses(userId, Object.keys(filters).length > 0 ? filters : undefined);
        res.json({ success: true, expenses });
      } catch (error) {
        console.error('Error getting expenses:', error);
        res.status(500).json({ error: 'Failed to get expenses' });
      }
    });

    /**
     * Get expense summary
     * GET /api/expenses/summary
     */
    this.router.get('/api/expenses/summary', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const { from, to } = req.query;

        const period = (from && to) ? {
          from: new Date(from as string),
          to: new Date(to as string),
        } : undefined;

        const summary = await this.expenseService.getSummary(userId, period);
        res.json({ success: true, summary });
      } catch (error) {
        console.error('Error getting expense summary:', error);
        res.status(500).json({ error: 'Failed to get expense summary' });
      }
    });

    /**
     * Get monthly breakdown
     * GET /api/expenses/monthly
     */
    this.router.get('/api/expenses/monthly', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const now = new Date();
        const year = parseInt(req.query.year as string) || now.getFullYear();
        const month = parseInt(req.query.month as string) || (now.getMonth() + 1);

        const breakdown = await this.expenseService.getMonthlyBreakdown(userId, year, month);
        res.json({ success: true, breakdown });
      } catch (error) {
        console.error('Error getting monthly breakdown:', error);
        res.status(500).json({ error: 'Failed to get monthly breakdown' });
      }
    });

    /**
     * Get category breakdown
     * GET /api/expenses/categories
     */
    this.router.get('/api/expenses/categories', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const { from, to } = req.query;

        const period = (from && to) ? {
          from: new Date(from as string),
          to: new Date(to as string),
        } : undefined;

        const categories = await this.expenseService.getCategoryBreakdown(userId, period);
        res.json({ success: true, categories });
      } catch (error) {
        console.error('Error getting category breakdown:', error);
        res.status(500).json({ error: 'Failed to get category breakdown' });
      }
    });

    /**
     * Get expense statistics
     * GET /api/expenses/stats
     */
    this.router.get('/api/expenses/stats', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const stats = await this.expenseService.getExpenseStats(userId);
        res.json({ success: true, stats });
      } catch (error) {
        console.error('Error getting expense stats:', error);
        res.status(500).json({ error: 'Failed to get expense stats' });
      }
    });

    /**
     * Get recent transactions
     * GET /api/expenses/recent
     */
    this.router.get('/api/expenses/recent', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const limit = parseInt(req.query.limit as string) || 10;

        const expenses = await this.expenseService.getRecentTransactions(userId, limit);
        res.json({ success: true, expenses });
      } catch (error) {
        console.error('Error getting recent transactions:', error);
        res.status(500).json({ error: 'Failed to get recent transactions' });
      }
    });

    /**
     * Get single expense
     * GET /api/expenses/:id
     */
    this.router.get('/api/expenses/:id', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const expense = await this.expenseService.getExpense(req.params.id);

        if (!expense) {
          return res.status(404).json({ error: 'Expense not found' });
        }

        if (expense.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ success: true, expense });
      } catch (error) {
        console.error('Error getting expense:', error);
        res.status(500).json({ error: 'Failed to get expense' });
      }
    });

    /**
     * Create new expense
     * POST /api/expenses
     */
    this.router.post('/api/expenses', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const userId = req.user!.phoneNumber;
        const { type, amount, description, category, date } = req.body;

        if (!type || !amount || amount <= 0) {
          return res.status(400).json({ error: 'Type and positive amount are required' });
        }

        const createData: CreateExpenseDto = {
          type: type as ExpenseType,
          amount: parseFloat(amount),
          description,
          category,
          date: date ? new Date(date) : new Date(),
        };

        const expense = await this.expenseService.createExpense(userId, createData);
        res.status(201).json({ success: true, expense });
      } catch (error) {
        console.error('Error creating expense:', error);
        res.status(500).json({ error: 'Failed to create expense' });
      }
    });

    /**
     * Update expense
     * PUT /api/expenses/:id
     */
    this.router.put('/api/expenses/:id', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const existing = await this.expenseService.getExpense(req.params.id);

        if (!existing) {
          return res.status(404).json({ error: 'Expense not found' });
        }

        if (existing.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const updateData: UpdateExpenseDto = {};
        if (req.body.type) updateData.type = req.body.type as ExpenseType;
        if (req.body.amount !== undefined) updateData.amount = parseFloat(req.body.amount);
        if (req.body.description !== undefined) updateData.description = req.body.description;
        if (req.body.category !== undefined) updateData.category = req.body.category;
        if (req.body.date) updateData.date = new Date(req.body.date);

        const expense = await this.expenseService.updateExpense(req.params.id, updateData);
        res.json({ success: true, expense });
      } catch (error) {
        console.error('Error updating expense:', error);
        res.status(500).json({ error: 'Failed to update expense' });
      }
    });

    /**
     * Delete expense
     * DELETE /api/expenses/:id
     */
    this.router.delete('/api/expenses/:id', requireUserAuth, async (req: UserRequest, res: Response) => {
      try {
        const existing = await this.expenseService.getExpense(req.params.id);

        if (!existing) {
          return res.status(404).json({ error: 'Expense not found' });
        }

        if (existing.userId !== req.user!.phoneNumber) {
          return res.status(403).json({ error: 'Access denied' });
        }

        await this.expenseService.deleteExpense(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ error: 'Failed to delete expense' });
      }
    });
  }
}