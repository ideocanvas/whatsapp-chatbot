./test/crypto.test.ts
---
import * as crypto from 'crypto';
import { CryptoUtils } from '../src/utils/crypto';

describe('Crypto Utils', () => {
  const appSecret = 'test-app-secret';
  const requestBody = '{"message": "Hello, World!"}';

  test('should verify valid signature correctly', () => {
    // Generate a valid signature
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(requestBody, 'utf8')
      .digest('hex');

    const signatureHeader = `sha256=${expectedSignature}`;
    const result = CryptoUtils.verifySignature(appSecret, requestBody, signatureHeader);

    expect(result).toBe(true);
  });

  test('should return false for missing signature header', () => {
    const result = CryptoUtils.verifySignature(appSecret, requestBody);
    expect(result).toBe(false);
  });

  test('should return false for invalid signature format', () => {
    const result = CryptoUtils.verifySignature(appSecret, requestBody, 'invalid-format');
    expect(result).toBe(false);
  });

  test('should return false for empty signature header', () => {
    const result = CryptoUtils.verifySignature(appSecret, requestBody, '');
    expect(result).toBe(false);
  });

  test('should return false for incorrect signature', () => {
    // Generate a valid signature but with different content
    const differentBody = '{"message": "Different content!"}';
    const incorrectSignature = crypto
      .createHmac('sha256', appSecret)
      .update(differentBody, 'utf8')
      .digest('hex');

    const signatureHeader = `sha256=${incorrectSignature}`;
    const result = CryptoUtils.verifySignature(appSecret, requestBody, signatureHeader);
    expect(result).toBe(false);
  });
});

---
./test/logger.test.ts
---
import { logger } from '../src/utils/logger';

describe('Logger Utility', () => {
  // Mock console.log to test logging
  const originalConsoleLog = console.log;
  const mockLog = jest.fn();

  beforeEach(() => {
    console.log = mockLog;
    jest.clearAllMocks();
    logger.clearLogs(); // Clear logs before each test
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  test('should log AI response messages', () => {
    logger.logAIResponse('Test AI response');
    expect(mockLog).toHaveBeenCalledWith('🤖 [AI_RESPONSE] Test AI response', '');
  });

  test('should log tool call messages', () => {
    logger.logToolCall('Test tool call');
    expect(mockLog).toHaveBeenCalledWith('🛠️ [TOOL_CALL] Test tool call', '');
  });

  test('should log search messages', () => {
    logger.logSearch('Test search');
    expect(mockLog).toHaveBeenCalledWith('🔍 [SEARCH] Test search', '');
  });

  test('should log error messages', () => {
    logger.logError('Test error');
    expect(mockLog).toHaveBeenCalledWith('❌ [ERROR] Test error', '');
  });

  test('should store logs internally', () => {
    logger.logAIResponse('Test message');
    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('ai_response');
    expect(logs[0].message).toBe('Test message');
  });

  test('should filter logs by type', () => {
    logger.logAIResponse('AI message');
    logger.logError('Error message');
    const errorLogs = logger.getLogs({ type: 'error' });
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0].type).toBe('error');
    expect(errorLogs[0].message).toBe('Error message');
  });
});

---
./test/rolling-summarization.test.ts
---
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

---
./test/integration/webScrapeIntegration.test.ts
---
import { WebScrapeService, createWebScrapeService, WebScrapeResult } from '../../src/services/webScrapeService';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Integration test configuration
const TEST_TIMEOUT = 60000; // 60 seconds for browser operations
const TEST_URLS = {
  // These are public test websites that are safe for scraping
  simple: 'https://example.com',
  contentRich: 'https://httpbin.org/html',
  invalid: 'https://invalid-url-that-does-not-exist.test'
};

describe('WebScrapeService Integration Tests', () => {
  let webScrapeService: WebScrapeService;

  beforeAll(async () => {
    // Create service with longer timeouts for integration tests
    webScrapeService = new WebScrapeService({
      timeout: 30000,
      navigationTimeout: 15000,
      maxRetries: 1,
      concurrency: 2,
      simulateHuman: false // Disable human simulation for faster tests
    });

    // Initialize the service
    await webScrapeService.initialize();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Clean up browser
    await webScrapeService.close();
  });

  describe('Basic URL Scraping', () => {
    it('should successfully scrape example.com', async () => {
      const result = await webScrapeService.scrapeUrl(TEST_URLS.simple);

      expect(result).toEqual({
        title: expect.any(String),
        url: TEST_URLS.simple,
        content: expect.any(String),
        extractedAt: expect.any(String),
        method: expect.stringMatching(/html|visual/) // Allow both methods
      });

      // Basic content validation
      expect(result.title).toBeTruthy();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.method).toMatch(/html|visual/); // Allow both methods

      console.log(`✅ Scraped ${TEST_URLS.simple}: ${result.title} (${result.content.length} chars)`);
    }, TEST_TIMEOUT);

    it('should scrape content-rich pages', async () => {
      const result = await webScrapeService.scrapeUrl(TEST_URLS.contentRich);

      expect(result).toEqual({
        title: expect.any(String),
        url: TEST_URLS.contentRich,
        content: expect.any(String),
        extractedAt: expect.any(String),
        method: 'html'
      });

      // Content-rich page should have more content
      expect(result.content.length).toBeGreaterThan(100);

      console.log(`✅ Scraped ${TEST_URLS.contentRich}: ${result.title} (${result.content.length} chars)`);
    }, TEST_TIMEOUT);

    it('should handle specific selector extraction', async () => {
      const result = await webScrapeService.scrapeUrl(TEST_URLS.contentRich, 'h1');

      expect(result).toEqual({
        title: expect.any(String),
        url: TEST_URLS.contentRich,
        content: expect.any(String),
        extractedAt: expect.any(String),
        method: expect.stringMatching(/html|visual/) // Allow both methods
      });

      // Selector-based extraction should work
      expect(result.content).toBeTruthy();

      console.log(`✅ Selector extraction: "${result.content.substring(0, 50)}..."`);
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle invalid URLs gracefully', async () => {
      await expect(webScrapeService.scrapeUrl(TEST_URLS.invalid))
        .rejects.toThrow();

      console.log(`✅ Properly handled invalid URL: ${TEST_URLS.invalid}`);
    }, TEST_TIMEOUT);

    it('should handle timeout scenarios', async () => {
      // Create a service with very short timeout
      const fastService = new WebScrapeService({
        navigationTimeout: 1000, // 1 second timeout
        maxRetries: 0
      });

      await fastService.initialize();

      // This should timeout quickly
      await expect(fastService.scrapeUrl('https://httpbin.org/delay/3')) // 3 second delay
        .rejects.toThrow();

      await fastService.close();

      console.log('✅ Properly handled timeout scenario');
    }, TEST_TIMEOUT);
  });

  describe('Concurrent Scraping', () => {
    it('should scrape multiple URLs concurrently', async () => {
      const urls = [
        TEST_URLS.simple,
        TEST_URLS.contentRich,
        'https://httpbin.org/json'
      ];

      const results = await webScrapeService.scrapeUrls(urls);

      expect(results).toHaveLength(3);
      expect(results.every(r => r !== null)).toBe(true);

      results.forEach((result, index) => {
        expect(result).toEqual({
          title: expect.any(String),
          url: urls[index],
          content: expect.any(String),
          extractedAt: expect.any(String),
          method: expect.stringMatching(/html|visual/) // Allow both methods
        });
      });

      console.log(`✅ Concurrent scraping completed: ${results.length} URLs`);
    }, TEST_TIMEOUT);

    it('should handle mixed success/failure in concurrent scraping', async () => {
      const urls = [
        TEST_URLS.simple,
        TEST_URLS.invalid, // This should fail
        TEST_URLS.contentRich
      ];

      const results = await webScrapeService.scrapeUrls(urls);

      // Should have 2 successful results (the invalid URL should be filtered out)
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.every(r => r !== null)).toBe(true);

      console.log(`✅ Mixed success/failure handled: ${results.length} successful out of ${urls.length}`);
    }, TEST_TIMEOUT);
  });

  describe('Service Lifecycle', () => {
    it('should initialize and close properly', async () => {
      const service = new WebScrapeService();

      // Should be able to initialize
      await expect(service.initialize()).resolves.not.toThrow();

      // Should be able to scrape after initialization
      const result = await service.scrapeUrl(TEST_URLS.simple);
      expect(result).toBeDefined();

      // Should be able to close
      await expect(service.close()).resolves.not.toThrow();

      console.log('✅ Service lifecycle test passed');
    }, TEST_TIMEOUT);

    it('should handle repeated initialization', async () => {
      await webScrapeService.initialize(); // Already initialized in beforeAll

      // Should still work after re-initialization
      const result = await webScrapeService.scrapeUrl(TEST_URLS.simple);
      expect(result).toBeDefined();

      console.log('✅ Repeated initialization handled');
    }, TEST_TIMEOUT);
  });

  describe('Result Formatting', () => {
    it('should format results correctly', async () => {
      const results = await webScrapeService.scrapeUrls([TEST_URLS.simple, TEST_URLS.contentRich]);

      const formatted = webScrapeService.formatScrapeResults(results);

      expect(formatted).toContain('Example Domain');
      // The content may vary depending on the actual page content
      expect(formatted).toContain('URL:');
      expect(formatted).toContain('Content:');
      expect(formatted).toMatch(/html|visual/);

      console.log('✅ Result formatting works correctly');
    }, TEST_TIMEOUT);

    it('should handle empty results formatting', () => {
      const formatted = webScrapeService.formatScrapeResults([]);
      expect(formatted).toBe('No content scraped.');

      console.log('✅ Empty results formatting handled');
    });
  });

  describe('Configuration', () => {
    it('should create service from environment variables', () => {
      // Temporarily set environment variables
      const originalTimeout = process.env.WEB_SCRAPE_TIMEOUT;
      const originalRetries = process.env.WEB_SCRAPE_MAX_RETRIES;
      const originalConcurrency = process.env.WEB_SCRAPE_CONCURRENCY;

      process.env.WEB_SCRAPE_TIMEOUT = '45000';
      process.env.WEB_SCRAPE_MAX_RETRIES = '2';
      process.env.WEB_SCRAPE_CONCURRENCY = '4';

      const service = createWebScrapeService();
      expect(service).toBeInstanceOf(WebScrapeService);

      // Restore environment variables
      if (originalTimeout) process.env.WEB_SCRAPE_TIMEOUT = originalTimeout;
      if (originalRetries) process.env.WEB_SCRAPE_MAX_RETRIES = originalRetries;
      if (originalConcurrency) process.env.WEB_SCRAPE_CONCURRENCY = originalConcurrency;

      console.log('✅ Factory function works correctly');
    });
  });
});

// Additional test for visual extraction (requires OpenAI configuration)
describe('WebScrapeService Visual Extraction (Conditional)', () => {
  let webScrapeService: WebScrapeService;

  beforeAll(async () => {
    webScrapeService = new WebScrapeService({
      timeout: 30000,
      navigationTimeout: 15000,
      maxRetries: 1
    });
    await webScrapeService.initialize();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await webScrapeService.close();
  });

  it('should handle sparse content scenarios', async () => {
    // Use a URL that returns minimal content (binary data endpoint)
    // The service should handle this gracefully
    try {
      const result = await webScrapeService.scrapeUrl('https://httpbin.org/bytes/10');

      // If it succeeds, verify the result structure
      if (result) {
        expect(result).toEqual({
          title: expect.any(String),
          url: 'https://httpbin.org/bytes/10',
          content: expect.any(String),
          extractedAt: expect.any(String),
          method: expect.stringMatching(/html|visual/)
        });
      }
    } catch (error) {
      // It's acceptable for this to fail - binary endpoints aren't meant for scraping
      console.log('✅ Binary endpoint properly rejected:', error instanceof Error ? error.message : String(error));
    }

    console.log('✅ Sparse content scenarios handled correctly');
  }, TEST_TIMEOUT);
});

---
./test/services/webScrapeService.test.ts
---
import { WebScrapeService, createWebScrapeService, WebScrapeResult } from '../../src/services/webScrapeService';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { OpenAIService } from '../../src/services/openaiService';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('playwright');
jest.mock('../../src/services/openaiService');
jest.mock('fs');
jest.mock('path');

const mockChromium = chromium as jest.Mocked<typeof chromium>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockOpenAIService = OpenAIService as jest.MockedClass<typeof OpenAIService>;

describe('WebScrapeService', () => {
  let webScrapeService: WebScrapeService;
  let mockBrowser: jest.Mocked<Browser>;
  let mockContext: jest.Mocked<BrowserContext>;
  let mockPage: jest.Mocked<Page>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock browser, context, and page
    mockBrowser = {
      newContext: jest.fn(),
      close: jest.fn(),
      isConnected: jest.fn().mockReturnValue(true),
    } as any;

    mockContext = {
      newPage: jest.fn(),
      close: jest.fn(),
      route: jest.fn(),
    } as any;

    mockPage = {
      goto: jest.fn(),
      title: jest.fn(),
      evaluate: jest.fn(),
      screenshot: jest.fn(),
      locator: jest.fn().mockReturnValue({
        first: jest.fn().mockReturnValue({
          isVisible: jest.fn(),
          click: jest.fn(),
        }),
      }),
      waitForTimeout: jest.fn(),
    } as any;

    // Setup mock implementations
    mockChromium.launch.mockResolvedValue(mockBrowser);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockContext.newPage.mockResolvedValue(mockPage);
    mockPage.goto.mockResolvedValue({} as any);
    mockPage.title.mockResolvedValue('Test Page');
    mockPage.evaluate.mockResolvedValue('Test content extracted from page');
    mockPage.screenshot.mockResolvedValue(Buffer.from('mock screenshot'));

    // Setup mock path operations
    mockPath.dirname.mockReturnValue('/mock/dir');
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.extname.mockReturnValue('.jpg');

    // Setup mock file system operations
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => '/mock/dir');
    mockFs.readFileSync.mockReturnValue(Buffer.from('mock file content'));
    mockFs.unlinkSync.mockImplementation(() => {});

    // Setup mock OpenAI service
    mockOpenAIService.prototype.isConfigured.mockReturnValue(true);
    mockOpenAIService.prototype.analyzeImage.mockResolvedValue('Analyzed image content');

    // Create service instance with minimal config
    webScrapeService = new WebScrapeService({
      timeout: 10000,
      maxRetries: 1,
      concurrency: 1,
    });
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const service = new WebScrapeService();

      expect(service).toBeInstanceOf(WebScrapeService);
    });

    it('should override default configuration with provided values', () => {
      const customConfig = {
        timeout: 30000,
        maxRetries: 3,
        concurrency: 5,
        simulateHuman: false,
      };

      const service = new WebScrapeService(customConfig);

      expect(service).toBeInstanceOf(WebScrapeService);
    });

    it('should initialize OpenAI service', () => {
      expect(mockOpenAIService).toHaveBeenCalled();
    });
  });

  describe('initialize', () => {
    it('should launch browser if not initialized', async () => {
      await webScrapeService.initialize();

      expect(mockChromium.launch).toHaveBeenCalledWith({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled'
        ]
      });
    });

    it('should not launch browser if already initialized', async () => {
      // First initialization
      await webScrapeService.initialize();

      // Reset mock to track second call
      mockChromium.launch.mockClear();

      // Second initialization should not launch browser again
      await webScrapeService.initialize();

      expect(mockChromium.launch).not.toHaveBeenCalled();
    });
  });

  describe('scrapeUrl', () => {
    it('should successfully scrape a URL', async () => {
      const url = 'https://example.com';
      const result = await webScrapeService.scrapeUrl(url);

      expect(result).toEqual({
        title: 'Test Page',
        url: url,
        content: 'Test content extracted from page',
        extractedAt: expect.any(String),
        method: 'html'
      });

      expect(mockPage.goto).toHaveBeenCalledWith(url, {
        timeout: 30000,
        waitUntil: 'domcontentloaded'
      });
    });

    it('should use custom selector when provided', async () => {
      const url = 'https://example.com';
      const selector = '.content';

      await webScrapeService.scrapeUrl(url, selector);

      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function), selector);
    });

    it('should handle navigation timeout errors', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));

      const url = 'https://example.com';

      await expect(webScrapeService.scrapeUrl(url)).rejects.toThrow('Navigation timeout');
    });

    it('should retry on network errors', async () => {
      // Mock first call to fail, second to succeed
      mockPage.goto
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({} as any);

      const url = 'https://example.com';

      const result = await webScrapeService.scrapeUrl(url);

      expect(result).toBeDefined();
      expect(mockPage.goto).toHaveBeenCalledTimes(2);
    });

    it('should switch to visual extraction when content is sparse', async () => {
      // Mock sparse content (less than 300 characters)
      mockPage.evaluate.mockResolvedValue('Short content');

      const url = 'https://example.com';
      const result = await webScrapeService.scrapeUrl(url);

      expect(result.method).toBe('visual');
      expect(mockOpenAIService.prototype.analyzeImage).toHaveBeenCalled();
    });
  });

  describe('scrapeUrls', () => {
    it('should scrape multiple URLs concurrently', async () => {
      const urls = [
        'https://example.com/1',
        'https://example.com/2',
        'https://example.com/3'
      ];

      const results = await webScrapeService.scrapeUrls(urls);

      expect(results).toHaveLength(3);
      expect(results.every(r => r !== null)).toBe(true);
    });

    it('should handle failed URLs gracefully', async () => {
      const urls = [
        'https://example.com/success',
        'https://example.com/fail',
        'https://example.com/success2'
      ];

      // Mock one URL to fail
      mockPage.goto
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({} as any);

      const results = await webScrapeService.scrapeUrls(urls);

      expect(results).toHaveLength(2); // Only successful results
      expect(results.every(r => r !== null)).toBe(true);
    });
  });

  describe('close', () => {
    it('should close browser when called', async () => {
      await webScrapeService.initialize();
      await webScrapeService.close();

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should not throw error if browser is not initialized', async () => {
      await expect(webScrapeService.close()).resolves.not.toThrow();
    });
  });

  describe('formatScrapeResults', () => {
    it('should format results correctly', () => {
      const results: WebScrapeResult[] = [
        {
          title: 'Test Page 1',
          url: 'https://example.com/1',
          content: 'Content 1',
          extractedAt: '2024-01-01T00:00:00Z',
          method: 'html'
        },
        {
          title: 'Test Page 2',
          url: 'https://example.com/2',
          content: 'Content 2',
          extractedAt: '2024-01-01T00:00:00Z',
          method: 'visual'
        }
      ];

      const formatted = webScrapeService.formatScrapeResults(results);

      expect(formatted).toContain('Test Page 1');
      expect(formatted).toContain('Test Page 2');
      expect(formatted).toContain('html');
      expect(formatted).toContain('visual');
    });

    it('should return message for empty results', () => {
      const formatted = webScrapeService.formatScrapeResults([]);

      expect(formatted).toBe('No content scraped.');
    });
  });

  describe('error handling', () => {
    it('should handle browser initialization failures', async () => {
      mockChromium.launch.mockRejectedValue(new Error('Browser failed to launch'));

      await expect(webScrapeService.scrapeUrl('https://example.com'))
        .rejects.toThrow('Browser not initialized');
    });

    it('should handle context creation failures', async () => {
      mockBrowser.newContext.mockRejectedValue(new Error('Context creation failed'));

      await expect(webScrapeService.scrapeUrl('https://example.com'))
        .rejects.toThrow('Context creation failed');
    });
  });
});

describe('createWebScrapeService', () => {
  it('should create service with environment variables', () => {
    // Mock environment variables
    process.env.WEB_SCRAPE_TIMEOUT = '60000';
    process.env.WEB_SCRAPE_MAX_RETRIES = '3';
    process.env.WEB_SCRAPE_CONCURRENCY = '5';

    const service = createWebScrapeService();

    expect(service).toBeInstanceOf(WebScrapeService);
  });

  it('should use defaults when environment variables are not set', () => {
    // Clear environment variables
    delete process.env.WEB_SCRAPE_TIMEOUT;
    delete process.env.WEB_SCRAPE_MAX_RETRIES;
    delete process.env.WEB_SCRAPE_CONCURRENCY;

    const service = createWebScrapeService();

    expect(service).toBeInstanceOf(WebScrapeService);
  });
});

---
./src/autonomous.ts
---
import 'dotenv/config';
import { Scheduler } from './core/Scheduler';
import { Agent } from './core/Agent';
import { ContextManager } from './memory/ContextManager';
import { SummaryStore } from './memory/SummaryStore';
import { ToolRegistry } from './core/ToolRegistry';
import { BrowserService } from './services/BrowserService';
import { ActionQueueService } from './services/ActionQueueService';
import { WhatsAppService } from './services/whatsappService';
import { MediaService } from './services/mediaService';
import { OpenAIService, createOpenAIServiceFromConfig } from './services/openaiService';
import { WebScrapeService, createWebScrapeService } from './services/webScrapeService';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from './services/googleSearchService';
import { WebSearchTool } from './tools/WebSearchTool';
import { RecallHistoryTool } from './tools/RecallHistoryTool';
import { ScrapeNewsTool } from './tools/ScrapeNewsTool';
import { DeepResearchTool } from './tools/DeepResearchTool'; // Import the new tool
import { NewsScrapeService, createNewsScrapeService } from './services/newsScrapeService';
import { NewsProcessorService } from './services/newsProcessorService';
import { DatabaseConfig } from './config/databaseConfig';
import type { KnowledgeDocument } from './memory/KnowledgeBasePostgres';

/**
 * Autonomous WhatsApp Agent Main Entry Point
 * 
 * This is the complete replacement for the reactive bot architecture.
 * Features autonomous browsing, proactive messaging, and intelligent memory management.
 */
class AutonomousWhatsAppAgent {
  private scheduler?: Scheduler;
  private agent?: Agent;
  private contextMgr?: ContextManager;
  private kb?: any; // KnowledgeBase or KnowledgeBasePostgres
  private tools?: ToolRegistry;
  private browser?: BrowserService;
  private actionQueue?: ActionQueueService;
  private whatsapp?: WhatsAppService;
  private mediaService?: MediaService; // Add MediaService
  private openai?: OpenAIService;
  private historyStore?: any; // HistoryStore or HistoryStorePostgres
  private vectorStore?: any; // VectorStoreService or VectorStoreServicePostgres
  private summaryStore?: SummaryStore;
  private isInitialized: boolean = false;

  constructor() {
    console.log('🚀 Initializing Autonomous WhatsApp Agent...');
  }

  /**
   * Initialize all components of the autonomous system
   */
  async initialize(): Promise<void> {
    try {
      // 1. Initialize Core Services
      this.openai = await createOpenAIServiceFromConfig();
      this.contextMgr = new ContextManager();
      this.summaryStore = new SummaryStore();
      
      // Initialize database services using configuration switcher
      await DatabaseConfig.initialize();
      this.kb = DatabaseConfig.getKnowledgeBase(this.openai);
      this.historyStore = DatabaseConfig.getHistoryStore();
      this.vectorStore = DatabaseConfig.getVectorStoreService(this.openai);
      this.actionQueue = new ActionQueueService();

      // Set dependencies for ContextManager (rolling summarization)
      this.contextMgr.setDependencies(this.summaryStore, this.openai);

      // WhatsApp configuration
      const whatsappConfig = {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
        apiVersion: 'v19.0'
      };

      this.whatsapp = new WhatsAppService(whatsappConfig, process.env.DEV_MODE === 'true');
      this.mediaService = new MediaService(whatsappConfig); // Initialize MediaService

      // CRITICAL FIX: Link ActionQueue to WhatsApp Service
      this.actionQueue.registerMessageSender(async (userId, content) => {
        return this.whatsapp!.sendMessage(userId, content);
      });

      // 2. Initialize Browser & News Services
      const scraper = createWebScrapeService();
      this.browser = new BrowserService(scraper, this.kb);
      
      // Initialize News Stack
      // Mock GoogleSearchService for processor if not available, or initialize properly
      const searchService = createGoogleSearchServiceFromEnv();
      const newsProcessor = new NewsProcessorService(this.openai, searchService, this.vectorStore);
      const newsService = createNewsScrapeService(scraper, newsProcessor);

      // 3. Initialize Tool Registry
      this.tools = new ToolRegistry();
      
      // Register Web Search
      if (searchService) {
        this.tools.registerTool(new WebSearchTool(searchService));
      }

      // Register NEW Tools
      this.tools.registerTool(new RecallHistoryTool(this.historyStore));
      this.tools.registerTool(new ScrapeNewsTool(newsService));
      
      // Register Deep Research Tool
      if (this.browser) {
          this.tools.registerTool(new DeepResearchTool(this.browser));
      }

      // 4. Initialize Agent
      this.agent = new Agent(this.openai, this.contextMgr, this.kb, this.tools, this.actionQueue);

      // 5. Initialize Scheduler
      this.scheduler = new Scheduler(
        this.browser,
        this.contextMgr,
        this.whatsapp,
        this.agent,
        this.actionQueue,
        this.kb
      );

      this.isInitialized = true;
      console.log('✅ Autonomous WhatsApp Agent Initialized Successfully');
      
      // Start background news service
      newsService.startBackgroundService(30);

    } catch (error) {
      console.error('❌ Failed to initialize Autonomous Agent:', error);
      throw error;
    }
  }

  /**
   * Initialize and register all tools
   */
  private async initializeTools(): Promise<void> {
    try {
      // Initialize Google Search Service if configured
      let searchService: GoogleSearchService | undefined;
      try {
        searchService = createGoogleSearchServiceFromEnv();
        console.log('✅ Google Search Service initialized');
      } catch (error) {
        console.log('⚠️ Google Search Service not configured (missing API keys)');
      }
      
      // Register Web Search Tool if available
      if (searchService) {
        const webSearchTool = new WebSearchTool(searchService);
        this.tools!.registerTool(webSearchTool);
        console.log('🔍 Web Search Tool registered');
      }
      
      console.log(`🛠️ Tool Registry: ${this.tools!.getAvailableTools().length} tools available`);
      
      if (this.tools!.getAvailableTools().length === 0) {
        console.log('⚠️ No tools available - agent will rely on knowledge base only');
      }
      
    } catch (error) {
      console.error('❌ Tool initialization failed:', error);
      console.log('⚠️ Continuing with knowledge base only');
    }
  }

