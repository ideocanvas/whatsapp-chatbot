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
./src/index.ts
---
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import express from 'express';
import { WebhookRoutes } from './routes/webhook';
import { WhatsAppService } from './services/whatsappService';
import { newsScrapeService, initializeTools } from './tools/index'; // Import service
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from './services/googleSearchService';
import { MediaService } from './services/mediaService';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const devMode = process.env.DEV_MODE === 'true';

// Middleware
app.use(bodyParser.json({ verify: (req, res, buf) => {
  (req as any).rawBody = buf;
} }));

// WhatsApp API configuration
const whatsappConfig = {
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  apiVersion: 'v19.0'
};

// Validate required environment variables only if not in dev mode
if (!devMode && (!whatsappConfig.accessToken || !whatsappConfig.phoneNumberId)) {
  console.error('Missing required environment variables: WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID');
  process.exit(1);
}

// Initialize services
const whatsappService = new WhatsAppService(whatsappConfig, devMode);
const mediaService = new MediaService(whatsappConfig);
const webhookRoutes = new WebhookRoutes(
  whatsappService,
  process.env.WHATSAPP_VERIFY_TOKEN || 'default-verify-token',
  process.env.WHATSAPP_APP_SECRET || '',
  whatsappConfig
);

// Use routes
app.use('/', webhookRoutes.getRouter());

// Initialize tools and start background service
async function initializeBackgroundService() {
  try {
    // Initialize Google Search service if API keys are available
    let googleSearchService: GoogleSearchService | null = null;
    try {
      googleSearchService = createGoogleSearchServiceFromEnv();
      console.log('✅ Google Search service initialized successfully');
    } catch (error) {
      console.warn('⚠️ Google Search service not available:', error instanceof Error ? error.message : `${error}`);
      googleSearchService = null;
    }

    // Initialize tools if Google Search service is available
    if (googleSearchService) {
      initializeTools(googleSearchService, mediaService);
      console.log('✅ Tools initialized successfully');
      
      // Start background service after tools are initialized
      if (newsScrapeService) {
        console.log('🕰️ Starting Background News Service (Every 30 mins)');
        newsScrapeService.startBackgroundService(30); // Runs every 30 mins
      } else {
        console.warn('⚠️ News scrape service not available');
      }
    } else {
      console.warn('⚠️ Tools not initialized - Google Search service unavailable');
    }
  } catch (error) {
    console.error('❌ Failed to initialize background service:', error);
  }
}

// Start background service initialization after server settles
setTimeout(() => {
  initializeBackgroundService();
}, 5000);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 WhatsApp ChatBot Server Started');
  console.log('='.repeat(60));
  console.log(`📍 Port: ${port}`);

  if (devMode) {
    console.log('\n' + '💡'.repeat(20));
    console.log('💡 DEVELOPMENT MODE ACTIVATED');
    console.log('💡'.repeat(20));
    console.log('📱 Messages will be printed to console');
    console.log('🚫 No messages will be sent to WhatsApp');
    console.log('💡 No API credentials required');
    console.log('💡'.repeat(20));
    console.log('\n Usage: npm run dev:test -- send "Your message"');
    console.log('📝 Interactive: npm run dev:test interactive');
  } else {
    console.log('\n⚡ Production Mode - Messages will be sent to WhatsApp');
  }

  console.log('\n🌐 Webhook URL:', `${process.env.WEBHOOK_URL || `http://localhost:${port}`}/webhook`);
  console.log('❤️  Health check:', `${process.env.WEBHOOK_URL || `http://localhost:${port}`}/health`);
  console.log('='.repeat(60) + '\n');
});

---
./src/services/conversationStorageService.ts
---
import * as fs from 'fs';
import * as path from 'path';
import { Conversation, Message, ConversationStorageConfig, UserProfile } from '../types/conversation';

export class ConversationStorageService {
  private config: ConversationStorageConfig;
  private storageDir: string;

  constructor(config: ConversationStorageConfig) {
    this.config = {
      storagePath: config.storagePath,
      maxMessagesPerConversation: config.maxMessagesPerConversation || 100,
      cleanupIntervalHours: config.cleanupIntervalHours || 24
    };

    this.storageDir = path.resolve(process.cwd(), this.config.storagePath);
    this.ensureStorageDirectory();

    // Start cleanup interval
    this.startCleanupInterval();
  }

