/**
 * ChromeRemoteDebugService
 * 
 * A service to control a Chrome browser via Chrome DevTools Protocol (CDP).
 * This allows using manually configured browser sessions (cookies, logins, etc.)
 * while automating navigation and content extraction.
 * 
 * @example
 * ```typescript
 * const service = new ChromeRemoteDebugService({ endpoint: 'http://192.168.8.24:9222' });
 * await service.connect();
 * const content = await service.navigateAndGetContent('https://example.com');
 * console.log(content.html);
 * await service.disconnect();
 * ```
 */

import { chromium, Browser, BrowserContext, Page, Response } from 'playwright';
import {
  ChromeRemoteDebugConfig,
  NavigateOptions,
  NavigateResult,
  PageContent,
  HealthStatus,
  ConnectionState,
  ConnectionStatus,
} from '../types/chromeRemoteDebug';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

/**
 * ChromeRemoteDebugService
 * 
 * Provides a high-level API for controlling a remote Chrome browser via CDP.
 * Preserves existing browser sessions (cookies, logins) by using existing contexts.
 */
export class ChromeRemoteDebugService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  
  private readonly config: Required<ChromeRemoteDebugConfig>;
  private connectionState: ConnectionState = 'disconnected';
  private lastConnected: Date | null = null;
  private lastError: string | null = null;
  private reconnectAttempts = 0;

  /**
   * Create a new ChromeRemoteDebugService instance
   * 
   * @param config - Configuration for the service
   */
  constructor(config: ChromeRemoteDebugConfig) {
    this.config = {
      endpoint: config.endpoint,
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
      retries: config.retries ?? DEFAULT_CONFIG.retries,
      retryDelay: config.retryDelay ?? DEFAULT_CONFIG.retryDelay,
    };
  }

  /**
   * Connect to the remote Chrome browser
   * 
   * @returns Promise that resolves when connected
   * @throws Error if connection fails after all retries
   */
  async connect(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      return; // Already connected
    }

    this.connectionState = 'connecting';
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retries; attempt++) {
      try {
        this.reconnectAttempts = attempt;
        this.browser = await chromium.connectOverCDP(this.config.endpoint);
        
        // Get or create context (prefer existing to preserve sessions)
        const contexts = this.browser.contexts();
        if (contexts.length > 0) {
          this.context = contexts[0];
        } else {
          this.context = await this.browser.newContext();
        }

        // Get or create page
        const pages = this.context.pages();
        if (pages.length > 0) {
          this.page = pages[0];
        } else {
          this.page = await this.context.newPage();
        }

        this.connectionState = 'connected';
        this.lastConnected = new Date();
        this.lastError = null;
        this.reconnectAttempts = 0;
        
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.lastError = lastError.message;
        
        if (attempt < this.config.retries) {
          await this.delay(this.config.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    this.connectionState = 'error';
    throw new Error(
      `Failed to connect to Chrome at ${this.config.endpoint} after ${this.config.retries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Disconnect from the remote Chrome browser
   * 
   * Note: This closes the connection but does NOT close the remote browser.
   */
  async disconnect(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore errors during disconnect
      }
    }
    
    this.browser = null;
    this.context = null;
    this.page = null;
    this.connectionState = 'disconnected';
  }

  /**
   * Check if currently connected to the remote browser
   */
  isConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return {
      state: this.connectionState,
      endpoint: this.config.endpoint,
      lastConnected: this.lastConnected ?? undefined,
      lastError: this.lastError ?? undefined,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Perform a health check on the connection
   */
  async healthCheck(): Promise<HealthStatus> {
    const timestamp = new Date();
    
    if (!this.browser || !this.browser.isConnected()) {
      return {
        healthy: false,
        error: 'Not connected to remote browser',
        timestamp,
      };
    }

    try {
      const browserVersion = this.browser.version();
      const contexts = this.browser.contexts();
      let pageCount = 0;
      
      for (const ctx of contexts) {
        pageCount += ctx.pages().length;
      }

      return {
        healthy: true,
        browserVersion,
        contextCount: contexts.length,
        pageCount,
        timestamp,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp,
      };
    }
  }

  /**
   * Navigate to a URL
   * 
   * @param url - URL to navigate to
   * @param options - Navigation options
   * @returns Navigation result
   */
  async navigate(url: string, options?: NavigateOptions): Promise<NavigateResult> {
    await this.ensureConnected();
    
    if (!this.page) {
      return {
        success: false,
        url: '',
        title: '',
        error: 'No page available',
      };
    }

    try {
      const timeout = options?.timeout ?? this.config.timeout;
      const waitUntil = options?.waitUntil ?? 'domcontentloaded';
      
      const response: Response | null = await this.page.goto(url, {
        timeout,
        waitUntil,
      });

      const finalUrl = this.page.url();
      const title = await this.page.title();

      return {
        success: true,
        url: finalUrl,
        title,
        statusCode: response?.status(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        url: this.page?.url() ?? url,
        title: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Get the HTML content of the current page
   * 
   * @returns HTML content string
   */
  async getHtmlContent(): Promise<string> {
    await this.ensureConnected();
    
    if (!this.page) {
      throw new Error('No page available');
    }

    return this.page.content();
  }

  /**
   * Get the current page title
   */
  async getTitle(): Promise<string> {
    await this.ensureConnected();
    
    if (!this.page) {
      throw new Error('No page available');
    }

    return this.page.title();
  }

  /**
   * Get the current page URL
   */
  getCurrentUrl(): string {
    return this.page?.url() ?? '';
  }

  /**
   * Navigate to a URL and get its content
   * 
   * Convenience method that combines navigate() and getHtmlContent().
   * 
   * @param url - URL to navigate to
   * @param options - Navigation options
   * @returns Page content including HTML, title, and URL
   */
  async navigateAndGetContent(url: string, options?: NavigateOptions): Promise<PageContent> {
    const navResult = await this.navigate(url, options);
    
    if (!navResult.success) {
      throw new Error(`Navigation failed: ${navResult.error}`);
    }

    const html = await this.getHtmlContent();

    return {
      url: navResult.url,
      title: navResult.title,
      html,
      timestamp: new Date(),
    };
  }

  /**
   * Create a new page in the current context
   * 
   * @returns The new page
   */
  async newPage(): Promise<Page> {
    await this.ensureConnected();
    
    if (!this.context) {
      throw new Error('No context available');
    }

    const newPage = await this.context.newPage();
    return newPage;
  }

  /**
   * Switch to a different page by index
   * 
   * @param index - Page index (0-based)
   * @returns The page at the given index
   */
  async switchToPage(index: number): Promise<Page> {
    await this.ensureConnected();
    
    if (!this.context) {
      throw new Error('No context available');
    }

    const pages = this.context.pages();
    
    if (index < 0 || index >= pages.length) {
      throw new Error(`Page index ${index} out of range (0-${pages.length - 1})`);
    }

    this.page = pages[index];
    return this.page;
  }

  /**
   * Get all pages in the current context
   */
  async getAllPages(): Promise<Page[]> {
    await this.ensureConnected();
    
    if (!this.context) {
      throw new Error('No context available');
    }

    return this.context.pages();
  }

  /**
   * Close the current page
   */
  async closeCurrentPage(): Promise<void> {
    if (this.page) {
      await this.page.close();
      
      // Switch to another page if available
      if (this.context) {
        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : null;
      } else {
        this.page = null;
      }
    }
  }

  /**
   * Execute JavaScript in the current page
   * 
   * @param script - JavaScript to execute
   * @returns Result of the script execution
   */
  async evaluate<T>(script: string): Promise<T> {
    await this.ensureConnected();
    
    if (!this.page) {
      throw new Error('No page available');
    }

    return this.page.evaluate(script);
  }

  /**
   * Take a screenshot of the current page
   * 
   * @param options - Screenshot options
   * @returns Screenshot as base64 string or Buffer
   */
  async screenshot(options?: { fullPage?: boolean; type?: 'png' | 'jpeg' }): Promise<Buffer> {
    await this.ensureConnected();
    
    if (!this.page) {
      throw new Error('No page available');
    }

    return this.page.screenshot({
      fullPage: options?.fullPage ?? false,
      type: options?.type ?? 'png',
    });
  }

  /**
   * Wait for a selector to appear on the page
   * 
   * @param selector - CSS selector to wait for
   * @param timeout - Timeout in milliseconds
   */
  async waitForSelector(selector: string, timeout?: number): Promise<void> {
    await this.ensureConnected();
    
    if (!this.page) {
      throw new Error('No page available');
    }

    await this.page.waitForSelector(selector, {
      timeout: timeout ?? this.config.timeout,
    });
  }

  /**
   * Ensure we have an active connection
   * 
   * @throws Error if not connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      // Try to reconnect
      await this.connect();
    }
    
    if (!this.browser || !this.browser.isConnected()) {
      throw new Error('Not connected to remote browser');
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a ChromeRemoteDebugService from environment variables
 * 
 * Environment variables:
 * - CDP_ENDPOINT: CDP endpoint URL (default: http://192.168.8.24:9222)
 * - CDP_TIMEOUT: Navigation timeout in ms (default: 30000)
 * - CDP_RETRIES: Connection retry count (default: 3)
 */
export function createChromeRemoteDebugServiceFromEnv(): ChromeRemoteDebugService {
  return new ChromeRemoteDebugService({
    endpoint: process.env.CDP_ENDPOINT || 'http://192.168.8.24:9222',
    timeout: process.env.CDP_TIMEOUT ? parseInt(process.env.CDP_TIMEOUT, 10) : undefined,
    retries: process.env.CDP_RETRIES ? parseInt(process.env.CDP_RETRIES, 10) : undefined,
  });
}