  /**
   * Start the autonomous agent system
   */
  start(): void {
    if (!this.isInitialized || !this.scheduler) {
      throw new Error('Agent must be initialized before starting');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🤖 AUTONOMOUS WHATSAPP AGENT STARTING');
    console.log('='.repeat(60));

    // Start the scheduler (1-minute ticks)
    this.scheduler.start();

    console.log('📍 Scheduler: 1-minute autonomous tick cycle started');
    console.log('🌐 Browser: Autonomous surfing enabled');
    console.log('💬 Agent: Proactive messaging capabilities active');
    console.log('🧠 Memory: 3-tier memory system operational');
    console.log('📬 Queue: Rate-limited action queue running');

    if (process.env.DEV_MODE === 'true') {
      console.log('\n💡 DEVELOPMENT MODE: Messages will be logged to console');
      console.log('🚫 No messages will be sent to WhatsApp');
    }

    console.log('='.repeat(60) + '\n');
  }

  /**
   * Handle incoming WhatsApp messages (webhook integration)
   */
  async handleIncomingMessage(userId: string, message: string, messageId: string): Promise<void> {
    if (!this.isInitialized || !this.agent || !this.whatsapp) {
      throw new Error('Agent not initialized');
    }

    // 1. INTERRUPT BACKGROUND TASKS
    if (this.scheduler) {
        this.scheduler.interrupt();
    }

    console.log(`📱 Incoming message from ${userId}: ${message.substring(0, 50)}...`);

    try {
      // Process through the agent
      const response = await this.agent.handleUserMessage(userId, message);

      // Send response via WhatsApp (or log in dev mode)
      if (process.env.DEV_MODE === 'true') {
        console.log(`💬 Response to ${userId}: ${response}`);
      } else {
        await this.whatsapp.sendMessage(userId, response);
      }

      console.log(`✅ Message processed for ${userId}`);

    } catch (error) {
      console.error(`❌ Error processing message from ${userId}:`, error);
      
      // Fallback response
      const fallback = "Sorry, I encountered an issue. Please try again.";
      if (process.env.DEV_MODE !== 'true') {
        await this.whatsapp.sendMessage(userId, fallback);
      }
    }
  }

  /**
   * NEW: Handle incoming Image messages
   */
  async handleImageMessage(userId: string, imageId: string, mimeType: string, sha256: string, caption?: string): Promise<void> {
    if (!this.isInitialized || !this.agent || !this.whatsapp || !this.mediaService) {
      throw new Error('Agent not initialized');
    }

    // 1. INTERRUPT BACKGROUND TASKS
    if (this.scheduler) {
        this.scheduler.interrupt();
    }

    console.log(`🖼️ Incoming IMAGE from ${userId}`);

    try {
      // 1. Download Media
      const mediaInfo = await this.mediaService.downloadAndSaveMedia(imageId, mimeType, sha256, 'image');
      
      // 2. Analyze using Vision AI
      console.log(`👁️ Analyzing image: ${mediaInfo.filename}`);
      const analysis = await this.mediaService.analyzeImageWithOpenAI(mediaInfo.filepath);
      
      // 3. Construct Augmented Message for Agent
      // We present the image analysis as system context or augmented user message
      const augmentedMessage = `[USER SENT AN IMAGE]\n\nImage Analysis:\n${analysis}\n\n${caption ? `User Caption: "${caption}"` : 'No caption provided.'}`;
      
      console.log(`📝 Processing analyzed image as text context...`);
      
      // 4. Pass to standard agent handler
      const response = await this.agent.handleUserMessage(userId, augmentedMessage);

      if (process.env.DEV_MODE === 'true') {
        console.log(`💬 Response to ${userId}: ${response}`);
      } else {
        await this.whatsapp.sendMessage(userId, response);
      }

      console.log(`✅ Image processed for ${userId}`);

    } catch (error) {
      console.error(`❌ Error processing image from ${userId}:`, error);
      const fallback = "I received your image but had trouble analyzing it. Please try again.";
      if (process.env.DEV_MODE !== 'true') {
        await this.whatsapp.sendMessage(userId, fallback);
      }
    }
  }

  /**
   * Handle web interface messages (returns response instead of sending)
   */
  async handleWebMessage(userId: string, message: string): Promise<string> {
    if (!this.isInitialized || !this.agent) {
      throw new Error('Agent not initialized');
    }

    // 1. INTERRUPT BACKGROUND TASKS
    if (this.scheduler) {
        this.scheduler.interrupt();
    }

    console.log(`🌐 Web message from ${userId}: ${message.substring(0, 50)}...`);

    try {
      // Process through the agent but don't send via WhatsApp
      const response = await this.agent.handleUserMessage(userId, message);
      console.log(`✅ Web message processed for ${userId}`);
      return response;
    } catch (error) {
      console.error(`❌ Error processing web message from ${userId}:`, error);
      return "Sorry, I encountered an issue processing your message. Please try again.";
    }
  }

  /**
   * Get system status and statistics
   */
  async getStatus() {
    if (!this.isInitialized || !this.agent || !this.scheduler || !this.contextMgr || !this.kb || !this.browser || !this.actionQueue || !this.tools) {
      return { status: 'Not initialized' };
    }

    const dbStats = await DatabaseConfig.getDatabaseStats();

    return {
      status: 'Running',
      database: dbStats,
      agent: this.agent.getStats(),
      scheduler: this.scheduler.getStatus(),
      memory: {
        context: this.contextMgr.getStats(),
        knowledge: await (this.kb as any).getStats()
      },
      browser: this.browser.getStats(),
      queue: this.actionQueue.getQueueStats(),
      tools: {
        available: this.tools.getAvailableTools(),
        count: this.tools.getAvailableTools().length
      }
    };
  }

  /**
   * Get actual knowledge content for dashboard display
   */
  async getKnowledgeContent(limit: number = 10): Promise<Array<{id: string; title: string; content: string; source: string; category: string; timestamp: string}>> {
    if (!this.isInitialized || !this.kb) {
      return [];
    }
    
    try {
      const documents = await (this.kb as any).getRecentDocuments(limit);
      return documents.map((doc: any) => ({
        id: doc.id,
        title: `${doc.category} - ${doc.source}`,
        content: doc.content,
        source: doc.source,
        category: doc.category,
        timestamp: doc.timestamp
      }));
    } catch (error) {
      console.error('Error getting knowledge content:', error);
      return [];
    }
  }

  /**
   * Search knowledge content for dashboard
   */
  async searchKnowledgeContent(query: string, limit: number = 10): Promise<Array<{id: string; title: string; content: string; source: string; category: string; timestamp: string}>> {
    if (!this.isInitialized || !this.kb) {
      return [];
    }
    
    try {
      const documents = await (this.kb as any).searchContent(query, limit);
      return documents.map((doc: any) => ({
        id: doc.id,
        title: `${doc.category} - ${doc.source}`,
        content: doc.content,
        source: doc.source,
        category: doc.category,
        timestamp: doc.timestamp
      }));
    } catch (error) {
      console.error('Error searching knowledge content:', error);
      return [];
    }
  }

  /**
   * Stop the autonomous system
   */
  stop(): void {
    if (this.scheduler) {
      this.scheduler.stop();
    }
    console.log('🛑 Autonomous WhatsApp Agent Stopped');
  }

  /**
   * Log initial system statistics
   */
  private logInitialStats(): void {
    console.log('📊 Initial System Stats:');
    console.log('- Memory: 3-tier architecture (1h context, vector KB, SQL history)');
    console.log('- Browser: Autonomous surfing with 10 pages/hour limit');
    console.log('- Scheduler: 1-minute ticks with intelligent mode switching');
    console.log('- Agent: LLM orchestration with tool calling');
    console.log('- Queue: Rate-limited messaging with proactive cooldowns');
  }
}

// Singleton instance
let autonomousAgent: AutonomousWhatsAppAgent;

/**
 * Get or create the autonomous agent instance
 */
export function getAutonomousAgent(): AutonomousWhatsAppAgent {
  if (!autonomousAgent) {
    autonomousAgent = new AutonomousWhatsAppAgent();
  }
  return autonomousAgent;
}

/**
 * Initialize and start the autonomous agent
 */
export async function startAutonomousAgent(): Promise<AutonomousWhatsAppAgent> {
  const agent = getAutonomousAgent();
  await agent.initialize();
  agent.start();
  return agent;
}

// Export for testing and manual control
export { AutonomousWhatsAppAgent };

---
./src/dev-test.ts
---
#!/usr/bin/env node

import axios from 'axios';
import { Command } from 'commander';
import * as readline from 'readline';

interface SendOptions {
  port: string;
  from: string;
  image?: string;
  audio?: string;
  type?: 'text' | 'image' | 'audio';
}

const program = new Command();

program
  .name('dev-test')
  .description('CLI chat client for WhatsApp chatbot dev server')
  .version('1.0.0')
  .argument('[message]', 'Message to send (if not provided, enters interactive chat mode)')
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-f, --from <number>', 'Sender phone number', '1234567890')
  .option('-i, --image <path>', 'Path to image file for testing')
  .option('-a, --audio <path>', 'Path to audio file for testing')
  .option('-t, --type <type>', 'Message type: text, image, audio', 'text')
  .action(async (message: string | undefined, options: SendOptions) => {
    try {
      const port = options.port || process.env.PORT || '3000';
      const devApiUrl = `http://localhost:${port}/dev/message`;

      if (message || options.image || options.audio) {
        // Send single message from command line
        console.log(`📤 Sending message to ${devApiUrl}:`);

        let requestBody: any = {
          from: options.from
        };

        if (options.image) {
          console.log(`🖼️ Image file: ${options.image}`);
          console.log(`📋 Type: image`);
          requestBody.type = 'image';
          requestBody.imagePath = options.image;
          requestBody.message = 'Test image analysis';
        } else if (options.audio) {
          console.log(`🎤 Audio file: ${options.audio}`);
          console.log(`📋 Type: audio`);
          requestBody.type = 'audio';
          requestBody.audioPath = options.audio;
          requestBody.message = 'Test audio transcription';
        } else {
          console.log(`💬 "${message}"`);
          console.log(`📋 Type: text`);
          requestBody.message = message;
        }

        console.log(`📞 From: ${options.from}`);
        console.log(`🌐 Port: ${port}`);
        console.log('---');

        const response = await axios.post(devApiUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Dev-Test-CLI/1.0.0'
          }
        });

        console.log('✅ Message processed successfully!');
        console.log(`🤖 Response: ${response.data.response}`);
        console.log(`📋 Server status: ${response.status} ${response.statusText}`);
      } else {
        // Enter interactive chat mode
        console.log('💬 Interactive chat mode started');
        console.log(`📞 Sender: ${options.from}`);
        console.log(`🌐 Server: http://localhost:${port}`);
        console.log('📝 Type your messages (type "exit" or "quit" to end):');
        console.log('---');

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const chatLoop = async () => {
          rl.question('👤 You: ', async (userMessage: string) => {
            if (userMessage.toLowerCase() === 'exit' || userMessage.toLowerCase() === 'quit') {
              console.log('👋 Goodbye!');
              rl.close();
              return;
            }

            try {
              console.log('⏳ Thinking...');

              const response = await axios.post(devApiUrl, {
                message: userMessage,
                from: options.from
              }, {
                headers: {
                  'Content-Type': 'application/json',
                  'User-Agent': 'Dev-Test-CLI/1.0.0'
                }
              });

              console.log(`🤖 AI: ${response.data.response}`);
              console.log('---');

              // Continue the chat loop
              chatLoop();
            } catch (error: any) {
              console.error('❌ Error:', error.message);
              console.log('---');
              // Continue the chat loop even on error
              chatLoop();
            }
          });
        };

        // Start the chat loop
        chatLoop();
      }
    } catch (error: any) {
      if (error.response) {
        console.error('❌ Server error:', error.response.status, error.response.statusText);
        console.error('📋 Response data:', error.response.data);
      } else if (error.request) {
        console.error('❌ Network error: Could not connect to server');
        console.error('💡 Make sure the dev server is running on port', options.port);
      } else {
        console.error('❌ Error:', error.message);
      }
      process.exit(1);
    }
  });

program.parse();

---
./src/server.ts
---
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { startAutonomousAgent } from './autonomous';
import { DashboardRoutes } from './routes/dashboard';
import { WebhookRoutes } from './routes/webhook';
import { WhatsAppService } from './services/whatsappService';
import { MediaService } from './services/mediaService';

/**
 * Main server that integrates both autonomous agent and web dashboard
 */
class AutonomousServer {
  private app: express.Application;
  private port: number;
  private dashboardRoutes: DashboardRoutes;
  private webhookRoutes?: WebhookRoutes;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000');
    this.dashboardRoutes = new DashboardRoutes();
    
    this.setupMiddleware();
    // Note: setupRoutes() will be called after agent initialization in start() method
  }

  private setupMiddleware(): void {
    // Cookie parser middleware
    this.app.use(cookieParser());
    
    // JSON parsing middleware - CRITICAL FIX FOR SIGNATURE VERIFICATION
    // We must capture the raw buffer before JSON parsing happens
    this.app.use(express.json({
      limit: '10mb',
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      }
    }));
    
    // URL-encoded parsing middleware
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS middleware for web interface
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });
  }

  private setupRoutes(): void {
    // 1. Setup Webhook Routes FIRST (Priority over catch-all dashboard)
    const whatsappConfig = {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      apiVersion: 'v19.0'
    };
    
    if (whatsappConfig.accessToken && whatsappConfig.phoneNumberId) {
      const isDevMode = process.env.DEV_MODE === 'true';
      const whatsappService = new WhatsAppService(whatsappConfig, isDevMode);
      
      this.webhookRoutes = new WebhookRoutes(
        whatsappService,
        process.env.WHATSAPP_VERIFY_TOKEN || 'default-verify-token',
        process.env.WHATSAPP_APP_SECRET || '',
        whatsappConfig
      );
      
      // Mount at /webhook
      this.app.use('/webhook', this.webhookRoutes.getRouter());
      console.log(`✅ WhatsApp webhook routes enabled`);
    }

    // 2. Setup Dashboard Routes (Web Interface) - Acts as catch-all for '/'
    this.app.use('/', this.dashboardRoutes.getRouter());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        mode: process.env.DEV_MODE === 'true' ? 'development' : 'production'
      });
    });

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Autonomous WhatsApp Agent',
        version: '1.0.0',
        endpoints: {
          dashboard: '/',
          status: '/api/status',
          chat: '/api/chat',
          activity: '/api/activity',
          memory: '/api/memory/{context|knowledge|history}',
          health: '/health'
        }
      });
    });
  }

  /**
   * Start the server and autonomous agent
   */
  async start(): Promise<void> {
    try {
      console.log('🚀 Starting Autonomous WhatsApp Agent Server...');
      
      // Start the autonomous agent first
      await startAutonomousAgent();
      
      // Now set up routes after agent is initialized
      this.setupRoutes();
      
      // Determine host based on environment variable or fallback to 0.0.0.0 for external access
      const host = process.env.HOST || '0.0.0.0';
      
      // Start the HTTP server
      this.app.listen(this.port, host, () => {
        console.log('\n' + '='.repeat(60));
        console.log('🤖 AUTONOMOUS SERVER STARTED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log(`📍 Server Host: ${host}`);
        console.log(`📍 Server Port: ${this.port}`);
        
        // Show appropriate URLs based on host binding
        if (host === '0.0.0.0') {
          console.log(`🌐 Web Dashboard: http://localhost:${this.port} (local)`);
          console.log(`🌐 Web Dashboard: http://[your-ip]:${this.port} (network)`);
        } else {
          console.log(`🌐 Web Dashboard: http://localhost:${this.port}`);
        }
        
        if (process.env.DEV_MODE === 'true') {
          console.log('\n💡 DEVELOPMENT MODE ACTIVATED');
          console.log('📱 Messages will be logged to console');
          console.log('🚫 No messages will be sent to WhatsApp');
        } else {
          console.log('\n⚡ PRODUCTION MODE');
          console.log('📱 Messages will be sent to WhatsApp');
        }
        
        if (this.webhookRoutes) {
          if (host === '0.0.0.0') {
            console.log(`🔗 Webhook URL: http://[your-ip]:${this.port}/webhook`);
          } else {
            console.log(`🔗 Webhook URL: http://localhost:${this.port}/webhook`);
          }
        }
        
        console.log(`❤️  Health Check: http://localhost:${this.port}/health`);
        console.log('='.repeat(60) + '\n');
      });

    } catch (error) {
      console.error('❌ Failed to start autonomous server:', error);
      process.exit(1);
    }
  }

  /**
   * Stop the server
   */
  stop(): void {
    console.log('🛑 Stopping autonomous server...');
    process.exit(0);
  }
}

// Export for testing and manual control
export { AutonomousServer };

// Start the server if this file is executed directly
if (require.main === module) {
  const server = new AutonomousServer();
  server.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', () => server.stop());
  process.on('SIGTERM', () => server.stop());
}

---
./src/test-autonomous.ts
---
import { startAutonomousAgent, getAutonomousAgent } from './autonomous';

/**
 * Test script for the Autonomous WhatsApp Agent
 * This demonstrates the core functionality without requiring WhatsApp integration
 */
async function testAutonomousAgent() {
  console.log('🧪 Testing Autonomous WhatsApp Agent Architecture...\n');

  try {
    // 1. Start the autonomous agent
    console.log('1. Starting autonomous agent...');
    const agent = await startAutonomousAgent();
    
    // Small delay to let the system initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 2. Check system status
    console.log('\n2. Checking system status...');
    const status = await agent.getStatus();
    console.log('System Status:', {
      status: status.status,
      memory: {
        activeUsers: status.memory?.context?.activeUsers || 0,
        knowledgeDocuments: status.memory?.knowledge?.totalDocuments || 0
      },
      tools: status.tools?.count || 0,
      browser: status.browser?.favoritesCount || 0
    });

    // 3. Test incoming message handling
    console.log('\n3. Testing message processing...');
    const testUserId = 'test-user-123';
    const testMessage = 'Hello! Can you tell me about the latest tech news?';
    
    await agent.handleIncomingMessage(testUserId, testMessage, 'test-message-1');
    
    // 4. Test another message to build context
    console.log('\n4. Testing context building...');
    await agent.handleIncomingMessage(testUserId, 'What about AI developments?', 'test-message-2');

    // 5. Check if user interests were discovered
    console.log('\n5. Checking user interest discovery...');
    const statusAfterMessages = await agent.getStatus();
    console.log('After messages - User should have discovered interests');

    // 6. Wait for autonomous browsing to occur
    console.log('\n6. Waiting for autonomous browsing session...');
    console.log('The scheduler will automatically start browsing in idle mode');
    console.log('This may take a few minutes depending on the tick cycle...');

    // 7. Demonstrate proactive messaging potential
    console.log('\n7. Proactive messaging capabilities:');
    console.log('- The system will automatically browse for knowledge');
    console.log('- User interests are auto-discovered from conversations');
    console.log('- When relevant content is found, proactive messages are queued');
    console.log('- Rate limiting prevents spam (15-minute cooldown per user)');

    // 8. Show system architecture
    console.log('\n8. System Architecture Summary:');
    console.log('✅ 3-Tier Memory: ContextManager (1h) + KnowledgeBase (vector) + HistoryStore (SQL)');
    console.log('✅ Autonomous Browser: 10 pages/hour limit with intelligent URL selection');
    console.log('✅ Scheduler: 1-minute ticks with idle/proactive mode switching');
    console.log('✅ Agent: LLM orchestration with tool calling and mobile optimization');
    console.log('✅ Action Queue: Rate-limited messaging with exponential backoff');
    console.log('✅ Interest Discovery: Auto-extracts user interests from conversations');

    // 9. Keep the test running to observe autonomous behavior
    console.log('\n9. Test will continue running to observe autonomous behavior...');
    console.log('Press Ctrl+C to stop the test');
    console.log('You should see browsing sessions and potential proactive checks in the logs');

    // Keep the process alive to observe autonomous behavior
    setInterval(async () => {
      const currentStatus = await agent.getStatus();
      if (currentStatus.status === 'Running') {
        console.log(`⏰ System running - Ticks: ${currentStatus.scheduler?.tickCount || 0}`);
      }
    }, 30000); // Log every 30 seconds

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testAutonomousAgent().catch(console.error);
}

export { testAutonomousAgent };

---
./src/core/Agent.ts
---
import { OpenAIService } from '../services/openaiService';
import { ContextManager } from '../memory/ContextManager';
import { ToolRegistry } from './ToolRegistry';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { ActionQueueService } from '../services/ActionQueueService';

/**
 * The Brain of the autonomous agent system.
 * Orchestrates LLM interactions, tool calling, and decision-making.
 */
export class Agent {
  private chatbotName: string;

  constructor(
    private openai: OpenAIService,
    private contextMgr: ContextManager,
    private kb: KnowledgeBasePostgres,
    private tools: ToolRegistry,
    private actionQueue: ActionQueueService
  ) {
    this.chatbotName = process.env.CHATBOT_NAME || 'Lucy';
  }

  /**
   * Main entry point for User Messages (reactive mode)
   */
  async handleUserMessage(userId: string, message: string): Promise<string> {
    // 1. Add to Short-term context
    this.contextMgr.addMessage(userId, 'user', message);

    // 2. Check if we need RAG (Knowledge Base)
    let systemContext = await this.getSystemPrompt(userId);
    
    // Retrieve relevant facts from Long-term memory
    const relevantFacts = await this.kb.search(message);
    if (relevantFacts && !relevantFacts.includes('No relevant knowledge')) {
      systemContext += `\n\n🧠 Relevant Knowledge:\n${relevantFacts}`;
    }

    // 3. Build Tool definitions
    const toolDefs = this.tools.getOpenAITools();

    // 4. Generate Response (with Tool Calling loop)
    const history = this.contextMgr.getHistory(userId);
    
    const response = await this.generateResponseWithContext({
      systemPrompt: systemContext,
      history: history,
      tools: toolDefs,
      userMessage: message,
      toolRegistry: this.tools
    });

    // 5. Save and Return (with mobile optimization)
    this.contextMgr.addMessage(userId, 'assistant', response);
    return this.optimizeForMobile(response);
  }

  /**
   * Entry point for Autonomous Thoughts (proactive mode)
   */
  async generateProactiveMessage(userId: string, discoveredContent: string): Promise<string | null> {
    // Check if we should bother the user (cooldown and relevance)
    if (!this.actionQueue.canSendProactiveMessage(userId)) {
      console.log(`⏰ Proactive message cooldown active for ${userId}`);
      return null;
    }

    const userInterests = this.contextMgr.getUserInterests(userId);
    const history = this.contextMgr.getHistory(userId).slice(-3); // Last 3 messages

    // Ask LLM if we should share this discovery
    const prompt = `
You discovered this interesting content: "${discoveredContent}"

Based on the user's conversation history and interests, decide if you should share this:
- User interests: ${userInterests.join(', ') || 'Not yet discovered'}
- Recent conversation: ${JSON.stringify(history)}

Decision guidelines:
✅ Share if: Content matches user interests, it's genuinely interesting, and it's been >15 mins since last message
❌ Skip if: Content doesn't match interests, it's trivial, or user was recently active

If you decide to share, write a short, natural WhatsApp message (under 30 words).
If you decide to skip, reply exactly with: SKIP

Your decision:`;

    const decision = await this.openai.generateTextResponse(prompt);
    
    if (decision.trim().toUpperCase() === 'SKIP') {
      console.log(`🤖 Decision: Skip proactive message to ${userId}`);
      return null;
    }

    console.log(`🤖 Decision: Send proactive message to ${userId}`);
    return this.optimizeForMobile(decision);
  }

  /**
   * Generate response with full context and tool calling
   */
  private async generateResponseWithContext(options: {
    systemPrompt: string;
    history: any[];
    tools: any[];
    userMessage: string;
    toolRegistry?: ToolRegistry;
  }): Promise<string> {
    const messages: any[] = [
      {
        role: 'system',
        content: options.systemPrompt
      },
      ...options.history.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: options.userMessage
      }
    ];

    try {
      const response = await this.openai.generateResponseWithTools(messages, options.tools, 10, options.toolRegistry);
      return response;
    } catch (error) {
      console.error('❌ Agent response generation failed:', error);
      
      // Fallback response
      return `I encountered an issue processing your message. ${this.getFallbackResponse(options.userMessage)}`;
    }
  }

  /**
   * Get system prompt with mobile optimization and long-term context
   */
  private async getSystemPrompt(userId: string): Promise<string> {
    let systemPrompt = `You are ${this.chatbotName}, a witty, concise WhatsApp assistant.

**CRITICAL RESPONSE GUIDELINES:**
1. **Mobile Optimization**: Responses MUST be under 50 words unless specifically requested. Use natural spacing.
2. **No Markdown**: Never use code blocks, markdown, or complex formatting.
3. **Personality**: Be warm, use emojis naturally 🌟, avoid robotic phrases.
4. **Tool Usage**: Use available tools when you need current information or specific actions.
5. **Context Awareness**: Reference recent conversation naturally when relevant.

**TOOL SELECTION PRIORITY:**
1. Check 'recall_history' first if the user refers to the past.
2. Use 'search_knowledge' for general facts you might have learned.
3. Use 'web_search' for quick lookups of current information.
4. **IMPORTANT**: If 'search_knowledge' and 'web_search' yield no results, YOU MUST use 'deep_research' to find the answer. Do not give up without trying deep research.

**CRITICAL: When using 'deep_research', you MUST first respond to the user with a natural message like "Let me research that for you" or "I'll search for more information about that" BEFORE calling the tool. This ensures the user knows you're working on their request.**

**Current Time**: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}`;

    // Add long-term conversation summaries if available
    const longTermSummaries = await this.contextMgr.getLongTermSummaries(userId);
    if (longTermSummaries.length > 0) {
      systemPrompt += `\n\n📚 **Previous Conversation Context:**\n${longTermSummaries.join('\n\n')}`;
    }

    systemPrompt += `\n\nAlways prioritize being helpful while respecting the mobile format constraints.`;

    return systemPrompt;
  }

  /**
   * Optimize response for WhatsApp mobile interface
   */
  private optimizeForMobile(response: string): string {
    // Remove markdown blocks
    let optimized = response.replace(/```[\s\S]*?```/g, '');
    optimized = optimized.replace(/`[^`]*`/g, match => match.replace(/`/g, ''));
    
    // Limit to 50 words if too long
    const words = optimized.split(/\s+/);
    if (words.length > 50) {
      optimized = words.slice(0, 50).join(' ') + '...';
    }
    
    // Ensure proper spacing for mobile readability
    optimized = optimized.replace(/\n{3,}/g, '\n\n');
    
    return optimized.trim();
  }

  /**
   * Get fallback response when AI fails
   */
  private getFallbackResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return 'Hello! 👋 How can I help you today?';
    }
    if (lowerMessage.includes('help')) {
      return 'I can help with questions, search information, or just chat! What would you like to know?';
    }
    if (lowerMessage.includes('time')) {
      return `The current time is: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Hong_Kong' })}`;
    }
    
    return 'Please try asking your question again or rephrase it.';
  }

  /**
   * Check if content is relevant to user interests for proactive messaging
   */
  isContentRelevantToUser(userId: string, content: string): boolean {
    const userInterests = this.contextMgr.getUserInterests(userId);
    if (userInterests.length === 0) return false;

    const lowerContent = content.toLowerCase();
    
    return userInterests.some(interest => 
      lowerContent.includes(interest.toLowerCase()) ||
      this.calculateRelevanceScore(interest, content) > 0.3
    );
  }

  /**
   * Calculate relevance score between interest and content
   */
  private calculateRelevanceScore(interest: string, content: string): number {
    const interestWords = interest.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);
    
    let matches = 0;
    interestWords.forEach(word => {
      if (contentWords.some(contentWord => contentWord.includes(word) || word.includes(contentWord))) {
        matches++;
      }
    });
    
    return matches / Math.max(interestWords.length, 1);
  }

  /**
   * Get agent statistics
   */
  getStats() {
    return {
      chatbotName: this.chatbotName,
      contextStats: this.contextMgr.getStats(),
      knowledgeStats: this.kb.getStats(),
      availableTools: this.tools.getAvailableTools().length
    };
  }
}

