import * as fs from 'fs';
import * as path from 'path';
import { WebScrapeService, WebScrapeResult } from './webScrapeService';
import { NewsProcessorService } from './newsProcessorService';
import { GoogleNewsService } from './googleNewsService';

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
  private googleNewsService?: GoogleNewsService; // New Google News integration

  // Storage for our cached news summaries
  private newsCache: Map<string, string> = new Map();
  private isScraping: boolean = false;
  private lastUpdated: Date | null = null;

  // Hong Kong focused, Mobile-Friendly URLs
  private categorySources: Record<NewsCategory, string[]> = {
    'general': [
       'https://news.rthk.hk/rthk/en/'
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

  constructor(webScrapeService: WebScrapeService, newsProcessor?: NewsProcessorService, googleNewsService?: GoogleNewsService) {
    this.webScrapeService = webScrapeService;
    this.newsProcessor = newsProcessor;
    this.googleNewsService = googleNewsService;
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
    // Try to get news from Google News system first if available
    if (this.googleNewsService) {
      return this.getNewsFromGoogleNews(category);
    }

    // Fallback to legacy system
    return this.getNewsFromLegacySystem(category);
  }

  /**
   * Get news from Google News system
   */
  private getNewsFromGoogleNews(category: string): string {
    try {
      // This would integrate with the Google News service
      // For now, return a placeholder message
      return `[SYSTEM: Google News integration active. Category: ${category.toUpperCase()}]\n\nI'm now using the enhanced Google News system for more comprehensive news coverage. The system automatically browses news at 6:00 AM daily and checks for updates every 3 hours. You can view generated blog posts and digests in the dashboard.`;
    } catch (error) {
      console.error('❌ Error getting news from Google News:', error);
      return this.getNewsFromLegacySystem(category);
    }
  }

  /**
   * Get news from legacy system (fallback)
   */
  private getNewsFromLegacySystem(category: string): string {
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

    return `[SYSTEM: Legacy news system. Fetch time: ${timeAgo} mins ago. Category: ${key.toUpperCase()}]\n\n${data}`;
  }

  private formatNewsForLLM(results: WebScrapeResult[]): string {
    return results.map((r, i) =>
        `Headline: ${r.title}\nSource: ${r.url}\nSummary: ${r.content.substring(0, 350)}...`
    ).join('\n\n');
  }
}

export function createNewsScrapeService(webScrapeService: WebScrapeService, newsProcessor?: NewsProcessorService, googleNewsService?: GoogleNewsService): NewsScrapeService {
  return new NewsScrapeService(webScrapeService, newsProcessor, googleNewsService);
}