  private ensureStorageDirectory(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
      console.log(`Created conversation storage directory: ${this.storageDir}`);
    }
  }

  private getConversationFilePath(senderNumber: string): string {
    // Sanitize sender number for filename
    const sanitizedNumber = senderNumber.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(this.storageDir, `${sanitizedNumber}.json`);
  }

  async storeMessage(senderNumber: string, message: Message): Promise<void> {
    try {
      const filePath = this.getConversationFilePath(senderNumber);
      let conversation: Conversation;

      // Load existing conversation or create new one
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        conversation = JSON.parse(fileContent);
      } else {
        conversation = {
          senderNumber,
          // Initialize a default user profile for new users
          userProfile: {
            name: undefined,
            state: null,
            knowledge: {}
          },
          messages: [],
          lastUpdated: new Date().toISOString(),
          messageCount: 0
        };
      }

      // Add new message
      conversation.messages.push(message);
      conversation.lastUpdated = new Date().toISOString();
      conversation.messageCount = conversation.messages.length;

      // Apply message limit
      if (conversation.messages.length > this.config.maxMessagesPerConversation!) {
        conversation.messages = conversation.messages.slice(-this.config.maxMessagesPerConversation!);
        conversation.messageCount = conversation.messages.length;
      }

      // Save to file
      fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));

    } catch (error) {
      console.error(`Error storing message for ${senderNumber}:`, error);
      throw new Error(`Failed to store message: ${error instanceof Error ? error.message : `${error}`}`);
    }
  }

  async getConversation(senderNumber: string): Promise<Conversation | null> {
    try {
      const filePath = this.getConversationFilePath(senderNumber);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(fileContent);
    } catch (error) {
      console.error(`Error loading conversation for ${senderNumber}:`, error);
      return null;
    }
  }

  async getMessageHistory(senderNumber: string, limit?: number): Promise<Message[]> {
    const conversation = await this.getConversation(senderNumber);
    if (!conversation) {
      return [];
    }

    const messages = conversation.messages;
    return limit ? messages.slice(-limit) : messages;
  }

  async getFormattedMessageHistory(senderNumber: string, limit: number = 10): Promise<string> {
    const messages = await this.getMessageHistory(senderNumber, limit);

    if (messages.length === 0) {
      return 'No previous conversation history.';
    }

    return messages.map(msg => {
      const timestamp = new Date(msg.timestamp).toLocaleString();
      let content = msg.content;

      if (msg.type === 'image' && msg.mediaPath) {
        content = '[Image message]';
      } else if (msg.type === 'audio' && msg.mediaPath) {
        content = '[Audio message]';
      }

      return `${timestamp} - ${msg.type.toUpperCase()}: ${content}`;
    }).join('\n');
  }

  async deleteConversation(senderNumber: string): Promise<boolean> {
    try {
      const filePath = this.getConversationFilePath(senderNumber);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error deleting conversation for ${senderNumber}:`, error);
      return false;
    }
  }

  async cleanupOldConversations(maxAgeHours: number = 168): Promise<number> {
    try {
      const files = fs.readdirSync(this.storageDir);
      const now = new Date();
      let deletedCount = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.storageDir, file);
          const stats = fs.statSync(filePath);
          const ageHours = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60);

          if (ageHours > maxAgeHours) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        }
      }

      console.log(`Cleaned up ${deletedCount} old conversation files`);
      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up old conversations:', error);
      return 0;
    }
  }

  private startCleanupInterval(): void {
    setInterval(() => {
      this.cleanupOldConversations(this.config.cleanupIntervalHours! * 24); // Convert hours to days
    }, 24 * 60 * 60 * 1000); // Run every 24 hours
  }

  getStorageStats(): { totalConversations: number; totalMessages: number } {
    try {
      const files = fs.readdirSync(this.storageDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));

      let totalMessages = 0;

      for (const file of jsonFiles) {
        const filePath = path.join(this.storageDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const conversation = JSON.parse(fileContent);
        totalMessages += conversation.messageCount;
      }

      return {
        totalConversations: jsonFiles.length,
        totalMessages
      };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { totalConversations: 0, totalMessages: 0 };
    }
  }
  // Add a new method to update the user profile
  async updateUserProfile(senderNumber: string, profileUpdate: Partial<UserProfile>): Promise<Conversation | null> {
      try {
          const conversation = await this.getConversation(senderNumber);
          if (!conversation) {
              console.error(`Cannot update profile for non-existent conversation: ${senderNumber}`);
              return null;
          }

          // Merge the update with the existing profile
          conversation.userProfile = { ...conversation.userProfile, ...profileUpdate };
          conversation.lastUpdated = new Date().toISOString();

          const filePath = this.getConversationFilePath(senderNumber);
          fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2));

          return conversation;

      } catch (error) {
          console.error(`Error updating profile for ${senderNumber}:`, error);
          return null;
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
./src/services/knowledgeBaseService.ts
---
import * as fs from 'fs';
import * as path from 'path';
import { OpenAIService } from './openaiService';

export interface KnowledgeDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    source: string;
    date: string;
    category: string;
    topics: string[];
  };
}

export class KnowledgeBaseService {
  private storagePath: string;
  private documents: KnowledgeDocument[] = [];
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService, storageDir: string = 'data/knowledge') {
    this.openaiService = openaiService;
    this.storagePath = path.join(storageDir, 'vectors.json');
    this.ensureDirectory(storageDir);
    this.loadDatabase();
  }

  private ensureDirectory(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private loadDatabase() {
    if (fs.existsSync(this.storagePath)) {
      const data = fs.readFileSync(this.storagePath, 'utf-8');
      this.documents = JSON.parse(data);
    }
  }

  private saveDatabase() {
    fs.writeFileSync(this.storagePath, JSON.stringify(this.documents, null, 2));
  }

  /**
   * Calculates Cosine Similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Check if similar content already exists to prevent duplicates
   */
  async hasDuplicate(content: string): Promise<boolean> {
    // Simple check: strict string matching or high similarity
    // Here we use strict matching for efficiency
    return this.documents.some(doc => doc.content === content);
  }

  /**
   * Add a new piece of knowledge
   */
  async addKnowledge(content: string, metadata: KnowledgeDocument['metadata']): Promise<void> {
    if (await this.hasDuplicate(content)) {
      console.log('Duplicate knowledge skipped.');
      return;
    }

    try {
      const embedding = await this.openaiService.createEmbedding(content);
      
      const doc: KnowledgeDocument = {
        id: `doc_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        content,
        embedding,
        metadata
      };

      this.documents.push(doc);
      this.saveDatabase();
      console.log(`🧠 Knowledge saved: [${metadata.category}] ${content.substring(0, 50)}...`);
    } catch (error) {
      console.error('Failed to add knowledge:', error);
    }
  }

  /**
   * RAG Search: Find relevant context for a query
   */
  async search(query: string, limit: number = 3, threshold: number = 0.75): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);

      const results = this.documents
        .map(doc => ({
          ...doc,
          similarity: this.cosineSimilarity(queryEmbedding, doc.embedding)
        }))
        .filter(doc => doc.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      if (results.length === 0) return "No relevant knowledge found in the database.";

      return results.map(r => 
        `[Date: ${r.metadata.date} | Source: ${r.metadata.source}]\n${r.content}`
      ).join('\n\n');

    } catch (error) {
      console.error('Knowledge search failed:', error);
      return "Error searching knowledge base.";
    }
  }
}

