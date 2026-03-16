import { prisma } from '../config/prisma';
import { Note } from '@prisma/client';

/**
 * DTOs for Note operations
 */
export interface CreateNoteDto {
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  isPinned?: boolean;
}

export interface UpdateNoteDto {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  isPinned?: boolean;
}

export interface NoteFilters {
  category?: string;
  tag?: string;
  isPinned?: boolean;
  search?: string;
}

/**
 * NoteService handles CRUD operations for notes
 */
export class NoteService {
  /**
   * Create a new note
   */
  async createNote(userId: string, data: CreateNoteDto): Promise<Note> {
    const note = await prisma.note.create({
      data: {
        userId,
        title: data.title,
        content: data.content,
        category: data.category || null,
        tags: data.tags || [],
        isPinned: data.isPinned || false,
      },
    });

    console.log(`📝 Created note ${note.id} for user ${userId}: "${data.title}"`);
    return note;
  }

  /**
   * Get all notes for a user with optional filters
   */
  async getNotes(userId: string, filters?: NoteFilters): Promise<Note[]> {
    const where: any = { userId };

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.tag) {
      where.tags = { has: filters.tag };
    }

    if (filters?.isPinned !== undefined) {
      where.isPinned = filters.isPinned;
    }

    if (filters?.search) {
      const searchTerm = filters.search.toLowerCase();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { content: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    return prisma.note.findMany({
      where,
      orderBy: [
        { isPinned: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  /**
   * Get a single note by ID
   */
  async getNote(id: string): Promise<Note | null> {
    return prisma.note.findUnique({
      where: { id },
    });
  }

  /**
   * Update a note
   */
  async updateNote(id: string, data: UpdateNoteDto): Promise<Note> {
    const note = await prisma.note.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    console.log(`📝 Updated note ${id}`);
    return note;
  }

  /**
   * Delete a note
   */
  async deleteNote(id: string): Promise<boolean> {
    try {
      await prisma.note.delete({
        where: { id },
      });
      console.log(`🗑️ Deleted note ${id}`);
      return true;
    } catch (error) {
      console.error('Error deleting note:', error);
      return false;
    }
  }

  /**
   * Search notes by content or title
   */
  async searchNotes(userId: string, query: string): Promise<Note[]> {
    const searchTerm = query.toLowerCase();

    return prisma.note.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: searchTerm, mode: 'insensitive' } },
          { content: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      orderBy: [
        { isPinned: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  /**
   * Get notes by category
   */
  async getNotesByCategory(userId: string, category: string): Promise<Note[]> {
    return prisma.note.findMany({
      where: {
        userId,
        category,
      },
      orderBy: [
        { isPinned: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  /**
   * Get notes by tag
   */
  async getNotesByTag(userId: string, tag: string): Promise<Note[]> {
    return prisma.note.findMany({
      where: {
        userId,
        tags: { has: tag },
      },
      orderBy: [
        { isPinned: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  /**
   * Get all categories used by a user
   */
  async getCategories(userId: string): Promise<string[]> {
    const notes = await prisma.note.findMany({
      where: {
        userId,
        category: { not: null },
      },
      select: { category: true },
    });

    const categories = new Set<string>();
    notes.forEach(note => {
      if (note.category) {
        categories.add(note.category);
      }
    });

    return Array.from(categories).sort();
  }

  /**
   * Get all tags used by a user
   */
  async getTags(userId: string): Promise<string[]> {
    const notes = await prisma.note.findMany({
      where: { userId },
      select: { tags: true },
    });

    const tags = new Set<string>();
    notes.forEach(note => {
      note.tags.forEach(tag => tags.add(tag));
    });

    return Array.from(tags).sort();
  }

  /**
   * Toggle pin status of a note
   */
  async togglePin(id: string): Promise<Note> {
    const note = await prisma.note.findUnique({
      where: { id },
    });

    if (!note) {
      throw new Error('Note not found');
    }

    return prisma.note.update({
      where: { id },
      data: {
        isPinned: !note.isPinned,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get note statistics for a user
   */
  async getNoteStats(userId: string): Promise<{
    total: number;
    pinned: number;
    categories: number;
    tags: number;
  }> {
    const [total, pinned, categories, tagsData] = await Promise.all([
      prisma.note.count({ where: { userId } }),
      prisma.note.count({ where: { userId, isPinned: true } }),
      this.getCategories(userId),
      this.getTags(userId),
    ]);

    return {
      total,
      pinned,
      categories: categories.length,
      tags: tagsData.length,
    };
  }

  /**
   * Bulk delete notes by category
   */
  async deleteByCategory(userId: string, category: string): Promise<number> {
    const result = await prisma.note.deleteMany({
      where: {
        userId,
        category,
      },
    });

    console.log(`🗑️ Deleted ${result.count} notes from category "${category}"`);
    return result.count;
  }

  /**
   * Bulk delete notes by tag
   */
  async deleteByTag(userId: string, tag: string): Promise<number> {
    const result = await prisma.note.deleteMany({
      where: {
        userId,
        tags: { has: tag },
      },
    });

    console.log(`🗑️ Deleted ${result.count} notes with tag "${tag}"`);
    return result.count;
  }
}