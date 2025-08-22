import { chromium, Browser, Page } from 'playwright';

export interface WebScrapeResult {
  title: string;
  url: string;
  content: string;
  extractedAt: string;
}

export interface WebScrapeConfig {
  timeout?: number;
  userAgent?: string;
  viewport?: { width: number; height: number };
  maxRetries?: number;
  retryDelay?: number;
  navigationTimeout?: number;
  loadStateTimeout?: number;
}

export class WebScrapeService {
  private config: WebScrapeConfig;
  private browser: Browser | null = null;

  constructor(config: WebScrapeConfig = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      userAgent: config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: config.viewport || { width: 1280, height: 720 },
      maxRetries: config.maxRetries || 2,
      retryDelay: config.retryDelay || 2000,
      navigationTimeout: config.navigationTimeout || 15000,
      loadStateTimeout: config.loadStateTimeout || 10000,
    };
  }

  /**
   * Initialize the browser instance
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }

  /**
   * Scrape content from a specific URL
   */
  async scrapeUrl(url: string, selector?: string): Promise<WebScrapeResult> {
    await this.initialize();

    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    let retryCount = 0;
    const maxRetries = this.config.maxRetries!;

    while (retryCount <= maxRetries) {
      const page = await this.browser.newPage();

      try {
        // Set viewport and user agent
        await page.setViewportSize(this.config.viewport!);
        await page.setExtraHTTPHeaders({
          'User-Agent': this.config.userAgent!,
        });

        console.log('🌐 Navigating to URL:', {
          url,
          attempt: retryCount + 1,
          maxRetries
        });

        // Navigate to the URL with separate timeouts for navigation and loading
        await page.goto(url, {
          timeout: this.config.navigationTimeout,
          waitUntil: 'domcontentloaded',
        });

        // Wait for the page to be fully loaded with a separate timeout
        // Use 'load' instead of 'networkidle' for more reliable loading
        await page.waitForLoadState('load', {
          timeout: this.config.loadStateTimeout
        });

        // Handle website-specific challenges
        await this.handleWebsiteSpecificChallenges(page, url);

        // Additional wait for dynamic content
        await this.waitForDynamicContent(page, url);

        // Get page title
        const pageTitle = await page.title();

        // Extract content based on selector or entire page
        let extractedContent: string;
        if (selector) {
          // Extract specific element content
          const element = await page.$(selector);
          if (element) {
            extractedContent = await element.textContent() || '';
          } else {
            throw new Error(`Selector "${selector}" not found on page`);
          }
        } else {
          // Extract main content (try to get article or main content)
          const articleContent = await page.$('article, main, .content, #content');
          if (articleContent) {
            extractedContent = await articleContent.textContent() || '';
          } else {
            // Fallback to body content
            const body = await page.$('body');
            extractedContent = await body?.textContent() || '';
          }
        }

        // Clean up content
        extractedContent = this.cleanContent(extractedContent);

        const scrapeResult: WebScrapeResult = {
          title: pageTitle,
          url,
          content: extractedContent.substring(0, 4000), // Limit content length
          extractedAt: new Date().toISOString(),
        };

        console.log('✅ Web scrape completed:', {
          url,
          title: pageTitle.substring(0, 50) + (pageTitle.length > 50 ? '...' : ''),
          contentLength: extractedContent.length,
          attempt: retryCount + 1,
        });

        await page.close();
        return scrapeResult;

      } catch (error) {
        await page.close();

        // Check if we should retry
        if (retryCount < maxRetries && this.shouldRetry(error)) {
          retryCount++;
          console.warn('⚠️ Web scrape attempt failed, retrying:', {
            url,
            attempt: retryCount,
            maxRetries,
            error: error instanceof Error ? error.message : 'Unknown error',
            retryDelay: `${this.config.retryDelay}ms`
          });

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay!));
          continue;
        }

        console.error('❌ Web scrape error:', {
          url,
          error: error instanceof Error ? error.message : 'Unknown error',
          finalAttempt: retryCount + 1,
        });

        throw new Error(`Failed to scrape URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    throw new Error(`Failed to scrape URL after ${maxRetries + 1} attempts`);
  }

  /**
   * Scrape multiple URLs
   */
  async scrapeUrls(urls: string[], selector?: string): Promise<WebScrapeResult[]> {
    const results: WebScrapeResult[] = [];

    for (const url of urls) {
      try {
        const result = await this.scrapeUrl(url, selector);
        results.push(result);
      } catch (error) {
        console.warn('⚠️ Failed to scrape URL:', { url, error });
        // Continue with other URLs
      }
    }

    return results;
  }

  /**
   * Clean extracted content
   */
  private cleanContent(content: string): string {
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }

  /**
   * Format scrape results for LLM consumption
   */
  formatScrapeResults(results: WebScrapeResult[]): string {
    if (results.length === 0) {
      return 'No content scraped.';
    }

    return results.map((result, index) =>
      `[${index + 1}] ${result.title}\nURL: ${result.url}\nContent: ${result.content}\n`
    ).join('\n');
  }

  /**
   * Close the browser instance
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Determine if a scrape error should be retried
   */
  private shouldRetry(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const errorMessage = error.message.toLowerCase();

    // Retry on timeout and network-related errors
    const retryableErrors = [
      'timeout',
      'network',
      'navigation',
      'load',
      'connection',
      'socket',
      'econnreset',
      'econnrefused',
      'econnaborted',
      'etimedout'
    ];

    return retryableErrors.some(keyword => errorMessage.includes(keyword));
  }

  /**
   * Handle website-specific scraping challenges
   */
  private async handleWebsiteSpecificChallenges(page: Page, url: string): Promise<void> {
    const domain = new URL(url).hostname;

    // Yahoo Finance specific handling
    if (domain.includes('yahoo.com') || domain.includes('finance.yahoo')) {
      console.log('🔧 Applying Yahoo Finance specific handling...');

      // Wait for specific elements that indicate the page is loaded
      try {
        await page.waitForSelector('[data-test="quote-header"]', { timeout: 5000 });
      } catch {
        // Fallback to waiting for any price-related element
        try {
          await page.waitForSelector('[data-symbol]', { timeout: 5000 });
        } catch {
          // If neither selector works, just continue
          console.log('⚠️ Yahoo Finance specific selectors not found, continuing...');
        }
      }
    }

    // News websites often have dynamic content
    if (domain.includes('news.') || domain.includes('reuters') || domain.includes('bloomberg')) {
      console.log('🔧 Applying news website handling...');

      // Wait a bit longer for news content to load
      await page.waitForTimeout(1000);
    }

    // Financial websites often have complex JavaScript
    if (domain.includes('finance.') || domain.includes('yahoo.com/finance') || domain.includes('bloomberg.com')) {
      console.log('🔧 Applying financial website handling...');

      // Wait for financial data to load
      await page.waitForTimeout(2000);

      // Try to wait for common financial data elements
      try {
        await page.waitForSelector('[data-test*="price"], [data-symbol], .quote-header', {
          timeout: 5000
        });
      } catch {
        console.log('⚠️ Financial data selectors not found, continuing...');
      }
    }
  }

  /**
   * Wait for dynamic content to load
   */
  private async waitForDynamicContent(page: Page, url: string): Promise<void> {
    const domain = new URL(url).hostname;

    // For JavaScript-heavy sites, wait for additional content
    if (domain.includes('yahoo.com') || domain.includes('finance.')) {
      console.log('⏳ Waiting for dynamic content on financial site...');
      await page.waitForTimeout(3000);

      // Scroll down a bit to trigger lazy loading using mouse wheel
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(1000);
    }
  }
}

// Helper function to create WebScrapeService instance with environment configuration
export function createWebScrapeService(): WebScrapeService {
  const config: WebScrapeConfig = {
    timeout: process.env.WEB_SCRAPE_TIMEOUT ? parseInt(process.env.WEB_SCRAPE_TIMEOUT) : undefined,
    maxRetries: process.env.WEB_SCRAPE_MAX_RETRIES ? parseInt(process.env.WEB_SCRAPE_MAX_RETRIES) : undefined,
    retryDelay: process.env.WEB_SCRAPE_RETRY_DELAY ? parseInt(process.env.WEB_SCRAPE_RETRY_DELAY) : undefined,
    navigationTimeout: process.env.WEB_SCRAPE_NAVIGATION_TIMEOUT ? parseInt(process.env.WEB_SCRAPE_NAVIGATION_TIMEOUT) : undefined,
    loadStateTimeout: process.env.WEB_SCRAPE_LOAD_STATE_TIMEOUT ? parseInt(process.env.WEB_SCRAPE_LOAD_STATE_TIMEOUT) : undefined,
  };

  console.log('🌐 Web Scrape Service Configuration:', {
    timeout: config.timeout || 'default',
    maxRetries: config.maxRetries || 'default',
    retryDelay: config.retryDelay || 'default',
    navigationTimeout: config.navigationTimeout || 'default',
    loadStateTimeout: config.loadStateTimeout || 'default',
  });

  return new WebScrapeService(config);
}