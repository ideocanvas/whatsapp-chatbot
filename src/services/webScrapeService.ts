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
}

export class WebScrapeService {
  private config: WebScrapeConfig;
  private browser: Browser | null = null;

  constructor(config: WebScrapeConfig = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      userAgent: config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: config.viewport || { width: 1280, height: 720 },
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

    const page = await this.browser.newPage();

    try {
      // Set viewport and user agent
      await page.setViewportSize(this.config.viewport!);
      await page.setExtraHTTPHeaders({
        'User-Agent': this.config.userAgent!,
      });

      console.log('🌐 Navigating to URL:', { url });

      // Navigate to the URL with timeout
      await page.goto(url, {
        timeout: this.config.timeout,
        waitUntil: 'domcontentloaded',
      });

      // Wait for the page to be fully loaded
      await page.waitForLoadState('networkidle', { timeout: this.config.timeout });

      // Get page title
      const title = await page.title();

      // Extract content based on selector or entire page
      let content: string;
      if (selector) {
        // Extract specific element content
        const element = await page.$(selector);
        if (element) {
          content = await element.textContent() || '';
        } else {
          throw new Error(`Selector "${selector}" not found on page`);
        }
      } else {
        // Extract main content (try to get article or main content)
        const articleContent = await page.$('article, main, .content, #content');
        if (articleContent) {
          content = await articleContent.textContent() || '';
        } else {
          // Fallback to body content
          const body = await page.$('body');
          content = await body?.textContent() || '';
        }
      }

      // Clean up content
      content = this.cleanContent(content);

      const result: WebScrapeResult = {
        title,
        url,
        content: content.substring(0, 4000), // Limit content length
        extractedAt: new Date().toISOString(),
      };

      console.log('✅ Web scrape completed:', {
        url,
        title: title.substring(0, 50) + (title.length > 50 ? '...' : ''),
        contentLength: content.length,
      });

      return result;

    } catch (error) {
      console.error('❌ Web scrape error:', {
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Failed to scrape URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      await page.close();
    }
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
}

// Helper function to create WebScrapeService instance
export function createWebScrapeService(): WebScrapeService {
  return new WebScrapeService();
}