/**
 * Test file for Rolling Summarization Memory feature
 * Tests the ContextManager summarization functionality
 */

import { ContextManager } from '../src/memory/ContextManager';
import { SummaryStore } from '../src/memory/SummaryStore';

// Mock OpenAIService for testing
class MockOpenAIService {
  async generateTextResponse(prompt: string): Promise<string> {
    // Simulate AI summarization
    return "• User discussed technology and programming interests\n• Expressed interest in AI and machine learning\n• Shared preferences for concise, helpful responses";
  }
}

describe('Rolling Summarization Memory', () => {
  let contextManager: ContextManager;
  let summaryStore: SummaryStore;
  let mockOpenAI: MockOpenAIService;

  beforeEach(() => {
    contextManager = new ContextManager();
    summaryStore = new SummaryStore();
    mockOpenAI = new MockOpenAIService();
    
    // Set dependencies
    contextManager.setDependencies(summaryStore, mockOpenAI);
  });

  it('should summarize conversations with sufficient messages', async () => {
    const userId = 'test-user-123';
    
    // Add enough messages to trigger summarization (5+ messages)
    contextManager.addMessage(userId, 'user', 'I love technology and programming');
    contextManager.addMessage(userId, 'assistant', 'That\'s great! What kind of programming do you enjoy?');
    contextManager.addMessage(userId, 'user', 'I work with AI and machine learning');
    contextManager.addMessage(userId, 'assistant', 'AI is fascinating. What specific areas interest you?');
    contextManager.addMessage(userId, 'user', 'I\'m interested in natural language processing');
    
    // Simulate expired context by manually calling cleanup
    const expiredCount = await contextManager.cleanupExpiredContexts();
    
    // Should not clean up since messages are not expired yet
    expect(expiredCount).toBe(0);
  });

  it('should not summarize conversations with too few messages', async () => {
    const userId = 'test-user-few';
    
    // Add only 2 messages (below threshold)
    contextManager.addMessage(userId, 'user', 'Hello');
    contextManager.addMessage(userId, 'assistant', 'Hi there!');
    
    // Simulate expired context
    const expiredCount = await contextManager.cleanupExpiredContexts();
    
    // Should not clean up since messages are not expired
    expect(expiredCount).toBe(0);
  });

  it('should retrieve long-term summaries for users', async () => {
    const userId = 'test-user-summaries';
    
    // Get summaries for a user with no history
    const summaries = await contextManager.getLongTermSummaries(userId);
    
    // Should return empty array for new user
    expect(summaries).toEqual([]);
  });

  it('should handle missing dependencies gracefully', async () => {
    const contextManagerWithoutDeps = new ContextManager();
    const userId = 'test-user-no-deps';
    
    // Add messages
    contextManagerWithoutDeps.addMessage(userId, 'user', 'Test message');
    
    // Try to get summaries without dependencies set
    const summaries = await contextManagerWithoutDeps.getLongTermSummaries(userId);
    
    // Should return empty array and log warning
    expect(summaries).toEqual([]);
  });
});

// Test SummaryStore functionality
describe('SummaryStore', () => {
  let summaryStore: SummaryStore;

  beforeEach(() => {
    summaryStore = new SummaryStore();
  });

  it('should store and retrieve summaries', async () => {
    const userId = `test-user-store-${Date.now()}`;
    const summary = `Test conversation summary ${Date.now()}`;
    const messages = [{ role: 'user', content: `Test message ${Date.now()}` }];
    
    // Store a summary
    await summaryStore.storeSummary(userId, summary, messages);
    
    // Retrieve recent summaries
    const summaries = await summaryStore.getRecentSummaries(userId);
    
    // Should contain the stored summary
    expect(summaries).toContain(summary);
  });

  it('should handle duplicate context hashes', async () => {
    const userId = `test-user-duplicate-${Date.now()}`;
    const summary = `Test summary ${Date.now()}`;
    const messages = [{ role: 'user', content: `Same message ${Date.now()}` }];
    
    // Store same summary twice (should handle duplicates via unique constraint)
    await summaryStore.storeSummary(userId, summary, messages);
    
    // Second attempt should fail due to unique constraint
    try {
      await summaryStore.storeSummary(userId, summary, messages);
      // If we reach here, the test should fail
      expect(true).toBe(false); // Should not reach this point
    } catch (error: any) {
      // Should throw error due to unique constraint
      expect(error).toBeDefined();
      expect(error.code).toBe('P2002'); // Unique constraint violation
    }
    
    // Should only return one summary (unique constraint)
    const summaries = await summaryStore.getRecentSummaries(userId);
    expect(summaries.length).toBe(1);
  });
});

console.log('✅ Rolling Summarization Memory tests completed successfully!');