---
./src/services/knowledgeExtractionService.ts
---
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
import { VectorStoreService } from './vectorStoreService'; // UPDATED
import { NewsArticle } from './newsScrapeService';

export class NewsProcessorService {
  private openaiService: OpenAIService;
  private googleService: GoogleSearchService;
  private vectorStore: VectorStoreService; // UPDATED

  constructor(
    openaiService: OpenAIService,
    googleService: GoogleSearchService,
    vectorStore: VectorStoreService // UPDATED
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
    maxToolRounds: number = 15 // Increased from 5 to 15 as requested
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

      // Process tool calls
      const toolResults = await this.processToolCalls(message.tool_calls);

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
./src/services/processedMessageService.ts
---
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class ProcessedMessageService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = 'data/processed_messages.db') {
    this.dbPath = path.resolve(process.cwd(), dbPath);
    this.ensureDatabaseDirectory();
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  private ensureDatabaseDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initializeDatabase(): void {
    // WAL mode is better for concurrency
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id TEXT PRIMARY KEY,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sender_number TEXT,
        message_type TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_processed_at ON processed_messages(processed_at);
    `);
    
    console.log('✅ Processed messages database ready (better-sqlite3)');
    
    // Cleanup old entries on startup
    this.cleanupOldEntries(30);
  }

  async hasMessageBeenProcessed(messageId: string): Promise<boolean> {
    const stmt = this.db.prepare('SELECT message_id FROM processed_messages WHERE message_id = ?');
    const result = stmt.get(messageId);
    return !!result;
  }

  async markMessageAsProcessed(messageId: string, senderNumber?: string, messageType?: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO processed_messages (message_id, sender_number, message_type)
      VALUES (?, ?, ?)
    `);
    stmt.run(messageId, senderNumber, messageType);
  }

  async cleanupOldEntries(daysOlderThan: number = 30): Promise<number> {
    const stmt = this.db.prepare(`DELETE FROM processed_messages WHERE processed_at < datetime('now', '-${daysOlderThan} days')`);
    const info = stmt.run();
    return info.changes;
  }

  /**
   * Get statistics about processed messages
   */
  async getStats(): Promise<{
    totalProcessed: number;
    last24Hours: number;
    byType: Record<string, number>;
  }> {
    const totalProcessed = this.getCount();
    const last24Hours = this.getCountLast24Hours();
    const byType = this.getCountByType();

    return {
      totalProcessed,
      last24Hours,
      byType
    };
  }

  private getCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM processed_messages');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  private getCountLast24Hours(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM processed_messages WHERE processed_at > datetime('now', '-1 day')");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  private getCountByType(): Record<string, number> {
    const stmt = this.db.prepare('SELECT message_type, COUNT(*) as count FROM processed_messages GROUP BY message_type');
    const rows = stmt.all() as Array<{ message_type: string | null, count: number }>;
    
    const result: Record<string, number> = {};
    rows.forEach(row => {
      result[row.message_type || 'unknown'] = row.count;
    });
    return result;
  }

  close(): void {
    this.db.close();
  }
}

---
./src/services/vectorStoreService.ts
---
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { OpenAIService } from './openaiService';
import { TextChunker } from '../utils/textChunker';

export interface DocumentMetadata {
  source: string;
  date: string;
  category: string;
  title?: string;
}

interface VectorRow {
  id: string;
  content: string;
  vector: Buffer; // Changed from String to Buffer (BLOB)
  title: string;
  date: string;
}

export class VectorStoreService {
  private db: Database.Database;
  private openaiService: OpenAIService;