---
./src/core/BaseTool.ts
---
import { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Abstract base class for all tools in the autonomous agent system.
 * Provides a strict contract for tool creation and OpenAI function calling.
 */
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, any>;

  abstract execute(args: any, context?: any): Promise<string>;

  /**
   * Convert tool definition to OpenAI function calling schema
   */
  toOpenAISchema(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

---
./src/core/Scheduler.ts
---
import { BrowserService } from '../services/BrowserService';
import { ContextManager } from '../memory/ContextManager';
import { WhatsAppService } from '../services/whatsappService';
import { Agent } from './Agent';
import { ActionQueueService } from '../services/ActionQueueService';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';

/**
 * The Heartbeat of the autonomous agent system.
 * Manages the 1-minute tick cycle for idle browsing and proactive messaging.
 */
export class Scheduler {
  private isRunning: boolean = false;
  private tickCount: number = 0;
  private stats = {
    browsingSessions: 0,
    proactiveChecks: 0,
    messagesSent: 0,
    knowledgeLearned: 0,
    lastTick: new Date()
  };

  constructor(
    private browser: BrowserService,
    private contextMgr: ContextManager,
    private whatsapp: WhatsAppService,
    private agent: Agent,
    private actionQueue: ActionQueueService,
    private kb: KnowledgeBasePostgres
  ) {}

  /**
   * Start the scheduler with 1-minute ticks
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.log('🕰️ Autonomous Agent Scheduler Started (1-minute ticks)');

    // Initial tick immediately
    this.tick();

    // Set up periodic ticking
    setInterval(() => this.tick(), 60 * 1000); // 1 minute

    // Set up periodic maintenance
    setInterval(() => {
      this.maintenance().catch(error => {
        console.error('❌ Maintenance error:', error);
      });
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.isRunning = false;
    console.log('🛑 Autonomous Agent Scheduler Stopped');
  }

  /**
   * Interrupt current background tasks (Browsing)
   */
  interrupt(): void {
    if (this.isRunning) {
      console.log('🚦 Scheduler interrupting background tasks...');
      this.browser.stopBrowsing();
    }
  }

  /**
   * Main tick function - decides between idle browsing and proactive messaging
   */
  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    this.tickCount++;
    this.stats.lastTick = new Date();

    try {
      // 1. Get STRICTLY active users (last contact < 1 hour)
      const activeUsers = this.contextMgr.getActiveUsers();
      console.log(`⏰ Tick #${this.tickCount} - Active users: ${activeUsers.length}`);

      // 2. IDLE MODE: Browse if not too busy or just random
      if (this.shouldBrowse(activeUsers.length)) {
          // Pass a user interest as intent if a user is active!
          let browseIntent = undefined;
          if (activeUsers.length > 0) {
              const randomUser = activeUsers[Math.floor(Math.random() * activeUsers.length)];
              const interests = this.contextMgr.getUserInterests(randomUser);
              if (interests.length > 0) {
                  browseIntent = interests[Math.floor(Math.random() * interests.length)];
                  console.log(`🎯 Browsing targeted for active user ${randomUser}: ${browseIntent}`);
              }
          }
          await this.idleMode(browseIntent);
      }

      // 3. PROACTIVE MODE: Only for Active Users
      if (activeUsers.length > 0) {
        await this.proactiveMode(activeUsers);
      }

      this.logTickStats();

    } catch (error) {
      console.error('❌ Scheduler tick error:', error);
    }
  }

  private async idleMode(intent?: string): Promise<void> {
    console.log('🌐 Entering Idle Mode: Autonomous Browsing');
    this.stats.browsingSessions++;
    
    // Surf with intent if provided, otherwise generic
    const result = await this.browser.surf(intent);
    this.stats.knowledgeLearned += result.knowledgeGained;
  }

  private async proactiveMode(activeUsers: string[]): Promise<void> {
    console.log(`💬 Proactive Mode: Checking ${activeUsers.length} active users`);

    for (const userId of activeUsers) {
      // Check strict cooldown (e.g., don't message twice in 15 mins)
      if (!this.actionQueue.canSendProactiveMessage(userId)) continue;

      // Find knowledge specifically learned RECENTLY (last 1 hour) that matches interests
      const relevantContent = await this.findFreshRelevantContent(userId);
      
      if (relevantContent) {
          const message = await this.agent.generateProactiveMessage(userId, relevantContent);
          if (message) {
              this.actionQueue.queueMessage(userId, message, { isProactive: true, priority: 8 });
              this.stats.messagesSent++;
          }
      }
    }
  }


  /**
   * Find content learned in the last hour that matches user interests
   */
  private async findFreshRelevantContent(userId: string): Promise<string | null> {
      const interests = this.contextMgr.getUserInterests(userId);
      if (interests.length === 0) return null;

      // We need a way to search specifically for *recent* docs in KB matching tags
      // This uses a specific search logic on the KB
      for (const interest of interests) {
          // This relies on the KnowledgeBase having a method to find *fresh* content by tag/query
          // We can use the existing search but filter the string results or add a new method to KB
          // For now, using standard search but looking for the "🆕" indicator added by KB
          const knowledge = await this.kb.search(interest, 1);
          if (knowledge && knowledge.includes('🆕')) {
              return knowledge; // Found something fresh
          }
      }
      return null;
  }

  /**
   * Map user interest to knowledge base category
   */
  private mapInterestToCategory(interest: string): string {
    const lowerInterest = interest.toLowerCase();
    
    if (lowerInterest.includes('tech') || lowerInterest.includes('programming')) return 'tech';
    if (lowerInterest.includes('business') || lowerInterest.includes('finance')) return 'business';
    if (lowerInterest.includes('sports') || lowerInterest.includes('game')) return 'sports';
    if (lowerInterest.includes('news') || lowerInterest.includes('current')) return 'news';
    
    return 'general';
  }


  private shouldBrowse(activeUserCount: number): boolean {
    return true; // Always try to browse if browser limit allows
  }

  private shouldCheckProactive(activeUserCount: number): boolean {
    return activeUserCount > 0;
  }

  /**
   * Periodic maintenance tasks
   */
  private async maintenance(): Promise<void> {
    console.log('🧹 Running maintenance tasks');
    
    // Clean up expired contexts (now async with summarization)
    const expiredCount = await this.contextMgr.cleanupExpiredContexts();
    
    // Clean up old knowledge
    const oldKnowledgeCount = await this.kb.cleanupOldKnowledge(30); // 30 days
    
    if (expiredCount > 0 || oldKnowledgeCount > 0) {
      console.log(`📊 Maintenance: ${expiredCount} expired contexts, ${oldKnowledgeCount} old knowledge documents`);
    }
  }

  /**
   * Log tick statistics
   */
  private logTickStats(): void {
    if (this.tickCount % 10 === 0) { // Every 10 ticks
      console.log('📊 Scheduler Statistics:', {
        ticks: this.tickCount,
        browsingSessions: this.stats.browsingSessions,
        proactiveChecks: this.stats.proactiveChecks,
        messagesSent: this.stats.messagesSent,
        knowledgeLearned: this.stats.knowledgeLearned,
        queueStats: this.actionQueue.getQueueStats(),
        browserStats: this.browser.getStats()
      });
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      tickCount: this.tickCount,
      stats: this.stats,
      lastTick: this.stats.lastTick
    };
  }
}

---
./src/core/ToolRegistry.ts
---
import { BaseTool } from './BaseTool';
import { ChatCompletionTool } from 'openai/resources/chat/completions';

/**
 * Dynamic tool management system for the autonomous agent.
 * Allows easy addition of new tools without changing core logic.
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  /**
   * Register a new tool with the registry
   */
  registerTool(tool: BaseTool): void {
    this.tools.set(tool.name, tool);
    console.log(`🛠️ Tool registered: ${tool.name} - ${tool.description}`);
  }

  /**
   * Register multiple tools at once
   */
  registerTools(tools: BaseTool[]): void {
    tools.forEach(tool => this.registerTool(tool));
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Execute a tool with the given arguments
   */
  async executeTool(name: string, args: any, context?: any): Promise<string> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    console.log(`🔧 Executing tool: ${name}`, { args, context });

    try {
      const result = await tool.execute(args, context);
      console.log(`✅ Tool execution completed: ${name}`);
      return result;
    } catch (error) {
      console.error(`❌ Tool execution failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Get all tools as OpenAI function schemas
   */
  getOpenAITools(): ChatCompletionTool[] {
    return Array.from(this.tools.values()).map(tool => tool.toOpenAISchema());
  }

  /**
   * Get all available tool names
   */
  getAvailableTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Remove a tool from the registry
   */
  unregisterTool(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      console.log(`🗑️ Tool unregistered: ${name}`);
    }
    return existed;
  }
}

---
./src/memory/ContextManager.ts
---
/**
 * Short-term memory manager with 1-hour TTL for active conversations.
 * Stores the last hour of conversation verbatim for immediate context.
 * Implements rolling summarization to archive expired conversations.
 */
interface ConversationContext {
  userId: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: number }>;
  lastInteraction: number;
  userInterests?: string[]; // Auto-discovered user interests for proactive messaging
}

export class ContextManager {
  private activeContexts: Map<string, ConversationContext> = new Map();
  private readonly TTL_MS = 60 * 60 * 1000; // 1 Hour
  private summaryStore?: any; // SummaryStore instance
  private openai?: any; // OpenAIService instance

  /**
   * Set dependencies for summarization functionality
   */
  setDependencies(summaryStore: any, openai: any) {
    this.summaryStore = summaryStore;
    this.openai = openai;
  }

  /**
   * Get conversation history for a user (filtered by TTL)
   */
  getHistory(userId: string): any[] {
    const ctx = this.activeContexts.get(userId);
    if (!ctx) return [];
    
    // Filter out expired messages
    const now = Date.now();
    ctx.messages = ctx.messages.filter(m => (now - m.timestamp) < this.TTL_MS);
    
    return ctx.messages.map(({ role, content }) => ({ role, content }));
  }

  /**
   * Add a message to the conversation context
   */
  addMessage(userId: string, role: 'user' | 'assistant', content: string) {
    if (!this.activeContexts.has(userId)) {
      this.activeContexts.set(userId, { 
        userId, 
        messages: [], 
        lastInteraction: Date.now(),
        userInterests: []
      });
    }
    const ctx = this.activeContexts.get(userId)!;
    ctx.messages.push({ role, content, timestamp: Date.now() });
    ctx.lastInteraction = Date.now();
    
    // Auto-discover user interests from message content
    this.updateUserInterests(userId, content);
  }

  /**
   * Get active users (those with interactions within the TTL window)
   */
  getActiveUsers(): string[] {
    const now = Date.now();
    return Array.from(this.activeContexts.values())
      .filter(ctx => (now - ctx.lastInteraction) < this.TTL_MS)
      .map(ctx => ctx.userId);
  }

  /**
   * Get user interests for proactive messaging
   */
  getUserInterests(userId: string): string[] {
    const ctx = this.activeContexts.get(userId);
    return ctx?.userInterests || [];
  }

  /**
   * Update user interests based on message content
   */
  private updateUserInterests(userId: string, content: string) {
    const ctx = this.activeContexts.get(userId);
    if (!ctx) return;

    // Extract potential interests from message content
    const interests = this.extractInterests(content);
    
    // Add new interests, avoiding duplicates
    interests.forEach(interest => {
      if (!ctx.userInterests!.includes(interest)) {
        ctx.userInterests!.push(interest);
      }
    });

    // Keep only the most recent 10 interests
    if (ctx.userInterests!.length > 10) {
      ctx.userInterests = ctx.userInterests!.slice(-10);
    }
  }

  /**
   * Extract potential interests from message content
   */
  private extractInterests(content: string): string[] {
    const interests: string[] = [];
    const lowerContent = content.toLowerCase();

    // Common interest patterns
    const interestPatterns = [
      /(tech|technology|programming|coding|ai|artificial intelligence|machine learning)/gi,
      /(business|finance|stock|market|economy|investment)/gi,
      /(sports|football|basketball|tennis|soccer|game)/gi,
      /(news|current events|headlines|breaking)/gi,
      /(travel|vacation|holiday|destination)/gi,
      /(food|cooking|recipe|restaurant|cuisine)/gi,
      /(music|song|artist|album|concert)/gi,
      /(movie|film|cinema|actor|director)/gi,
      /(gaming|video game|console|pc gaming)/gi,
      /(health|fitness|exercise|wellness|diet)/gi
    ];

    interestPatterns.forEach(pattern => {
      const matches = lowerContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const interest = match.toLowerCase();
          if (!interests.includes(interest)) {
            interests.push(interest);
          }
        });
      }
    });

    return interests;
  }

  /**
   * Check if a user is interested in a specific topic
   */
  isUserInterestedIn(userId: string, topic: string): boolean {
    const interests = this.getUserInterests(userId);
    const lowerTopic = topic.toLowerCase();
    
    return interests.some(interest => 
      interest.toLowerCase().includes(lowerTopic) || 
      lowerTopic.includes(interest.toLowerCase())
    );
  }

  /**
   * Clean up expired contexts (run periodically)
   * Now includes summarization of expired conversations
   */
  async cleanupExpiredContexts(): Promise<number> {
    const now = Date.now();
    let removedCount = 0;

    for (const [userId, ctx] of this.activeContexts.entries()) {
      if (now - ctx.lastInteraction >= this.TTL_MS) {
        // Summarize and archive the conversation before deleting
        await this.summarizeAndArchive(userId, ctx.messages);
        this.activeContexts.delete(userId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`🧹 Cleaned up ${removedCount} expired contexts`);
    }

    return removedCount;
  }

  /**
   * Summarize and archive a conversation when it expires
   */
  private async summarizeAndArchive(userId: string, messages: any[]): Promise<void> {
    if (!this.summaryStore || !this.openai) {
      console.log('⚠️ Summarization dependencies not set, skipping archive');
      return;
    }

    // Only summarize conversations with enough content
    if (messages.length < 5) {
      console.log(`📝 Skipping summary for ${userId}: only ${messages.length} messages`);
      return;
    }

    try {
      const prompt = `Summarize this conversation in 3 bullet points, focusing on user preferences, key facts, and important context. Keep it concise but informative:

${JSON.stringify(messages, null, 2)}

Summary:`;

      const summary = await this.openai.generateTextResponse(prompt);
      
      // Store the summary in long-term memory
      await this.summaryStore.storeSummary(userId, summary, messages);
      
      console.log(`📝 Archived conversation for ${userId}: ${summary.substring(0, 100)}...`);
    } catch (error) {
      console.error('❌ Failed to summarize and archive conversation:', error);
    }
  }

  /**
   * Get long-term conversation summaries for a user
   */
  async getLongTermSummaries(userId: string): Promise<string[]> {
    if (!this.summaryStore) {
      console.log('⚠️ SummaryStore not available, returning empty summaries');
      return [];
    }

    try {
      return await this.summaryStore.getRecentSummaries(userId, 3);
    } catch (error) {
      console.error('❌ Failed to get long-term summaries:', error);
      return [];
    }
  }

  /**
   * Get statistics about active contexts
   */
  getStats(): { activeUsers: number; totalMessages: number } {
    let totalMessages = 0;
    
    this.activeContexts.forEach(ctx => {
      totalMessages += ctx.messages.length;
    });

    return {
      activeUsers: this.activeContexts.size,
      totalMessages
    };
  }
}

---
./src/memory/HistoryStorePostgres.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { v4 as uuidv4 } from 'uuid';

/**
 * PostgreSQL-based History Store for long-term conversation logs.
 * Stores raw chat logs for the "Recall" tool and historical analysis.
 */
interface ConversationLog {
  id: string;
  userId: string;
  message: string;
  role: 'user' | 'assistant';
  timestamp: string;
  messageType: 'text' | 'image' | 'audio';
  metadata?: any;
}

export class HistoryStorePostgres {
  constructor() {
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Store a conversation message
   */
  async storeMessage(log: Omit<ConversationLog, 'id'>): Promise<void> {
    try {
      await prisma.conversationLog.create({
        data: {
          id: uuidv4(),
          userId: log.userId,
          message: log.message.substring(0, 4000), // Limit message length
          role: log.role,
          timestamp: new Date(log.timestamp),
          messageType: log.messageType,
          metadata: log.metadata || undefined,
        },
      });
    } catch (error) {
      console.error('❌ Failed to store conversation message:', error);
      throw error;
    }
  }

  /**
   * Query conversation history by date range and/or keywords
   */
  async query(options: {
    userId?: string;
    start?: string; // ISO date string
    end?: string;   // ISO date string
    keywords?: string;
    limit?: number;
    role?: 'user' | 'assistant';
  } = {}): Promise<ConversationLog[]> {
    try {
      const where: any = {};

      if (options.userId) {
        where.userId = options.userId;
      }

      if (options.start || options.end) {
        where.timestamp = {};
        if (options.start) {
          where.timestamp.gte = new Date(options.start);
        }
        if (options.end) {
          where.timestamp.lte = new Date(options.end);
        }
      }

      if (options.role) {
        where.role = options.role;
      }

      if (options.keywords) {
        // Simple keyword search (for production, consider full-text search)
        const keywords = options.keywords.toLowerCase().split(/\s+/).filter(k => k.length > 2);
        if (keywords.length > 0) {
          where.OR = keywords.map(keyword => ({
            message: {
              contains: keyword,
              mode: 'insensitive' as const,
            },
          }));
        }
      }

      const logs = await prisma.conversationLog.findMany({
        where,
        orderBy: {
          timestamp: 'desc',
        },
        take: options.limit,
      });

      return logs.map(log => ({
        id: log.id,
        userId: log.userId,
        message: log.message,
        role: log.role as 'user' | 'assistant',
        timestamp: log.timestamp.toISOString(),
        messageType: log.messageType as 'text' | 'image' | 'audio',
        metadata: log.metadata || undefined,
      }));
    } catch (error) {
      console.error('❌ Failed to query conversation history:', error);
      throw error;
    }
  }

  /**
   * Get conversation summary for a user
   */
  async getConversationSummary(userId: string, days: number = 30): Promise<{
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    firstInteraction: string;
    lastInteraction: string;
    averageMessageLength: number;
  }> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const stats = await prisma.conversationLog.aggregate({
        where: {
          userId,
          timestamp: {
            gte: cutoff,
          },
        },
        _count: {
          _all: true,
        },
        _min: {
          timestamp: true,
        },
        _max: {
          timestamp: true,
        },
      });

      // For average message length, we need a custom query
      const avgResult = await prisma.$queryRaw<Array<{ avg_length: number }>>`
        SELECT AVG(LENGTH(message)) as avg_length 
        FROM conversation_logs 
        WHERE user_id = ${userId} AND timestamp >= ${cutoff}
      `;

      return {
        totalMessages: stats._count._all || 0,
        userMessages: await prisma.conversationLog.count({
          where: {
            userId,
            timestamp: { gte: cutoff },
            role: 'user',
          },
        }),
        assistantMessages: await prisma.conversationLog.count({
          where: {
            userId,
            timestamp: { gte: cutoff },
            role: 'assistant',
          },
        }),
        firstInteraction: stats._min.timestamp?.toISOString() || 'No interactions',
        lastInteraction: stats._max.timestamp?.toISOString() || 'No interactions',
        averageMessageLength: Math.round(avgResult[0]?.avg_length || 0),
      };
    } catch (error) {
      console.error('❌ Failed to get conversation summary:', error);
      return {
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        firstInteraction: 'No interactions',
        lastInteraction: 'No interactions',
        averageMessageLength: 0,
      };
    }
  }

  /**
   * Get most active users (for proactive messaging prioritization)
   */
  async getMostActiveUsers(days: number = 7, limit: number = 10): Promise<Array<{userId: string; messageCount: number; lastActivity: string}>> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const result = await prisma.conversationLog.groupBy({
        by: ['userId'],
        where: {
          timestamp: {
            gte: cutoff,
          },
        },
        _count: {
          id: true,
        },
        _max: {
          timestamp: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: limit,
      });

      return result.map(row => ({
        userId: row.userId,
        messageCount: row._count.id,
        lastActivity: row._max.timestamp?.toISOString() || '',
      }));
    } catch (error) {
      console.error('❌ Failed to get most active users:', error);
      return [];
    }
  }

  /**
   * Clean up old conversation logs
   */
  async cleanupOldLogs(maxAgeDays: number = 365): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);

      const result = await prisma.conversationLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} old conversation logs`);
      }

      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old logs:', error);
      return 0;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    totalLogs: number;
    uniqueUsers: number;
    oldestLog: string;
    newestLog: string;
  }> {
    try {
      const [total, uniqueUsers, oldest, newest] = await Promise.all([
        prisma.conversationLog.count(),
        prisma.conversationLog.groupBy({
          by: ['userId'],
          _count: true,
        }).then(groups => groups.length),
        prisma.conversationLog.findFirst({
          orderBy: {
            timestamp: 'asc',
          },
        }),
        prisma.conversationLog.findFirst({
          orderBy: {
            timestamp: 'desc',
          },
        }),
      ]);

      return {
        totalLogs: total,
        uniqueUsers,
        oldestLog: oldest?.timestamp.toISOString() || 'No logs',
        newestLog: newest?.timestamp.toISOString() || 'No logs',
      };
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      return {
        totalLogs: 0,
        uniqueUsers: 0,
        oldestLog: 'No logs',
        newestLog: 'No logs',
      };
    }
  }

  /**
   * Export conversation data for a user (for recall tool)
   */
  async exportUserConversation(userId: string, format: 'json' | 'text' = 'text'): Promise<string> {
    try {
      const logs = await this.query({ userId, limit: 1000 }); // Limit for safety
      
      if (format === 'json') {
        return JSON.stringify(logs, null, 2);
      }

      // Text format for human readability
      return logs.map(log => 
        `[${new Date(log.timestamp).toLocaleString()}] ${log.role.toUpperCase()}: ${log.message}`
      ).join('\n');
    } catch (error) {
      console.error('❌ Failed to export user conversation:', error);
      return '';
    }
  }
}

---
./src/memory/KnowledgeBasePostgres.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { OpenAIService } from '../services/openaiService';
import { v4 as uuidv4 } from 'uuid';

/**
 * PostgreSQL-based Knowledge Base for storing facts learned from autonomous browsing.
 * Uses PostgreSQL with BYTEA storage for efficient RAG searches.
 */
export interface KnowledgeDocument {
  id: string;
  content: string;
  vector: Buffer; // BYTEA storage for embeddings
  source: string;
  category: string;
  tags: string[];
  timestamp: string;
  relevanceScore?: number;
}

export class KnowledgeBasePostgres {
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Check if a source URL has already been processed and stored
   */
  async hasDocument(url: string): Promise<boolean> {
    try {
      const count = await prisma.knowledge.count({
        where: { source: url }
      });
      return count > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a specific content hash already exists in the database.
   * This is used to detect if an article (even with a different URL)
   * has already been learned.
   */
  async hasContentHash(hash: string): Promise<boolean> {
    try {
      const tag = `hash:${hash}`;
      const count = await prisma.knowledge.count({
        where: {
          tags: {
            string_contains: tag
          }
        }
      });
      return count > 0;
    } catch (error) {
      console.error('Error checking content hash:', error);
      return false;
    }
  }

  /**
   * Add a new document learned from browsing
   */
  async learnDocument(document: {
    content: string;
    source: string;
    tags: string[];
    timestamp: Date;
    category?: string;
    contentHash?: string;
  }): Promise<void> {
    if (!document.content || document.content.trim().length < 50) return;

    // Add hash to tags if provided
    const finalTags = [...document.tags];
    if (document.contentHash) {
      finalTags.push(`hash:${document.contentHash}`);
    }

    try {
      const embedding = await this.openaiService.createEmbedding(document.content);
      const vectorBuffer = Buffer.from(new Float64Array(embedding).buffer);

      await prisma.knowledge.create({
        data: {
          id: uuidv4(),
          content: document.content.substring(0, 4000),
          vector: vectorBuffer,
          source: document.source,
          category: document.category || 'general',
          tags: finalTags,
          timestamp: document.timestamp,
        },
      });

      console.log(`💾 Learned: [${document.category}] ${document.source.substring(0, 40)}...`);
    } catch (error) {
      console.error('❌ Failed to learn document:', error);
    }
  }

  /**
   * Search for relevant knowledge using RAG with recency prioritization
   */
  async search(query: string, limit: number = 3, category?: string): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);
      const queryVec = new Float64Array(queryEmbedding);

      // Prioritize recent content: only search documents from last 7 days by default
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const where: any = {
        timestamp: {
          gt: sevenDaysAgo,
        },
      };
      
      if (category) {
        where.category = category;
      }
      
      // Order by timestamp descending to prioritize recent content
      const rows = await prisma.knowledge.findMany({
        where,
        orderBy: {
          timestamp: 'desc',
        },
      });

      // If no recent results, expand search to all time but with stronger recency penalty
      let expandedSearch = false;
      if (rows.length === 0) {
        expandedSearch = true;
        const fallbackWhere: any = {};
        if (category) {
          fallbackWhere.category = category;
        }
        rows.push(...await prisma.knowledge.findMany({
          where: fallbackWhere,
        }));
      }

      // Calculate relevance scores with enhanced recency weighting
      const results = rows.map(row => {
        // Convert BYTEA back to Float64Array
        const docVec = new Float64Array(
          row.vector.buffer,
          row.vector.byteOffset,
          row.vector.byteLength / 8
        );

        const similarity = this.cosineSimilarity(queryVec, docVec);
        const recencyScore = this.calculateRecencyScore(row.timestamp.toISOString());
        
        // Enhanced relevance calculation: give more weight to recency
        // Recent content (last 24 hours) gets significant boost
        const hoursAgo = (Date.now() - row.timestamp.getTime()) / (1000 * 60 * 60);
        const freshnessBoost = hoursAgo < 24 ? 1.5 : 1.0; // 50% boost for content < 24h old
        
        // If we expanded search, penalize older content more heavily
        const agePenalty = expandedSearch ? Math.max(0.1, recencyScore) : 1.0;
        
        const relevance = similarity * recencyScore * freshnessBoost * agePenalty;
        
        return {
          ...row,
          tags: row.tags as string[] || [],
          similarity,
          recencyScore,
          relevance,
          hoursAgo,
          expandedSearch
        };
      })
      .filter(result => result.similarity >= 0.6) // Slightly lower threshold for expanded search
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);

      if (results.length === 0) {
        return "No relevant knowledge found in my memory.";
      }

