import { BaseTool } from '../core/BaseTool';
import { ExpenseService, CreateExpenseDto } from '../services/ExpenseService';
import { ExpenseType } from '@prisma/client';

interface ExpenseArgs {
  action: 'create' | 'list' | 'summary' | 'update' | 'delete' | 'categories' | 'monthly';
  // For create
  type?: 'income' | 'expense';
  amount?: number;
  description?: string;
  category?: string;
  date?: string;  // ISO date string
  // For list
  type_filter?: 'income' | 'expense';
  category_filter?: string;
  from_date?: string;
  to_date?: string;
  // For summary
  period?: 'week' | 'month' | 'year';
  // For monthly
  year?: number;
  month?: number;
  // For update/delete
  expense_id?: string;
}

/**
 * Tool for managing expenses and income with support for:
 * - Create expense/income entries
 * - List, filter, and search transactions
 * - Get summaries and monthly breakdowns
 * - Update and delete entries
 */
export class CreateExpenseTool extends BaseTool {
  name = 'manage_expenses';
  description = `Manage expenses and income with various actions:
- Create expense or income entries
- List transactions with filters
- Get financial summaries
- View monthly breakdowns

Examples:
- "I spent $50 on groceries" -> action: create, type: expense, amount: 50, category: groceries
- "I received $1000 salary" -> action: create, type: income, amount: 1000, category: salary
- "show my expenses this month" -> action: summary, period: month
- "list all food expenses" -> action: list, category_filter: food`;

  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'summary', 'update', 'delete', 'categories', 'monthly'],
        description: 'The action to perform on expenses'
      },
      type: {
        type: 'string',
        enum: ['income', 'expense'],
        description: 'Type of transaction (income or expense)'
      },
      amount: {
        type: 'number',
        description: 'Amount of the transaction'
      },
      description: {
        type: 'string',
        description: 'Description of the transaction'
      },
      category: {
        type: 'string',
        description: 'Category (e.g., food, transport, salary, etc.)'
      },
      date: {
        type: 'string',
        description: 'Date of transaction (ISO format or natural language like "today", "yesterday")'
      },
      type_filter: {
        type: 'string',
        enum: ['income', 'expense'],
        description: 'Filter by type when listing'
      },
      category_filter: {
        type: 'string',
        description: 'Filter by category when listing'
      },
      from_date: {
        type: 'string',
        description: 'Start date for filtering (ISO format)'
      },
      to_date: {
        type: 'string',
        description: 'End date for filtering (ISO format)'
      },
      period: {
        type: 'string',
        enum: ['week', 'month', 'year'],
        description: 'Time period for summary'
      },
      year: {
        type: 'number',
        description: 'Year for monthly breakdown'
      },
      month: {
        type: 'number',
        description: 'Month for monthly breakdown (1-12)'
      },
      expense_id: {
        type: 'string',
        description: 'ID of the expense for update/delete operations'
      }
    },
    required: ['action']
  };

  private expenseService?: ExpenseService;
  private userId?: string;

  constructor() {
    super();
  }

  // ExpenseService will be injected by the Agent
  setExpenseService(expenseService: ExpenseService): void {
    this.expenseService = expenseService;
  }

  // Set userId dynamically before execution in the Agent
  setUserId(userId: string): void {
    this.userId = userId;
  }

  async execute(args: ExpenseArgs): Promise<string> {
    if (!this.userId) {
      return "Error: No User ID context.";
    }

    if (!this.expenseService) {
      return "Error: ExpenseService not configured.";
    }

    switch (args.action) {
      case 'create':
        return this.createExpense(args);
      case 'list':
        return this.listExpenses(args);
      case 'summary':
        return this.getSummary(args);
      case 'update':
        return this.updateExpense(args);
      case 'delete':
        return this.deleteExpense(args);
      case 'categories':
        return this.getCategories();
      case 'monthly':
        return this.getMonthlyBreakdown(args);
      default:
        return `Unknown action: ${args.action}. Valid actions are: create, list, summary, update, delete, categories, monthly.`;
    }
  }

  private async createExpense(args: ExpenseArgs): Promise<string> {
    if (!args.type) {
      return "Error: Transaction type (income/expense) is required.";
    }

    if (!args.amount || args.amount <= 0) {
      return "Error: A positive amount is required.";
    }

    // Parse date
    let date = new Date();
    if (args.date) {
      const parsed = this.parseDate(args.date);
      if (parsed) {
        date = parsed;
      } else {
        return `Error: Could not parse date: "${args.date}". Try formats like "today", "yesterday", or ISO format.`;
      }
    }

    const createData: CreateExpenseDto = {
      type: args.type as ExpenseType,
      amount: args.amount,
      description: args.description,
      category: args.category,
      date,
    };

    try {
      const expense = await this.expenseService!.createExpense(this.userId!, createData);

      const typeEmoji = args.type === 'income' ? '💰' : '💸';
      const typeStr = args.type === 'income' ? 'Income' : 'Expense';
      const categoryStr = args.category ? ` (${args.category})` : '';

      return `${typeEmoji} ${typeStr} recorded successfully!\n` +
             `Amount: $${args.amount.toFixed(2)}${categoryStr}\n` +
             `Date: ${date.toLocaleDateString()}\n` +
             `ID: ${expense.id}`;
    } catch (error) {
      console.error('Failed to create expense:', error);
      return `Failed to create expense: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async listExpenses(args: ExpenseArgs): Promise<string> {
    try {
      const filters: any = {};
      
      if (args.type_filter) {
        filters.type = args.type_filter as ExpenseType;
      }
      
      if (args.category_filter) {
        filters.category = args.category_filter;
      }

      if (args.from_date) {
        filters.from = new Date(args.from_date);
      }

      if (args.to_date) {
        filters.to = new Date(args.to_date);
      }

      const expenses = await this.expenseService!.getExpenses(this.userId!, Object.keys(filters).length > 0 ? filters : undefined);

      if (expenses.length === 0) {
        return "No transactions found.";
      }

      const lines = [`📋 Found ${expenses.length} transaction(s):\n`];
      
      let totalIncome = 0;
      let totalExpense = 0;

      expenses.forEach((expense, index) => {
        const typeEmoji = expense.type === ExpenseType.income ? '💰' : '💸';
        const categoryStr = expense.category ? ` [${expense.category}]` : '';
        const descStr = expense.description ? ` - ${expense.description}` : '';
        
        lines.push(`${index + 1}. ${typeEmoji} $${expense.amount.toFixed(2)}${categoryStr}${descStr}`);
        lines.push(`   ${expense.date.toLocaleDateString()} | ID: ${expense.id}`);
        
        if (expense.type === ExpenseType.income) {
          totalIncome += expense.amount;
        } else {
          totalExpense += expense.amount;
        }
      });

      lines.push('');
      lines.push(`📊 Summary: Income $${totalIncome.toFixed(2)} | Expenses $${totalExpense.toFixed(2)} | Balance $${(totalIncome - totalExpense).toFixed(2)}`);

      return lines.join('\n');
    } catch (error) {
      console.error('Failed to list expenses:', error);
      return `Failed to list expenses: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async getSummary(args: ExpenseArgs): Promise<string> {
    try {
      let from: Date | undefined;
      let to: Date | undefined;

      const now = new Date();

      if (args.period) {
        switch (args.period) {
          case 'week':
            from = new Date(now);
            from.setDate(from.getDate() - 7);
            to = now;
            break;
          case 'month':
            from = new Date(now.getFullYear(), now.getMonth(), 1);
            to = now;
            break;
          case 'year':
            from = new Date(now.getFullYear(), 0, 1);
            to = now;
            break;
        }
      }

      const summary = await this.expenseService!.getSummary(this.userId!, from && to ? { from, to } : undefined);

      const periodStr = args.period ? `this ${args.period}` : 'all time';
      const lines = [
        `📊 Financial Summary (${periodStr}):\n`,
        `💰 Total Income: $${summary.totalIncome.toFixed(2)} (${summary.incomeCount} transactions)`,
        `💸 Total Expenses: $${summary.totalExpenses.toFixed(2)} (${summary.expenseCount} transactions)`,
        `📈 Balance: $${summary.balance.toFixed(2)}`,
      ];

      return lines.join('\n');
    } catch (error) {
      console.error('Failed to get summary:', error);
      return `Failed to get summary: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async updateExpense(args: ExpenseArgs): Promise<string> {
    if (!args.expense_id) {
      return "Error: expense_id is required for updating an expense.";
    }

    try {
      // Verify the expense belongs to the user
      const existing = await this.expenseService!.getExpense(args.expense_id);
      if (!existing) {
        return "Error: Transaction not found.";
      }
      if (existing.userId !== this.userId) {
        return "Error: You don't have permission to update this transaction.";
      }

      const updateData: any = {};
      if (args.type) updateData.type = args.type as ExpenseType;
      if (args.amount !== undefined) updateData.amount = args.amount;
      if (args.description !== undefined) updateData.description = args.description;
      if (args.category !== undefined) updateData.category = args.category;
      if (args.date) {
        const parsed = this.parseDate(args.date);
        if (parsed) {
          updateData.date = parsed;
        }
      }

      await this.expenseService!.updateExpense(args.expense_id, updateData);

      return `✅ Transaction updated successfully!\nID: ${args.expense_id}`;
    } catch (error) {
      console.error('Failed to update expense:', error);
      return `Failed to update expense: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async deleteExpense(args: ExpenseArgs): Promise<string> {
    if (!args.expense_id) {
      return "Error: expense_id is required for deleting an expense.";
    }

    try {
      // Verify the expense belongs to the user
      const existing = await this.expenseService!.getExpense(args.expense_id);
      if (!existing) {
        return "Error: Transaction not found.";
      }
      if (existing.userId !== this.userId) {
        return "Error: You don't have permission to delete this transaction.";
      }

      await this.expenseService!.deleteExpense(args.expense_id);

      return `✅ Transaction deleted successfully!\nID: ${args.expense_id}`;
    } catch (error) {
      console.error('Failed to delete expense:', error);
      return `Failed to delete expense: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async getCategories(): Promise<string> {
    try {
      const categories = await this.expenseService!.getCategories(this.userId!);

      if (categories.length === 0) {
        return "You have no categories yet. Add a category when creating a transaction.";
      }

      return `📁 Your categories:\n${categories.map(c => `• ${c}`).join('\n')}`;
    } catch (error) {
      console.error('Failed to get categories:', error);
      return `Failed to get categories: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async getMonthlyBreakdown(args: ExpenseArgs): Promise<string> {
    try {
      const now = new Date();
      const year = args.year || now.getFullYear();
      const month = args.month || (now.getMonth() + 1);

      const breakdown = await this.expenseService!.getMonthlyBreakdown(this.userId!, year, month);

      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];

      const lines = [
        `📊 Monthly Breakdown for ${monthNames[breakdown.month - 1]} ${breakdown.year}:\n`,
        `💰 Income: $${breakdown.income.toFixed(2)}`,
        `💸 Expenses: $${breakdown.expenses.toFixed(2)}`,
        `📈 Balance: $${breakdown.balance.toFixed(2)}\n`,
      ];

      if (breakdown.categories.length > 0) {
        lines.push('By Category:');
        breakdown.categories
          .sort((a, b) => b.amount - a.amount)
          .forEach(cat => {
            const emoji = cat.type === ExpenseType.income ? '💰' : '💸';
            lines.push(`  ${emoji} ${cat.category}: $${cat.amount.toFixed(2)}`);
          });
      }

      return lines.join('\n');
    } catch (error) {
      console.error('Failed to get monthly breakdown:', error);
      return `Failed to get monthly breakdown: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private parseDate(input: string): Date | null {
    const lowerInput = input.toLowerCase().trim();
    const now = new Date();

    // Natural language parsing
    if (lowerInput === 'today') {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    if (lowerInput === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
    }

    // ISO date parsing
    const isoDate = new Date(input);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    return null;
  }
}