import { prisma } from '../config/prisma';
import { Expense, ExpenseType } from '@prisma/client';

/**
 * DTOs for Expense operations
 */
export interface CreateExpenseDto {
  type: ExpenseType;
  amount: number;
  description?: string;
  category?: string;
  date: Date;
}

export interface UpdateExpenseDto {
  type?: ExpenseType;
  amount?: number;
  description?: string;
  category?: string;
  date?: Date;
}

export interface ExpenseFilters {
  type?: ExpenseType;
  category?: string;
  from?: Date;
  to?: Date;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface ExpenseSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
}

export interface MonthlyBreakdown {
  year: number;
  month: number;
  income: number;
  expenses: number;
  balance: number;
  categories: { category: string; amount: number; type: ExpenseType }[];
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  count: number;
  type: ExpenseType;
}

/**
 * ExpenseService handles CRUD operations for expenses and income
 */
export class ExpenseService {
  /**
   * Create a new expense/income entry
   */
  async createExpense(userId: string, data: CreateExpenseDto): Promise<Expense> {
    const expense = await prisma.expense.create({
      data: {
        userId,
        type: data.type,
        amount: data.amount,
        description: data.description || null,
        category: data.category || null,
        date: data.date,
      },
    });

    console.log(`💰 Created ${data.type} entry ${expense.id} for user ${userId}: ${data.amount}`);
    return expense;
  }

  /**
   * Get all expenses for a user with optional filters
   */
  async getExpenses(userId: string, filters?: ExpenseFilters): Promise<Expense[]> {
    const where: any = { userId };

    if (filters?.type) {
      where.type = filters.type;
    }

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.from || filters?.to) {
      where.date = {
        ...(filters.from && { gte: filters.from }),
        ...(filters.to && { lte: filters.to }),
      };
    }

    return prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Get a single expense by ID
   */
  async getExpense(id: string): Promise<Expense | null> {
    return prisma.expense.findUnique({
      where: { id },
    });
  }

  /**
   * Update an expense
   */
  async updateExpense(id: string, data: UpdateExpenseDto): Promise<Expense> {
    const expense = await prisma.expense.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    console.log(`💰 Updated expense ${id}`);
    return expense;
  }

  /**
   * Delete an expense
   */
  async deleteExpense(id: string): Promise<boolean> {
    try {
      await prisma.expense.delete({
        where: { id },
      });
      console.log(`🗑️ Deleted expense ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting expense:', error);
      return false;
    }
  }

  /**
   * Get expense summary for a period
   */
  async getSummary(userId: string, period?: DateRange): Promise<ExpenseSummary> {
    const where: any = { userId };

    if (period) {
      where.date = {
        gte: period.from,
        lte: period.to,
      };
    }

    const expenses = await prisma.expense.findMany({
      where,
      select: { type: true, amount: true },
    });

    let totalIncome = 0;
    let totalExpenses = 0;
    let incomeCount = 0;
    let expenseCount = 0;

    expenses.forEach(expense => {
      if (expense.type === ExpenseType.income) {
        totalIncome += expense.amount;
        incomeCount++;
      } else {
        totalExpenses += expense.amount;
        expenseCount++;
      }
    });

    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
      transactionCount: expenses.length,
      incomeCount,
      expenseCount,
    };
  }

  /**
   * Get expenses by category
   */
  async getExpensesByCategory(userId: string, category: string): Promise<Expense[]> {
    return prisma.expense.findMany({
      where: {
        userId,
        category,
      },
      orderBy: { date: 'desc' },
    });
  }

  /**
   * Get monthly breakdown
   */
  async getMonthlyBreakdown(userId: string, year: number, month: number): Promise<MonthlyBreakdown> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    let income = 0;
    let expenses_total = 0;
    const categoryMap = new Map<string, { amount: number; type: ExpenseType }>();

    expenses.forEach(expense => {
      if (expense.type === ExpenseType.income) {
        income += expense.amount;
      } else {
        expenses_total += expense.amount;
      }

      if (expense.category) {
        const existing = categoryMap.get(expense.category);
        if (existing) {
          existing.amount += expense.amount;
        } else {
          categoryMap.set(expense.category, { amount: expense.amount, type: expense.type });
        }
      }
    });

    const categories = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      amount: data.amount,
      type: data.type,
    }));

    return {
      year,
      month,
      income,
      expenses: expenses_total,
      balance: income - expenses_total,
      categories,
    };
  }

  /**
   * Get category breakdown for a period
   */
  async getCategoryBreakdown(userId: string, period?: DateRange): Promise<CategoryBreakdown[]> {
    const where: any = { userId };

    if (period) {
      where.date = {
        gte: period.from,
        lte: period.to,
      };
    }

    const expenses = await prisma.expense.findMany({
      where,
      select: { category: true, amount: true, type: true },
    });

    const categoryMap = new Map<string, { total: number; count: number; type: ExpenseType }>();

    expenses.forEach(expense => {
      const category = expense.category || 'Uncategorized';
      const existing = categoryMap.get(category);

      if (existing) {
        existing.total += expense.amount;
        existing.count++;
      } else {
        categoryMap.set(category, {
          total: expense.amount,
          count: 1,
          type: expense.type,
        });
      }
    });

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        total: data.total,
        count: data.count,
        type: data.type,
      }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Get all categories used by a user
   */
  async getCategories(userId: string): Promise<string[]> {
    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        category: { not: null },
      },
      select: { category: true },
    });

    const categories = new Set<string>();
    expenses.forEach(expense => {
      if (expense.category) {
        categories.add(expense.category);
      }
    });

    return Array.from(categories).sort();
  }

  /**
   * Get expense statistics for a user
   */
  async getExpenseStats(userId: string): Promise<{
    total: number;
    income: number;
    expenses: number;
    categories: number;
  }> {
    const [total, income, expenses, categories] = await Promise.all([
      prisma.expense.count({ where: { userId } }),
      prisma.expense.count({ where: { userId, type: ExpenseType.income } }),
      prisma.expense.count({ where: { userId, type: ExpenseType.expense } }),
      this.getCategories(userId),
    ]);

    return {
      total,
      income,
      expenses,
      categories: categories.length,
    };
  }

  /**
   * Get recent transactions
   */
  async getRecentTransactions(userId: string, limit: number = 10): Promise<Expense[]> {
    return prisma.expense.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }

  /**
   * Get daily totals for a date range
   */
  async getDailyTotals(userId: string, from: Date, to: Date): Promise<{ date: Date; income: number; expenses: number }[]> {
    const expenses = await prisma.expense.findMany({
      where: {
        userId,
        date: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { date: 'asc' },
    });

    const dailyMap = new Map<string, { income: number; expenses: number }>();

    expenses.forEach(expense => {
      const dateKey = expense.date.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey);

      if (existing) {
        if (expense.type === ExpenseType.income) {
          existing.income += expense.amount;
        } else {
          existing.expenses += expense.amount;
        }
      } else {
        dailyMap.set(dateKey, {
          income: expense.type === ExpenseType.income ? expense.amount : 0,
          expenses: expense.type === ExpenseType.expense ? expense.amount : 0,
        });
      }
    });

    return Array.from(dailyMap.entries())
      .map(([dateStr, data]) => ({
        date: new Date(dateStr),
        income: data.income,
        expenses: data.expenses,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Bulk delete expenses by category
   */
  async deleteByCategory(userId: string, category: string): Promise<number> {
    const result = await prisma.expense.deleteMany({
      where: {
        userId,
        category,
      },
    });

    console.log(`🗑️ Deleted ${result.count} expenses from category "${category}"`);
    return result.count;
  }
}