      // Format results with freshness indicators
      return results.map(result => {
        const date = new Date(result.timestamp);
        const freshness = result.hoursAgo < 24 ? '🆕 ' : (result.hoursAgo < 168 ? '📅 ' : '📜 ');
        const sourceInfo = `[${freshness}Source: ${result.source} | Category: ${result.category} | ${date.toLocaleDateString()}]`;
        
        return `${sourceInfo}\n${result.content}`;
      }).join('\n\n---\n\n');

    } catch (error) {
      console.error('❌ Knowledge search failed:', error);
      return "Error searching knowledge base.";
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Calculate recency score with stronger emphasis on recent content
   */
  private calculateRecencyScore(timestamp: string): number {
    const docTime = new Date(timestamp).getTime();
    const now = Date.now();
    const ageDays = (now - docTime) / (1000 * 60 * 60 * 24);
    
    // Stronger recency weighting: content older than 7 days gets much lower scores
    // Recent content (0-1 days) gets near-maximum score
    if (ageDays <= 1) return 1.0; // Maximum score for today's content
    if (ageDays <= 3) return 0.8; // High score for last 3 days
    if (ageDays <= 7) return 0.6; // Good score for last week
    if (ageDays <= 14) return 0.3; // Moderate score for 2 weeks
    if (ageDays <= 30) return 0.1; // Low score for 1 month
    return 0.05; // Very low score for older content
  }

  /**
   * Get knowledge statistics
   */
  async getStats(): Promise<{ totalDocuments: number; categories: string[]; oldestDocument: string }> {
    try {
      const [total, categories, oldest] = await Promise.all([
        prisma.knowledge.count(),
        prisma.knowledge.findMany({
          distinct: ['category'],
          select: { category: true },
        }),
        prisma.knowledge.findFirst({
          orderBy: {
            timestamp: 'asc',
          },
        }),
      ]);

      return {
        totalDocuments: total,
        categories: categories.map(c => c.category || 'unknown'),
        oldestDocument: oldest?.timestamp.toISOString() || 'No documents'
      };
    } catch (error) {
      console.error('❌ Failed to get knowledge stats:', error);
      return {
        totalDocuments: 0,
        categories: [],
        oldestDocument: 'No documents'
      };
    }
  }

  /**
   * Clean up old knowledge (older than specified days)
   */
  async cleanupOldKnowledge(maxAgeDays: number = 90): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);
      
      const result = await prisma.knowledge.deleteMany({
        where: {
          timestamp: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} old knowledge documents`);
      }
      
      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old knowledge:', error);
      return 0;
    }
  }

  /**
   * Find knowledge by tags (for proactive messaging)
   */
  async findKnowledgeByTags(tags: string[], limit: number = 5): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        where: {
          tags: {
            array_contains: tags,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to find knowledge by tags:', error);
      return [];
    }
  }

  /**
   * Get recent knowledge documents for dashboard display
   */
  async getRecentDocuments(limit: number = 10): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to get recent documents:', error);
      return [];
    }
  }

  /**
   * Get knowledge documents by category
   */
  async getDocumentsByCategory(category: string, limit: number = 10): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        where: {
          category,
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to get documents by category:', error);
      return [];
    }
  }

  /**
   * Search knowledge content for dashboard (simple text search)
   */
  async searchContent(query: string, limit: number = 10): Promise<KnowledgeDocument[]> {
    try {
      const rows = await prisma.knowledge.findMany({
        where: {
          content: {
            contains: query,
            mode: 'insensitive' as const,
          },
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
      });
      
      return rows.map(row => ({
        id: row.id,
        content: row.content,
        vector: row.vector,
        source: row.source || '',
        category: row.category || '',
        tags: row.tags as string[] || [],
        timestamp: row.timestamp.toISOString()
      }));
    } catch (error) {
      console.error('❌ Failed to search knowledge content:', error);
      return [];
    }
  }
}

---
./src/memory/SummaryStore.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { createHash } from 'crypto';

/**
 * Service for managing long-term conversation summaries
 * Stores and retrieves conversation summaries to maintain context beyond the 1-hour TTL
 */
export class SummaryStore {
  constructor() {
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Generate a hash for conversation context to prevent duplicate summaries
   */
  private generateContextHash(userId: string, messages: any[]): string {
    const contextString = `${userId}:${JSON.stringify(messages)}`;
    return createHash('md5').update(contextString).digest('hex');
  }

  /**
   * Store a conversation summary for a user
   */
  async storeSummary(userId: string, summary: string, messages: any[]): Promise<void> {
    try {
      const contextHash = this.generateContextHash(userId, messages);
      
      await prisma.conversationSummary.create({
        data: {
          userId,
          summary,
          timestamp: new Date(),
          contextHash
        }
      });

      console.log(`📝 Stored conversation summary for ${userId}`);
    } catch (error) {
      console.error('❌ Failed to store conversation summary:', error);
      throw error;
    }
  }

  /**
   * Get the most recent conversation summaries for a user
   */
  async getRecentSummaries(userId: string, limit: number = 3): Promise<string[]> {
    try {
      const summaries = await prisma.conversationSummary.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: limit
      });

      return summaries.map(s => s.summary);
    } catch (error) {
      console.error('❌ Failed to get conversation summaries:', error);
      return [];
    }
  }

  /**
   * Get all conversation summaries for a user within a date range
   */
  async getSummariesByDateRange(userId: string, startDate: Date, endDate: Date): Promise<string[]> {
    try {
      const summaries = await prisma.conversationSummary.findMany({
        where: {
          userId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { timestamp: 'asc' }
      });

      return summaries.map(s => s.summary);
    } catch (error) {
      console.error('❌ Failed to get summaries by date range:', error);
      return [];
    }
  }

  /**
   * Clean up old summaries (keep only the most recent ones per user)
   */
  async cleanupOldSummaries(maxPerUser: number = 10): Promise<number> {
    try {
      // Get all user IDs
      const users = await prisma.conversationSummary.groupBy({
        by: ['userId'],
        _count: { id: true }
      });

      let totalDeleted = 0;

      for (const user of users) {
        if (user._count.id > maxPerUser) {
          // Get IDs of summaries to keep (most recent ones)
          const keepIds = await prisma.conversationSummary.findMany({
            where: { userId: user.userId },
            orderBy: { timestamp: 'desc' },
            take: maxPerUser,
            select: { id: true }
          });

          const keepIdSet = new Set(keepIds.map(s => s.id));

          // Delete old summaries
          const result = await prisma.conversationSummary.deleteMany({
            where: {
              userId: user.userId,
              id: { notIn: Array.from(keepIdSet) }
            }
          });

          totalDeleted += result.count;
        }
      }

      if (totalDeleted > 0) {
        console.log(`🧹 Cleaned up ${totalDeleted} old conversation summaries`);
      }

      return totalDeleted;
    } catch (error) {
      console.error('❌ Failed to cleanup old summaries:', error);
      return 0;
    }
  }

  /**
   * Get statistics about stored summaries
   */
  async getStats(): Promise<{
    totalSummaries: number;
    uniqueUsers: number;
    oldestSummary: string;
    newestSummary: string;
  }> {
    try {
      const [total, uniqueUsers, oldest, newest] = await Promise.all([
        prisma.conversationSummary.count(),
        prisma.conversationSummary.groupBy({
          by: ['userId'],
          _count: true
        }).then(groups => groups.length),
        prisma.conversationSummary.findFirst({
          orderBy: { timestamp: 'asc' }
        }),
        prisma.conversationSummary.findFirst({
          orderBy: { timestamp: 'desc' }
        })
      ]);

      return {
        totalSummaries: total,
        uniqueUsers,
        oldestSummary: oldest?.timestamp.toISOString() || 'No summaries',
        newestSummary: newest?.timestamp.toISOString() || 'No summaries'
      };
    } catch (error) {
      console.error('❌ Failed to get summary stats:', error);
      return {
        totalSummaries: 0,
        uniqueUsers: 0,
        oldestSummary: 'No summaries',
        newestSummary: 'No summaries'
      };
    }
  }
}

---
./src/services/ActionQueueService.ts
---
/**
 * Action Queue Service for rate-limited messaging and scheduled actions.
 * Prevents WhatsApp API rate limit violations and enables human-like delayed responses.
 */
interface QueuedAction {
  id: string;
  type: 'message' | 'media' | 'proactive';
  userId: string;
  content: string;
  scheduledFor: Date;
  priority: number; // 1-10, higher = more urgent
  retryCount: number;
  metadata?: any;
}

export class ActionQueueService {
  private queue: QueuedAction[] = [];
  private processing: boolean = false;
  private readonly MAX_RETRIES = 3;
  private readonly RATE_LIMIT_DELAY = 2000; // 2 seconds between messages
  private readonly PROACTIVE_COOLDOWN = 15 * 60 * 1000; // 15 minutes between proactive messages
  private messageSender?: (userId: string, content: string) => Promise<boolean>;

  constructor() {
    // Start processing loop
    this.startProcessing();
  }

  /**
   * Register a message sender function (called by AutonomousAgent)
   */
  registerMessageSender(sender: (userId: string, content: string) => Promise<boolean>) {
    this.messageSender = sender;
  }

  /**
   * Queue a message for delivery with rate limiting
   */
  queueMessage(userId: string, content: string, options: {
    priority?: number;
    delayMs?: number;
    isProactive?: boolean;
    metadata?: any;
  } = {}): string {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const scheduledFor = new Date(Date.now() + (options.delayMs || 0));
    
    const action: QueuedAction = {
      id: actionId,
      type: options.isProactive ? 'proactive' : 'message',
      userId,
      content,
      scheduledFor,
      priority: options.priority || 5,
      retryCount: 0,
      metadata: options.metadata
    };

    this.queue.push(action);
    this.queue.sort((a, b) => {
      // Sort by priority (descending), then by scheduled time (ascending)
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.scheduledFor.getTime() - b.scheduledFor.getTime();
    });

    console.log(`📬 Queued ${action.type} message for ${userId} (priority: ${action.priority})`);
    
    return actionId;
  }

  /**
   * Start processing the action queue
   */
  private startProcessing() {
    setInterval(() => {
      if (!this.processing) {
        this.processNextAction();
      }
    }, 1000); // Check every second
  }

  /**
   * Process the next action in the queue
   */
  private async processNextAction() {
    if (this.queue.length === 0 || this.processing) return;

    this.processing = true;
    const now = new Date();

    // Find the next actionable item (scheduled for now or earlier)
    const nextActionIndex = this.queue.findIndex(action => 
      action.scheduledFor <= now
    );

    if (nextActionIndex === -1) {
      this.processing = false;
      return;
    }

    const action = this.queue.splice(nextActionIndex, 1)[0];

    try {
      // Simulate action execution (will be integrated with WhatsApp service)
      await this.executeAction(action);
      
      console.log(`✅ Action completed: ${action.type} to ${action.userId}`);
      
    } catch (error) {
      console.error(`❌ Action failed: ${action.type} to ${action.userId}`, error);
      
      // Retry logic
      if (action.retryCount < this.MAX_RETRIES) {
        action.retryCount++;
        action.scheduledFor = new Date(Date.now() + (action.retryCount * 30000)); // Exponential backoff
        this.queue.push(action);
        console.log(`🔄 Retry scheduled for action ${action.id} (attempt ${action.retryCount})`);
      } else {
        console.error(`💀 Action ${action.id} failed after ${this.MAX_RETRIES} retries`);
      }
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY));
    
    this.processing = false;
  }

  /**
   * Execute an action (Updated to send real messages)
   */
  private async executeAction(action: QueuedAction): Promise<void> {
    console.log(`📤 Executing ${action.type} action for ${action.userId}`);
    
    if (!this.messageSender) {
      console.warn('⚠️ No message sender registered in ActionQueue! Message logged but not sent.');
      return;
    }

    try {
      // Send via the registered callback
      const success = await this.messageSender(action.userId, action.content);
      
      if (!success) {
        throw new Error('Message sender returned false');
      }
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      throw error; // This triggers the retry logic in processNextAction
    }
  }

  /**
   * Check if a user has a proactive message cooldown
   */
  canSendProactiveMessage(userId: string): boolean {
    const lastProactive = this.getLastProactiveMessageTime(userId);
    if (!lastProactive) return true;
    
    const cooldownRemaining = lastProactive.getTime() + this.PROACTIVE_COOLDOWN - Date.now();
    return cooldownRemaining <= 0;
  }

  /**
   * Get time until next proactive message can be sent to a user
   */
  getProactiveCooldownRemaining(userId: string): number {
    const lastProactive = this.getLastProactiveMessageTime(userId);
    if (!lastProactive) return 0;
    
    const cooldownRemaining = lastProactive.getTime() + this.PROACTIVE_COOLDOWN - Date.now();
    return Math.max(0, cooldownRemaining);
  }

  /**
   * Get the last proactive message time for a user
   */
  private getLastProactiveMessageTime(userId: string): Date | null {
    const proactiveActions = this.queue.filter(action => 
      action.type === 'proactive' && action.userId === userId
    ).concat(
      // Would also check completed actions from a log in production
      []
    );

    if (proactiveActions.length === 0) return null;
    
    return new Date(Math.max(...proactiveActions.map(a => a.scheduledFor.getTime())));
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    const now = new Date();
    
    return {
      totalQueued: this.queue.length,
      processing: this.processing,
      messages: this.queue.filter(a => a.type === 'message').length,
      proactive: this.queue.filter(a => a.type === 'proactive').length,
      delayed: this.queue.filter(a => a.scheduledFor > now).length,
      ready: this.queue.filter(a => a.scheduledFor <= now).length,
      averagePriority: this.queue.reduce((sum, a) => sum + a.priority, 0) / this.queue.length || 0
    };
  }

  /**
   * Clear the queue (for testing/reset)
   */
  clearQueue(): number {
    const count = this.queue.length;
    this.queue = [];
    console.log(`🧹 Cleared ${count} actions from queue`);
    return count;
  }

  /**
   * Get actions for a specific user
   */
  getUserActions(userId: string): QueuedAction[] {
    return this.queue.filter(action => action.userId === userId);
  }

  /**
   * Cancel a specific action
   */
  cancelAction(actionId: string): boolean {
    const index = this.queue.findIndex(action => action.id === actionId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      console.log(`❌ Cancelled action ${actionId}`);
      return true;
    }
    return false;
  }
}

---
./src/services/BrowserService.ts
---
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { WebScrapeService } from './webScrapeService';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from './googleSearchService';
import { OpenAIService, createOpenAIServiceFromConfig } from './openaiService';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface FavoriteSite {
  url: string;
  category: string;
  lastVisited: number;
  visitCount: number;
  addedAt: number;
  source: 'default' | 'user_added' | 'discovered';
}

interface LinkTrackingEntry {
  url: string;
  lastScraped: number;
  contentHash: string;
}

interface SearchChecklistItem {
  query: string;
  reason: string;
}

export class BrowserService {
  private favorites: FavoriteSite[] = [];
  private linkTracker: Map<string, LinkTrackingEntry> = new Map();
  
  private googleSearch?: GoogleSearchService;
  private openai?: OpenAIService;
  
  // Persistence Paths
  private readonly DATA_DIR = path.join(process.cwd(), 'data');
  private readonly FAVORITES_PATH = path.join(process.cwd(), 'data', 'favorites.json');
  private readonly TRACKER_PATH = path.join(process.cwd(), 'data', 'link_tracker.json');

  // Limits
  private readonly MAX_PAGES_PER_HOUR = 20;
  private readonly LINK_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
  
  private pagesVisitedThisHour = 0;

  // New control flags
  private isSurfing: boolean = false;
  private stopSignal: boolean = false;

  // Default Favorites (Used if no file exists)
  private readonly DEFAULT_FAVORITES: FavoriteSite[] = [
    { url: 'https://news.ycombinator.com', category: 'tech', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' },
    { url: 'https://techcrunch.com', category: 'tech', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' },
    { url: 'https://www.bbc.com/news/world', category: 'world', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' },
    { url: 'https://hongkongfp.com', category: 'news', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' }
  ];

  constructor(
    private scraper: WebScrapeService,
    private kb: KnowledgeBasePostgres
  ) {
    this.initialize();
  }

  private async initialize() {
    this.loadFavorites();
    this.loadLinkTracker();
    
    try { this.openai = await createOpenAIServiceFromConfig(); } catch (e) { console.error('Browser: OpenAI init failed'); }
    try { this.googleSearch = createGoogleSearchServiceFromEnv(); } catch (e) { console.warn('Browser: Google Search not configured'); }

    // Hourly Reset
    setInterval(() => { 
        this.pagesVisitedThisHour = 0; 
        console.log('🔄 Browser hourly limit reset');
        this.saveLinkTracker(); // Periodic save
    }, 3600 * 1000);
  }

  /**
   * Signal the browser to stop the current surfing session immediately
   */
  public stopBrowsing() {
    if (this.isSurfing) {
      console.log('🛑 Interrupt signal received. Stopping autonomous browsing...');
      this.stopSignal = true;
    }
  }

  /**
   * Main Autonomous Surfing Loop
   */
  async surf(intent?: string): Promise<{ urlsVisited: string[]; knowledgeGained: number }> {
    // Reset flags
    this.stopSignal = false;
    this.isSurfing = true;

    if (this.pagesVisitedThisHour >= this.MAX_PAGES_PER_HOUR) {
        console.log('💤 Browser resting (Rate limit reached)');
        this.isSurfing = false;
        return { urlsVisited: [], knowledgeGained: 0 };
    }

    const results = { urlsVisited: [] as string[], knowledgeGained: 0 };

    try {
        // 1. Pick a Favorite Site (Hub)
        const hub = this.pickFavorite(intent);
        if (!hub) {
            console.log('🤔 No favorites available to visit.');
            this.isSurfing = false;
            return results;
        }

        // Check interrupt
        if (this.stopSignal) { this.isSurfing = false; return results; }

        console.log(`🌐 Browsing Hub: ${hub.url}`);
        
        // 2. Extract Article Candidates
        const candidates = await this.scraper.extractArticleLinks(hub.url);
        this.pagesVisitedThisHour++;
        hub.lastVisited = Date.now();
        hub.visitCount++;
        this.saveFavorites();

        console.log(`🔍 Found ${candidates.length} candidate articles on ${hub.url}`);

        // 3. Process Candidates (Shuffle to vary browsing)
        const shuffled = candidates.sort(() => 0.5 - Math.random()).slice(0, 5);

        for (const article of shuffled) {
            // CRITICAL: Check for interrupt signal before every action
            if (this.stopSignal) {
                console.log('🛑 Browsing loop interrupted.');
                break;
            }
            if (this.pagesVisitedThisHour >= this.MAX_PAGES_PER_HOUR) break;

            // 4. Check Stale/Tracker Status
            const trackInfo = this.linkTracker.get(article.url);
            const isStale = trackInfo && (Date.now() - trackInfo.lastScraped > this.LINK_STALE_THRESHOLD_MS);
            
            // Skip if visited recently (unless stale)
            if (trackInfo && !isStale) continue;

            // 5. Scrape Article
            try {
                console.log(`📖 Reading${isStale ? ' (Update Check)' : ''}: ${article.title}`);
                const result = await this.scraper.scrapeUrl(article.url, undefined, true);
                this.pagesVisitedThisHour++;
                results.urlsVisited.push(article.url);

                if (result.content.length < 300) {
                    console.log('⏩ Skipping: Content too short');
                    continue;
                }

                // 6. Calculate Hash
                const currentHash = createHash('md5').update(result.content).digest('hex');

                // 7. Check for Changes (Local)
                if (trackInfo && trackInfo.contentHash === currentHash) {
                    console.log('⏩ Skipping: Content unchanged');
                    this.updateLinkTracker(article.url, currentHash);
                    continue;
                }

                // 8. Check for Changes (Global KB)
                const globalExists = await this.kb.hasContentHash(currentHash);
                if (globalExists) {
                     console.log('⏩ Skipping: Content exists in KB (Duplicate/Syndicated)');
                     this.updateLinkTracker(article.url, currentHash);
                     continue;
                }

                console.log(`✨ New/Updated Content Found! (Hash: ${currentHash.substring(0,8)})`);

                // 9. Generate Google Search Checklist
                let finalContent = result.content;
                let tags = ['autonomous_browse', hub.category];
                if (trackInfo) tags.push('updated_content'); // Mark as update

                if (this.googleSearch && this.openai) {
                    const checklist = await this.generateSearchChecklist(article.title, result.content);
                    if (checklist.length > 0) {
                        console.log(`🕵️ Enrichment Checklist (${checklist.length} items)`);
                        const enrichmentData = await this.processChecklist(checklist);
                        if (enrichmentData) {
                            finalContent += `\n\n--- 🔍 Research Context ---\n${enrichmentData}`;
                            tags.push('enriched');
                        }
                    }
                }

                // 10. Save Knowledge
                await this.kb.learnDocument({
                    content: finalContent,
                    source: article.url,
                    category: hub.category,
                    tags: tags,
                    timestamp: new Date(),
                    contentHash: currentHash
                });

                results.knowledgeGained++;
                this.updateLinkTracker(article.url, currentHash);

                // 11. Discovery (Chance to add new domain to favorites)
                if (Math.random() < 0.05) {
                    this.maybeDiscoverNewFavorite(article.url, hub.category);
                }

            } catch (e) {
                console.error(`Failed to process article ${article.url}:`, e);
            }
        }
    } catch (e) {
        console.error('Error during surfing:', e);
    } finally {
        this.isSurfing = false;
        this.stopSignal = false;
    }
    
    this.saveLinkTracker();
    return results;
  }

  /**
   * Deep Research Task: Bypasses hourly limits to find specific answers
   * Performs: Search -> Scrape -> Summarize -> Repeat if needed
   */
  async performDeepResearch(query: string): Promise<string> {
    console.log(`🕵️ Starting Deep Research for: "${query}"`);
    
    if (!this.googleSearch || !this.openai) {
        return "Deep research unavailable (Missing Google Search or OpenAI configuration).";
    }

    let summary = "";
    const maxIterations = 2; // Prevent infinite loops
    let currentQuery = query;

    for (let i = 0; i < maxIterations; i++) {
        console.log(`🕵️ Deep Research Iteration ${i + 1}/${maxIterations}: Searching for "${currentQuery}"`);
        
        // 1. Google Search
        const searchResults = await this.googleSearch.search(currentQuery, 3);
        
        if (searchResults.length === 0) break;

        // 2. Scrape Top Results (Bypassing hourly limit logic by not incrementing pagesVisitedThisHour)
        const scrapedContents = [];
        for (const result of searchResults) {
            try {
                // Check interrupt just in case the user spams messages
                if (this.stopSignal) break;

                console.log(`📖 Deep Research Reading: ${result.title}`);
                const scrapeResult = await this.scraper.scrapeUrl(result.link, undefined, true); // Force mobile view
                if (scrapeResult.content.length > 200) {
                    scrapedContents.push(`Source: ${result.link}\nTitle: ${result.title}\nContent: ${scrapeResult.content.substring(0, 3000)}`);
                }
            } catch (e) {
                console.warn(`Failed to scrape ${result.link} for research`);
            }
        }

        if (scrapedContents.length === 0) {
             if (i === maxIterations - 1) return "I couldn't find any readable websites for your query. The search results were either blocked or contained no readable content.";
             continue;
        }

        // 3. Analyze & Synthesize
        const researchPrompt = `
        User Question: "${query}"
        
        I have gathered information from the following sources:
        ${scrapedContents.join('\n\n---\n\n')}

        Task:
        Provide a natural, conversational answer to the user's question based on the information gathered.
        If you can answer the question clearly, provide the answer in a friendly, WhatsApp-appropriate format.
        If the information is insufficient to answer the question, explain what you found and suggest what additional information might be needed.
        `;

        const response = await this.openai.generateTextResponse(researchPrompt);

        // Check if the response seems to answer the question (contains relevant information)
        const lowerResponse = response.toLowerCase();
        const lowerQuery = query.toLowerCase();
        
        // Simple heuristic: if response contains key terms from query and is substantial
        const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 3);
        const matchingWords = queryWords.filter(word => lowerResponse.includes(word));
        
        if (matchingWords.length >= queryWords.length * 0.5 && response.length > 50) {
            // Save this new knowledge to the DB for future speed
            await this.kb.learnDocument({
                content: `Deep Research on "${query}":\n${response.trim()}`,
                source: "deep_research_task",
                category: "research",
                tags: ["deep_research", "user_query"],
                timestamp: new Date()
            });
            
            return response.trim();
        } else {
            // Update query for next iteration if needed
            if (i < maxIterations - 1) {
                console.log(`🕵️ Information insufficient. Continuing research...`);
                // Try a more specific query for next iteration
                currentQuery = query + " detailed explanation";
                summary = "I found some related information but need to search more specifically.";
            } else {
                return response.trim(); // Return whatever we got
            }
        }
    }

    return "After searching multiple sources, I couldn't find a definitive answer to your question. The information available was either incomplete or didn't directly address your specific query.";
  }

  // --- Helpers ---

  private async generateSearchChecklist(title: string, content: string): Promise<SearchChecklistItem[]> {
    if (!this.openai) return [];
    // Ask LLM to create a checklist of things to verify
    const prompt = `Read this news article snippet. Identify 1-2 facts, technical terms, or historical events that need verification or more context. Return valid JSON array only: [{"query": "search query", "reason": "why"}] \n\nTitle: ${title}\nContent: ${content.substring(0, 1000)}...`;
    try {
        const raw = await this.openai.generateTextResponse(prompt);
        const jsonMatch = raw.match(/\[.*\]/s);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch (e) { return []; }
  }

  private async processChecklist(items: SearchChecklistItem[]): Promise<string> {
      if (!this.googleSearch) return '';
      let context = '';
      for (const item of items) {
          try {
              const results = await this.googleSearch.search(item.query, 2);
              if (results.length > 0) {
                  context += `Query: ${item.query} (${item.reason})\n` + results.map(r => `- ${r.title}: ${r.snippet}`).join('\n') + '\n\n';
              }
              await new Promise(r => setTimeout(r, 1000));
          } catch (e) {}
      }
      return context;
  }

  private pickFavorite(intent?: string): FavoriteSite | null {
      this.loadFavorites();
      let candidates = this.favorites;
      if (intent) {
          const filtered = candidates.filter(f => f.category.includes(intent.toLowerCase()) || f.url.includes(intent.toLowerCase()));
          if (filtered.length > 0) candidates = filtered;
      }
      candidates.sort((a, b) => a.lastVisited - b.lastVisited);
      // Wait at least 2 hours before revisiting same hub
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      const staleCandidates = candidates.filter(f => f.lastVisited < twoHoursAgo);
      return staleCandidates.length > 0 ? staleCandidates[0] : (intent && candidates.length > 0 ? candidates[0] : null);
  }

  private maybeDiscoverNewFavorite(url: string, category: string) {
      try {
          const urlObj = new URL(url);
          const rootUrl = `${urlObj.protocol}//${urlObj.hostname}`;
          if (!this.favorites.some(f => f.url === rootUrl)) {
              this.addFavorite(rootUrl, category, 'discovered');
          }
      } catch (e) {}
  }

  // --- Persistence ---

  public addFavorite(url: string, category: string, source: 'user_added' | 'discovered' = 'user_added') {
      if (this.favorites.some(f => f.url === url)) return;
      this.favorites.push({ url, category, lastVisited: 0, visitCount: 0, addedAt: Date.now(), source });
      this.saveFavorites();
      console.log(`⭐ New favorite added: ${url}`);
  }

  private updateLinkTracker(url: string, hash: string) {
      this.linkTracker.set(url, { url, lastScraped: Date.now(), contentHash: hash });
  }

  private loadFavorites() {
    try {
        if (!fs.existsSync(this.DATA_DIR)) fs.mkdirSync(this.DATA_DIR, { recursive: true });
        if (fs.existsSync(this.FAVORITES_PATH)) {
            this.favorites = JSON.parse(fs.readFileSync(this.FAVORITES_PATH, 'utf8'));
        } else {
            this.favorites = [...this.DEFAULT_FAVORITES];
            this.saveFavorites();
        }
    } catch (e) { this.favorites = [...this.DEFAULT_FAVORITES]; }
  }

  private saveFavorites() {
      try { fs.writeFileSync(this.FAVORITES_PATH, JSON.stringify(this.favorites, null, 2)); } catch (e) {}
  }

  private loadLinkTracker() {
      try {
          if (fs.existsSync(this.TRACKER_PATH)) {
              const data = JSON.parse(fs.readFileSync(this.TRACKER_PATH, 'utf8'));
              this.linkTracker = new Map(data.map((i: any) => [i.url, i]));
          }
      } catch (e) { console.error('Error loading link tracker', e); }
  }

  private saveLinkTracker() {
      try {
          const data = Array.from(this.linkTracker.values());
          fs.writeFileSync(this.TRACKER_PATH, JSON.stringify(data, null, 2));
      } catch (e) { console.error('Error saving link tracker', e); }
  }

  getStats() {
      return {
          favoritesCount: this.favorites.length,
          pagesVisitedThisHour: this.pagesVisitedThisHour,
          mostVisited: this.favorites.sort((a,b) => b.visitCount - a.visitCount)[0]?.url
      };
  }
}

---
./src/services/ProcessedMessageServicePostgres.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';

export class ProcessedMessageServicePostgres {
  constructor() {
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  async hasMessageBeenProcessed(messageId: string): Promise<boolean> {
    try {
      const result = await prisma.processedMessage.findUnique({
        where: {
          messageId,
        },
      });
      return !!result;
    } catch (error) {
      console.error('❌ Failed to check if message was processed:', error);
      return false;
    }
  }

  async markMessageAsProcessed(messageId: string, senderNumber?: string, messageType?: string): Promise<void> {
    try {
      await prisma.processedMessage.upsert({
        where: {
          messageId,
        },
        update: {
          senderNumber,
          messageType,
          processedAt: new Date(),
        },
        create: {
          messageId,
          senderNumber,
          messageType,
        },
      });
    } catch (error) {
      console.error('❌ Failed to mark message as processed:', error);
      throw error;
    }
  }

  async cleanupOldEntries(daysOlderThan: number = 30): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysOlderThan);

      const result = await prisma.processedMessage.deleteMany({
        where: {
          processedAt: {
            lt: cutoff,
          },
        },
      });

      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old entries:', error);
      return 0;
    }
  }

  /**
   * Get statistics about processed messages
   */
  async getStats(): Promise<{
    totalProcessed: number;
    last24Hours: number;
    byType: Record<string, number>;
  }> {
    try {
      const [totalProcessed, last24Hours, byType] = await Promise.all([
        this.getCount(),
        this.getCountLast24Hours(),
        this.getCountByType(),
      ]);

      return {
        totalProcessed,
        last24Hours,
        byType,
      };
    } catch (error) {
      console.error('❌ Failed to get processed messages stats:', error);
      return {
        totalProcessed: 0,
        last24Hours: 0,
        byType: {},
      };
    }
  }

  private async getCount(): Promise<number> {
    try {
      return await prisma.processedMessage.count();
    } catch (error) {
      console.error('❌ Failed to get count:', error);
      return 0;
    }
  }

  private async getCountLast24Hours(): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 1);

      return await prisma.processedMessage.count({
        where: {
          processedAt: {
            gte: cutoff,
          },
        },
      });
    } catch (error) {
      console.error('❌ Failed to get count for last 24 hours:', error);
      return 0;
    }
  }

  private async getCountByType(): Promise<Record<string, number>> {
    try {
      const result = await prisma.processedMessage.groupBy({
        by: ['messageType'],
        _count: {
          messageId: true,
        },
      });

      const counts: Record<string, number> = {};
      result.forEach(row => {
        counts[row.messageType || 'unknown'] = row._count.messageId;
      });
      return counts;
    } catch (error) {
      console.error('❌ Failed to get count by type:', error);
      return {};
    }
  }
}

---
./src/services/VectorStoreServicePostgres.ts
---
import { prisma, PrismaDatabaseUtils } from '../config/prisma';
import { OpenAIService } from './openaiService';
import { TextChunker } from '../utils/textChunker';
import { v4 as uuidv4 } from 'uuid';

export interface DocumentMetadata {
  source: string;
  date: string;
  category: string;
  title?: string;
}

