/**
 * ChromeRemoteDebugService
 * 
 * A service to control a Chrome browser via Chrome DevTools Protocol (CDP).
 * This allows using manually configured browser sessions (cookies, logins, etc.)
 * while automating navigation and content extraction.
 * 
 * IMPORTANT: This service implements exclusive locking to ensure only one caller
 * can use the Chrome instance at a time. Multiple concurrent callers will be
 * queued and processed sequentially.
 * 
 * @example
 * ```typescript
 * const service = new ChromeRemoteDebugService({ endpoint: 'http://127.0.0.1:9222' });
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
  lockTimeout: 60000, // Default lock acquisition timeout
};

/**
 * Lock acquisition result
 */
interface LockResult {
  release: () => void;
  acquiredAt: Date;
}

/**
 * Simple async lock implementation for exclusive access
 */
class AsyncLock {
  private locked = false;
  private readonly queue: Array<(acquired: boolean) => void> = [];

  async acquire(timeout: number): Promise<LockResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue if timeout
        const index = this.queue.indexOf(onAcquire);
        if (index !== -1) {
          this.queue.splice(index, 1);
          reject(new Error(`Lock acquisition timeout after ${timeout}ms`));
        }
      }, timeout);

      const onAcquire = (acquired: boolean) => {
        clearTimeout(timeoutId);
        if (acquired) {
          resolve({
            release: () => this.release(),
            acquiredAt: new Date(),
          });
        } else {
          reject(new Error('Lock acquisition failed'));
        }
      };

      if (this.locked) {
        this.queue.push(onAcquire);
      } else {
        this.locked = true;
        onAcquire(true);
      }
    });
  }

  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next(true);
    } else {
      this.locked = false;
    }
  }

  isLocked(): boolean {
    return this.locked;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

/**
 * ChromeRemoteDebugService
 * 
 * Provides a high-level API for controlling a remote Chrome browser via CDP.
 * Preserves existing browser sessions (cookies, logins) by using existing contexts.
 * 
 * This service uses an exclusive lock to ensure only one caller can use the
 * Chrome instance at a time. All public methods that interact with the browser
 * will acquire the lock automatically.
 */
export class ChromeRemoteDebugService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  
  private readonly config: Required<ChromeRemoteDebugConfig> & { lockTimeout: number };
  private connectionState: ConnectionState = 'disconnected';
  private lastConnected: Date | null = null;
  private lastError: string | null = null;
  private reconnectAttempts = 0;
  
  /** Lock for exclusive access to the Chrome instance */
  private readonly lock = new AsyncLock();

  /**
   * Create a new ChromeRemoteDebugService instance
   * 
   * @param config - Configuration for the service
   */
  constructor(config: ChromeRemoteDebugConfig & { lockTimeout?: number }) {
    this.config = {
      endpoint: config.endpoint,
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
      retries: config.retries ?? DEFAULT_CONFIG.retries,
      retryDelay: config.retryDelay ?? DEFAULT_CONFIG.retryDelay,
      lockTimeout: config.lockTimeout ?? DEFAULT_CONFIG.lockTimeout,
    };
  }
  
  /**
   * Get the current lock status
   */
  getLockStatus(): { isLocked: boolean; queueLength: number } {
    return {
      isLocked: this.lock.isLocked(),
      queueLength: this.lock.getQueueLength(),
    };
  }
  
  /**
   * Execute an operation with exclusive access to the Chrome instance
   * 
   * This method acquires the lock, executes the operation, and releases the lock.
   * All public methods that interact with the browser should use this method.
   * 
   * @param operation - The operation to execute
   * @returns The result of the operation
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const lockResult = await this.lock.acquire(this.config.lockTimeout);
    try {
      return await operation();
    } finally {
      lockResult.release();
    }
  }

  /**
   * Connect to the remote Chrome browser
   * 
   * This method acquires an exclusive lock to ensure only one caller
   * can connect at a time.
   * 
   * @returns Promise that resolves when connected
   * @throws Error if connection fails after all retries
   */
  async connect(): Promise<void> {
    return this.withLock(async () => {
      if (this.browser?.isConnected()) {
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
    });
  }

  /**
   * Disconnect from the remote Chrome browser
   * 
   * This method acquires an exclusive lock to ensure safe disconnection.
   * 
   * Note: This closes the connection but does NOT close the remote browser.
   */
  async disconnect(): Promise<void> {
    return this.withLock(async () => {
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
    });
  }

  /**
   * Check if currently connected to the remote browser
   */
  isConnected(): boolean {
    return this.browser?.isConnected() ?? false;
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
   * 
   * This method acquires an exclusive lock to ensure consistent health status.
   */
  async healthCheck(): Promise<HealthStatus> {
    return this.withLock(async () => {
      const timestamp = new Date();
      
      if (!this.browser?.isConnected()) {
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
    });
  }

  /**
   * Navigate to a URL
   * 
   * This method acquires an exclusive lock to ensure only one navigation
   * happens at a time.
   * 
   * @param url - URL to navigate to
   * @param options - Navigation options
   * @returns Navigation result
   */
  async navigate(url: string, options?: NavigateOptions): Promise<NavigateResult> {
    return this.withLock(async () => {
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
    });
  }

  /**
   * Get the HTML content of the current page
   * 
   * This method acquires an exclusive lock to ensure consistent content retrieval.
   * 
   * @returns HTML content string
   */
  async getHtmlContent(): Promise<string> {
    return this.withLock(async () => {
      await this.ensureConnected();
      
      if (!this.page) {
        throw new Error('No page available');
      }

      return this.page.content();
    });
  }

  /**
   * Get the current page title
   * 
   * This method acquires an exclusive lock to ensure consistent title retrieval.
   */
  async getTitle(): Promise<string> {
    return this.withLock(async () => {
      await this.ensureConnected();
      
      if (!this.page) {
        throw new Error('No page available');
      }

      return this.page.title();
    });
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
   * Uses a single lock acquisition for the entire operation.
   * 
   * @param url - URL to navigate to
   * @param options - Navigation options
   * @returns Page content including HTML, title, and URL
   */
  async navigateAndGetContent(url: string, options?: NavigateOptions): Promise<PageContent> {
    return this.withLock(async () => {
      await this.ensureConnected();
      
      if (!this.page) {
        throw new Error('No page available');
      }

      const timeout = options?.timeout ?? this.config.timeout;
      const waitUntil = options?.waitUntil ?? 'domcontentloaded';
      
      let response: Response | null;
      try {
        response = await this.page.goto(url, {
          timeout,
          waitUntil,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Navigation failed: ${errorMessage}`);
      }
      console.log(`Navigated to ${url} with status ${response?.status()}`);

      const finalUrl = this.page.url();
      const title = await this.page.title();
      const html = await this.page.content();

      return {
        url: finalUrl,
        title,
        html,
        timestamp: new Date(),
      };
    });
  }

  /**
   * Create a new page in the current context
   * 
   * This method acquires an exclusive lock to ensure safe page creation.
   * 
   * @returns The new page
   */
  async newPage(): Promise<Page> {
    return this.withLock(async () => {
      await this.ensureConnected();
      
      if (!this.context) {
        throw new Error('No context available');
      }

      const newPage = await this.context.newPage();
      return newPage;
    });
  }

  /**
   * Switch to a different page by index
   * 
   * This method acquires an exclusive lock to ensure safe page switching.
   * 
   * @param index - Page index (0-based)
   * @returns The page at the given index
   */
  async switchToPage(index: number): Promise<Page> {
    return this.withLock(async () => {
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
    });
  }

  /**
   * Get all pages in the current context
   * 
   * This method acquires an exclusive lock to ensure consistent page list.
   */
  async getAllPages(): Promise<Page[]> {
    return this.withLock(async () => {
      await this.ensureConnected();
      
      if (!this.context) {
        throw new Error('No context available');
      }

      return this.context.pages();
    });
  }

  /**
   * Close the current page
   * 
   * This method acquires an exclusive lock to ensure safe page closing.
   */
  async closeCurrentPage(): Promise<void> {
    return this.withLock(async () => {
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
    });
  }

  /**
   * Execute JavaScript in the current page
   * 
   * This method acquires an exclusive lock to ensure safe script execution.
   * 
   * @param script - JavaScript to execute
   * @returns Result of the script execution
   */
  async evaluate<T>(script: string): Promise<T> {
    return this.withLock(async () => {
      await this.ensureConnected();
      
      if (!this.page) {
        throw new Error('No page available');
      }

      return this.page.evaluate(script);
    });
  }

  /**
   * Take a screenshot of the current page
   * 
   * This method acquires an exclusive lock to ensure consistent screenshot.
   * 
   * @param options - Screenshot options
   * @returns Screenshot as base64 string or Buffer
   */
  async screenshot(options?: { fullPage?: boolean; type?: 'png' | 'jpeg' }): Promise<Buffer> {
    return this.withLock(async () => {
      await this.ensureConnected();
      
      if (!this.page) {
        throw new Error('No page available');
      }

      return this.page.screenshot({
        fullPage: options?.fullPage ?? false,
        type: options?.type ?? 'png',
      });
    });
  }

  /**
   * Wait for a selector to appear on the page
   * 
   * This method acquires an exclusive lock to ensure consistent waiting.
   * 
   * @param selector - CSS selector to wait for
   * @param timeout - Timeout in milliseconds
   */
  async waitForSelector(selector: string, timeout?: number): Promise<void> {
    return this.withLock(async () => {
      await this.ensureConnected();
      
      if (!this.page) {
        throw new Error('No page available');
      }

      await this.page.waitForSelector(selector, {
        timeout: timeout ?? this.config.timeout,
      });
    });
  }

  /**
   * Ensure we have an active connection
   * 
   * Note: This is a private method that should only be called from within
   * a locked context (i.e., from within withLock()). It does NOT acquire
   * the lock itself to avoid deadlocks.
   * 
   * @throws Error if not connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.browser?.isConnected()) {
      // Try to reconnect - this would cause a deadlock if called from within withLock()
      // since connect() also uses withLock(). Instead, we do a direct connection here.
      await this.connectInternal();
    }
    
    if (!this.browser?.isConnected()) {
      throw new Error('Not connected to remote browser');
    }
  }

  /**
   * Internal connection method without lock acquisition
   * 
   * This is used by ensureConnected() which is already called from within
   * a locked context.
   */
  private async connectInternal(): Promise<void> {
    if (this.browser?.isConnected()) {
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
 * - CDP_ENDPOINT: CDP endpoint URL (default: http://127.0.0.1:9222)
 * - CDP_TIMEOUT: Navigation timeout in ms (default: 30000)
 * - CDP_RETRIES: Connection retry count (default: 3)
 * - CDP_LOCK_TIMEOUT: Lock acquisition timeout in ms (default: 60000)
 */
export function createChromeRemoteDebugServiceFromEnv(): ChromeRemoteDebugService {
  return new ChromeRemoteDebugService({
    endpoint: process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222',
    timeout: process.env.CDP_TIMEOUT ? Number.parseInt(process.env.CDP_TIMEOUT, 10) : undefined,
    retries: process.env.CDP_RETRIES ? Number.parseInt(process.env.CDP_RETRIES, 10) : undefined,
    lockTimeout: process.env.CDP_LOCK_TIMEOUT ? Number.parseInt(process.env.CDP_LOCK_TIMEOUT, 10) : undefined,
  });
}
