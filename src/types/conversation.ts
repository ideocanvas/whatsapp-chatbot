export interface UserProfile {
  name?: string;
  state?: 'awaiting_name' | null; // For multi-step conversations
  knowledge?: {
    [topic: string]: {
      value: string;
      source: string; // e.g., 'user_provided', 'https://example.com'
      lastUpdated: string;
    }
  };
}

export interface Message {
  id: string;
  type: 'text' | 'image' | 'audio';
  content: string;
  timestamp: string;
  mediaPath?: string;
  mediaInfo?: {
    id: string;
    mimeType: string;
    sha256: string;
  };
}

export interface Conversation {
  senderNumber: string;
  userProfile: UserProfile; // Add this
  messages: Message[];
  lastUpdated: string;
  messageCount: number;
}

export interface ConversationStorageConfig {
  storagePath: string;
  maxMessagesPerConversation?: number;
  cleanupIntervalHours?: number;
}