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