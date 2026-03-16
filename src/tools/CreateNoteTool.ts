import { BaseTool } from '../core/BaseTool';
import { NoteService, CreateNoteDto } from '../services/NoteService';

interface NoteArgs {
  action: 'create' | 'list' | 'search' | 'update' | 'delete' | 'pin' | 'categories' | 'tags';
  // For create
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  // For search
  query?: string;
  // For list by category/tag
  category_filter?: string;
  tag_filter?: string;
  // For update/delete/pin
  note_id?: string;
  is_pinned?: boolean;
}

/**
 * Tool for managing notes with support for:
 * - Create notes with title, content, category, and tags
 * - List, search, update, and delete notes
 * - Pin/unpin notes
 * - Get categories and tags
 */
export class CreateNoteTool extends BaseTool {
  name = 'manage_notes';
  description = `Manage notes with various actions:
- Create notes with title, content, category, and tags
- List all notes or filter by category/tag
- Search notes by content or title
- Update, delete, and pin notes

Examples:
- "create a note about meeting" -> action: create, title: "meeting notes", content: ...
- "show my notes" -> action: list
- "search notes for 'project'" -> action: search, query: "project"
- "pin note <id>" -> action: pin, note_id: <id>`;

  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'list', 'search', 'update', 'delete', 'pin', 'categories', 'tags'],
        description: 'The action to perform on notes'
      },
      title: {
        type: 'string',
        description: 'The note title (for create/update)'
      },
      content: {
        type: 'string',
        description: 'The note content/text'
      },
      category: {
        type: 'string',
        description: 'Category for organizing notes'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Tags for the note'
      },
      query: {
        type: 'string',
        description: 'Search query for finding notes'
      },
      category_filter: {
        type: 'string',
        description: 'Filter notes by category when listing'
      },
      tag_filter: {
        type: 'string',
        description: 'Filter notes by tag when listing'
      },
      note_id: {
        type: 'string',
        description: 'ID of the note for update/delete/pin operations'
      },
      is_pinned: {
        type: 'boolean',
        description: 'Whether to pin or unpin the note'
      }
    },
    required: ['action']
  };

  private noteService?: NoteService;
  private userId?: string;

  constructor() {
    super();
  }

  // NoteService will be injected by the Agent
  setNoteService(noteService: NoteService): void {
    this.noteService = noteService;
  }

  // Set userId dynamically before execution in the Agent
  setUserId(userId: string): void {
    this.userId = userId;
  }

  async execute(args: NoteArgs): Promise<string> {
    if (!this.userId) {
      return "Error: No User ID context.";
    }

    if (!this.noteService) {
      return "Error: NoteService not configured.";
    }

    switch (args.action) {
      case 'create':
        return this.createNote(args);
      case 'list':
        return this.listNotes(args);
      case 'search':
        return this.searchNotes(args);
      case 'update':
        return this.updateNote(args);
      case 'delete':
        return this.deleteNote(args);
      case 'pin':
        return this.pinNote(args);
      case 'categories':
        return this.getCategories();
      case 'tags':
        return this.getTags();
      default:
        return `Unknown action: ${args.action}. Valid actions are: create, list, search, update, delete, pin, categories, tags.`;
    }
  }

  private async createNote(args: NoteArgs): Promise<string> {
    if (!args.title) {
      return "Error: Note title is required for creating a note.";
    }

    if (!args.content) {
      return "Error: Note content is required for creating a note.";
    }

    const createData: CreateNoteDto = {
      title: args.title,
      content: args.content,
      category: args.category,
      tags: args.tags,
      isPinned: false,
    };

    try {
      const note = await this.noteService!.createNote(this.userId!, createData);

      let response = `✅ Note created successfully!\n`;
      response += `📝 "${args.title}"\n`;
      if (args.category) {
        response += `📁 Category: ${args.category}\n`;
      }
      if (args.tags && args.tags.length > 0) {
        response += `🏷️ Tags: ${args.tags.join(', ')}\n`;
      }
      response += `ID: ${note.id}`;

      return response;
    } catch (error) {
      console.error('Failed to create note:', error);
      return `Failed to create note: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async listNotes(args: NoteArgs): Promise<string> {
    try {
      const filters: any = {};
      
      if (args.category_filter) {
        filters.category = args.category_filter;
      }
      
      if (args.tag_filter) {
        filters.tag = args.tag_filter;
      }

      const notes = await this.noteService!.getNotes(this.userId!, Object.keys(filters).length > 0 ? filters : undefined);

      if (notes.length === 0) {
        return "You have no notes.";
      }

      const lines = [`📋 You have ${notes.length} note(s):\n`];
      
      notes.forEach((note, index) => {
        const pinEmoji = note.isPinned ? '📌 ' : '';
        const categoryStr = note.category ? ` [${note.category}]` : '';
        const tagsStr = note.tags.length > 0 ? ` 🏷️ ${note.tags.join(', ')}` : '';
        
        lines.push(`${index + 1}. ${pinEmoji}"${note.title}"${categoryStr}${tagsStr}`);
        lines.push(`   ID: ${note.id}`);
        lines.push(`   ${note.content.substring(0, 100)}${note.content.length > 100 ? '...' : ''}`);
        lines.push('');
      });

      return lines.join('\n');
    } catch (error) {
      console.error('Failed to list notes:', error);
      return `Failed to list notes: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async searchNotes(args: NoteArgs): Promise<string> {
    if (!args.query) {
      return "Error: Search query is required for searching notes.";
    }

    try {
      const notes = await this.noteService!.searchNotes(this.userId!, args.query);

      if (notes.length === 0) {
        return `No notes found matching "${args.query}".`;
      }

      const lines = [`🔍 Found ${notes.length} note(s) matching "${args.query}":\n`];
      
      notes.forEach((note, index) => {
        const pinEmoji = note.isPinned ? '📌 ' : '';
        const categoryStr = note.category ? ` [${note.category}]` : '';
        
        lines.push(`${index + 1}. ${pinEmoji}"${note.title}"${categoryStr}`);
        lines.push(`   ID: ${note.id}`);
        lines.push('');
      });

      return lines.join('\n');
    } catch (error) {
      console.error('Failed to search notes:', error);
      return `Failed to search notes: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async updateNote(args: NoteArgs): Promise<string> {
    if (!args.note_id) {
      return "Error: note_id is required for updating a note.";
    }

    try {
      // Verify the note belongs to the user
      const existing = await this.noteService!.getNote(args.note_id);
      if (!existing) {
        return "Error: Note not found.";
      }
      if (existing.userId !== this.userId) {
        return "Error: You don't have permission to update this note.";
      }

      const updateData: any = {};
      if (args.title) updateData.title = args.title;
      if (args.content !== undefined) updateData.content = args.content;
      if (args.category !== undefined) updateData.category = args.category;
      if (args.tags) updateData.tags = args.tags;

      await this.noteService!.updateNote(args.note_id, updateData);

      return `✅ Note updated successfully!\nID: ${args.note_id}`;
    } catch (error) {
      console.error('Failed to update note:', error);
      return `Failed to update note: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async deleteNote(args: NoteArgs): Promise<string> {
    if (!args.note_id) {
      return "Error: note_id is required for deleting a note.";
    }

    try {
      // Verify the note belongs to the user
      const existing = await this.noteService!.getNote(args.note_id);
      if (!existing) {
        return "Error: Note not found.";
      }
      if (existing.userId !== this.userId) {
        return "Error: You don't have permission to delete this note.";
      }

      await this.noteService!.deleteNote(args.note_id);

      return `✅ Note deleted successfully!\nID: ${args.note_id}`;
    } catch (error) {
      console.error('Failed to delete note:', error);
      return `Failed to delete note: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async pinNote(args: NoteArgs): Promise<string> {
    if (!args.note_id) {
      return "Error: note_id is required for pinning a note.";
    }

    try {
      const existing = await this.noteService!.getNote(args.note_id);
      if (!existing) {
        return "Error: Note not found.";
      }
      if (existing.userId !== this.userId) {
        return "Error: You don't have permission to pin this note.";
      }

      const note = await this.noteService!.togglePin(args.note_id);
      const status = note.isPinned ? 'pinned' : 'unpinned';

      return `📌 Note ${status} successfully!\nID: ${args.note_id}`;
    } catch (error) {
      console.error('Failed to pin note:', error);
      return `Failed to pin note: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async getCategories(): Promise<string> {
    try {
      const categories = await this.noteService!.getCategories(this.userId!);

      if (categories.length === 0) {
        return "You have no categories yet. Add a category when creating a note.";
      }

      return `📁 Your categories:\n${categories.map(c => `• ${c}`).join('\n')}`;
    } catch (error) {
      console.error('Failed to get categories:', error);
      return `Failed to get categories: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async getTags(): Promise<string> {
    try {
      const tags = await this.noteService!.getTags(this.userId!);

      if (tags.length === 0) {
        return "You have no tags yet. Add tags when creating a note.";
      }

      return `🏷️ Your tags:\n${tags.map(t => `• ${t}`).join('\n')}`;
    } catch (error) {
      console.error('Failed to get tags:', error);
      return `Failed to get tags: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}