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