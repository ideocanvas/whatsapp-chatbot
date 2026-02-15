/**
 * Unit tests for ChromeRemoteDebugService
 * 
 * Note: These tests mock the Playwright browser connection.
 * For integration tests with a real Chrome instance, use the test script:
 *   npx ts-node scripts/test-chrome-remote-debug.ts
 */

import { chromium } from 'playwright';
import { ChromeRemoteDebugService, createChromeRemoteDebugServiceFromEnv } from '../../src/services/ChromeRemoteDebugService';

// Mock Playwright
jest.mock('playwright', () => ({
  chromium: {
    connectOverCDP: jest.fn(),
  },
}));

describe('ChromeRemoteDebugService', () => {
  let service: ChromeRemoteDebugService;
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;

  const defaultConfig = {
    endpoint: 'http://127.0.0.1:9222',
    timeout: 30000,
    retries: 3,
    retryDelay: 100,
  };

  beforeEach(() => {
    // Create mock page
    mockPage = {
      url: jest.fn().mockReturnValue('https://example.com'),
      title: jest.fn().mockResolvedValue('Example Domain'),
      content: jest.fn().mockResolvedValue('<html><body>Test Content</body></html>'),
      goto: jest.fn().mockResolvedValue({ status: () => 200, statusText: () => 'OK' }),
      evaluate: jest.fn().mockResolvedValue('result'),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Create mock context
    mockContext = {
      pages: jest.fn().mockReturnValue([mockPage]),
      newPage: jest.fn().mockResolvedValue(mockPage),
    };

    // Create mock browser
    mockBrowser = {
      isConnected: jest.fn().mockReturnValue(true),
      version: jest.fn().mockReturnValue('Chrome/120.0.0'),
      contexts: jest.fn().mockReturnValue([mockContext]),
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Mock connectOverCDP
    (chromium.connectOverCDP as jest.Mock).mockResolvedValue(mockBrowser);

    service = new ChromeRemoteDebugService(defaultConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create service with provided config', () => {
      expect(service).toBeDefined();
      expect(service.isConnected()).toBe(false);
    });

    it('should use default values for optional config', () => {
      const minimalService = new ChromeRemoteDebugService({ endpoint: 'http://localhost:9222' });
      expect(minimalService).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should connect to remote browser', async () => {
      await service.connect();
      
      expect(chromium.connectOverCDP).toHaveBeenCalledWith(defaultConfig.endpoint);
      expect(service.isConnected()).toBe(true);
    });

    it('should reuse existing context', async () => {
      await service.connect();
      
      expect(mockBrowser.contexts).toHaveBeenCalled();
      expect(mockContext.pages).toHaveBeenCalled();
    });

    it('should create new context if none exists', async () => {
      mockBrowser.contexts.mockReturnValue([]);
      
      await service.connect();
      
      expect(mockBrowser.newContext).toHaveBeenCalled();
    });

    it('should retry connection on failure', async () => {
      (chromium.connectOverCDP as jest.Mock)
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(mockBrowser);
      
      await service.connect();
      
      expect(chromium.connectOverCDP).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      (chromium.connectOverCDP as jest.Mock).mockRejectedValue(new Error('Connection refused'));
      
      await expect(service.connect()).rejects.toThrow('Failed to connect to Chrome');
      expect(chromium.connectOverCDP).toHaveBeenCalledTimes(defaultConfig.retries);
    });

    it('should not reconnect if already connected', async () => {
      await service.connect();
      await service.connect(); // Second call
      
      expect(chromium.connectOverCDP).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('should disconnect from browser', async () => {
      await service.connect();
      await service.disconnect();
      
      expect(mockBrowser.close).toHaveBeenCalled();
      expect(service.isConnected()).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      await expect(service.disconnect()).resolves.not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should return true when connected', async () => {
      await service.connect();
      expect(service.isConnected()).toBe(true);
    });
  });

  describe('getConnectionStatus', () => {
    it('should return disconnected status initially', () => {
      const status = service.getConnectionStatus();
      
      expect(status.state).toBe('disconnected');
      expect(status.endpoint).toBe(defaultConfig.endpoint);
    });

    it('should return connected status after connection', async () => {
      await service.connect();
      
      const status = service.getConnectionStatus();
      expect(status.state).toBe('connected');
      expect(status.lastConnected).toBeDefined();
    });
  });

  describe('healthCheck', () => {
    it('should return unhealthy when not connected', async () => {
      const health = await service.healthCheck();
      
      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Not connected to remote browser');
    });

    it('should return healthy when connected', async () => {
      await service.connect();
      
      const health = await service.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.browserVersion).toBe('Chrome/120.0.0');
      expect(health.contextCount).toBe(1);
      expect(health.pageCount).toBe(1);
    });
  });

  describe('navigate', () => {
    it('should navigate to URL', async () => {
      await service.connect();
      
      const result = await service.navigate('https://example.com');
      
      expect(result.success).toBe(true);
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Example Domain');
      expect(result.statusCode).toBe(200);
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    });

    it('should return error on navigation failure', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));
      
      await service.connect();
      
      const result = await service.navigate('https://example.com');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Navigation timeout');
    });

    it('should use custom timeout', async () => {
      await service.connect();
      
      await service.navigate('https://example.com', { timeout: 5000 });
      
      expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', 
        expect.objectContaining({ timeout: 5000 })
      );
    });
  });

  describe('getHtmlContent', () => {
    it('should return HTML content', async () => {
      await service.connect();
      
      const html = await service.getHtmlContent();
      
      expect(html).toBe('<html><body>Test Content</body></html>');
      expect(mockPage.content).toHaveBeenCalled();
    });

    it('should throw when not connected', async () => {
      await expect(service.getHtmlContent()).rejects.toThrow();
    });
  });

  describe('getTitle', () => {
    it('should return page title', async () => {
      await service.connect();
      
      const title = await service.getTitle();
      
      expect(title).toBe('Example Domain');
    });
  });

  describe('getCurrentUrl', () => {
    it('should return current URL', async () => {
      await service.connect();
      
      const url = service.getCurrentUrl();
      
      expect(url).toBe('https://example.com');
    });
  });

  describe('navigateAndGetContent', () => {
    it('should navigate and return content', async () => {
      await service.connect();
      
      const content = await service.navigateAndGetContent('https://example.com');
      
      expect(content.url).toBe('https://example.com');
      expect(content.title).toBe('Example Domain');
      expect(content.html).toBe('<html><body>Test Content</body></html>');
      expect(content.timestamp).toBeInstanceOf(Date);
    });

    it('should throw on navigation failure', async () => {
      mockPage.goto.mockRejectedValue(new Error('Failed'));
      
      await service.connect();
      
      await expect(service.navigateAndGetContent('https://example.com'))
        .rejects.toThrow('Navigation failed');
    });
  });

  describe('newPage', () => {
    it('should create a new page', async () => {
      await service.connect();
      
      const page = await service.newPage();
      
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(page).toBeDefined();
    });
  });

  describe('getAllPages', () => {
    it('should return all pages', async () => {
      await service.connect();
      
      const pages = await service.getAllPages();
      
      expect(pages).toHaveLength(1);
    });
  });

  describe('evaluate', () => {
    it('should execute JavaScript', async () => {
      await service.connect();
      
      const result = await service.evaluate('document.title');
      
      expect(mockPage.evaluate).toHaveBeenCalledWith('document.title');
      expect(result).toBe('result');
    });
  });

  describe('screenshot', () => {
    it('should take a screenshot', async () => {
      await service.connect();
      
      const screenshot = await service.screenshot();
      
      expect(mockPage.screenshot).toHaveBeenCalled();
      expect(screenshot).toBeInstanceOf(Buffer);
    });
  });

  describe('waitForSelector', () => {
    it('should wait for selector', async () => {
      await service.connect();
      
      await service.waitForSelector('.content');
      
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('.content', expect.any(Object));
    });
  });
});

describe('createChromeRemoteDebugServiceFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should create service with default values', () => {
    delete process.env.CDP_ENDPOINT;
    delete process.env.CDP_TIMEOUT;
    delete process.env.CDP_RETRIES;
    
    const service = createChromeRemoteDebugServiceFromEnv();
    
    expect(service).toBeDefined();
  });

  it('should use environment variables', () => {
    process.env.CDP_ENDPOINT = 'http://custom:9222';
    process.env.CDP_TIMEOUT = '60000';
    process.env.CDP_RETRIES = '5';
    
    const service = createChromeRemoteDebugServiceFromEnv();
    
    expect(service).toBeDefined();
  });
});
