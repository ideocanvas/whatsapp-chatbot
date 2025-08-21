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
  messages: Message[];
  lastUpdated: string;
  messageCount: number;
}

export interface ConversationStorageConfig {
  storagePath: string;
  maxMessagesPerConversation?: number;
  cleanupIntervalHours?: number;
}