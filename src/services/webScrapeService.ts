import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { OpenAIService, createOpenAIServiceFromEnv, createOpenAIServiceFromConfig } from './openaiService';

// --- TYPE DECLARATIONS TO FIX "Cannot find name" ERRORS ---
declare const window: any;
declare const document: any;
// ---------------------------------------------------------

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
  concurrency?: number;
  simulateHuman?: boolean;
}

export class WebScrapeService {
  private config: WebScrapeConfig;
  private browser: Browser | null = null;
  private openaiService: OpenAIService | null = null;

  constructor(config: WebScrapeConfig = {}) {
    this.config = {
      timeout: config.timeout || 60000,
      userAgent: config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      viewport: config.viewport || { width: 1366, height: 768 },
      maxRetries: config.maxRetries || 2,
      retryDelay: config.retryDelay || 2000,
      navigationTimeout: config.navigationTimeout || 30000,
      concurrency: config.concurrency || 3,
      simulateHuman: true,
    };

    this.initializeOpenAIService();
  }

  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled'
        ]
      });
    }
  }

  async scrapeUrl(url: string, selector?: string): Promise<WebScrapeResult> {
    await this.initialize();
    if (!this.browser) throw new Error('Browser not initialized');

    const context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      locale: 'en-US',
      timezoneId: 'America/New_York',
    });

    const page = await context.newPage();
    let retryCount = 0;

    try {
      while (retryCount <= this.config.maxRetries!) {
        try {
          console.log(`🕵️ Human-like scrape: ${url} (Attempt ${retryCount + 1})`);

          await page.goto(url, {
            timeout: this.config.navigationTimeout,
            waitUntil: 'domcontentloaded',
          });

          if (this.config.simulateHuman) {
            await this.dismissModals(page);
            await this.autoScroll(page);
            await page.waitForTimeout(Math.floor(Math.random() * 1000) + 500);
          }

          const pageTitle = await page.title();

          // Execute extraction logic IN the browser
          let extractedContent = await page.evaluate((inputSelector) => {
            // -- CLEANUP PHASE --
            const junkSelectors = [
              'script', 'style', 'noscript', 'iframe', 'svg',
              'nav', 'footer', 'header', 
              '.ad', '.ads', '.advertisement', 
              '#cookie-banner', '.cookie-consent',
              '[role="alert"]', '[aria-hidden="true"]'
            ];
            
            junkSelectors.forEach(sel => {
              const elements = document.querySelectorAll(sel);
              elements.forEach((el: any) => el.remove());
            });

            const clean = (text: string) => text.replace(/\s+/g, ' ').replace(/\n+/g, '\n').trim();

            // -- EXTRACTION PHASE --

            // 1. Specific Selector
            if (inputSelector) {
              const el = document.querySelector(inputSelector);
              if (el) return clean(el.textContent || '');
            }

            // 2. Heuristic: Find 'meatiest' element
            // explicitly cast to any[] to allow reduce
            const candidates = Array.from(document.querySelectorAll('article, main, .content, #content, .post-body, .entry-content')) as any[];
            
            if (candidates.length > 0) {
              // Explicitly cast result to 'any' to fix "best is unknown" error
              const best = candidates.reduce((a: any, b: any) => 
                (a.textContent?.length || 0) > (b.textContent?.length || 0) ? a : b
              ) as any;
              
              return clean(best.textContent || '');
            }

            // 3. Fallback to Body
            return clean(document.body.innerText || '');
          }, selector);

          // Visual Fallback
          if (extractedContent.length < 100) {
            console.warn(`⚠️ Content sparse for "${url}", using Visual Analysis...`);
            extractedContent = await this.fallbackToVisualAnalysis(page, url, selector);
          }

          const scrapeResult: WebScrapeResult = {
            title: pageTitle,
            url,
            content: extractedContent.substring(0, 8000),
            extractedAt: new Date().toISOString(),
          };

          await context.close();
          return scrapeResult;

        } catch (error) {
            if (retryCount < this.config.maxRetries! && this.shouldRetry(error)) {
                retryCount++;
                const delay = this.config.retryDelay! + Math.random() * 1000;
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw error;
        }
      }
      throw new Error(`Max retries reached`);
    } catch (error) {
      await context.close().catch(() => {});
      throw new Error(`Scrape failed: ${error instanceof Error ? error.message : `${error}`}`);
    }
  }

  private async autoScroll(page: Page): Promise<void> {
    try {
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 200;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight || totalHeight > 15000) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
    } catch (e) {
      // Ignore scroll errors
    }
  }

  private async dismissModals(page: Page): Promise<void> {
    try {
      const buttonTexts = ['Accept', 'Agree', 'Allow', 'I understand', 'Close', 'Reject All'];
      for (const text of buttonTexts) {
        const button = page.getByRole('button', { name: text, exact: false }).first();
        if (await button.isVisible()) {
            await button.click({ timeout: 1000 }).catch(() => {});
            await page.waitForTimeout(200);
        }
      }
    } catch (e) {}
  }

  async scrapeUrls(urls: string[], selector?: string): Promise<WebScrapeResult[]> {
    const results: WebScrapeResult[] = [];
    const batchSize = this.config.concurrency || 3; 

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      console.log(`🚀 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(urls.length/batchSize)}`);
      
      const batchPromises = batch.map(url => this.scrapeUrl(url, selector).catch(e => {
        console.error(`❌ Failed: ${url}`); 
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
    return ['timeout', 'network', 'connection', 'reset', 'navigat'].some(k => msg.includes(k));
  }

  private async fallbackToVisualAnalysis(page: Page, url: string, selector?: string): Promise<string> {
    if (!this.openaiService?.isConfigured()) return "Visual analysis not configured.";
    try {
      const screenshotPath = await this.captureScreenshot(page, url);
      const prompt = this.openaiService.getConfig()?.prompts?.webScrapeImageAnalysis;
      const analysis = await this.openaiService.analyzeImage(screenshotPath, prompt);
      this.cleanupScreenshot(screenshotPath);
      return analysis;
    } catch (error) { return ""; }
  }

  private async captureScreenshot(page: Page, url: string): Promise<string> {
    const screenshotPath = this.getScreenshotPath(url);
    const dir = path.dirname(screenshotPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  }

  private getScreenshotPath(url: string): string {
    let hash = 0;
    for (let i = 0; i < url.length; i++) hash = ((hash << 5) - hash) + url.charCodeAt(i) | 0;
    return path.join('data', 'screenshots', `snap_${Math.abs(hash)}_${Date.now()}.png`);
  }

  private cleanupScreenshot(pathStr: string): void {
    try { if (fs.existsSync(pathStr)) fs.unlinkSync(pathStr); } catch (e) {}
  }

  formatScrapeResults(results: WebScrapeResult[]): string {
    if (results.length === 0) return 'No content scraped.';
    return results.map((result, index) =>
      `[${index + 1}] ${result.title}\nURL: ${result.url}\nContent: ${result.content}\n`
    ).join('\n');
  }

  private async initializeOpenAIService(): Promise<void> {
    try { this.openaiService = await createOpenAIServiceFromConfig(); } 
    catch (e) { try { this.openaiService = createOpenAIServiceFromEnv(); } catch (e) { this.openaiService = null; } }
  }
}

export function createWebScrapeService(): WebScrapeService {
  return new WebScrapeService({
    timeout: Number(process.env.WEB_SCRAPE_TIMEOUT) || undefined,
    maxRetries: Number(process.env.WEB_SCRAPE_MAX_RETRIES) || undefined,
    concurrency: Number(process.env.WEB_SCRAPE_CONCURRENCY) || 3
  });
}