export class VectorStoreServicePostgres {
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService) {
    this.openaiService = openaiService;
    // Initialize database connection
    PrismaDatabaseUtils.initialize().catch(console.error);
  }

  /**
   * Optimized Cosine Similarity for Float64 Arrays
   */
  private cosineSimilarity(vecA: Float64Array, vecB: Float64Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async addDocument(content: string, metadata: DocumentMetadata): Promise<void> {
    if (!content) return;
    const chunks = TextChunker.split(content);
    console.log(`📚 Ingesting "${metadata.title}" - ${chunks.length} chunks`);

    try {
      const records = [];
      
      for (const chunk of chunks) {
        try {
          const embedding = await this.openaiService.createEmbedding(chunk);
          
          // Convert array to Float64Array buffer
          const vectorBuffer = Buffer.from(new Float64Array(embedding).buffer);

          records.push({
            id: uuidv4(),
            content: chunk,
            vector: vectorBuffer, // Store as BYTEA
            source: metadata.source,
            date: metadata.date,
            category: metadata.category,
            title: metadata.title || ''
          });
        } catch (e) {
          console.warn('Embedding failed:', e);
        }
      }

      if (records.length > 0) {
        // Use transaction for batch insert
        await prisma.$transaction(
          records.map(record => 
            prisma.document.create({
              data: record,
            })
          )
        );
        console.log(`💾 Saved ${records.length} vectors to PostgreSQL (BYTEA format).`);
      }
    } catch (error) {
      console.error('❌ Failed to add document to vector store:', error);
    }
  }

  async search(query: string, limit: number = 4, filter?: { category?: string }): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);
      // Convert query to TypedArray for faster math
      const queryVec = new Float64Array(queryEmbedding);

      const where: any = {};
      if (filter?.category) {
        where.category = filter.category;
      }
      
      const rows = await prisma.document.findMany({
        where,
      });

      const results = rows.map(row => {
        // Convert BYTEA back to Float array
        const docVec = new Float64Array(
          row.vector.buffer,
          row.vector.byteOffset,
          row.vector.byteLength / 8
        );

        return {
          ...row,
          score: this.cosineSimilarity(queryVec, docVec)
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

      if (results.length === 0) return "No relevant knowledge found.";

      return results.map(r =>
        `[Source: ${r.title} (${r.date})]\n${r.content}`
      ).join('\n\n---\n\n');

    } catch (error) {
      console.error('Vector search failed:', error);
      return "Error searching knowledge base.";
    }
  }

  /**
   * Get vector store statistics
   */
  async getStats(): Promise<{
    totalDocuments: number;
    byCategory: Record<string, number>;
    oldestDocument: string;
    newestDocument: string;
  }> {
    try {
      const [total, byCategory, oldest, newest] = await Promise.all([
        prisma.document.count(),
        prisma.document.groupBy({
          by: ['category'],
          _count: {
            id: true,
          },
        }),
        prisma.document.findFirst({
          orderBy: {
            // Assuming we have a created_at field, using id as fallback
            id: 'asc',
          },
        }),
        prisma.document.findFirst({
          orderBy: {
            id: 'desc',
          },
        }),
      ]);

      const categoryCounts: Record<string, number> = {};
      byCategory.forEach(group => {
        categoryCounts[group.category || 'unknown'] = group._count.id;
      });

      return {
        totalDocuments: total,
        byCategory: categoryCounts,
        oldestDocument: oldest?.id || 'No documents',
        newestDocument: newest?.id || 'No documents',
      };
    } catch (error) {
      console.error('❌ Failed to get vector store stats:', error);
      return {
        totalDocuments: 0,
        byCategory: {},
        oldestDocument: 'No documents',
        newestDocument: 'No documents',
      };
    }
  }

  /**
   * Clean up old vector documents
   */
  async cleanupOldDocuments(maxAgeDays: number = 90): Promise<number> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);

      const result = await prisma.document.deleteMany({
        where: {
          createdAt: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        console.log(`🧹 Cleaned up ${result.count} old vector documents`);
      }

      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old vector documents:', error);
      return 0;
    }
  }
}

---
./src/services/googleSearchService.ts
---
import axios from 'axios';

export interface GoogleSearchConfig {
  apiKey: string;
  searchEngineId: string;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export class GoogleSearchService {
  private config: GoogleSearchConfig;

  constructor(config: GoogleSearchConfig) {
    this.config = config;
  }

  /**
   * Perform a Google search using the Custom Search JSON API
   */
  async search(query: string, numResults: number = 5, startIndex: number = 1): Promise<SearchResult[]> {
    try {
      console.log('🌐 Making Google API Request:', {
        query: query,
        numResults: numResults,
        startIndex: startIndex,
        engineId: this.config.searchEngineId.substring(0, 10) + '...'
      });

      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: this.config.apiKey,
          cx: this.config.searchEngineId,
          q: query,
          num: Math.min(numResults, 10), // Google API max is 10 results per request
          start: startIndex,
        },
      });

      const items = response.data.items || [];

      console.log('📊 Google API Response:', {
        query: query,
        totalResults: response.data.searchInformation?.totalResults || 0,
        itemsFound: items.length,
        startIndex: startIndex,
        items: items.map((item: any) => ({
          title: item.title?.substring(0, 30) + (item.title?.length > 30 ? '...' : ''),
          link: item.link?.substring(0, 30) + (item.link?.length > 30 ? '...' : '')
        }))
      });

      if (items.length > 0) {
        return items.map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
        }));
      }

      return [];
    } catch (error) {
      console.error('❌ Google search error:', {
        error: error instanceof Error ? error.message : `${error}`,
        query: query,
        startIndex: startIndex
      });
      throw new Error('Failed to perform Google search');
    }
  }

  /**
   * Perform multiple Google search requests to get more results
   */
  async searchMultiple(query: string, totalResults: number = 10): Promise<SearchResult[]> {
    const maxPerRequest = 10;
    const results: SearchResult[] = [];
    let startIndex = 1;
    let requestsMade = 0;
    const maxRequests = 3; // Limit to avoid excessive API calls

    while (results.length < totalResults && requestsMade < maxRequests) {
      const resultsNeeded = totalResults - results.length;
      const numResults = Math.min(resultsNeeded, maxPerRequest);

      try {
        const batchResults = await this.search(query, numResults, startIndex);
        results.push(...batchResults);

        if (batchResults.length < numResults) {
          break; // No more results available
        }

        startIndex += batchResults.length;
        requestsMade++;

        // Add small delay between requests to avoid rate limiting
        if (requestsMade < maxRequests && results.length < totalResults) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.warn('⚠️ Partial Google search failure:', {
          error: error instanceof Error ? error.message : `${error}`,
          query: query,
          startIndex: startIndex
        });
        break; // Continue with partial results
      }
    }

    // Remove duplicates by URL
    const uniqueResults = results.filter((result, index, self) =>
      index === self.findIndex(r => r.link === result.link)
    );

    console.log('📈 Multiple search requests completed:', {
      query: query,
      totalRequested: totalResults,
      totalObtained: uniqueResults.length,
      requestsMade: requestsMade
    });

    return uniqueResults.slice(0, totalResults);
  }

  /**
   * Format search results for LLM consumption
   */
  formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No search results found.';
    }

    return results.map((result, index) =>
      `[${index + 1}] ${result.title}\n${result.link}\n${result.snippet}\n`
    ).join('\n');
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey && !!this.config.searchEngineId;
  }
}

// Helper function to create GoogleSearchService instance from environment variables
export function createGoogleSearchServiceFromEnv(): GoogleSearchService {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    throw new Error('GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables are required');
  }

  return new GoogleSearchService({
    apiKey,
    searchEngineId,
  });
}

---
./src/services/mediaService.ts
---
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';
import { WhatsAppAPIConfig } from '../types/whatsapp';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from './openaiService';

export interface MediaInfo {
  filename: string;
  filepath: string;
  mimeType: string;
  size: number;
  sha256: string;
  type: 'image' | 'audio';
}

export class MediaService {
  private config: WhatsAppAPIConfig;
  private openaiService: OpenAIService | null;

  constructor(config: WhatsAppAPIConfig) {
    this.config = config;

    // Initialize OpenAI service if API key is available
    this.openaiService = null;
    this.initializeOpenAIService();
  }

  async downloadAndSaveMedia(
    mediaId: string,
    mimeType: string,
    sha256: string,
    mediaType: 'image' | 'audio'
  ): Promise<MediaInfo> {
    try {
      // Get media URL from WhatsApp API
      const mediaUrl = `https://graph.facebook.com/${this.config.apiVersion}/${mediaId}`;

      const response = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        }
      });

      const downloadUrl = response.data.url;

      // Download the media file
      const mediaResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`
        }
      });

      // Determine file extension from mime type
      const extension = this.getExtensionFromMimeType(mimeType);
      const timestamp = Date.now();
      const filename = `${mediaType}_${timestamp}_${mediaId.substring(0, 8)}.${extension}`;
      const filepath = path.join('data', 'media', filename);

      // Ensure directory exists
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save file
      fs.writeFileSync(filepath, mediaResponse.data);

      // Get file stats
      const stats = fs.statSync(filepath);

      return {
        filename,
        filepath,
        mimeType,
        size: stats.size,
        sha256,
        type: mediaType
      };

    } catch (error) {
      console.error('Error downloading media:', error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to download media: ${errorMessage}`);
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      // Image types
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',

      // Audio types - WhatsApp commonly uses these
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/wav': 'wav',
      'audio/aac': 'aac',
      'audio/m4a': 'm4a',
      'audio/mp4': 'm4a', // WhatsApp often sends audio as MP4 container
      'audio/x-m4a': 'm4a',
      'audio/flac': 'flac',
      'audio/x-wav': 'wav',
      'audio/amr': 'amr', // WhatsApp voice messages often use AMR
      'audio/3gpp': '3gp', // Common mobile audio format

      // Video types (for future expansion)
      'video/mp4': 'mp4',
      'video/3gpp': '3gp',
      'video/quicktime': 'mov'
    };

    return mimeToExt[mimeType] || 'bin';
  }

  getMediaInfoResponse(mediaInfo: MediaInfo): string {
    return `📁 Media received!\n\n` +
           `Type: ${mediaInfo.type.toUpperCase()}\n` +
           `Filename: ${mediaInfo.filename}\n` +
           `Size: ${this.formatFileSize(mediaInfo.size)}\n` +
           `MIME Type: ${mediaInfo.mimeType}\n` +
           `SHA256: ${mediaInfo.sha256.substring(0, 12)}...`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async transcribeAudio(audioFilePath: string, language?: string): Promise<string> {
    try {
      const apiUrl = process.env.AUDIO_SERVICE_API_URL;
      const apiKey = process.env.AUDIO_SERVICE_API_KEY;

      if (!apiUrl || !apiKey) {
        throw new Error('Audio transcription service not configured');
      }

      // Read the audio file
      const audioBuffer = fs.readFileSync(audioFilePath);
      const fileName = path.basename(audioFilePath);

      // Determine content type based on file extension
      const extension = fileName.split('.').pop()?.toLowerCase();
      let contentType = 'audio/wav';
      if (extension === 'mp3') contentType = 'audio/mpeg';
      else if (extension === 'm4a') contentType = 'audio/mp4';
      else if (extension === 'flac') contentType = 'audio/flac';
      else if (extension === 'ogg') contentType = 'audio/ogg';

      // Create form data
      const form = new FormData();
      form.append('audio_file', audioBuffer, {
        filename: fileName,
        contentType: contentType,
      });

      if (language) {
        form.append('language', language);
      }

      // Make API request to audio service
      const response = await axios.post(`${apiUrl}transcribe`, form, {
        headers: {
          'X-API-Key': apiKey,
          ...form.getHeaders(),
        },
      });
      console.log('response', response);
      // Handle different response formats from audio service
      if (response.data.text) {
        // Direct text response format: { text: "transcribed text" }
        return response.data.text;
      } else if (response.data.success && response.data.text) {
        // Success-based response format: { success: true, text: "transcribed text" }
        return response.data.text;
      } else {
        throw new Error(response.data.error || response.data.detail || 'Transcription failed');
      }

    } catch (error) {
      console.error('Error transcribing audio:', error);
      const errorMessage = error instanceof Error ? error.message : `${error}`;
      throw new Error(`Failed to transcribe audio: ${errorMessage}`);
    }
  }

  async getTranscriptionResponse(transcribedText: string, mediaInfo: MediaInfo): Promise<string> {
    // Generate enhanced AI response based on the transcription
    const aiResponse = await this.generateAIResponseFromTranscription(transcribedText);

    return `🎤 I heard your audio message!\n\n${aiResponse}\n\n` +
           `Note: This response was generated automatically based on the audio content and may contain inaccuracies.`;
  }

  /**
   * Analyze image content using OpenAI's vision capabilities
   * Returns only the enhanced AI response, not the raw analysis
   */
  async analyzeImageWithOpenAI(imagePath: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) {
      throw new Error('OpenAI service is not configured for image analysis');
    }

    try {
      // Use specialized media image analysis prompt from config if available
      const mediaImagePrompt = this.openaiService.getConfig()?.prompts?.mediaImageAnalysis;
      const analysis = await this.openaiService.analyzeImage(imagePath, mediaImagePrompt);

      // Generate enhanced AI response based on the image analysis
      const aiResponse = await this.generateEnhancedAIResponseFromAnalysis(analysis);

      return aiResponse;
    } catch (error) {
      console.error('Error analyzing image with OpenAI:', error);
      throw new Error('Failed to analyze image with OpenAI');
    }
  }

  /**
   * Generate enhanced AI response based on image analysis with contextual suggestions
   */
  private async generateEnhancedAIResponseFromAnalysis(analysis: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) {
      return 'I analyzed the image but cannot generate a response as OpenAI is not configured.';
    }

    try {
      // Use enhanced image response prompt from config if available
      const enhancedPrompt = this.openaiService.getConfig()?.prompts?.enhancedImageResponse;

      // If no custom prompt is configured, use the default one
      const prompt = enhancedPrompt
        ? enhancedPrompt.replace('{analysis}', analysis)
        : `Based on this detailed image analysis: "${analysis}"

Generate a helpful, engaging, and conversational response with specific contextual awareness:

- If it's a food menu: suggest popular dishes, recommend what to order based on cuisine type, mention any specials or pricing
- If it's a building or landmark: suggest where it might be located, provide architectural details, historical context, and nearby attractions
- If it's a hand holding an object: identify what the object is, suggest its purpose or how to use it, provide related recommendations
- If it's a product: provide recommendations, usage tips, where to buy it, or similar alternatives
- If it's a document or text-heavy: summarize key information clearly, highlight important details, suggest next steps
- If it's nature or scenery: provide interesting facts, travel suggestions, best times to visit, or photography tips
- If it's people or events: provide appropriate commentary, suggest related activities or social context
- If it's artwork or creative content: discuss the style, possible meaning, or artistic techniques

Keep the response natural, conversational, and focused on being genuinely helpful with practical suggestions.`;

      return await this.openaiService.generateTextResponse(prompt);
    } catch (error) {
      console.error('Error generating enhanced AI response from image analysis:', error);
      return 'I analyzed the image but encountered an error generating a response.';
    }
  }

  /**
   * Generate enhanced AI response based on audio transcription
   */
  private async generateAIResponseFromTranscription(transcription: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) {
      return 'I transcribed the audio but cannot generate a response as OpenAI is not configured.';
    }

    try {
      // Use audio transcription response prompt from config if available
      const transcriptionPrompt = this.openaiService.getConfig()?.prompts?.audioTranscriptionResponse;

      // If no custom prompt is configured, use the default one
      const prompt = transcriptionPrompt
        ? transcriptionPrompt.replace('{transcription}', transcription)
        : `Based on this audio transcription: "${transcription}"

Generate a helpful, engaging, and conversational response. Provide thoughtful commentary, answer questions, or continue the conversation naturally based on the audio content. Keep it conversational and focused on being helpful.`;

      return await this.openaiService.generateTextResponse(prompt);
    } catch (error) {
      console.error('Error generating AI response from transcription:', error);
      return 'I transcribed the audio but encountered an error generating a response.';
    }
  }

  /**
   * Enhanced media info response that includes only the AI-generated response
   * without raw analysis details
   */
  getEnhancedMediaInfoResponse(mediaInfo: MediaInfo, aiResponse?: string): string {
    let response = `📁 I received your ${mediaInfo.type}!\n\n`;

    if (aiResponse) {
      response += `${aiResponse}\n\n`;
    } else {
      response += `Type: ${mediaInfo.type.toUpperCase()}\n` +
                  `Filename: ${mediaInfo.filename}\n` +
                  `Size: ${this.formatFileSize(mediaInfo.size)}\n` +
                  `MIME Type: ${mediaInfo.mimeType}`;
    }

    return response;
  }
  /**
   * Initialize OpenAI service asynchronously
   */
  private async initializeOpenAIService(): Promise<void> {
    try {
      // Try to load from config file first
      this.openaiService = await createOpenAIServiceFromConfig();
      console.log('OpenAI service initialized successfully from config file in MediaService');
    } catch (configError) {
      console.warn('Failed to initialize from config file in MediaService, trying legacy environment variables:', configError instanceof Error ? configError.message : `${configError}`);

      // Fall back to environment variables for backward compatibility
      try {
        this.openaiService = createOpenAIServiceFromEnv();
        console.log('OpenAI service initialized successfully from environment variables (legacy mode) in MediaService');
      } catch (envError) {
        console.warn('OpenAI service not available for media analysis:', envError instanceof Error ? envError.message : `${envError}`);
        this.openaiService = null;
      }
    }
  }
}

---
./src/services/newsProcessorService.ts
---
import { OpenAIService } from './openaiService';
import { GoogleSearchService } from './googleSearchService';
import { VectorStoreServicePostgres } from './VectorStoreServicePostgres';
import { NewsArticle } from './newsScrapeService';

export class NewsProcessorService {
  private openaiService: OpenAIService;
  private googleService: GoogleSearchService;
  private vectorStore: VectorStoreServicePostgres;

  constructor(
    openaiService: OpenAIService,
    googleService: GoogleSearchService,
    vectorStore: VectorStoreServicePostgres
  ) {
    this.openaiService = openaiService;
    this.googleService = googleService;
    this.vectorStore = vectorStore;
  }

  /**
   * Analyzes an article, enriches it with Google Search if complex, and learns it.
   */
  async processAndLearn(article: NewsArticle, category: string): Promise<void> {
    try {
      console.log(`🤔 Learning: ${article.title}`);

      // 1. Check if we need to search Google (same as before)
      const analysisPrompt = `
        Analyze this news article.
        1. Summarize the key facts in 2 sentences.
        2. Identify if this topic requires more context to be fully understood (e.g., technical terms, historical context, stock symbols).
        3. If yes, generate a specific search query. If no, output "NO_SEARCH".
        
        Article:
        ${article.title}
        ${article.content.substring(0, 1000)}
      `;

      const analysis = await this.openaiService.generateTextResponse(analysisPrompt);
      
      let fullContent = `Title: ${article.title}\n\n${article.content}`;
      let sourceLabel = 'web_scrape';

      // 2. Enrichment Step (Google Search)
      // If the LLM suggests a search (and it's not NO_SEARCH), we enrich.
      const searchMatch = analysis.match(/Search Query: "(.*)"/i) || analysis.split('\n').pop()?.match(/"(.*)"/);
      
      if (!analysis.includes("NO_SEARCH") && searchMatch) {
        const query = searchMatch[1];
        console.log(`🔍 Enriching knowledge with Google Search: ${query}`);
        
        const searchResults = await this.googleService.search(query, 3);
        const searchContext = this.googleService.formatSearchResults(searchResults);

        // Append context to the content we want to save
        fullContent += `\n\n--- Additional Context from Google Search ---\n${searchContext}`;
        sourceLabel = 'web_scrape_enriched';
      }

      // 3. Store in Vector DB (The DB handles chunking and embedding now)
      await this.vectorStore.addDocument(fullContent, {
        source: sourceLabel,
        date: new Date().toISOString().split('T')[0],
        category: category,
        title: article.title
      });

    } catch (error) {
      console.error('Error processing news for learning:', error);
    }
  }
}

---
./src/services/newsScrapeService.ts
---
import * as fs from 'fs';
import * as path from 'path';
import { WebScrapeService, WebScrapeResult } from './webScrapeService';
import { NewsProcessorService } from './newsProcessorService'; // Import new service

export interface NewsArticle {
  title: string;
  url: string;
  content: string;
  source: string;
  category?: string;
  scrapedAt?: string;
}

// Define supported categories
type NewsCategory = 'general' | 'tech' | 'business' | 'sports' | 'world';

export class NewsScrapeService {
  private webScrapeService: WebScrapeService;
  private newsProcessor?: NewsProcessorService; // Optional dependency
  
  // Storage for our cached news summaries
  private newsCache: Map<string, string> = new Map();
  private isScraping: boolean = false;
  private lastUpdated: Date | null = null;

  // Hong Kong focused, Mobile-Friendly URLs
  private categorySources: Record<NewsCategory, string[]> = {
    'general': [
       'https://news.rthk.hk/rthk/en/',
       'https://hongkongfp.com/'
    ],
    'world': [
       'https://www.bbc.com/news/world'
    ],
    'tech': [
       'https://techcrunch.com/',
       'https://www.theverge.com/'
    ],
    'business': [
       'https://www.cnbc.com/world/?region=world'
    ],
    'sports': [
       'https://www.skysports.com/news-wire'
    ]
  };

  constructor(webScrapeService: WebScrapeService, newsProcessor?: NewsProcessorService) {
    this.webScrapeService = webScrapeService;
    this.newsProcessor = newsProcessor;
  }

  /**
   * Start the background service loop
   */
  public startBackgroundService(intervalMinutes: number = 30) {
    console.log(`🕰️ Starting Background News Service (Every ${intervalMinutes} mins)`);
    this.refreshNewsCache(); // Run immediately
    setInterval(() => this.refreshNewsCache(), intervalMinutes * 60 * 1000);
  }

  /**
   * Scrapes all categories and updates the cache
   */
  private async refreshNewsCache() {
    if (this.isScraping) return;
    this.isScraping = true;
    console.log('🔄 Background Service: Updating News Cache...');

    try {
      const categories = Object.keys(this.categorySources) as NewsCategory[];
      const dateStr = new Date().toISOString().split('T')[0];
      const storageBase = path.join('data', 'news', dateStr);

      // Ensure daily directory exists
      if (!fs.existsSync(storageBase)) {
        fs.mkdirSync(storageBase, { recursive: true });
      }

      for (const cat of categories) {
        const urls = this.categorySources[cat];
        // FORCE MOBILE = TRUE
        const results = await this.webScrapeService.scrapeUrls(urls, undefined, true);
        
        if (results.length > 0) {
            // 1. Format for Cache (Immediate Tool Access)
            const formatted = this.formatNewsForLLM(results);
            this.newsCache.set(cat, formatted);
            
            // 2. Save Raw Files & Trigger Learning
            await this.handlePersistenceAndLearning(results, cat, storageBase);
            
            console.log(`✅ Cached & Processed ${results.length} articles for [${cat}]`);
        }
      }
      this.lastUpdated = new Date();
    } catch (error) {
      console.error('❌ Background Service Error:', error);
    } finally {
      this.isScraping = false;
    }
  }

  private async handlePersistenceAndLearning(results: WebScrapeResult[], category: string, storageBase: string) {
    const filePath = path.join(storageBase, `${category}.json`);
    
    // Convert to NewsArticle format
    const articles: NewsArticle[] = results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content,
        source: 'web_scrape',
        category: category,
        scrapedAt: new Date().toISOString()
    }));

    // Save to Disk
    fs.writeFileSync(filePath, JSON.stringify(articles, null, 2));

    // Trigger "Learning" if Processor is available
    if (this.newsProcessor) {
        // Limit to top 2 articles per category to save tokens/time
        for (const article of articles.slice(0, 2)) {
            await this.newsProcessor.processAndLearn(article, category);
        }
    }
  }

  /**
   * Returns cached string for the Tool to use
   */
  public getCachedNews(category: string = 'general'): string {
    // Basic normalization
    let key: NewsCategory = 'general';
    const lower = category.toLowerCase();
    if (lower.includes('tech')) key = 'tech';
    else if (lower.includes('busin') || lower.includes('financ')) key = 'business';
    else if (lower.includes('sport')) key = 'sports';
    else if (lower.includes('world')) key = 'world';

    const data = this.newsCache.get(key);
    
    if (!data) {
        // If cache is empty, trigger a scrape (fallback)
        this.refreshNewsCache(); 
        return "I am currently updating my news feed. Please ask again in 1 minute.";
    }

    const timeAgo = this.lastUpdated 
      ? Math.floor((new Date().getTime() - this.lastUpdated.getTime()) / 60000) 
      : 0;

    return `[SYSTEM: News fetch time: ${timeAgo} mins ago. Category: ${key.toUpperCase()}]\n\n${data}`;
  }

  private formatNewsForLLM(results: WebScrapeResult[]): string {
    return results.map((r, i) => 
        `Headline: ${r.title}\nSource: ${r.url}\nSummary: ${r.content.substring(0, 350)}...`
    ).join('\n\n');
  }
}

export function createNewsScrapeService(webScrapeService: WebScrapeService, newsProcessor?: NewsProcessorService): NewsScrapeService {
  return new NewsScrapeService(webScrapeService, newsProcessor);
}

---
./src/services/openaiService.ts
---
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { cleanLLMResponse } from '../utils/responseCleaner';
import type { ChatCompletionTool } from 'openai/resources/chat/completions';
import { executeTool } from '../tools';
import { ToolRegistry } from '../core/ToolRegistry';
import { AIConfig } from '../types/aiConfig';
import { ConfigLoader } from '../utils/configLoader';

export interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  visionModel?: string;
  temperature?: number;
  maxTokens?: number;
  enableToolCalling?: boolean;
  embeddingModel?: string;
}

export class OpenAIService {
  private openai: OpenAI;
  private config: OpenAIConfig;
  private chatbotName: string;
  private prompts: AIConfig['prompts'];

