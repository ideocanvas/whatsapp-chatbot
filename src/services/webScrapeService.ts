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