  constructor(openaiService: OpenAIService, storageDir: string = 'data/lancedb') {
    this.openaiService = openaiService;
    
    const dbPath = path.resolve(process.cwd(), storageDir);
    if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });
    
    this.db = new Database(path.join(dbPath, 'vectors.sqlite'));
    this.initDB();
  }

  private initDB() {
    this.db.pragma('journal_mode = WAL');
    // We store 'vector' as BLOB now
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        vector BLOB NOT NULL,
        source TEXT,
        date TEXT,
        category TEXT,
        title TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_category ON documents(category);
    `);
    console.log('✅ SQLite Vector Store Initialized (BLOB Mode)');
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

    const insertStmt = this.db.prepare(`
      INSERT INTO documents (id, content, vector, source, date, category, title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items) => {
      for (const item of items) insertStmt.run(item.id, item.content, item.vector, item.source, item.date, item.category, item.title);
    });

    const records = [];
    
    for (const chunk of chunks) {
      try {
        const embedding = await this.openaiService.createEmbedding(chunk);
        
        // CONVERT ARRAY TO BUFFER (Float64)
        const vectorBuffer = Buffer.from(new Float64Array(embedding).buffer);

        records.push({
          id: uuidv4(),
          content: chunk,
          vector: vectorBuffer, // Store as BLOB
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
      insertMany(records);
      console.log(`💾 Saved ${records.length} vectors to SQLite (BLOB format).`);
    }
  }

  async search(query: string, limit: number = 4, filter?: { category?: string }): Promise<string> {
    try {
      const queryEmbedding = await this.openaiService.createEmbedding(query);
      // Convert query to TypedArray for faster math
      const queryVec = new Float64Array(queryEmbedding);

      let sql = 'SELECT content, vector, title, date FROM documents';
      if (filter?.category) sql += ` WHERE category = '${filter.category}'`;
      
      const rows = this.db.prepare(sql).all() as VectorRow[];

      const results = rows.map(row => {
        // CONVERT BLOB BACK TO FLOAT ARRAY
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
  extractedAt: string;
  method: 'html' | 'visual' | 'hybrid';
  mobileView?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
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
./src/handlers/messageHandler.ts
---
import { WhatsAppService } from '../services/whatsappService';
import { MediaService, MediaInfo } from '../services/mediaService';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from '../services/openaiService';
import { ConversationStorageService } from '../services/conversationStorageService';
import { KnowledgeExtractionService } from '../services/knowledgeExtractionService';
import { Message } from '../types/conversation';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../services/googleSearchService';
import { initializeTools, getToolSchemas, executeTool, hasAvailableTools } from '../tools';

export class MessageHandler {
  private whatsappService: WhatsAppService;
  private mediaService: MediaService;
  public openaiService: OpenAIService | null;
  private googleSearchService: GoogleSearchService | null;
  private conversationStorage: ConversationStorageService;
  private knowledgeExtractionService: KnowledgeExtractionService;
  private toolsAvailable: boolean = false;
  private chatbotName: string;

  constructor(whatsappService: WhatsAppService, mediaService: MediaService) {
    this.whatsappService = whatsappService;
    this.mediaService = mediaService;
    this.openaiService = null;
    this.googleSearchService = null;

    // Initialize conversation storage
    this.conversationStorage = new ConversationStorageService({
      storagePath: 'data/conversations',
      maxMessagesPerConversation: 50,
      cleanupIntervalHours: 24
    });

    // Initialize knowledge extraction service
    this.knowledgeExtractionService = new KnowledgeExtractionService(
      null, // Will be set after OpenAI service initialization
      this.conversationStorage
    );

    // Get chatbot name from environment variable
    this.chatbotName = process.env.CHATBOT_NAME || 'Lucy';

    // Initialize services (OpenAI will be initialized asynchronously)
    this.initializeServices();
  }

  /**
   * Initialize services asynchronously
   */
  private async initializeServices(): Promise<void> {
    // Initialize OpenAI service from config file
    try {
      // Try to load from config file first
      this.openaiService = await createOpenAIServiceFromConfig();
      console.log('OpenAI service initialized successfully from config file');
    } catch (configError) {
      console.warn('Failed to initialize from config file, trying legacy environment variables:', configError instanceof Error ? configError.message : `${configError}`);

      // Fall back to environment variables for backward compatibility
      try {
        this.openaiService = createOpenAIServiceFromEnv();
        console.log('OpenAI service initialized successfully from environment variables (legacy mode)');
      } catch (envError) {
        console.warn('OpenAI service not available:', envError instanceof Error ? envError.message : `${envError}`);
        this.openaiService = null;
      }
    }

    // Update knowledge extraction service with OpenAI service
    this.knowledgeExtractionService = new KnowledgeExtractionService(
      this.openaiService,
      this.conversationStorage
    );

    // Initialize Google Search service if API keys are available
    try {
      this.googleSearchService = createGoogleSearchServiceFromEnv();
      console.log('Google Search service initialized successfully');

      // Initialize tools if both services are available
      if (this.openaiService && this.googleSearchService) {
        initializeTools(this.googleSearchService, this.mediaService);
        this.toolsAvailable = hasAvailableTools();
        console.log('Tools initialized:', this.toolsAvailable);
      }
    } catch (error) {
      console.warn('Google Search service not available:', error instanceof Error ? error.message : `${error}`);
      this.googleSearchService = null;
    }
  }

  async processMessage(
    from: string,
    messageText: string,
    messageId: string,
    messageType: string,
    mediaData?: { id: string; mimeType: string; sha256: string; type: 'image' | 'audio' }
  ): Promise<void> {
    await this.whatsappService.markMessageAsRead(messageId);

    // Get the full conversation object, including the user profile
    let conversation = await this.conversationStorage.getConversation(from);
    if (!conversation) {
        // This is a first-time user. Create an initial conversation entry.
        // The storeIncomingMessage will create the file with a default profile.
        await this.storeIncomingMessage(from, messageText, messageId, messageType, mediaData);
        conversation = await this.conversationStorage.getConversation(from);
    }

    const userProfile = conversation?.userProfile;
    let response: string;

    // --- State-based conversation logic ---
    if (userProfile?.state === 'awaiting_name') {
        // The user is responding with their name
        const name = messageText.trim();
        await this.conversationStorage.updateUserProfile(from, { name, state: null });
        response = `Great to meet you, ${name}! How can I help you today?`;
    } else if (!userProfile?.name) {
        // It's the first interaction and we don't know the name
        await this.conversationStorage.updateUserProfile(from, { state: 'awaiting_name' });
        response = `Hello! I'm ${this.chatbotName}, your personal assistant. What should I call you?`;
    } else {
        // --- Normal message processing ---
        if (messageType === 'text') {
            response = await this.generateResponse(messageText, from);
        } else if (messageType === 'image' && mediaData) {
            response = await this.processMediaMessage(mediaData, 'image');
        } else if (messageType === 'audio' && mediaData) {
            response = await this.processMediaMessage(mediaData, 'audio');
        } else {
            response = 'I can only process text, images, and audio files.';
        }
    }

    // Store the incoming message (if not already stored)
    await this.storeIncomingMessage(from, messageText, messageId, messageType, mediaData);

    await this.whatsappService.sendMessage(from, response);
    await this.storeOutgoingMessage(from, response, messageId);

    // After responding, scan conversation history for knowledge extraction
    await this.scanConversationForKnowledge(from);
  }

  async processMediaMessage(
    mediaData: { id: string; mimeType: string; sha256: string; type: 'image' | 'audio' },
    mediaType: 'image' | 'audio'
  ): Promise<string> {
    try {
      const mediaInfo = await this.mediaService.downloadAndSaveMedia(
        mediaData.id,
        mediaData.mimeType,
        mediaData.sha256,
        mediaType
      );

      // For both audio and images, use tool calling approach
      // The LLM will decide whether to use analyze_image or transcribe_audio tools
      const userMessage = mediaType === 'audio'
        ? "I've sent you an audio message. Please transcribe and respond to it."
        : "I've sent you an image. Please analyze and describe what you see.";

      try {
        const systemPrompt = `You are ${this.chatbotName}, a helpful WhatsApp assistant. The user has sent a ${mediaType} file.

For audio messages: Use the transcribe_audio tool to convert the audio to text, then respond conversationally.
For images: Use the analyze_image tool to understand the image content, then provide a helpful description.

File path: ${mediaInfo.filepath}
File type: ${mediaType}`;

        const messages: any[] = [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userMessage
          }
        ];

        const tools = getToolSchemas();
        const response = await this.openaiService!.generateResponseWithTools(messages, tools);

        return this.mediaService.getEnhancedMediaInfoResponse(mediaInfo, response);
      } catch (error) {
        console.error(`${mediaType} processing via tool calling failed:`, error);
        // Fall back to basic media info if tool calling fails
        return this.mediaService.getMediaInfoResponse(mediaInfo) +
               `\n\n❌ ${mediaType === 'audio' ? 'Audio transcription' : 'Image analysis'} is not available at the moment.`;
      }
    } catch (error) {
      console.error('Error processing media message:', error);
      return `Sorry, I couldn't process the ${mediaType} file. Please try again.`;
    }
  }

  async generateResponse(messageText: string, senderNumber?: string): Promise<string> {
    // Use OpenAI for intelligent responses if available
    if (this.openaiService?.isConfigured()) {
      try {
        let context = '';

        // Include conversation history if sender number is provided
        if (senderNumber) {
          context = await this.conversationStorage.getFormattedMessageHistory(senderNumber, 5);

          // Add user's name and learned knowledge to the context for the LLM
          const conversation = await this.conversationStorage.getConversation(senderNumber);
          const userName = conversation?.userProfile?.name || 'the user';
          const userKnowledge = conversation?.userProfile?.knowledge || {};

          context += `\n\n--- User Information ---
Name: ${userName}
Learned Knowledge: ${JSON.stringify(userKnowledge, null, 2)}`;
        }

        // Use tool calling if available and the message seems to require search
        const shouldUseSearch = this.toolsAvailable && this.shouldUseSearch(messageText);

        console.log('🧠 Response Generation Decision:', {
          message: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : ''),
          hasContext: !!context,
          toolsAvailable: this.toolsAvailable,
          shouldUseSearch: shouldUseSearch,
          searchKeywords: this.getSearchKeywords(messageText)
        });

        if (shouldUseSearch) {
          return await this.generateResponseWithTools(messageText, context, senderNumber);
        }

        return await this.openaiService.generateTextResponse(messageText, context);
      } catch (error) {
        console.error('OpenAI response generation failed, falling back to basic responses:', error);
        // Fall back to basic responses
      }
    }

    const lowerMessage = messageText.toLowerCase().trim();

    // Simple chatbot responses
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return 'Hello! Welcome to our WhatsApp bot. How can I help you today?';
    }

    if (lowerMessage.includes('help')) {
      return 'Here are some commands you can use:\n\n' +
             '• "hello" - Get a greeting\n' +
             '• "time" - Get current time\n' +
             '• "info" - Get information about this bot\n' +
             '• "help" - Show this help message';
    }

    if (lowerMessage.includes('time')) {
      const now = new Date();
      return `The current time is: ${now.toLocaleString()}`;
    }

    if (lowerMessage.includes('info')) {
      return 'This is a WhatsApp chat bot built with TypeScript and Express.js.\n' +
             'It can respond to basic commands and provide helpful information.';
    }

    // Default response
    return `You said: "${messageText}"\n\n` +
           'I can help you with:\n' +
           '• Type "hello" for a greeting\n' +
           '• Type "help" for available commands\n' +
           '• Type "time" for current time\n' +
           '• Type "info" for bot information';
  }

  // Helper for current time
  private getCurrentDateTime(): string {
    return new Date().toLocaleString('en-US', {
        timeZone: 'Asia/Hong_Kong',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
  }

  /**
   * Generate response using tool calling for enhanced capabilities
   */
  private async generateResponseWithTools(
    messageText: string,
    context: string,
    senderNumber?: string
  ): Promise<string> {
    if (!this.openaiService || !this.toolsAvailable) {
      return this.generateResponse(messageText, senderNumber);
    }

    try {
      // --- DIRECT NEWS HANDLING: Bypass AI tool calling for news requests ---
      const lowerMessage = messageText.toLowerCase();
      const isNewsRequest = lowerMessage.includes('news') ||
                           lowerMessage.includes('新聞') ||
                           lowerMessage.includes('港聞') ||
                           lowerMessage.includes('頭條') ||
                           lowerMessage.includes('today') ||
                           lowerMessage.includes('今日') ||
                           lowerMessage.includes('有咩');

      if (isNewsRequest) {
        console.log('📰 Direct news request detected, bypassing AI tool calling');
        return await this.handleNewsRequestDirectly(messageText, senderNumber);
      }

      let userName = 'the user';
      let userKnowledge = {};

      if (senderNumber) {
        const conversation = await this.conversationStorage.getConversation(senderNumber);
        userName = conversation?.userProfile?.name || 'the user';
        userKnowledge = conversation?.userProfile?.knowledge || {};
      }

      const now = this.getCurrentDateTime();
      
      // UPDATED PROMPT
      const systemPrompt = `You are ${this.chatbotName}, a friendly and witty Hong Kong assistant.
    
    Current Time: ${now}

    **BEHAVIOR GUIDELINES:**
    1. **Personality:** Be warm, use emojis naturally 🌏, and avoid robotic phrases like "Here is the output".
    2. **News Handling:**
       - If user asks for general news, call 'scrape_news' with category="general".
       - Summarize the top 3 stories briefly.
       - **IMPORTANT:** At the end, ask: "I also have updates on **Tech**, **Business**, and **Sports**. Want to hear about those?"
    3. **Accuracy:** Never invent news. Only use the data provided by the tools.
    4. **Context:** Ignore old news in the chat history. Always use tools for fresh data.

    Context: ${context}`;

      const messages: any[] = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: messageText
        }
      ];

      const tools = getToolSchemas();
      const rawAiResponse = await this.openaiService.generateResponseWithTools(messages, tools);

      // --- New logic to process and save learned knowledge ---
      const learnTagRegex = /<learn topic="([^"]+)" source="([^"]+)">([\s\S]*?)<\/learn>/;
      const match = rawAiResponse.match(learnTagRegex);

      if (match && senderNumber) {
          const [, topic, source, value] = match;
          const knowledgeUpdate = {
              [topic]: {
                  value: value.trim(),
                  source: source.trim(),
                  lastUpdated: new Date().toISOString()
              }
          };

          // Get the current profile and merge knowledge
          const conversation = await this.conversationStorage.getConversation(senderNumber);
          const existingKnowledge = conversation?.userProfile?.knowledge || {};
          await this.conversationStorage.updateUserProfile(senderNumber, {
              knowledge: { ...existingKnowledge, ...knowledgeUpdate }
          });

          console.log(`🧠 Learned new knowledge for user ${senderNumber}:`, knowledgeUpdate);
      }

      // Clean the <learn> tag from the response before sending it to the user
      const finalResponse = rawAiResponse.replace(learnTagRegex, '').trim();

      return finalResponse;
    } catch (error) {
      console.error('Error generating response with tools:', error);
      // Fall back to regular response generation
      return this.generateResponse(messageText, senderNumber);
    }
  }

  /**
   * Directly handle news requests without relying on AI tool calling
   */
  private async handleNewsRequestDirectly(messageText: string, senderNumber?: string): Promise<string> {
    try {
      // Import the news scrape service directly
      const { newsScrapeService } = await import('../tools/index');
      
      if (!newsScrapeService) {
        throw new Error('News scrape service not available');
      }
      
      // Determine category based on message
      let category = 'general';
      const lowerMessage = messageText.toLowerCase();
      
      if (lowerMessage.includes('tech') || lowerMessage.includes('技術')) category = 'tech';
      else if (lowerMessage.includes('business') || lowerMessage.includes('商業') || lowerMessage.includes('財經')) category = 'business';
      else if (lowerMessage.includes('sport') || lowerMessage.includes('體育')) category = 'sports';
      else if (lowerMessage.includes('world') || lowerMessage.includes('國際')) category = 'world';
      
      // Get fresh news data directly
      const newsData = newsScrapeService.getCachedNews(category);
      
      // Parse and format the news for the user
      const formattedNews = this.formatNewsForUser(newsData, category, messageText);
      
      return formattedNews;
    } catch (error) {
      console.error('Error handling news request directly:', error);
      return '抱歉，我暫時無法獲取最新新聞。請稍後再試。';
    }
  }

  /**
   * Format news data into a user-friendly response
   */
  private formatNewsForUser(newsData: string, category: string, originalMessage: string): string {
    // Extract the actual news content (remove system info)
    const newsContent = newsData.replace(/\[SYSTEM:.*?\]\n\n/, '');
    
    // Check if this is a Chinese language request
    const isChineseRequest = originalMessage.includes('新聞') ||
                            originalMessage.includes('港聞') ||
                            originalMessage.includes('有咩') ||
                            originalMessage.includes('今日');
    
    if (newsContent.includes('I am currently updating my news feed')) {
      return isChineseRequest
        ? '我正在更新新聞資訊，請稍等一分鐘再問我。🌟'
        : 'I am currently updating my news feed. Please ask again in 1 minute.';
    }
    
    // Parse the news content and create a summary
    const headlines = newsContent.split('\n\n').slice(0, 3); // Get top 3 headlines
    
    if (isChineseRequest) {
      let response = `嗨！👋 今日${this.getChineseCategoryName(category)}頭條：\n\n`;
      
      headlines.forEach((headline, index) => {
        const titleMatch = headline.match(/Headline: (.*?)\n/);
        const summaryMatch = headline.match(/Summary: (.*?)(\.\.\.)?$/);
        
        if (titleMatch && summaryMatch) {
          response += `${index + 1}️⃣ ${titleMatch[1]}\n`;
          response += `   ${summaryMatch[1].substring(0, 100)}...\n\n`;
        }
      });
      
      response += '想深入了解哪一個故事嗎？或者想看看其他類別的新聞？💬';
      return response;
    } else {
      let response = `Hi! 👋 Today's top ${category} headlines:\n\n`;
      
      headlines.forEach((headline, index) => {
        const titleMatch = headline.match(/Headline: (.*?)\n/);
        const summaryMatch = headline.match(/Summary: (.*?)(\.\.\.)?$/);
        
        if (titleMatch && summaryMatch) {
          response += `${index + 1}️⃣ ${titleMatch[1]}\n`;
          response += `   ${summaryMatch[1].substring(0, 100)}...\n\n`;
        }
      });
      
      response += 'Want more details on any story? Or check out other categories? 💬';
      return response;
    }
  }

  /**
   * Get Chinese category name
   */
  private getChineseCategoryName(category: string): string {
    const categoryMap: { [key: string]: string } = {
      'general': '綜合',
      'tech': '科技',
      'business': '商業',
      'sports': '體育',
      'world': '國際'
    };
    return categoryMap[category] || '綜合';
  }

  /**
   * Determine if a message should trigger search functionality
   */
  private shouldUseSearch(messageText: string): boolean {
    const lowerMessage = messageText.toLowerCase();

    // Keywords that indicate need for current information and web scraping
    const searchKeywords = [
      'current', 'latest', 'news', 'today', 'recent', 'update',
      'what is', 'who is', 'when is', 'where is', 'how to',
      'search', 'find', 'look up', 'information about',
      'weather', 'stock', 'price', 'score', 'results',
      // Web scraping specific keywords
      'website', 'webpage', 'page', 'article', 'blog', 'post',
      'url', 'link', 'http', 'https', 'www', '.com', '.org',
      'read', 'content', 'extract', 'scrape', 'information from',
      'check this', 'look at this', 'visit this', 'go to',
      'product', 'review', 'manual', 'documentation', 'guide',
      'tutorial', 'instructions', 'specifications', 'details'
    ];

    return searchKeywords.some(keyword => lowerMessage.includes(keyword));
  }

  /**
   * Get matching search keywords for logging
   */
  private getSearchKeywords(messageText: string): string[] {
    const lowerMessage = messageText.toLowerCase();
    const searchKeywords = [
      'current', 'latest', 'news', 'today', 'recent', 'update',
      'what is', 'who is', 'when is', 'where is', 'how to',
      'search', 'find', 'look up', 'information about',
      'weather', 'stock', 'price', 'score', 'results',
      // Web scraping specific keywords
      'website', 'webpage', 'page', 'article', 'blog', 'post',
      'url', 'link', 'http', 'https', 'www', '.com', '.org',
      'read', 'content', 'extract', 'scrape', 'information from',
      'check this', 'look at this', 'visit this', 'go to',
      'product', 'review', 'manual', 'documentation', 'guide',
      'tutorial', 'instructions', 'specifications', 'details'
    ];

    return searchKeywords.filter(keyword => lowerMessage.includes(keyword));
  }

 private async storeIncomingMessage(
   senderNumber: string,
   messageText: string,
   messageId: string,
   messageType: string,
   mediaData?: { id: string; mimeType: string; sha256: string; type: 'image' | 'audio' }
 ): Promise<void> {
   try {
     const message: Message = {
       id: messageId,
       type: messageType as 'text' | 'image' | 'audio',
       content: messageText,
       timestamp: new Date().toISOString(),
       mediaInfo: mediaData ? {
         id: mediaData.id,
         mimeType: mediaData.mimeType,
         sha256: mediaData.sha256
       } : undefined
     };

     await this.conversationStorage.storeMessage(senderNumber, message);
   } catch (error) {
     console.error('Error storing incoming message:', error);
   }
 }

 private async storeOutgoingMessage(
   senderNumber: string,
   response: string,
   originalMessageId: string
 ): Promise<void> {
   try {
     const message: Message = {
       id: `response_${Date.now()}_${originalMessageId}`,
       type: 'text',
       content: response,
       timestamp: new Date().toISOString()
     };

     await this.conversationStorage.storeMessage(senderNumber, message);
   } catch (error) {
     console.error('Error storing outgoing message:', error);
   }
 }

  /**
   * Get the chatbot name for external access
   */

  /**
   * Scan conversation history for knowledge extraction after responding
   */
  private async scanConversationForKnowledge(senderNumber: string): Promise<void> {
    try {
      // Only scan if we have enough conversation history (at least 3 messages)
      const conversation = await this.conversationStorage.getConversation(senderNumber);
      if (!conversation || conversation.messages.length < 3) {
        return;
      }

      // Only scan periodically to avoid excessive API calls
      // Scan every 5th message or if conversation has grown significantly
      const shouldScan = conversation.messages.length % 5 === 0 ||
                        conversation.messages.length > 20;

      if (shouldScan) {
        console.log(`🧠 Starting knowledge extraction scan for user ${senderNumber}`);
        await this.knowledgeExtractionService.scanConversationForKnowledge(senderNumber);
      }
    } catch (error) {
      console.error('Error in knowledge extraction scan:', error);
    }
  }
  getChatbotName(): string {
    return this.chatbotName;
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
./src/routes/webhook.ts
---
import { Router, Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsappService';
import { MessageHandler } from '../handlers/messageHandler';
import { MediaService } from '../services/mediaService';
import { ProcessedMessageService } from '../services/processedMessageService';
import { CryptoUtils } from '../utils/crypto';
import { WhatsAppMessage } from '../types/whatsapp';
import { getToolSchemas } from '../tools';

export class WebhookRoutes {
  private router: Router;
  private messageHandler: MessageHandler;
  private processedMessageService: ProcessedMessageService;
  private verifyToken: string;
  private appSecret: string;

  constructor(whatsappService: WhatsAppService, verifyToken: string, appSecret: string, whatsappConfig: any) {
    this.router = Router();
    const mediaService = new MediaService(whatsappConfig);
    this.messageHandler = new MessageHandler(whatsappService, mediaService);
    this.processedMessageService = new ProcessedMessageService();
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Webhook verification endpoint (GET)
    this.router.get('/webhook', (req: Request, res: Response) => {
      this.handleWebhookVerification(req, res);
    });

    // Webhook message handler (POST)
    this.router.post('/webhook', (req: Request, res: Response) => {
      this.handleWebhookMessage(req, res);
    });

    // Health check endpoint
    this.router.get('/health', (req: Request, res: Response) => {
      res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
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
    if (mode && token) {
      if (mode === 'subscribe' && token === this.verifyToken) {
        console.log('Webhook verified successfully!');
        res.status(200).send(challenge);
      } else {
        console.log('Webhook verification failed!');
        res.sendStatus(403);
      }
    }
  }

  private async handleWebhookMessage(req: Request, res: Response): Promise<void> {
    try {
      // Verify signature if app secret is provided
      if (this.appSecret) {
        const signature = req.headers['x-hub-signature-256'] as string;
        // Use raw body for signature verification (stored by body-parser middleware)
        const rawBody = (req as any).rawBody?.toString() || JSON.stringify(req.body);
        if (!CryptoUtils.verifySignature(this.appSecret, rawBody, signature)) {
          console.warn('Invalid webhook signature');
          res.sendStatus(401);
          return;
        }
      }

      const data: WhatsAppMessage = req.body;

      // Process each entry
      for (const entry of data.entry) {
        for (const change of entry.changes) {
          if (change.field === 'messages') {
            const messages = change.value.messages;

            if (messages && messages.length > 0) {
              for (const message of messages) {
                // Check if this message has already been processed
                const alreadyProcessed = await this.processedMessageService.hasMessageBeenProcessed(message.id);

                if (alreadyProcessed) {
                  console.log(`Skipping duplicate message: ${message.id} (already processed)`);
                  continue;
                }

                // Mark message as processed immediately to prevent race conditions
                await this.processedMessageService.markMessageAsProcessed(
                  message.id,
                  message.from,
                  message.type
                );

                if (message.type === 'text' && message.text) {
                  await this.messageHandler.processMessage(
                    message.from,
                    message.text.body,
                    message.id,
                    'text'
                  );
                } else if (message.type === 'image' && message.image) {
                  await this.messageHandler.processMessage(
                    message.from,
                    '',
                    message.id,
                    'image',
                    {
                      id: message.image.id,
                      mimeType: message.image.mime_type,
                      sha256: message.image.sha256,
                      type: 'image'
                    }
                  );
                } else if (message.type === 'audio' && message.audio) {
                  await this.messageHandler.processMessage(
                    message.from,
                    '',
                    message.id,
                    'audio',
                    {
                      id: message.audio.id,
                      mimeType: message.audio.mime_type,
                      sha256: message.audio.sha256,
                      type: 'audio'
                    }
                  );
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
        // For dev testing, directly use the local file path with tool calling
        const userMessage = "I've sent you an image. Please analyze and describe what you see.";

        const systemPrompt = `You are ${this.messageHandler.getChatbotName()}, a helpful WhatsApp assistant. The user has sent an image file for analysis.

Use the analyze_image tool to understand the image content and provide a helpful description.

File path: ${imagePath}`;

        const messages: any[] = [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userMessage
          }
        ];

        const tools = getToolSchemas();
        response = await this.messageHandler.openaiService!.generateResponseWithTools(messages, tools);
      } else if (type === 'audio' && audioPath) {
        console.log(`🎤 Processing local audio: ${audioPath}`);
        // For dev testing, directly use the local file path with tool calling
        const userMessage = "I've sent you an audio message. Please transcribe and respond to it.";

        const systemPrompt = `You are ${this.messageHandler.getChatbotName()}, a helpful WhatsApp assistant. The user has sent an audio file for transcription.

Use the transcribe_audio tool to convert the audio to text, then respond conversationally.

File path: ${audioPath}`;

        const messages: any[] = [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userMessage
          }
        ];

        const tools = getToolSchemas();
        response = await this.messageHandler.openaiService!.generateResponseWithTools(messages, tools);
      } else {
        // Process text message using the message handler
        response = await this.messageHandler.generateResponse(message, from);
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
./src/tools/index.ts
---
import { GoogleSearchService } from '../services/googleSearchService';
import { WebScrapeService, createWebScrapeService } from '../services/webScrapeService';
import { NewsScrapeService, createNewsScrapeService, NewsArticle } from '../services/newsScrapeService';
import { VectorStoreService } from '../services/vectorStoreService'; // Updated
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
let vectorStoreService: VectorStoreService; // Updated global reference
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
  vectorStoreService = new VectorStoreService(openaiService);

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

  // UPDATED: News Tool
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

  // ADD NEW TOOL: search_knowledge
  // ADD NEW TOOL: search_knowledge
  availableTools.search_knowledge = {
    name: 'search_knowledge',
    description: 'Search learned knowledge base',
    parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query']
    },
    execute: async (args: { query: string }) => {
      console.log(`🧠 Searching Vector Store for: ${args.query}`);
      return vectorStoreService.search(args.query);
    }
  };

// Cleanup function to close browser instances
export async function cleanupTools(): Promise<void> {
  if (webScrapeService) {
    await webScrapeService.close();
  }
}

---