  constructor(config: AIConfig, chatbotName?: string) {
    this.config = {
      model: config.model || 'gpt-4o',
      visionModel: config.visionModel || 'gpt-4o',
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 1000,
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      enableToolCalling: config.enableToolCalling ?? true,
      embeddingModel: config.embeddingModel || 'text-embedding-ada-002'
    };
    this.chatbotName = chatbotName || 'Lucy';
    this.prompts = config.prompts || {};

    this.openai = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });
  }

  /**
   * Generate a response to a text message using OpenAI
   */
  async generateTextResponse(
    message: string,
    context?: string,
    tools?: ChatCompletionTool[],
    toolChoice?: 'auto' | 'none' | 'required'
  ): Promise<string> {
    try {
      // Use custom prompt from config if available, otherwise use default
      const textPrompt = this.prompts?.textResponse || `You are {chatbotName}, a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message.`;

      let systemPrompt = textPrompt.replace('{chatbotName}', this.chatbotName);

      if (context) {
        systemPrompt += ` Context: ${context}`;
      }

      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: message
        }
      ];

      const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
        model: this.config.model!,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      };

      // Add tools if provided and tool calling is enabled
      if (tools && tools.length > 0 && this.config.enableToolCalling) {
        requestOptions.tools = tools;
        requestOptions.tool_choice = toolChoice || 'auto';
      }

      const response = await this.openai.chat.completions.create(requestOptions);

      const rawResponse = response.choices[0]?.message?.content?.trim() || 'I apologize, but I could not generate a response. Please try again.';

      // Log AI response
      console.log('🤖 AI Response:', {
        message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        rawResponse: rawResponse.substring(0, 200) + (rawResponse.length > 200 ? '...' : ''),
        hasContext: !!context,
        model: this.config.model
      });

      return cleanLLMResponse(rawResponse);
    } catch (error) {
      console.error('Error generating text response:', error);
      throw new Error('Failed to generate response from OpenAI');
    }
  }

  /**
   * Generate response with tool calling support - let LLM decide when to use tools
   */
  async generateResponseWithTools(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    maxToolRounds: number = 15, // Increased from 5 to 15 as requested
    toolRegistry?: ToolRegistry // Optional ToolRegistry for new BaseTool system
  ): Promise<string> {
    if (!this.config.enableToolCalling || !tools || tools.length === 0) {
      // Fall back to regular response generation without tools
      const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
      return this.generateTextResponse(
        lastUserMessage?.content as string || '',
        undefined,
        undefined,
        'none' // Explicitly disable tools
      );
    }

    let currentMessages = [...messages];
    let toolCallRound = 0;

    while (toolCallRound < maxToolRounds) {
      toolCallRound++;

      const response = await this.openai.chat.completions.create({
        model: this.config.model!,
        messages: currentMessages,
        tools,
        tool_choice: 'auto', // Let LLM decide when to use tools
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('No response from OpenAI');
      }

      // Log tool calling round
      console.log('🔄 Tool Calling Round:', {
        round: toolCallRound,
        hasToolCalls: !!message.tool_calls && message.tool_calls.length > 0,
        toolCallCount: message.tool_calls?.length || 0,
        hasContent: !!message.content,
        contentPreview: message.content?.substring(0, 50) || 'No content'
      });

      currentMessages.push(message);

      // If no tool calls, return the final response immediately
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return cleanLLMResponse(message.content || 'I apologize, but I could not generate a response.');
      }

      // Process tool calls using appropriate method
      let toolResults;
      if (toolRegistry) {
        // Use new BaseTool system via ToolRegistry
        toolResults = await this.processToolCallsWithRegistry(message.tool_calls, toolRegistry);
      } else {
        // Use old tool system
        toolResults = await this.processToolCalls(message.tool_calls);
      }

      // Add tool results to the conversation
      for (const result of toolResults) {
        currentMessages.push({
          role: 'tool',
          content: result.error
            ? `Error: ${result.error}`
            : (typeof result.result === 'string' ? result.result : JSON.stringify(result.result)),
          tool_call_id: result.tool_call_id
        });
      }

      // Safety check to prevent infinite loops
      if (toolCallRound >= maxToolRounds) {
        console.warn('⚠️ Maximum tool call rounds reached:', maxToolRounds);

        // Get the last user message for context
        const lastUserMessage = messages.slice().reverse().find(msg => msg.role === 'user');
        const userQuery = lastUserMessage?.content;

        // Use custom search limit prompt from config if available, otherwise use default
        const toolLimitPrompt = this.prompts?.searchLimit || `I reached the maximum tool usage limit while processing your request. Please try a more specific query or ask me something else.`;

        return await this.generateTextResponse(
          toolLimitPrompt,
          undefined,
          undefined,
          'none' // Don't use tools for this final response
        );
      }
    }

    return 'I apologize, but I encountered an issue while processing your request. Please try again.';
  }

  /**
   * Process tool calls by executing the appropriate tools
   */
  private async processToolCalls(toolCalls: any[]): Promise<any[]> {
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      try {
        console.log('🛠️ Processing tool call:', {
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments
        });

        const args = JSON.parse(toolCall.function.arguments);
        const result = await executeTool(toolCall.function.name, args);

        results.push({
          tool_call_id: toolCall.id,
          result: result
        });

        console.log('✅ Tool execution completed:', {
          toolName: toolCall.function.name,
          resultLength: typeof result === 'string' ? result.length : 'object'
        });

      } catch (error) {
        console.error('❌ Tool execution failed:', {
          toolName: toolCall.function.name,
          error: error instanceof Error ? error.message : `${error}`
        });

        results.push({
          tool_call_id: toolCall.id,
          error: error instanceof Error ? error.message : 'Tool execution failed'
        });
      }
    }

    return results;
  }

  /**
   * Process tool calls using ToolRegistry (for new BaseTool system)
   */
  async processToolCallsWithRegistry(toolCalls: any[], toolRegistry: ToolRegistry): Promise<any[]> {
    const results: any[] = [];

    for (const toolCall of toolCalls) {
      try {
        console.log('🛠️ Processing tool call with registry:', {
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments
        });

        const args = JSON.parse(toolCall.function.arguments);
        const result = await toolRegistry.executeTool(toolCall.function.name, args);

        results.push({
          tool_call_id: toolCall.id,
          result: result
        });

        console.log('✅ Tool execution completed with registry:', {
          toolName: toolCall.function.name,
          resultLength: typeof result === 'string' ? result.length : 'object'
        });

      } catch (error) {
        console.error('❌ Tool execution failed with registry:', {
          toolName: toolCall.function.name,
          error: error instanceof Error ? error.message : `${error}`
        });

        results.push({
          tool_call_id: toolCall.id,
          error: error instanceof Error ? error.message : 'Tool execution failed'
        });
      }
    }

    return results;
  }


  /**
   * Get MIME type from file extension
   */
  private getMimeTypeFromExtension(extension: string): string {
    const mimeTypes: { [key: string]: string } = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      tiff: 'image/tiff',
      svg: 'image/svg+xml'
    };

    return mimeTypes[extension] || 'image/jpeg';
  }
  /**
   * @deprecated Use tool calling with analyze_image tool instead
   * Analyze image content using OpenAI's vision capabilities
   */
  async analyzeImage(imagePath: string, prompt?: string): Promise<string> {
    try {
      // Read the image file
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');

      // Determine MIME type from file extension
      const extension = path.extname(imagePath).toLowerCase().substring(1);
      const mimeType = this.getMimeTypeFromExtension(extension);

      // Use custom image prompt from config if available, otherwise use default
      const visionPrompt = prompt || this.prompts?.imageAnalysis || `Analyze this image comprehensively with context awareness. Describe what you see in detail, including:

- Objects, people, animals, text, colors, and environment
- If it's a food menu or restaurant scene: focus on menu items, prices, cuisine type, and popular dishes
- If it's a building, landmark, or location: provide architectural details, possible location clues, and historical context if recognizable
- If it's a product or object: identify the item, brand, purpose, and key features
- If it's a hand holding something: identify the object being held and its potential use
- If it's a document or text-heavy: transcribe all text accurately and note the document type
- If it's nature or scenery: describe the landscape, weather conditions, and geographical features
- If it's people or events: note activities, emotions, and social context

Include any text content exactly as it appears. Provide specific details that would help understand the context and purpose of the image.`;

      const response = await this.openai.chat.completions.create({
        model: this.config.visionModel!,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: visionPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`
                }
              }
            ]
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      const rawResponse = response.choices[0]?.message?.content?.trim() || 'I could not analyze this image. Please try again.';
      return cleanLLMResponse(rawResponse);
    } catch (error) {
      console.error('Error analyzing image:', error);
      throw new Error('Failed to analyze image with OpenAI');
    }
  }

  /**
   * Create embeddings for text content
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.config.embeddingModel!,
        input: text,
        encoding_format: 'float',
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw new Error('Failed to create embedding with OpenAI');
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * Get the current configuration
   */
  getConfig(): OpenAIConfig & { prompts?: AIConfig['prompts'] } {
    return {
      ...this.config,
      prompts: this.prompts
    };
  }
}

// Helper function to create OpenAIService instance from config file
export async function createOpenAIServiceFromConfig(): Promise<OpenAIService> {
  const configLoader = new ConfigLoader();

  try {
    const config = await configLoader.loadConfig();

    if (!config.apiKey) {
      throw new Error('API key is required in the config file');
    }

    return new OpenAIService(config, process.env.CHATBOT_NAME);
  } catch (error) {
    console.error('Failed to create OpenAI service from config:', error);
    throw new Error(`Failed to initialize OpenAI service: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper function to create OpenAIService instance from environment variables (legacy support)
export function createOpenAIServiceFromEnv(): OpenAIService {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required for legacy mode');
  }

  return new OpenAIService({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL,
    visionModel: process.env.OPENAI_VISION_MODEL,
    temperature: process.env.OPENAI_TEMPERATURE ? parseFloat(process.env.OPENAI_TEMPERATURE) : undefined,
    maxTokens: process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS) : undefined,
    enableToolCalling: process.env.OPENAI_ENABLE_TOOL_CALLING === 'true',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
  }, process.env.CHATBOT_NAME);
}

---
./src/services/webScrapeService.ts
---
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from './openaiService';

// --- TYPE DECLARATIONS ---
declare const window: any;
declare const document: any;

export interface WebScrapeResult {
  title: string;
  url: string;
  content: string;
  links: string[]; // Added links array
  extractedAt: string;
  method: 'html' | 'visual' | 'hybrid';
  mobileView?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
}

export interface ArticleCandidate {
  title: string;
  url: string;
}

export interface WebScrapeConfig {
  timeout?: number;
  userAgent?: string;
  viewport?: { width: number; height: number };
  maxRetries?: number;
  retryDelay?: number;
  navigationTimeout?: number;
  concurrency?: number;
  simulateHuman?: boolean;
  mobileView?: boolean;
  mobileDevice?: 'iphone' | 'android' | 'tablet' | 'custom';
}

export class WebScrapeService {
  private config: WebScrapeConfig;
  private browser: Browser | null = null;
  private openaiService: OpenAIService | null = null;

  // 1. UPDATED: Modern Mobile Presets (iPhone 14 Pro)
  private mobilePresets = {
    iphone: {
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    }
  };

  constructor(config: WebScrapeConfig = {}) {
    // Apply mobile configuration if requested
    let finalViewport = config.viewport;
    let finalUserAgent = config.userAgent;

    if (config.mobileView) {
      const device = config.mobileDevice || 'iphone';
      
      if (device !== 'custom') {
        // Only 'iphone' is supported in the updated presets
        const preset = this.mobilePresets.iphone;
        if (preset) {
          finalViewport = config.viewport || preset.viewport;
          finalUserAgent = config.userAgent || preset.userAgent;
        }
      } else {
        // Default mobile settings for custom device
        finalViewport = config.viewport || { width: 375, height: 812 };
        finalUserAgent = config.userAgent || 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36';
      }
    }

    this.config = {
      timeout: config.timeout || 60000,
      userAgent: finalUserAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      viewport: finalViewport || { width: 1280, height: 800 },
      maxRetries: config.maxRetries || 2,
      retryDelay: config.retryDelay || 1000,
      navigationTimeout: config.navigationTimeout || 30000,
      concurrency: config.concurrency || 3,
      simulateHuman: true,
      mobileView: config.mobileView || false,
      mobileDevice: config.mobileDevice,
    };

    this.initializeOpenAIService();
  }

  async initialize(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled'
        ]
      });
    }
  }

  /**
   * OPTIMIZATION: Block Ads and Trackers
   * Drastically reduces network activity and CPU usage.
   */
  private async setupBlockers(context: BrowserContext) {
    await context.route('**/*', route => {
      const url = route.request().url();
      const type = route.request().resourceType();

      if (
        type === 'media' ||
        type === 'image' ||
        url.includes('google-analytics') ||
        url.includes('doubleclick') ||
        url.includes('facebook.com/tr') ||
        url.includes('googletagmanager') ||
        url.includes('ads')
      ) {
        // Allow images if strictly necessary for visual extraction, but generally blocking them speeds up scraping.
        // If you rely heavily on visual extraction of small icons, you might comment out the 'image' check.
        if (type === 'image') return route.continue();
        return route.abort();
      }
      return route.continue();
    });
  }

  /**
   * OPTIMIZATION: Faster Modal Handling
   * Checks selectors in parallel to find buttons quickly.
   */
  private async handleModals(page: Page) {
    const commonSelectors = [
        'button:has-text("Accept")', 'button:has-text("Agree")', 'button:has-text("Allow")',
        '[aria-label="close"]', '.modal-close', '.cookie-banner button'
    ];

    try {
        // COMPATIBILITY FIX: Using Promise.all instead of Promise.any
        // We map every selector to a promise that resolves to the selector string if visible, or null if not.
        // Since all have a 500ms timeout, this waits max 500ms total.
        const results = await Promise.all(
            commonSelectors.map(sel =>
                page.locator(sel).first().isVisible({ timeout: 500 })
                    .then(visible => visible ? sel : null)
                    .catch(() => null)
            )
        );

        // Find the first valid selector that returned true
        const found = results.find(r => r !== null);

        if (found) {
            await page.locator(found).first().click({ timeout: 500, force: true }).catch(() => {});
        }
    } catch (e) {
        // Ignore errors, proceed to scrape
    }
  }

  /**
   * OPTIMIZATION: Smart Scroll Turbo
   * Bigger scroll steps + shorter waits.
   */
  private async fastSmartScroll(page: Page): Promise<void> {
    try {
        const viewportHeight = await page.evaluate(() => window.innerHeight);
        const scrollStep = viewportHeight;
        let currentScroll = 0;
        const maxScrollHeight = 15000; // Cap to prevent infinite scroll loops

        const maxSteps = Math.ceil(maxScrollHeight / scrollStep);

        for (let i = 0; i < maxSteps; i++) {
            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            if (currentScroll >= currentHeight) break;

            await page.evaluate((y) => window.scrollTo(0, y), currentScroll + scrollStep);
            currentScroll += scrollStep;
            await page.waitForTimeout(200); // Short wait for lazy load
        }

        // Reset to top
        await page.evaluate(() => window.scrollTo(0, 0));
    } catch (e) {
        // Ignore scroll errors
    }
  }

  private shouldUseMobileView(url: string): boolean {
    // Check if mobile view is explicitly configured
    if (this.config.mobileView) return true;
    
    // Auto-detect mobile sites based on URL patterns
    const mobilePatterns = [
      /m\./i,                    // m.domain.com
      /mobile\./i,               // mobile.domain.com
      /\/mobile\//i,             // domain.com/mobile/
      /\.mobi/i,                 // domain.mobi
      /touch\./i,                // touch.domain.com
      /\/wml\//i,                // WML mobile pages
    ];
    
    return mobilePatterns.some(pattern => pattern.test(url));
  }

  async scrapeUrl(url: string, selector?: string, forceMobile?: boolean): Promise<WebScrapeResult> {
    await this.initialize();
    if (!this.browser) throw new Error('Browser not initialized');

    const useMobileView = forceMobile || this.shouldUseMobileView(url);
    
    // Default Context Options
    const contextOptions: any = {
        viewport: this.config.viewport,
        userAgent: this.config.userAgent,
        deviceScaleFactor: 1,
    };

    // Apply iPhone Mobile Settings if requested
    if (useMobileView) {
        const preset = this.mobilePresets.iphone;
        contextOptions.viewport = preset.viewport;
        contextOptions.userAgent = preset.userAgent;
        contextOptions.isMobile = preset.isMobile;
        contextOptions.hasTouch = preset.hasTouch;
        contextOptions.deviceScaleFactor = preset.deviceScaleFactor;
    }

    let context: BrowserContext | null = null;
    let retryCount = 0;

    while (retryCount <= this.config.maxRetries!) {
        try {
            context = await this.browser.newContext(contextOptions);

            await this.setupBlockers(context);
            const page = await context.newPage();

            const navPromise = page.goto(url, {
                timeout: this.config.navigationTimeout,
                waitUntil: 'domcontentloaded'
            });

            await navPromise;

            // Parallel Execution: Handle Modals & Scroll
            await Promise.all([
                this.handleModals(page),
                this.fastSmartScroll(page)
            ]);

            const pageTitle = await page.title().catch(() => "Untitled");

            // Extract Links BEFORE cleaning content
            const links = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                return anchors
                    .map((a: any) => ({ href: a.href, text: a.innerText }))
                    .filter((link: any) =>
                        link.href.startsWith('http') &&
                        link.text.trim().length > 10 // Only substantial links
                    )
                    .map((link: any) => link.href);
            });
            
            // Unique links
            const uniqueLinks = [...new Set(links)] as string[];

            let extractedContent = await page.evaluate((inputSelector) => {
                const junkSelectors = [
                    'script', 'style', 'noscript', 'iframe', 'svg',
                    'nav', 'footer', 'header', '.ad', '.ads',
                    '#cookie-banner', '.cookie-consent'
                ];
                junkSelectors.forEach(sel => document.querySelectorAll(sel).forEach((el: any) => el.remove()));

                const clean = (text: string) => text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();

                if (inputSelector) {
                    const el = document.querySelector(inputSelector);
                    return el ? clean(el.textContent || '') : '';
                }

                const candidates = Array.from(document.querySelectorAll('article, main, .content, #content, .post-body')) as any[];
                if (candidates.length > 0) {
                    const best = candidates.reduce((a: any, b: any) => (a.textContent?.length || 0) > (b.textContent?.length || 0) ? a : b);
                    return clean(best.textContent || '');
                }

                return clean(document.body.innerText || '');
            }, selector);

            let method: 'html' | 'visual' = 'html';

            // Visual Fallback if content is sparse
            if (extractedContent.length < 300) {
                console.log(`📸 Content sparse (${extractedContent.length} chars). Switching to Optimized Visual Extraction for ${url}`);
                const visualContent = await this.performOptimizedVisualExtraction(page, url);
                if (visualContent) {
                    extractedContent = visualContent;
                    method = 'visual';
                }
            }

            await context.close();

            return {
                title: pageTitle,
                url,
                content: extractedContent,
                links: uniqueLinks, // Return collected links
                extractedAt: new Date().toISOString(),
                method,
                mobileView: useMobileView,
                viewport: contextOptions.viewport,
                userAgent: contextOptions.userAgent
            };

        } catch (error) {
            if (context) await context.close().catch(() => {});

            if (retryCount < this.config.maxRetries! && this.shouldRetry(error)) {
                retryCount++;
                console.warn(`⚠️ Scrape failed, retrying (${retryCount}/${this.config.maxRetries})...`);
                await new Promise(r => setTimeout(r, this.config.retryDelay));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries reached');
  }

  /**
   * Scrapes a "Hub" page (homepage/section) to find potential article links.
   * Uses mobile view for cleaner HTML structure.
   */
  async extractArticleLinks(url: string): Promise<ArticleCandidate[]> {
    await this.initialize();
    if (!this.browser) throw new Error('Browser not initialized');

    const context = await this.browser.newContext({
      viewport: { width: 393, height: 852 }, // iPhone 14 Pro
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile: true,
      hasTouch: true
    });

    try {
      const page = await context.newPage();
      await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
      
      // Fast scroll to trigger lazy loading
      await this.fastSmartScroll(page);

      // Extract links with heuristics
      const links = await page.evaluate((baseUrl) => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        const candidates: { title: string; url: string }[] = [];
        const seenUrls = new Set();
        const baseDomain = new URL(baseUrl).hostname.replace('www.', '');

        anchors.forEach((a: any) => {
          let href = a.href;
          let title = a.innerText.trim();

          // 1. Basic filtering
          if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || !title) return;
          if (title.length < 15) return; // Skip "Home", "More", "Login"
          
          try {
            const urlObj = new URL(href, baseUrl);
            
            // 2. Strict Domain Check (Must be internal link)
            if (!urlObj.hostname.includes(baseDomain)) return;
            
            // 3. Remove query params for cleaner URLs
            const cleanUrl = urlObj.origin + urlObj.pathname;

            // 4. Heuristic: Article URLs usually have >3 path segments or contain date/slug
            const pathSegments = urlObj.pathname.split('/').filter(p => p.length > 0);
            if (pathSegments.length < 2) return;

            if (!seenUrls.has(cleanUrl)) {
              seenUrls.add(cleanUrl);
              candidates.push({ title, url: cleanUrl });
            }
          } catch (e) {}
        });

        return candidates;
      }, url);

      return links;

    } catch (error) {
      console.error(`Failed to extract links from ${url}:`, error);
      return [];
    } finally {
      await context.close();
    }
  }

  private async performOptimizedVisualExtraction(page: Page, url: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) return "";

    // Generate safe unique filename
    const safeUrl = url.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filename = `snap_${Date.now()}_${safeUrl}.jpg`;
    const screenshotPath = path.join('data', 'screenshots', filename);

    try {
        const dir = path.dirname(screenshotPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Optimized: JPEG, Quality 75
        await page.screenshot({
            path: screenshotPath,
            fullPage: true,
            type: 'jpeg',
            quality: 75
        });

        const prompt = this.config.userAgent ?
            "Extract the main content from this web page screenshot. Ignore menus and ads." :
            (this.openaiService.getConfig()?.prompts?.webScrapeImageAnalysis || "Extract text.");

        const analysis = await this.openaiService.analyzeImage(screenshotPath, prompt);
        return analysis;
    } catch (e) {
        console.error("Visual extraction failed", e);
        return "";
    } finally {
        try { if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath); } catch (e) {}
    }
  }

  async scrapeUrls(urls: string[], selector?: string, forceMobile?: boolean): Promise<WebScrapeResult[]> {
    const results: WebScrapeResult[] = [];
    const batchSize = this.config.concurrency || 3;

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchPromises = batch.map(url => this.scrapeUrl(url, selector, forceMobile).catch(e => {
        console.error(`❌ Failed: ${url} - ${e.message}`);
        return null;
      }));

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(r => { if(r) results.push(r); });
    }
    return results;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const msg = error.message.toLowerCase();
    return ['timeout', 'network', 'connection', 'reset', 'navigat', 'closed'].some(k => msg.includes(k));
  }

  private async initializeOpenAIService(): Promise<void> {
    try { this.openaiService = await createOpenAIServiceFromConfig(); }
    catch (e) { try { this.openaiService = createOpenAIServiceFromEnv(); } catch (e) { this.openaiService = null; } }
  }

  formatScrapeResults(results: WebScrapeResult[]): string {
    if (results.length === 0) return 'No content scraped.';
    return results.map((result, index) =>
      `[${index + 1}] ${result.title} (${result.method})${result.mobileView ? ' 📱' : ''}\nURL: ${result.url}\nContent: ${result.content}\n`
    ).join('\n');
  }
}

export function createWebScrapeService(): WebScrapeService {
  return new WebScrapeService({
    timeout: Number(process.env.WEB_SCRAPE_TIMEOUT) || undefined,
    maxRetries: Number(process.env.WEB_SCRAPE_MAX_RETRIES) || undefined,
    concurrency: Number(process.env.WEB_SCRAPE_CONCURRENCY) || 5
  });
}

---
./src/services/whatsappService.ts
---
import axios from 'axios';
import { WhatsAppResponse, WhatsAppAPIConfig } from '../types/whatsapp';

export class WhatsAppService {
  private config: WhatsAppAPIConfig;
  private devMode: boolean;

  constructor(config: WhatsAppAPIConfig, devMode: boolean = false) {
    this.config = config;
    this.devMode = devMode;
  }

  async sendMessage(to: string, message: string): Promise<boolean> {
    try {
      if (this.devMode) {
        console.log(`📱 [DEV MODE] Message would be sent to ${to}:`);
        console.log(`💬 ${message}`);
        console.log('---');
        return true;
      }

      const response: WhatsAppResponse = {
        messaging_product: 'whatsapp',
        to,
        text: {
          body: message
        }
      };

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

      await axios.post(url, response, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Message sent successfully to ${to}`);
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  async markMessageAsRead(messageId: string): Promise<boolean> {
    try {
      if (this.devMode) {
        console.log(`📱 [DEV MODE] Message ${messageId} would be marked as read`);
        return true;
      }

      const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

      await axios.post(url, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Message ${messageId} marked as read`);
      return true;
    } catch (error) {
      console.error('Error marking message as read:', error);
      return false;
    }
  }
}

---
./src/types/aiConfig.ts
---
export interface AIConfig {
  // API Configuration
  apiKey: string;
  baseURL?: string;
  model?: string;
  visionModel?: string;
  temperature?: number;
  maxTokens?: number;
  enableToolCalling?: boolean;
  embeddingModel?: string;

  // Prompt Templates
  prompts?: {
    textResponse?: string;
    imageAnalysis?: string;
    toolCalling?: string;
    errorResponse?: string;
    searchLimit?: string;
    // Specialized prompts for different services
    mediaImageAnalysis?: string;
    webScrapeImageAnalysis?: string;
    enhancedImageResponse?: string;
    audioTranscriptionResponse?: string;
  };

}

export interface AIConfigFile {
  name: string;
  description?: string;
  config: AIConfig;
}

export interface AIConfigManagerOptions {
  configPath?: string;
  defaultConfig?: string;
}

---
./src/types/conversation.ts
---
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

---
./src/types/whatsapp.ts
---
export interface WhatsAppMessage {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          image?: {
            id: string;
            mime_type: string;
            sha256: string;
            caption?: string;
          };
          audio?: {
            id: string;
            mime_type: string;
            sha256: string;
          };
          type: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppResponse {
  messaging_product: string;
  to: string;
  text: {
    body: string;
  };
}

export interface WhatsAppAPIConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}

---
./src/utils/configLoader.ts
---
import * as fs from 'fs';
import * as path from 'path';
import { AIConfig, AIConfigFile, AIConfigManagerOptions } from '../types/aiConfig';

export class ConfigLoader {
  private configPath: string;
  private defaultConfig: string;

  constructor(options: AIConfigManagerOptions = {}) {
    this.configPath = options.configPath || 'config/ai';
    this.defaultConfig = options.defaultConfig || 'default.json';
  }

