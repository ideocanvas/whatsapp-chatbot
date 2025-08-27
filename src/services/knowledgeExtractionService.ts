import { OpenAIService } from './openaiService';
import { ConversationStorageService } from './conversationStorageService';
import { Conversation, Message } from '../types/conversation';

export interface KnowledgeExtractionResult {
  topic: string;
  value: string;
  source: 'conversation_history';
  confidence: number;
  context: string;
}

export class KnowledgeExtractionService {
  private openaiService: OpenAIService | null;
  private conversationStorage: ConversationStorageService;

  constructor(openaiService: OpenAIService | null, conversationStorage: ConversationStorageService) {
    this.openaiService = openaiService;
    this.conversationStorage = conversationStorage;
  }

  /**
   * Extract knowledge from conversation history by analyzing recent messages
   */
  async extractKnowledgeFromConversation(senderNumber: string): Promise<KnowledgeExtractionResult[]> {
    if (!this.openaiService?.isConfigured()) {
      console.log('OpenAI service not available for knowledge extraction');
      return [];
    }

    try {
      const conversation = await this.conversationStorage.getConversation(senderNumber);
      if (!conversation || conversation.messages.length < 3) {
        return []; // Not enough conversation history
      }

      // Get recent messages (last 10 messages)
      const recentMessages = conversation.messages.slice(-10);
      const formattedHistory = this.formatConversationHistory(recentMessages);

      const systemPrompt = `You are a knowledge extraction assistant. Analyze the conversation history and identify valuable information that should be stored as knowledge for future reference.

RULES FOR KNOWLEDGE EXTRACTION:
1. Extract only factual, useful information that would be helpful to remember
2. Focus on: personal preferences, important dates, specific requests, unique insights, or valuable information shared
3. Avoid extracting: casual greetings, small talk, repetitive information, or temporary states
4. Each knowledge item should have a clear topic and concise value
5. Rate confidence from 0.1 to 1.0 based on how certain you are this is valuable knowledge

FORMAT: Return a JSON array of knowledge objects. Each object must have:
- topic: short, descriptive key (snake_case)
- value: concise summary of the information
- confidence: number between 0.1 and 1.0
- context: brief explanation of why this is valuable

EXAMPLE OUTPUT:
[
  {
    "topic": "user_coffee_preference",
    "value": "Prefers black coffee with no sugar",
    "confidence": 0.9,
    "context": "User mentioned this specifically when discussing morning routines"
  }
]

CONVERSATION HISTORY:
${formattedHistory}`;

      const response = await this.openaiService.generateTextResponse(
        'Extract valuable knowledge from this conversation history.',
        systemPrompt
      );

      return this.parseKnowledgeExtractionResponse(response);
    } catch (error) {
      console.error('Error extracting knowledge from conversation:', error);
      return [];
    }
  }

  /**
   * Format conversation history for analysis
   */
  private formatConversationHistory(messages: Message[]): string {
    return messages.map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      const role = msg.id.startsWith('response_') ? 'ASSISTANT' : 'USER';
      let content = msg.content;

      // Handle media messages
      if (msg.type === 'image') {
        content = '[Image message]';
      } else if (msg.type === 'audio') {
        content = '[Audio message]';
      }

      return `${timestamp} [${role}]: ${content}`;
    }).join('\n');
  }

  /**
   * Parse the AI response into structured knowledge objects
   */
  private parseKnowledgeExtractionResponse(response: string): KnowledgeExtractionResult[] {
    try {
      // Try to find JSON array in the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.map(item => ({
            topic: item.topic || '',
            value: item.value || '',
            confidence: Math.min(Math.max(item.confidence || 0.5, 0.1), 1.0),
            context: item.context || '',
            source: 'conversation_history' as const
          })).filter(item => item.topic && item.value);
        }
      }

      // Fallback: look for knowledge patterns in text
      const knowledgeItems: KnowledgeExtractionResult[] = [];
      const lines = response.split('\n');

      for (const line of lines) {
        if (line.toLowerCase().includes('topic:') && line.toLowerCase().includes('value:')) {
          const topicMatch = line.match(/topic:\s*([^\n,]+)/i);
          const valueMatch = line.match(/value:\s*([^\n,]+)/i);
          const confidenceMatch = line.match(/confidence:\s*([0-9.]+)/i);

          if (topicMatch && valueMatch) {
            knowledgeItems.push({
              topic: topicMatch[1].trim(),
              value: valueMatch[1].trim(),
              confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7,
              context: 'Extracted from conversation analysis',
              source: 'conversation_history'
            });
          }
        }
      }

      return knowledgeItems;
    } catch (error) {
      console.error('Error parsing knowledge extraction response:', error, response);
      return [];
    }
  }

  /**
   * Filter and validate extracted knowledge items
   */
  private filterKnowledgeItems(items: KnowledgeExtractionResult[]): KnowledgeExtractionResult[] {
    return items.filter(item =>
      item.confidence >= 0.5 && // Minimum confidence threshold
      item.topic.length > 0 &&
      item.value.length > 0 &&
      !item.topic.includes('http') && // Avoid URLs as topics
      !item.value.includes('<learn') // Avoid XML tags
    );
  }

  /**
   * Process and store extracted knowledge
   */
  async processAndStoreKnowledge(senderNumber: string, extractedKnowledge: KnowledgeExtractionResult[]): Promise<void> {
    const filteredKnowledge = this.filterKnowledgeItems(extractedKnowledge);

    if (filteredKnowledge.length === 0) {
      return;
    }

    try {
      const conversation = await this.conversationStorage.getConversation(senderNumber);
      if (!conversation) {
        return;
      }

      const existingKnowledge = conversation.userProfile.knowledge || {};
      const newKnowledge: typeof existingKnowledge = {};

      // Convert extracted knowledge to storage format
      for (const item of filteredKnowledge) {
        newKnowledge[item.topic] = {
          value: item.value,
          source: item.source,
          lastUpdated: new Date().toISOString()
        };
      }

      // Merge with existing knowledge
      const updatedKnowledge = { ...existingKnowledge, ...newKnowledge };

      await this.conversationStorage.updateUserProfile(senderNumber, {
        knowledge: updatedKnowledge
      });

      console.log(`🧠 Stored ${filteredKnowledge.length} knowledge items for user ${senderNumber}:`,
        filteredKnowledge.map(item => item.topic));
    } catch (error) {
      console.error('Error storing extracted knowledge:', error);
    }
  }

  /**
   * Main method to scan conversation and extract knowledge
   */
  async scanConversationForKnowledge(senderNumber: string): Promise<void> {
    if (!this.openaiService?.isConfigured()) {
      return;
    }

    try {
      console.log(`🧠 Scanning conversation history for user ${senderNumber} to extract knowledge...`);

      const extractedKnowledge = await this.extractKnowledgeFromConversation(senderNumber);

      if (extractedKnowledge.length > 0) {
        await this.processAndStoreKnowledge(senderNumber, extractedKnowledge);
        console.log(`✅ Successfully extracted and stored ${extractedKnowledge.length} knowledge items`);
      } else {
        console.log('ℹ️ No valuable knowledge found in conversation history');
      }
    } catch (error) {
      console.error('Error scanning conversation for knowledge:', error);
    }
  }
}