  /**
   * Load AI configuration from a config file
   */
  async loadConfig(configName?: string): Promise<AIConfig> {
    const configFileName = configName || this.defaultConfig;
    const configFilePath = path.join(this.configPath, configFileName);

    try {
      // Check if file exists
      if (!fs.existsSync(configFilePath)) {
        throw new Error(`Config file not found: ${configFilePath}`);
      }

      // Read and parse config file
      const configContent = fs.readFileSync(configFilePath, 'utf8');
      const configData: AIConfigFile = JSON.parse(configContent);

      // Validate required fields
      if (!configData.config || !configData.config.apiKey) {
        throw new Error(`Invalid config file: Missing required fields in ${configFileName}`);
      }

      return configData.config;
    } catch (error) {
      console.error(`Failed to load config from ${configFilePath}:`, error);
      throw new Error(`Failed to load AI configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List all available config files
   */
  listConfigs(): string[] {
    try {
      if (!fs.existsSync(this.configPath)) {
        return [];
      }

      const files = fs.readdirSync(this.configPath);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
    } catch (error) {
      console.error('Failed to list config files:', error);
      return [];
    }
  }

  /**
   * Validate a config file
   */
  validateConfig(config: AIConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('apiKey is required');
    }

    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push('temperature must be between 0 and 2');
    }

    if (config.maxTokens !== undefined && config.maxTokens < 1) {
      errors.push('maxTokens must be greater than 0');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a default config file structure
   */
  createDefaultConfigFile(): AIConfigFile {
    return {
      name: 'Default Configuration',
      description: 'Default AI model configuration',
      config: {
        apiKey: 'your_api_key_here',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        visionModel: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 1000,
        enableToolCalling: true,
        embeddingModel: 'text-embedding-ada-002',
        prompts: {
          textResponse: 'You are {chatbotName}, a helpful WhatsApp assistant. Keep responses very short and conversational - like a real WhatsApp message. Maximum 2-3 sentences. NEVER include URLs, links, or clickable references in your responses. Provide all information directly in the message.',
          imageAnalysis: 'Analyze this image comprehensively with context awareness. Describe what you see in detail...',
          toolCalling: 'You are a helpful assistant explaining search limitations. Be honest, helpful, and suggest concrete next steps.',
          errorResponse: 'I apologize, but I could not generate a response. Please try again.',
          searchLimit: 'I reached the maximum search limit while researching "{query}". Here\'s what I found so far...'
        }
      }
    };
  }
}

// Helper function to create config loader from environment
export function createConfigLoaderFromEnv(): ConfigLoader {
  const configPath = process.env.AI_CONFIG_PATH || 'config/ai';
  const defaultConfig = process.env.AI_CONFIG_FILE || 'default.json';

  return new ConfigLoader({
    configPath,
    defaultConfig
  });
}

---
./src/utils/crypto.ts
---
import * as crypto from 'crypto';

export class CryptoUtils {
  static verifySignature(
    appSecret: string,
    requestBody: string,
    signatureHeader?: string
  ): boolean {
    if (!signatureHeader) {
      console.log('No signature header provided');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(requestBody, 'utf8')
      .digest();

    const signatureParts = signatureHeader.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      console.log('Invalid signature format');
      return false;
    }

    const providedSignature = Buffer.from(signatureParts[1], 'hex');
    return crypto.timingSafeEqual(expectedSignature, providedSignature);
  }
}

---
./src/utils/logger.ts
---
/**
 * Enhanced logging utility for tool calling and AI responses
 */

export interface LogEntry {
  timestamp: string;
  type: 'ai_response' | 'tool_call' | 'search' | 'decision' | 'error';
  message: string;
  data?: any;
}

export class Logger {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  log(type: LogEntry['type'], message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data
    };

    this.logs.push(entry);

    // Keep only the most recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also output to console with emojis for better visibility
    const emoji = this.getEmojiForType(type);
    console.log(`${emoji} [${type.toUpperCase()}] ${message}`, data || '');
  }

  private getEmojiForType(type: string): string {
    const emojis: { [key: string]: string } = {
      'ai_response': '🤖',
      'tool_call': '🛠️',
      'search': '🔍',
      'decision': '🧠',
      'error': '❌'
    };
    return emojis[type] || '📝';
  }

  getLogs(filter?: { type?: string; limit?: number }): LogEntry[] {
    let filteredLogs = this.logs;

    if (filter?.type) {
      filteredLogs = filteredLogs.filter(log => log.type === filter.type);
    }

    if (filter?.limit) {
      filteredLogs = filteredLogs.slice(-filter.limit);
    }

    return filteredLogs;
  }

  clearLogs(): void {
    this.logs = [];
  }

  // Convenience methods for specific log types
  logAIResponse(message: string, data?: any): void {
    this.log('ai_response', message, data);
  }

  logToolCall(message: string, data?: any): void {
    this.log('tool_call', message, data);
  }

  logSearch(message: string, data?: any): void {
    this.log('search', message, data);
  }

  logDecision(message: string, data?: any): void {
    this.log('decision', message, data);
  }

  logError(message: string, data?: any): void {
    this.log('error', message, data);
  }
}

// Global logger instance
export const logger = Logger.getInstance();

---
./src/utils/responseCleaner.ts
---
/**
 * Utility functions for cleaning and processing LLM responses
 */

/**
 * Removes <think>...</think> tags and their content from LLM responses
 * @param response The raw LLM response that may contain thinking tags
 * @returns Cleaned response without thinking tags
 */
export function removeThinkingTags(response: string): string {
  // Regular expression to match <think>...</think> tags and their content
  // Also captures optional whitespace around tags to clean up properly
  const thinkingTagRegex = /\s*<think>[\s\S]*?<\/think>\s*/gi;

  // Remove all thinking tags and their content, including surrounding whitespace
  return response.replace(thinkingTagRegex, ' ').trim();
}

/**
 * Removes tool call artifacts and intermediate reasoning from responses
 * @param response The raw LLM response that may contain tool call artifacts
 * @returns Cleaned response without tool call artifacts
 */
export function removeToolCallArtifacts(response: string): string {
  // Remove common tool call artifacts and intermediate reasoning
  return response
    .replace(/I need to search for more information to answer your question properly\./gi, '')
    .replace(/Let me search for that information\./gi, '')
    .replace(/I'll look that up for you\./gi, '')
    .replace(/Searching for information\.\.\./gi, '')
    .replace(/Based on my search results,/gi, '')
    .replace(/According to my search,/gi, '')
    .trim();
}

/**
 * Shortens responses for WhatsApp by truncating long messages and making them more concise
 * @param response The response to shorten
 * @param maxLength Maximum length for WhatsApp responses (default: 1000 characters)
 * @returns Shortened response suitable for WhatsApp
 */
export function shortenForWhatsApp(response: string, maxLength: number = 1000): string {
  if (!response) return response;

  let shortened = response.trim();

  // DISABLED: Allow the bot to be polite
  // shortened = shortened.replace(/^(?:hello|hi|hey|greetings)[,!.\s]*/i, '');

  if (shortened.length > maxLength) {
      return shortened.substring(0, maxLength) + "...";
  }

  return shortened;
}

/**
 * Processes an LLM response by removing thinking tags, cleaning up whitespace, and shortening for WhatsApp
 * @param response The raw LLM response
 * @returns Cleaned and processed response ready for WhatsApp
 */
export function cleanLLMResponse(response: string): string {
  if (!response) return '';

  // Remove thinking tags first
  let cleaned = removeThinkingTags(response);

  // Remove tool call artifacts
  cleaned = removeToolCallArtifacts(cleaned);

  // Clean up excessive whitespace and newlines
  cleaned = cleaned
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace 3+ newlines with 2
    .replace(/^\s+|\s+$/g, '') // Trim leading/trailing whitespace
    .replace(/\s{2,}/g, ' '); // Replace multiple spaces with single space

  // Shorten for WhatsApp if it's too long
  return shortenForWhatsApp(cleaned);
}

/**
 * Checks if a response contains thinking tags
 * @param response The response to check
 * @returns True if thinking tags are present, false otherwise
 */
export function containsThinkingTags(response: string): boolean {
  return /<think>[\s\S]*?<\/think>/i.test(response);
}

---
./src/utils/textChunker.ts
---
// src/utils/textChunker.ts

export class TextChunker {
  /**
   * Splits text into chunks of ~chunkSize characters, respecting sentence boundaries.
   */
  static split(text: string, chunkSize: number = 800, overlap: number = 100): string[] {
    if (!text) return [];
    
    // Split by rough sentence boundaries to avoid cutting words in half
    const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk.length + sentence.length) > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        // Keep the last 'overlap' characters for context continuity
        currentChunk = currentChunk.slice(-overlap) + sentence; 
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

---
./src/routes/dashboard.ts
---
import { Router, Request, Response } from 'express';
import { getAutonomousAgent } from '../autonomous';
import express from 'express';
import { HistoryStorePostgres } from '../memory/HistoryStorePostgres';

/**
 * Dashboard API routes for the web interface
 * Provides real-time access to autonomous agent data and chat testing
 */
export class DashboardRoutes {
  private router: Router;
  private activityLog: Array<{timestamp: string; message: string; type?: string}> = [];
  private dashboardPassword: string;

  constructor() {
    this.router = Router();
    this.dashboardPassword = process.env.DASHBOARD_PASSWORD || 'admin';
    this.setupRoutes();
    
    // Initialize with startup message
    this.logActivity('System started - Dashboard API initialized');
  }

  /**
   * Check if user is authenticated
   */
  private isAuthenticated(req: Request): boolean {
    return req.cookies?.dashboardAuth === this.dashboardPassword;
  }

  /**
   * Require authentication middleware
   */
  private requireAuth(req: Request, res: Response, next: Function): void {
    if (this.isAuthenticated(req)) {
      next();
    } else {
      res.status(401).json({ error: 'Authentication required' });
    }
  }

  private setupRoutes(): void {
    // Login endpoint
    this.router.post('/api/login', (req: Request, res: Response) => {
      const { password } = req.body;
      
      if (password === this.dashboardPassword) {
        // FIX: Relaxed cookie settings for reliable local/prod development
        res.cookie('dashboardAuth', this.dashboardPassword, {
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
          path: '/',
          // Only set Secure if actually in production and on HTTPS
          secure: process.env.NODE_ENV === 'production' && req.secure,
          sameSite: 'lax' // 'strict' can block cookies on some redirects
        });
        
        this.logActivity('User logged in to dashboard');
        res.json({ success: true });
      } else {
        this.logActivity('Failed login attempt', 'warning');
        res.status(401).json({ error: 'Invalid password' });
      }
    });

    // Logout endpoint
    this.router.post('/api/logout', (req: Request, res: Response) => {
      res.clearCookie('dashboardAuth');
      this.logActivity('User logged out from dashboard');
      res.json({ success: true });
    });

    // Check authentication status
    this.router.get('/api/auth/status', (req: Request, res: Response) => {
      res.json({ authenticated: this.isAuthenticated(req) });
    });

    // Protected routes - require authentication
    // System status endpoint
    this.router.get('/api/status', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        const status = await agent.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: 'Agent not initialized' });
      }
    });

    // Bot info endpoint
    this.router.get('/api/bot-info', this.requireAuth.bind(this), (req: Request, res: Response) => {
      res.json({
        name: process.env.CHATBOT_NAME || 'Autonomous WhatsApp Agent',
        version: '1.0.0',
        mode: process.env.DEV_MODE === 'true' ? 'development' : 'production'
      });
    });

    // Activity log endpoint
    this.router.get('/api/activity', this.requireAuth.bind(this), (req: Request, res: Response) => {
      res.json(this.activityLog.slice(-50)); // Last 50 activities
    });

    // Memory data endpoints
    this.router.get('/api/memory/context', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        const status = await agent.getStatus();
        
        // Use real context data from ContextManager stats
        const contextStats = status.memory?.context || { activeUsers: 0, totalMessages: 0 };
        
        // Format the data based on real stats
        const contextData = [{
          id: 'ctx-stats',
          title: 'Context Statistics',
          timestamp: new Date().toISOString(),
          content: `Active users: ${contextStats.activeUsers}, Total messages: ${contextStats.totalMessages}`,
          activeUsers: contextStats.activeUsers,
          totalMessages: contextStats.totalMessages
        }];
        
        // Add web interface user for testing
        contextData.push({
          id: 'ctx-web',
          title: 'Web Interface User',
          timestamp: new Date().toISOString(),
          content: 'Web chat interface ready for testing',
          activeUsers: 0,
          totalMessages: 0
        });
        
        res.json(contextData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get context data' });
      }
    });

    this.router.get('/api/memory/knowledge', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        
        // Get actual knowledge content from the autonomous agent
        const knowledgeContent = await agent.getKnowledgeContent(20); // Get up to 20 recent documents
        
        // If we have real content, show it
        if (knowledgeContent.length > 0) {
          const knowledgeData = knowledgeContent.map((doc: any) => ({
            id: doc.id,
            title: doc.title,
            timestamp: doc.timestamp,
            content: doc.content,
            source: doc.source,
            category: doc.category
          }));
          
          res.json(knowledgeData);
        } else {
          // If no real content yet, show what the agent is ready to learn
          const exampleTopics = [
            'AI and Machine Learning',
            'Web Development',
            'Mobile Technology',
            'Cloud Computing',
            'Cybersecurity',
            'Data Science',
            'Internet of Things',
            'Blockchain Technology'
          ];
          
          const knowledgeData = exampleTopics.map((topic, i) => ({
            id: `knowledge-ready-${i + 1}`,
            title: `${topic} (Ready to Learn)`,
            timestamp: new Date().toISOString(),
            content: `The autonomous agent will learn about ${topic.toLowerCase()} during browsing sessions.`,
            source: 'Autonomous Browsing',
            category: topic
          }));
          
          res.json(knowledgeData);
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to get knowledge data' });
      }
    });

    this.router.get('/api/memory/history', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        const status = await agent.getStatus();
        
        // Use activity log as real history data
        const historyData = this.activityLog.slice(-20).map((log, index) => ({
          id: `hist-${index + 1}`,
          title: `Activity: ${log.type || 'info'}`,
          timestamp: log.timestamp,
          message: log.message,
          type: log.type || 'info'
        }));
        
        res.json(historyData);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get history data' });
      }
    });

    // Chat endpoint for testing the bot
    this.router.post('/api/chat', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { message } = req.body;
        const webUiUserId = process.env.WEB_UI_USER_ID || 'web-ui-user';
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        const agent = getAutonomousAgent();
        const historyStore = new HistoryStorePostgres();
        
        // Log the chat activity
        this.logActivity(`Web UI chat message from ${webUiUserId}: ${message.substring(0, 50)}...`);
        
        // Store user message in database like normal WhatsApp messages
        await historyStore.storeMessage({
          userId: webUiUserId,
          message: message,
          role: 'user',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        });
        
        // Process the message through the autonomous agent using web interface method
        const response = await agent.handleWebMessage(webUiUserId, message);
        
        // Store bot response in database
        await historyStore.storeMessage({
          userId: webUiUserId,
          message: response,
          role: 'assistant',
          timestamp: new Date().toISOString(),
          messageType: 'text'
        });
        
        // Log the response
        this.logActivity(`Bot response to ${webUiUserId}: ${response.substring(0, 50)}...`);
        
        res.json({ success: true, response });
      } catch (error) {
        console.error('Chat API error:', error);
        this.logActivity(`Chat error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        res.status(500).json({ error: 'Failed to process message' });
      }
    });

    // Autonomous activity simulation endpoints
    this.router.post('/api/simulate/browse', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { intent } = req.body;
        const agent = getAutonomousAgent();
        
        this.logActivity(`Simulating browsing session with intent: ${intent || 'general'}`);
        
        // In a real implementation, this would trigger actual browsing
        // For now, we'll simulate the activity
        setTimeout(() => {
          this.logActivity(`Browsing session completed - learned 3 new facts about ${intent || 'technology'}`);
        }, 2000);
        
        res.json({ success: true, message: 'Browsing session started' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to simulate browsing' });
      }
    });

    this.router.post('/api/simulate/proactive', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { userId = 'web-user', content } = req.body;
        const agent = getAutonomousAgent();
        
        this.logActivity(`Simulating proactive message to ${userId}`);
        
        // Simulate proactive messaging logic
        setTimeout(() => {
          this.logActivity(`Proactive message sent to ${userId}: "Check out this interesting content!"`);
        }, 1000);
        
        res.json({ success: true, message: 'Proactive message simulation started' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to simulate proactive message' });
      }
    });

    // Knowledge search endpoint
    this.router.post('/api/search/knowledge', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { query } = req.body;
        
        if (!query) {
          return res.status(400).json({ error: 'Search query is required' });
        }

        const agent = getAutonomousAgent();
        
        // Log the search activity
        this.logActivity(`Knowledge search: "${query}"`);
        
        // Search actual knowledge content
        const searchResults = await agent.searchKnowledgeContent(query, 10);
        
        // Format results with relevance scoring
        const formattedResults = searchResults.map((doc: any, index: number) => ({
          id: doc.id,
          title: doc.title,
          timestamp: doc.timestamp,
          content: doc.content.substring(0, 500) + (doc.content.length > 500 ? '...' : ''), // Limit content length
          relevance: ['High', 'Medium', 'Low'][index % 3], // Simple relevance based on order
          source: doc.source,
          category: doc.category
        }));
        
        // If no real results, provide informative message
        if (formattedResults.length === 0) {
          formattedResults.push({
            id: 'search-no-results',
            title: 'No Results Found',
            timestamp: new Date().toISOString(),
            content: `No knowledge found matching "${query}". The autonomous agent will learn about this topic during future browsing sessions.`,
            relevance: 'Low',
            source: 'Knowledge Base',
            category: 'Information'
          });
        }

        res.json(formattedResults);
      } catch (error) {
        console.error('Knowledge search error:', error);
        res.status(500).json({ error: 'Failed to search knowledge base' });
      }
    });

    // Manual browsing trigger endpoint
    this.router.post('/api/browse/now', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const { intent } = req.body;
        const agent = getAutonomousAgent();
        
        // Get browser service from agent (this would need to be exposed)
        // For now, we'll simulate triggering a browsing session
        this.logActivity(`Manual browsing triggered with intent: ${intent || 'general'}`);
        
        // Simulate browsing session
        setTimeout(() => {
          this.logActivity(`Manual browsing completed - learned fresh content about ${intent || 'technology'}`);
        }, 3000);
        
        res.json({
          success: true,
          message: `Browsing session started${intent ? ` with intent: ${intent}` : ''}`,
          estimatedTime: '3-5 seconds'
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to trigger browsing session' });
      }
    });

    // Force knowledge update endpoint
    this.router.post('/api/knowledge/refresh', this.requireAuth.bind(this), async (req: Request, res: Response) => {
      try {
        const agent = getAutonomousAgent();
        
        this.logActivity('Manual knowledge refresh triggered');
        
        // This would force the agent to browse and update knowledge
        // For now, simulate the process
        setTimeout(() => {
          this.logActivity('Knowledge refresh completed - fresh content available');
        }, 2000);
        
        res.json({
          success: true,
          message: 'Knowledge refresh initiated',
          status: 'Updating with latest content'
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to refresh knowledge' });
      }
    });

    // FIX: Improved Middleware to protect HTML files AND the root path
    this.router.use((req: Request, res: Response, next: Function) => {
      const path = req.path;
      
      // Always allow login page, static assets (css/js/images), and specific public API endpoints
      if (
        path === '/login.html' ||
        path === '/api/login' ||
        path === '/api/auth/status' ||
        path === '/health' ||
        path === '/api' ||
        path.match(/\.(js|css|png|jpg|ico|json)$/)
      ) {
        return next();
      }
      
      // Check authentication
      if (this.isAuthenticated(req)) {
        return next();
      }
      
      // If accessing root or html files without auth, redirect to login
      if (path === '/' || path.endsWith('.html')) {
        return res.redirect('/login.html');
      }

      // For protected API endpoints, return 401 instead of redirect
      if (path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      next();
    });

    // Serve static files from web directory
    this.router.use(express.static('web'));

    // Serve the web interface
    this.router.get('/', (req: Request, res: Response) => {
      // Redirect to login if not authenticated
      if (!this.isAuthenticated(req)) {
        return res.redirect('/login.html');
      }
      res.sendFile('web/index.html', { root: process.cwd() });
    });

    // Serve login page route
    this.router.get('/login', (req: Request, res: Response) => {
      // If already authenticated, redirect to dashboard
      if (this.isAuthenticated(req)) {
        return res.redirect('/');
      }
      res.redirect('/login.html');
    });
  }

  /**
   * Log activity for the dashboard
   */
  private logActivity(message: string, type?: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      type
    };
    
    this.activityLog.push(logEntry);
    
    // Keep only the last 1000 entries to prevent memory issues
    if (this.activityLog.length > 1000) {
      this.activityLog = this.activityLog.slice(-1000);
    }
    
    console.log(`📊 Dashboard: ${message}`);
  }

  /**
   * Get the router instance
   */
  getRouter(): Router {
    return this.router;
  }
}

---
./src/routes/webhook.ts
---
import { Router, Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsappService';
import { MediaService } from '../services/mediaService';
import { ProcessedMessageServicePostgres } from '../services/ProcessedMessageServicePostgres';
import { CryptoUtils } from '../utils/crypto';
import { WhatsAppMessage } from '../types/whatsapp';
import { getToolSchemas } from '../tools';
// Import the Autonomous Agent getter
import { getAutonomousAgent } from '../autonomous';

export class WebhookRoutes {
  private router: Router;
  private processedMessageService: ProcessedMessageServicePostgres;
  private whatsappService: WhatsAppService; // Added property
  private verifyToken: string;
  private appSecret: string;

  constructor(whatsappService: WhatsAppService, verifyToken: string, appSecret: string, whatsappConfig: any) {
    this.router = Router();
    this.processedMessageService = new ProcessedMessageServicePostgres();
    this.whatsappService = whatsappService; // Store the service instance
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Webhook verification endpoint (GET)
    this.router.get('/', (req: Request, res: Response) => {
      this.handleWebhookVerification(req, res);
    });

    // Webhook message handler (POST)
    this.router.post('/', (req: Request, res: Response) => {
      this.handleWebhookMessage(req, res);
    });

    // Health check endpoint (webhook-specific)
    this.router.get('/health', (req: Request, res: Response) => {
      res.status(200).json({
        status: 'OK',
        service: 'webhook',
        timestamp: new Date().toISOString()
      });
    });

    // Dev mode API endpoint (only available in dev mode)
    if (process.env.DEV_MODE === 'true') {
      this.router.post('/dev/message', (req: Request, res: Response) => {
        this.handleDevMessage(req, res);
      });
    }
  }

  private handleWebhookVerification(req: Request, res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    // Log verification attempt for debugging
    console.log(`Webhook Verification: Mode=${mode}, Token=${token?.toString().substring(0,3)}...`);

    if (mode && token) {
      if (mode === 'subscribe' && token === this.verifyToken) {
        console.log('✅ Webhook verified successfully!');
        // WhatsApp expects the challenge string directly, not JSON
        res.status(200).send(challenge);
      } else {
        console.warn('❌ Webhook verification failed! Token mismatch.');
        res.sendStatus(403);
      }
    } else {
        res.sendStatus(400);
    }
  }

  private async handleWebhookMessage(req: Request, res: Response): Promise<void> {
    try {
      // Verify signature if app secret is provided
      if (this.appSecret) {
        const signature = req.headers['x-hub-signature-256'] as string;
        // FIX: Use rawBody captured by middleware in server.ts
        const rawBody = (req as any).rawBody?.toString() || JSON.stringify(req.body);
        
        if (!CryptoUtils.verifySignature(this.appSecret, rawBody, signature)) {
          console.warn('Invalid webhook signature');
          res.sendStatus(401);
          return;
        }
      }

      const data: WhatsAppMessage = req.body;

      if (!data.entry || !Array.isArray(data.entry)) {
          res.sendStatus(200);
          return;
      }

      for (const entry of data.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const messages = change.value.messages;

            if (messages && messages.length > 0) {
              for (const message of messages) {
                // Mark message as read immediately
                if (this.whatsappService) {
                    await this.whatsappService.markMessageAsRead(message.id);
                }

                // Check if this message has already been processed
                const alreadyProcessed = await this.processedMessageService.hasMessageBeenProcessed(message.id);
                if (alreadyProcessed) continue;

                // Mark message as processed
                await this.processedMessageService.markMessageAsProcessed(
                  message.id,
                  message.from,
                  message.type
                );

                const agent = getAutonomousAgent();

                if (message.type === 'text' && message.text) {
                  // Text Message
                  agent.handleIncomingMessage(
                    message.from,
                    message.text.body,
                    message.id
                  ).catch(err => console.error('Agent text processing error:', err));

                } else if (message.type === 'image' && message.image) {
                  // Image Message
                  console.log(`🖼️ Processing image message from ${message.from}`);
                  
                  // Extract caption if available
                  const caption = message.image.caption;
                  
                  agent.handleImageMessage(
                    message.from,
                    message.image.id,
                    message.image.mime_type,
                    message.image.sha256,
                    caption
                  ).catch(err => console.error('Agent image processing error:', err));

                } else if (message.type === 'audio' && message.audio) {
                  console.log(`🎤 Audio message from ${message.from} (ID: ${message.audio.id})`);
                  console.log('⚠️ Audio processing not yet implemented in autonomous agent');
                } else {
                  console.log(`Unsupported message type: ${message.type}`);
                }
              }
            }
          }
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.sendStatus(500);
    }
  }

  private async handleDevMessage(req: Request, res: Response): Promise<void> {
    try {
      const { message, from = 'dev-user', type = 'text', imagePath, audioPath } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      console.log(`📱 [DEV API] Received ${type} message from ${from}: "${message}"`);

      let response: string;

      if (type === 'image' && imagePath) {
        console.log(`🖼️ Processing local image: ${imagePath}`);
        // TODO: Implement image processing in autonomous agent
        response = "Image processing is not yet implemented in the autonomous agent. Please use text messages for now.";
      } else if (type === 'audio' && audioPath) {
        console.log(`🎤 Processing local audio: ${audioPath}`);
        // TODO: Implement audio processing in autonomous agent
        response = "Audio processing is not yet implemented in the autonomous agent. Please use text messages for now.";
      } else {
        // Process text message using the autonomous agent
        const agent = getAutonomousAgent();
        response = await agent.handleWebMessage(from, message);
      }

      console.log(`🤖 [DEV API] Response: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);

      // Return the response directly as JSON
      res.status(200).json({
        success: true,
        message: message,
        response: response,
        from: from,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error processing dev message:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  getRouter(): Router {
    return this.router;
  }
}

---
./src/config/databaseConfig.ts
---
import { HistoryStorePostgres } from '../memory/HistoryStorePostgres';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { ProcessedMessageServicePostgres } from '../services/ProcessedMessageServicePostgres';
import { VectorStoreServicePostgres } from '../services/VectorStoreServicePostgres';
import { OpenAIService } from '../services/openaiService';
import { PrismaDatabaseUtils } from './prisma';

/**
 * Database configuration for PostgreSQL-only setup
 */
export class DatabaseConfig {
  /**
   * Get the HistoryStore implementation (PostgreSQL)
   */
  static getHistoryStore(): HistoryStorePostgres {
    return new HistoryStorePostgres();
  }

  /**
   * Get the KnowledgeBase implementation (PostgreSQL)
   */
  static getKnowledgeBase(openaiService: OpenAIService): KnowledgeBasePostgres {
    return new KnowledgeBasePostgres(openaiService);
  }

  /**
   * Get the ProcessedMessageService implementation (PostgreSQL)
   */
  static getProcessedMessageService(): ProcessedMessageServicePostgres {
    return new ProcessedMessageServicePostgres();
  }

  /**
   * Get the VectorStoreService implementation (PostgreSQL)
   */
  static getVectorStoreService(openaiService: OpenAIService): VectorStoreServicePostgres {
    return new VectorStoreServicePostgres(openaiService);
  }

  /**
   * Check if PostgreSQL is being used (always true now)
   */
  static isUsingPostgres(): boolean {
    return true;
  }

  /**
   * Get database statistics for PostgreSQL
   */
  static async getDatabaseStats(): Promise<{
    databaseType: string;
    conversationLogs: number;
    knowledgeDocuments: number;
    processedMessages: number;
    vectorDocuments: number;
  }> {
    const stats = await PrismaDatabaseUtils.getDatabaseStats();
    
    return {
      databaseType: 'PostgreSQL',
      conversationLogs: stats.conversationLogs,
      knowledgeDocuments: stats.knowledgeDocuments,
      processedMessages: stats.processedMessages,
      vectorDocuments: stats.vectorDocuments,
    };
  }

  /**
   * Initialize the database connection
   */
  static async initialize(): Promise<void> {
    await PrismaDatabaseUtils.initialize();
  }

  /**
   * Health check for PostgreSQL
   */
  static async healthCheck(): Promise<boolean> {
    return await PrismaDatabaseUtils.healthCheck();
  }

  /**
   * Clean up old data in PostgreSQL
   */
  static async cleanupOldData(): Promise<{
    oldConversations: number;
    oldKnowledge: number;
    oldProcessedMessages: number;
    oldVectorDocuments: number;
  }> {
    const result = await PrismaDatabaseUtils.cleanupOldData();
    
    return {
      oldConversations: result.oldConversations,
      oldKnowledge: result.oldKnowledge,
      oldProcessedMessages: result.oldProcessedMessages,
      oldVectorDocuments: 0, // Vector documents cleanup not implemented yet
    };
  }
}

export default DatabaseConfig;

---
./src/config/prisma.ts
---
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton
 */
class PrismaClientSingleton {
  private static instance: PrismaClient;

  private constructor() {}

  static getInstance(): PrismaClient {
    if (!PrismaClientSingleton.instance) {
      PrismaClientSingleton.instance = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    }
    return PrismaClientSingleton.instance;
  }

  static async disconnect(): Promise<void> {
    if (PrismaClientSingleton.instance) {
      await PrismaClientSingleton.instance.$disconnect();
    }
  }
}

export const prisma = PrismaClientSingleton.getInstance();

/**
 * Database utility functions using Prisma
 */
export class PrismaDatabaseUtils {
  /**
   * Initialize database connection and verify schema
   */
  static async initialize(): Promise<void> {
    try {
      // Test connection
      await prisma.$connect();
      console.log('✅ Prisma connected to database');
      
      // Verify tables exist by running a simple query
      await prisma.conversationLog.findFirst();
      console.log('✅ Database schema verified');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Health check for database
   */
  static async healthCheck(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return false;
    }
  }

  /**
   * Get database statistics
   */
  static async getDatabaseStats(): Promise<{
    conversationLogs: number;
    knowledgeDocuments: number;
    processedMessages: number;
    vectorDocuments: number;
  }> {
    try {
      const [conversationLogs, knowledgeDocuments, processedMessages, vectorDocuments] = await Promise.all([
        prisma.conversationLog.count(),
        prisma.knowledge.count(),
        prisma.processedMessage.count(),
        prisma.document.count(),
      ]);

      return {
        conversationLogs,
        knowledgeDocuments,
        processedMessages,
        vectorDocuments,
      };
    } catch (error) {
      console.error('❌ Failed to get database stats:', error);
      return {
        conversationLogs: 0,
        knowledgeDocuments: 0,
        processedMessages: 0,
        vectorDocuments: 0,
      };
    }
  }

  /**
   * Clean up old data
   */
  static async cleanupOldData(): Promise<{
    oldConversations: number;
    oldKnowledge: number;
    oldProcessedMessages: number;
  }> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [oldConversations, oldKnowledge, oldProcessedMessages] = await Promise.all([
        prisma.conversationLog.deleteMany({
          where: {
            timestamp: {
              lt: thirtyDaysAgo,
            },
          },
        }),
        prisma.knowledge.deleteMany({
          where: {
            timestamp: {
              lt: thirtyDaysAgo,
            },
          },
        }),
        prisma.processedMessage.deleteMany({
          where: {
            processedAt: {
              lt: thirtyDaysAgo,
            },
          },
        }),
      ]);

      return {
        oldConversations: oldConversations.count,
        oldKnowledge: oldKnowledge.count,
        oldProcessedMessages: oldProcessedMessages.count,
      };
    } catch (error) {
      console.error('❌ Failed to cleanup old data:', error);
      return {
        oldConversations: 0,
        oldKnowledge: 0,
        oldProcessedMessages: 0,
      };
    }
  }
}

---
./src/tools/DeepResearchTool.ts
---
// src/tools/DeepResearchTool.ts
import { BaseTool } from '../core/BaseTool';
import { BrowserService } from '../services/BrowserService';

export class DeepResearchTool extends BaseTool {
  name = 'deep_research';
  description = 'Perform an extensive, deep online research task. Use this ONLY when standard "web_search" or "search_knowledge" fails to provide a sufficient answer. This tool takes longer but searches and reads multiple websites.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The specific question or topic to research deeply.',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private browserService: BrowserService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query } = args;
    // Note: The Agent will call this, which calls the BrowserService logic
    return await this.browserService.performDeepResearch(query);
  }
}

---
./src/tools/RecallHistoryTool.ts
---
import { BaseTool } from '../core/BaseTool';
import { HistoryStorePostgres } from '../memory/HistoryStorePostgres';

export class RecallHistoryTool extends BaseTool {
  name = 'recall_history';
  description = 'Search through past conversations to remember what the user said, specific details, or dates. Use this when the user asks "What did I say about X?" or references a past discussion.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords to search for in the history',
      },
      days_back: {
        type: 'number',
        description: 'How many days back to search (default: 30)',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private historyStore: HistoryStorePostgres) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query, days_back = 30 } = args;
    
    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days_back);

    const logs = await this.historyStore.query({
      keywords: query,
      start: startDate.toISOString(),
      limit: 5 // Limit results to save context window
    });

    if (logs.length === 0) {
      return "No matching conversation history found.";
    }

    return logs.map(log => 
      `[${new Date(log.timestamp).toLocaleDateString()}] ${log.role}: ${log.message}`
    ).join('\n');
  }
}

---
./src/tools/ScrapeNewsTool.ts
---
import { BaseTool } from '../core/BaseTool';
import { NewsScrapeService } from '../services/newsScrapeService';

export class ScrapeNewsTool extends BaseTool {
  name = 'scrape_news';
  description = 'Get the latest headlines and news summaries. Use this when the user asks for news, updates, or current events.';
  
  parameters = {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['general', 'tech', 'business', 'sports', 'world'],
        description: 'The category of news to fetch (default: general)',
      }
    },
    required: ['category'],
    additionalProperties: false,
  };

  constructor(private newsService: NewsScrapeService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const category = args.category || 'general';
    return this.newsService.getCachedNews(category);
  }
}

---
./src/tools/WebSearchTool.ts
---
import { BaseTool } from '../core/BaseTool';
import { GoogleSearchService } from '../services/googleSearchService';

/**
 * Web Search Tool for the autonomous agent
 * Bridges the gap between old and new tool systems
 */
export class WebSearchTool extends BaseTool {
  name = 'web_search';
  description = 'Perform a web search using Google to find current information, news, or facts. Use this when you need up-to-date information that might not be in your knowledge base yet.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up information about',
      },
      num_results: {
        type: 'number',
        description: 'Number of search results to return (default: 3)',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private searchService: GoogleSearchService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query, num_results = 3 } = args;
    
    console.log(`🔍 WebSearchTool executing: "${query}"`);
    
    try {
      const results = await this.searchService.search(query, num_results);
      
      if (results.length === 0) {
        return "No search results found for your query.";
      }
      
      // Format results for the agent
      const formattedResults = results.map((result, index) =>
        `${index + 1}. ${result.title}\n   ${result.link}\n   ${result.snippet}`
      ).join('\n\n');
      
      return `Search results for "${query}":\n\n${formattedResults}`;
      
    } catch (error) {
      console.error('❌ WebSearchTool failed:', error);
      return `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

---
./src/tools/index.ts
---
import { GoogleSearchService } from '../services/googleSearchService';
import { WebScrapeService, createWebScrapeService } from '../services/webScrapeService';
import { NewsScrapeService, createNewsScrapeService, NewsArticle } from '../services/newsScrapeService';
import { VectorStoreServicePostgres } from '../services/VectorStoreServicePostgres';
import { NewsProcessorService } from '../services/newsProcessorService'; // New
import { OpenAIService, createOpenAIServiceFromConfig } from '../services/openaiService';

// Tool function definitions
export interface ToolFunction {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any) => Promise<any>;
}

// Available tools
export const availableTools: { [key: string]: ToolFunction } = {};
let webScrapeService: WebScrapeService | undefined;
export let newsScrapeService: NewsScrapeService;
let vectorStoreService: VectorStoreServicePostgres; // Updated global reference
let mediaService: any; // Will be initialized later

// Tool schemas for OpenAI function calling
export const toolSchemas = [
  {
    type: 'function' as const,
    function: {
      name: 'google_search',
      description: 'Perform a web search using Google to find current information, news, or facts',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up information about',
          },
          num_results: {
            type: 'number',
            description: 'Number of search results to return (default: 5)',
          }
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_scrape',
      description: 'Scrape content from specific URLs to get real-time information from websites. Useful for getting current data, news articles, or specific page content.',
      parameters: {
        type: 'object',
        properties: {
          urls: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Array of URLs to scrape content from',
          },
          selector: {
            type: 'string',
            description: 'Optional CSS selector to target specific content on the page (e.g., "article", ".content", "#main")',
          }
        },
        required: ['urls'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'scrape_news',
      description: 'Get latest news headlines. Categories: general, tech, business, sports, world.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Category of news (default: general).',
          }
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'analyze_image',
      description: 'Analyze image content using AI vision capabilities. Use this when users send images that need detailed analysis, description, or interpretation.',
      parameters: {
        type: 'object',
        properties: {
          image_path: {
            type: 'string',
            description: 'The file path to the image that needs to be analyzed',
          },
          prompt: {
            type: 'string',
            description: 'Optional specific instructions or questions about what to focus on in the image analysis',
          }
        },
        required: ['image_path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'transcribe_audio',
      description: 'Transcribe audio files to text using speech-to-text technology. Use this when users send audio messages that need to be converted to text for processing.',
      parameters: {
        type: 'object',
        properties: {
          audio_path: {
            type: 'string',
            description: 'The file path to the audio file that needs to be transcribed',
          },
          language: {
            type: 'string',
            description: 'Optional language code for transcription (e.g., "en", "zh", "ja")',
          }
        },
        required: ['audio_path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_knowledge',
      description: 'Search the bot\'s learned knowledge base for past news, facts, and enriched context.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The specific topic or question to search for in memory',
          }
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
];

// Initialize tools with dependencies
export async function initializeTools(searchService: GoogleSearchService, mediaServiceInstance?: any) {
  // 1. Initialize OpenAI (Needed for Embeddings & Processor)
  const openaiService = await createOpenAIServiceFromConfig();

  // 2. Initialize Vector Store (The Better RAG)
  vectorStoreService = new VectorStoreServicePostgres(openaiService);

  // 3. Initialize News Processor
  const newsProcessor = new NewsProcessorService(openaiService, searchService, vectorStoreService);

  // 4. Initialize Web Scrape
  webScrapeService = createWebScrapeService();

  // 5. Initialize News Scrape Service WITH Processor
  newsScrapeService = createNewsScrapeService(webScrapeService, newsProcessor);

  // Store media service reference for later use
  if (mediaServiceInstance) {
    mediaService = mediaServiceInstance;
  }

  availableTools.google_search = {
    name: 'google_search',
    description: 'Perform a web search using Google',
    parameters: toolSchemas[0].function.parameters,
    execute: async (args: { query: string; num_results?: number }) => {
      console.log('🔍 Executing Google Search:', {
        query: args.query,
        numResults: args.num_results || 5
      });

      const startTime = Date.now();
      const results = await searchService.search(args.query, args.num_results || 5);
      const executionTime = Date.now() - startTime;

      console.log('✅ Google Search Completed:', {
        query: args.query,
        resultsCount: results.length,
        executionTime: `${executionTime}ms`,
        firstResult: results[0] ? results[0].title.substring(0, 50) + '...' : 'No results'
      });

      return searchService.formatSearchResults(results);
    }
  };

  availableTools.web_scrape = {
    name: 'web_scrape',
    description: 'Scrape content from specific URLs',
    parameters: toolSchemas[1].function.parameters,
    execute: async (args: { urls: string[]; selector?: string }) => {
      console.log('🌐 Executing Web Scrape:', {
        urls: args.urls,
        selector: args.selector || 'auto',
        urlCount: args.urls.length
      });

      const startTime = Date.now();

      try {
        if (!webScrapeService) {
          throw new Error('Web scrape service not initialized');
        }
        const results = await webScrapeService.scrapeUrls(args.urls, args.selector);
        const executionTime = Date.now() - startTime;

        console.log('✅ Web Scrape Completed:', {
          urlCount: args.urls.length,
          successfulScrapes: results.length,
          executionTime: `${executionTime}ms`,
          firstResult: results[0] ? results[0].title.substring(0, 50) + '...' : 'No results'
        });

        return webScrapeService.formatScrapeResults(results);
      } catch (error) {
        console.error('❌ Web scrape execution error:', {
          error: error instanceof Error ? error.message : `${error}`,
          urls: args.urls
        });
        throw new Error('Failed to scrape web content');
      }
    }
  };

  availableTools.scrape_news = {
    name: 'scrape_news',
    description: 'Get latest news headlines. Categories: general, tech, business, sports, world.',
    parameters: toolSchemas[2].function.parameters,
    execute: async (args: { category?: string }) => {
      const cat = args.category || 'general';
      console.log(`📰 Tool retrieving cached news for: ${cat}`);
      return newsScrapeService.getCachedNews(cat);
    }
  };

  availableTools.search_knowledge = {
    name: 'search_knowledge',
    description: 'Search learned knowledge base',
    parameters: toolSchemas[5].function.parameters,
    execute: async (args: { query: string }) => {
      console.log(`🧠 Searching Vector Store for: ${args.query}`);
      return vectorStoreService.search(args.query);
    }
  };

  // Initialize media tools if media service is available
  if (mediaService) {
    availableTools.analyze_image = {
      name: 'analyze_image',
      description: 'Analyze image content using AI vision capabilities',
      parameters: toolSchemas[3].function.parameters,
      execute: async (args: { image_path: string; prompt?: string }) => {
        console.log('🖼️ Executing Image Analysis:', {
          imagePath: args.image_path,
          prompt: args.prompt || 'default analysis'
        });

        const startTime = Date.now();

        try {
          const result = await mediaService.analyzeImageWithOpenAI(args.image_path);
          const executionTime = Date.now() - startTime;

          console.log('✅ Image Analysis Completed:', {
            imagePath: args.image_path,
            executionTime: `${executionTime}ms`,
            resultLength: result.length
          });

          return result;
        } catch (error) {
          console.error('❌ Image analysis execution error:', {
            error: error instanceof Error ? error.message : `${error}`,
            imagePath: args.image_path
          });
          throw new Error('Failed to analyze image');
        }
      }
    };

    availableTools.transcribe_audio = {
      name: 'transcribe_audio',
      description: 'Transcribe audio files to text using speech-to-text technology',
      parameters: toolSchemas[4].function.parameters,
      execute: async (args: { audio_path: string; language?: string }) => {
        console.log('🎤 Executing Audio Transcription:', {
          audioPath: args.audio_path,
          language: args.language || 'auto'
        });

        const startTime = Date.now();

        try {
          const result = await mediaService.transcribeAudio(args.audio_path, args.language);
          const executionTime = Date.now() - startTime;

          console.log('✅ Audio Transcription Completed:', {
            audioPath: args.audio_path,
            executionTime: `${executionTime}ms`,
            resultLength: result.length
          });

          return result;
        } catch (error) {
          console.error('❌ Audio transcription execution error:', {
            error: error instanceof Error ? error.message : `${error}`,
            audioPath: args.audio_path
          });
          throw new Error('Failed to transcribe audio');
        }
      }
    };
  }
}

// Check if any tools are available
export function hasAvailableTools(): boolean {
  return Object.keys(availableTools).length > 0;
}

// Get tool schemas for OpenAI
export function getToolSchemas() {
  return toolSchemas;
}

// Execute a specific tool
export async function executeTool(toolName: string, args: any): Promise<any> {
  const tool = availableTools[toolName];
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }
  return tool.execute(args);
}

// Cleanup function to close browser instances
export async function cleanupTools(): Promise<void> {
  if (webScrapeService) {
    await webScrapeService.close();
  }
}

---
./scripts/check-document-duplicates.ts
---
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDocumentDuplicates() {
  try {
    console.log('🔍 Checking Document table for duplicates...');
    
    // Check for duplicate sources in Document table
    const duplicates = await prisma.$queryRaw<Array<{source: string, count: number}>>`
      SELECT source, COUNT(*) as count 
      FROM "Document" 
      GROUP BY source 
      HAVING COUNT(*) > 1
    `;
    
    console.log('📊 Document table duplicate entries found:');
    if (duplicates.length > 0) {
      duplicates.forEach((dup: any) => {
        console.log(`- ${dup.source}: ${dup.count} entries`);
      });
    } else {
      console.log('✅ No duplicate entries found in Document table');
    }
    
    // Get total Document entries
    const totalEntries = await prisma.document.count();
    console.log('\n📈 Total Document entries:', totalEntries);
    
    // Show some sample entries to verify content
    const sampleEntries = await prisma.document.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { source: true, category: true, createdAt: true, title: true }
    });
    
    console.log('\n📝 Recent Document entries:');
    sampleEntries.forEach(entry => {
      console.log(`- ${entry.source} [${entry.category}] - "${entry.title?.substring(0, 30)}..." - ${entry.createdAt.toISOString()}`);
    });
    
    // Check for content-based duplicates by sampling content
    console.log('\n🔍 Checking for content-based duplicates...');
    const allDocuments = await prisma.document.findMany({
      take: 50, // Sample first 50 to check for content duplicates
      orderBy: { createdAt: 'desc' }
    });
    
    if (allDocuments.length > 0) {
      // Simple content comparison for duplicates
      const contentMap = new Map();
      let contentDuplicates = 0;
      
      for (const doc of allDocuments) {
        const contentKey = doc.content.substring(0, 100); // First 100 chars as key
        if (contentMap.has(contentKey)) {
          contentDuplicates++;
          console.log(`⚠️ Potential content duplicate: ${doc.source}`);
        } else {
          contentMap.set(contentKey, doc);
        }
      }
      
      if (contentDuplicates > 0) {
        console.log(`📊 Found ${contentDuplicates} potential content-based duplicates`);
      } else {
        console.log('✅ No content-based duplicates detected in sample');
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking Document duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDocumentDuplicates();

---
./scripts/check-duplicates.ts
---
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDuplicates() {
  try {
    // Check for duplicate sources
    const duplicates = await prisma.$queryRaw`
      SELECT source, COUNT(*) as count 
      FROM "Knowledge" 
      GROUP BY source 
      HAVING COUNT(*) > 1
    `;
    
    console.log('📊 Duplicate entries found:');
    if (Array.isArray(duplicates) && duplicates.length > 0) {
      duplicates.forEach((dup: any) => {
        console.log(`- ${dup.source}: ${dup.count} entries`);
      });
    } else {
      console.log('✅ No duplicate entries found');
    }
    
    // Get total entries
    const totalEntries = await prisma.knowledge.count();
    console.log('\n📈 Total knowledge entries:', totalEntries);
    
    // Show some sample entries to verify content
    const sampleEntries = await prisma.knowledge.findMany({
      take: 5,
      orderBy: { timestamp: 'desc' },
      select: { source: true, category: true, timestamp: true }
    });
    
    console.log('\n📝 Recent entries:');
    sampleEntries.forEach(entry => {
      console.log(`- ${entry.source} [${entry.category}] - ${entry.timestamp.toISOString()}`);
    });
    
  } catch (error) {
    console.error('❌ Error checking duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicates();

---
./scripts/identify-content-duplicates.ts
---
import { PrismaClient } from '@prisma/client';
import { OpenAIService, createOpenAIServiceFromEnv } from '../src/services/openaiService';

const prisma = new PrismaClient();

// Helper function to calculate cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper function to convert BYTEA to Float64Array
function bufferToFloat64Array(buffer: Buffer): Float64Array {
  return new Float64Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 8);
}

async function identifyContentDuplicates() {
  let openaiService: OpenAIService | null = null;
  
  try {
    console.log('🔍 Starting content-based duplicate identification...');
    
    // Initialize OpenAI service for content comparison
    try {
      openaiService = createOpenAIServiceFromEnv();
    } catch (error) {
      console.log('⚠️ OpenAI service not available, using basic content comparison');
    }
    
    // Get all knowledge entries
    const allEntries = await prisma.knowledge.findMany({
      orderBy: { timestamp: 'desc' }
    });
    
    console.log(`📊 Total entries to analyze: ${allEntries.length}`);
    
    const duplicates: Array<{source: string, entries: any[], similarity: number}> = [];
    const processed = new Set<string>();
    
    // Compare entries for similarity
    for (let i = 0; i < allEntries.length; i++) {
      const entry1 = allEntries[i];
      
      if (processed.has(entry1.id)) continue;
      
      const similarEntries = [entry1];
      
      for (let j = i + 1; j < allEntries.length; j++) {
        const entry2 = allEntries[j];
        
        if (processed.has(entry2.id)) continue;
        
        // Check if entries are similar
        let currentSimilarity = 0;
        
        if (openaiService) {
          // Use vector similarity for more accurate comparison
          try {
            const vec1 = bufferToFloat64Array(entry1.vector);
            const vec2 = bufferToFloat64Array(entry2.vector);
            currentSimilarity = cosineSimilarity(Array.from(vec1), Array.from(vec2));
          } catch (error) {
            // Fallback to basic content comparison
            currentSimilarity = calculateBasicSimilarity(entry1.content, entry2.content);
          }
        } else {
          // Use basic content comparison
          currentSimilarity = calculateBasicSimilarity(entry1.content, entry2.content);
        }
        
        // Consider entries similar if similarity > 0.8
        if (currentSimilarity > 0.8) {
          similarEntries.push(entry2);
          processed.add(entry2.id);
        }
      }
      
      if (similarEntries.length > 1) {
        // Calculate average similarity for the group
        let avgSimilarity = 0;
        if (similarEntries.length > 1) {
          // For simplicity, use the first comparison as representative
          avgSimilarity = 0.85; // Placeholder value
        }
        
        duplicates.push({
          source: entry1.source || 'unknown',
          entries: similarEntries,
          similarity: avgSimilarity
        });
      }
      
      processed.add(entry1.id);
    }
    
    console.log(`\n📊 Content-based duplicates found: ${duplicates.length}`);
    
    if (duplicates.length > 0) {
      console.log('\n🔍 Duplicate groups:');
      duplicates.forEach((group, index) => {
        console.log(`\nGroup ${index + 1}: ${group.source}`);
        console.log(`  Entries: ${group.entries.length}`);
        console.log(`  Similarity: ${group.similarity.toFixed(3)}`);
        
        group.entries.forEach((entry, idx) => {
          console.log(`  ${idx + 1}. ${entry.timestamp.toISOString()} - ${entry.content.substring(0, 50)}...`);
        });
      });
    } else {
      console.log('✅ No content-based duplicates found');
    }
    
    // Show summary by source
    console.log('\n📈 Summary by source:');
    const sourceCounts = allEntries.reduce((acc, entry) => {
      const sourceKey = entry.source || 'unknown';
      acc[sourceKey] = (acc[sourceKey] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(sourceCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([source, count]) => {
        console.log(`- ${source || 'unknown'}: ${count} entries`);
      });
    
  } catch (error) {
    console.error('❌ Error identifying duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Basic similarity calculation using Jaccard similarity on words
function calculateBasicSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

identifyContentDuplicates();

---
./scripts/remove-content-duplicates.ts
---
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to calculate basic content similarity
function calculateBasicSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

async function removeContentDuplicates() {
  try {
    console.log('🧹 Starting content-based duplicate removal...');
    
    // Get all knowledge entries ordered by timestamp (newest first)
    const allEntries = await prisma.knowledge.findMany({
      orderBy: { timestamp: 'desc' }
    });
    
    console.log(`📊 Total entries to analyze: ${allEntries.length}`);
    
    const entriesToDelete: string[] = []; // IDs of entries to delete
    const processed = new Set<string>();
    
    // Identify content-based duplicates
    for (let i = 0; i < allEntries.length; i++) {
      const entry1 = allEntries[i];
      
      if (processed.has(entry1.id)) continue;
      
      // Skip if this entry is already marked for deletion
      if (entriesToDelete.includes(entry1.id)) continue;
      
      for (let j = i + 1; j < allEntries.length; j++) {
        const entry2 = allEntries[j];
        
        if (processed.has(entry2.id)) continue;
        if (entriesToDelete.includes(entry2.id)) continue;
        
        // Check if entries have similar content
        const similarity = calculateBasicSimilarity(entry1.content, entry2.content);
        
        // Consider entries duplicates if similarity > 0.7
        if (similarity > 0.7) {
          console.log(`🔍 Found similar entries: ${entry1.source} (similarity: ${similarity.toFixed(3)})`);
          console.log(`   Keeping: ${entry1.timestamp.toISOString()}`);
          console.log(`   Deleting: ${entry2.timestamp.toISOString()}`);
          
          // Mark the older entry for deletion
          entriesToDelete.push(entry2.id);
          processed.add(entry2.id);
        }
      }
      
      processed.add(entry1.id);
    }
    
    console.log(`\n🗑️  Entries to remove: ${entriesToDelete.length}`);
    
    if (entriesToDelete.length === 0) {
      console.log('✅ No content-based duplicates found to remove');
      return;
    }
    
    // Remove the duplicate entries
    let removedCount = 0;
    for (const entryId of entriesToDelete) {
      try {
        await prisma.knowledge.delete({
          where: { id: entryId }
        });
        removedCount++;
        console.log(`✅ Removed duplicate entry: ${entryId}`);
      } catch (error) {
        console.error(`❌ Failed to remove entry ${entryId}:`, error);
      }
    }
    
    console.log(`\n🎉 Duplicate removal completed!`);
    console.log(`📊 Total entries removed: ${removedCount}`);
    
    // Verify the cleanup
    const finalCount = await prisma.knowledge.count();
    console.log(`📈 Final knowledge entries count: ${finalCount}`);
    
    // Show remaining entries by source
    const remainingEntries = await prisma.knowledge.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10
    });
    
    console.log('\n📝 Recent remaining entries:');
    remainingEntries.forEach(entry => {
      console.log(`- ${entry.source || 'unknown'} - ${entry.timestamp.toISOString()}`);
    });
    
  } catch (error) {
    console.error('❌ Error removing duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeContentDuplicates();

---
./scripts/remove-document-duplicates.ts
---
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper function to calculate basic content similarity
function calculateBasicSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

async function removeDocumentDuplicates() {
  try {
    console.log('🧹 Starting Document table duplicate removal...');
    
    // Get all Document entries ordered by creation date (newest first)
    const allDocuments = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`📊 Total Document entries to analyze: ${allDocuments.length}`);
    
    const entriesToDelete: string[] = []; // IDs of entries to delete
    const processed = new Set<string>();
    
    // Identify content-based duplicates
    for (let i = 0; i < allDocuments.length; i++) {
      const doc1 = allDocuments[i];
      
      if (processed.has(doc1.id)) continue;
      
      // Skip if this entry is already marked for deletion
      if (entriesToDelete.includes(doc1.id)) continue;
      
      for (let j = i + 1; j < allDocuments.length; j++) {
        const doc2 = allDocuments[j];
        
        if (processed.has(doc2.id)) continue;
        if (entriesToDelete.includes(doc2.id)) continue;
        
        // Check if documents have similar content
        const similarity = calculateBasicSimilarity(doc1.content, doc2.content);
        
        // Consider documents duplicates if similarity > 0.8
        if (similarity > 0.8) {
          console.log(`🔍 Found similar documents: ${doc1.source} (similarity: ${similarity.toFixed(3)})`);
          console.log(`   Keeping: ${doc1.createdAt.toISOString()} - "${doc1.title?.substring(0, 40)}..."`);
          console.log(`   Deleting: ${doc2.createdAt.toISOString()} - "${doc2.title?.substring(0, 40)}..."`);
          
          // Mark the older entry for deletion
          entriesToDelete.push(doc2.id);
          processed.add(doc2.id);
        }
      }
      
      processed.add(doc1.id);
    }
    
    console.log(`\n🗑️  Document entries to remove: ${entriesToDelete.length}`);
    
    if (entriesToDelete.length === 0) {
      console.log('✅ No Document duplicates found to remove');
      return;
    }
    
    // Remove the duplicate entries
    let removedCount = 0;
    for (const docId of entriesToDelete) {
      try {
        await prisma.document.delete({
          where: { id: docId }
        });
        removedCount++;
        if (removedCount % 50 === 0) {
          console.log(`✅ Removed ${removedCount} duplicate entries...`);
        }
      } catch (error) {
        console.error(`❌ Failed to remove document ${docId}:`, error);
      }
    }
    
    console.log(`\n🎉 Document duplicate removal completed!`);
    console.log(`📊 Total Document entries removed: ${removedCount}`);
    
    // Verify the cleanup
    const finalCount = await prisma.document.count();
    console.log(`📈 Final Document entries count: ${finalCount}`);
    
    // Show remaining entries by source
    const remainingEntries = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    console.log('\n📝 Recent remaining Document entries:');
    remainingEntries.forEach(doc => {
      console.log(`- ${doc.source} [${doc.category}] - "${doc.title?.substring(0, 30)}..." - ${doc.createdAt.toISOString()}`);
    });
    
  } catch (error) {
    console.error('❌ Error removing Document duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeDocumentDuplicates();

---
./scripts/remove-duplicates.ts
---
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removeDuplicates() {
  try {
    console.log('🧹 Starting duplicate removal process...');
    
    // First, get all duplicate sources
    const duplicates = await prisma.$queryRaw<Array<{source: string, count: number}>>`
      SELECT source, COUNT(*) as count
      FROM "Knowledge"
      GROUP BY source
      HAVING COUNT(*) > 1
    `;
    
    if (duplicates.length === 0) {
      console.log('✅ No duplicates found to remove');
      return;
    }
    
    console.log(`📊 Found ${duplicates.length} sources with duplicates`);
    
    let totalRemoved = 0;
    
    // Process each duplicate source
    for (const dup of duplicates) {
      console.log(`\n🔧 Processing: ${dup.source} (${dup.count} entries)`);
      
      // Get all entries for this source, ordered by timestamp (newest first)
      const entries = await prisma.knowledge.findMany({
        where: { source: dup.source },
        orderBy: { timestamp: 'desc' }
      });
      
      if (entries.length <= 1) continue;
      
      // Keep the most recent entry, delete the rest
      const entriesToDelete = entries.slice(1); // All except the first (most recent)
      
      console.log(`🗑️  Removing ${entriesToDelete.length} duplicate entries`);
      
      // Delete the duplicate entries
      for (const entry of entriesToDelete) {
        await prisma.knowledge.delete({
          where: { id: entry.id }
        });
        totalRemoved++;
      }
      
      console.log(`✅ Kept most recent entry from ${dup.source}`);
    }
    
    console.log(`\n🎉 Duplicate removal completed!`);
    console.log(`📊 Total entries removed: ${totalRemoved}`);
    
    // Verify the cleanup
    const remainingDuplicates = await prisma.$queryRaw<Array<{source: string, count: number}>>`
      SELECT source, COUNT(*) as count
      FROM "Knowledge"
      GROUP BY source
      HAVING COUNT(*) > 1
    `;
    
    if (remainingDuplicates.length === 0) {
      console.log('✅ All duplicates successfully removed');
    } else {
      console.log('⚠️ Some duplicates may remain:', remainingDuplicates);
    }
    
    const finalCount = await prisma.knowledge.count();
    console.log(`📈 Final knowledge entries count: ${finalCount}`);
    
  } catch (error) {
    console.error('❌ Error removing duplicates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeDuplicates();

---
