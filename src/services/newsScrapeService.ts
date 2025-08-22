import { GoogleSearchService } from './googleSearchService';
import { WebScrapeService, WebScrapeResult } from './webScrapeService';

export interface NewsArticle {
  title: string;
  url: string;
  content: string;
  source: string;
  publishedAt?: string;
  category?: string;
}

export interface NewsScrapeConfig {
  maxArticles?: number;
  maxArticlesPerSite?: number;
  searchQuery?: string;
  timeout?: number;
  newsSources?: string[];
}

export class NewsScrapeService {
  private googleSearchService: GoogleSearchService;
  private webScrapeService: WebScrapeService;
  private config: NewsScrapeConfig;

  constructor(
    googleSearchService: GoogleSearchService,
    webScrapeService: WebScrapeService,
    config: NewsScrapeConfig = {}
  ) {
    this.googleSearchService = googleSearchService;
    this.webScrapeService = webScrapeService;
    this.config = {
      maxArticles: config.maxArticles || 5,
      maxArticlesPerSite: config.maxArticlesPerSite || 3,
      searchQuery: config.searchQuery || 'latest news',
      timeout: config.timeout || 30000,
      newsSources: config.newsSources || [
        'hk.news.yahoo.com',
        'bbc.com',
        'nytimes.com',
        'wsj.com',
      ]
    };
  }

  /**
   * Scrape news articles based on a query
   */
  async scrapeNews(query?: string): Promise<NewsArticle[]> {
    const searchQuery = query || this.config.searchQuery!;
    const maxArticles = this.config.maxArticles!;
    const maxArticlesPerSite = this.config.maxArticlesPerSite!;

    console.log('📰 Starting news scrape:', {
      query: searchQuery,
      maxArticles,
      maxArticlesPerSite,
      sources: this.config.newsSources
    });

    try {
      // Step 1: Search for news articles from each site individually
      const allSearchResults: any[] = [];

      // Search each news site separately to get maximum articles per site
      for (const source of this.config.newsSources!) {
        try {
          const siteQuery = `${searchQuery} site:${source}`;
          const siteResults = await this.googleSearchService.searchMultiple(
            siteQuery,
            maxArticlesPerSite * 2 // Get more to account for potential failures
          );

          console.log(`🔍 Found ${siteResults.length} results for ${source}`);
          allSearchResults.push(...siteResults);

          // Add small delay between site searches to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (error) {
          console.warn(`⚠️ Failed to search ${source}:`, {
            error: error instanceof Error ? error.message : `${error}`
          });
          // Continue with other sites
        }
      }

      if (allSearchResults.length === 0) {
        console.warn('⚠️ No news search results found from any site');
        return [];
      }

      // Step 2: Extract URLs from search results and group by site
      const siteUrlMap = new Map<string, string[]>();

      for (const result of allSearchResults) {
        if (this.isNewsSource(result.link)) {
          const hostname = new URL(result.link).hostname;
          if (!siteUrlMap.has(hostname)) {
            siteUrlMap.set(hostname, []);
          }
          siteUrlMap.get(hostname)!.push(result.link);
        }
      }

      // Step 3: Limit URLs per site and flatten
      const newsUrls: string[] = [];
      for (const [site, urls] of siteUrlMap.entries()) {
        const limitedUrls = urls.slice(0, maxArticlesPerSite);
        newsUrls.push(...limitedUrls);
        console.log(`📊 ${site}: ${limitedUrls.length}/${urls.length} articles selected`);
      }

      if (newsUrls.length === 0) {
        console.warn('⚠️ No valid news URLs found in search results');
        return [];
      }

      // Apply overall max articles limit
      const finalUrls = newsUrls.slice(0, maxArticles);

      console.log('🔍 Final news URLs selected:', {
        totalSelected: finalUrls.length,
        bySite: Array.from(siteUrlMap.entries()).map(([site, urls]) => ({
          site,
          selected: Math.min(urls.length, maxArticlesPerSite),
          total: urls.length
        }))
      });

      // Step 4: Scrape content from news URLs
      const scrapeResults = await this.webScrapeService.scrapeUrls(finalUrls);

      // Step 5: Convert to NewsArticle format
      const newsArticles = scrapeResults.map(result => this.convertToNewsArticle(result));

      console.log('✅ News scrape completed:', {
        successfulArticles: newsArticles.length,
        totalAttempted: finalUrls.length,
        distribution: this.getArticleDistribution(newsArticles)
      });

      return newsArticles;
    } catch (error) {
      console.error('❌ News scrape error:', {
        error: error instanceof Error ? error.message : `${error}`,
        query: searchQuery
      });
      throw new Error(`Failed to scrape news: ${error instanceof Error ? error.message : `${error}`}`);
    }
  }

  /**
   * Scrape news from specific URLs
   */
  async scrapeNewsFromUrls(urls: string[]): Promise<NewsArticle[]> {
    console.log('📰 Scraping news from specific URLs:', {
      urls: urls.map(url => new URL(url).hostname),
      count: urls.length
    });

    try {
      const scrapeResults = await this.webScrapeService.scrapeUrls(urls);
      const newsArticles = scrapeResults.map(result => this.convertToNewsArticle(result));

      console.log('✅ Specific URL news scrape completed:', {
        successfulArticles: newsArticles.length,
        totalAttempted: urls.length
      });

      return newsArticles;
    } catch (error) {
      console.error('❌ Specific URL news scrape error:', {
        error: error instanceof Error ? error.message : `${error}`,
        urls
      });
      throw new Error(`Failed to scrape news from URLs: ${error instanceof Error ? error.message : `${error}`}`);
    }
  }

  /**
   * Check if a URL is from a known news source
   */
  private isNewsSource(url: string): boolean {
    try {
      const hostname = new URL(url).hostname;
      return this.config.newsSources!.some(source => hostname.includes(source));
    } catch {
      return false;
    }
  }

  /**
   * Convert WebScrapeResult to NewsArticle
   */
  private convertToNewsArticle(result: WebScrapeResult): NewsArticle {
    const source = new URL(result.url).hostname;

    return {
      title: result.title,
      url: result.url,
      content: result.content,
      source: source,
      publishedAt: new Date().toISOString(), // Could extract from content if available
      category: this.detectCategory(result.content)
    };
  }

  /**
   * Detect news category from content
   */
  private detectCategory(content: string): string {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('politics') || lowerContent.includes('election') || lowerContent.includes('government')) {
      return 'Politics';
    } else if (lowerContent.includes('business') || lowerContent.includes('economy') || lowerContent.includes('market')) {
      return 'Business';
    } else if (lowerContent.includes('technology') || lowerContent.includes('tech') || lowerContent.includes('ai')) {
      return 'Technology';
    } else if (lowerContent.includes('sports') || lowerContent.includes('game') || lowerContent.includes('match')) {
      return 'Sports';
    } else if (lowerContent.includes('health') || lowerContent.includes('medical') || lowerContent.includes('covid')) {
      return 'Health';
    } else if (lowerContent.includes('entertainment') || lowerContent.includes('movie') || lowerContent.includes('celebrity')) {
      return 'Entertainment';
    } else {
      return 'General';
    }
  }

  /**
   * Get distribution of articles by source
   */
  private getArticleDistribution(articles: NewsArticle[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    for (const article of articles) {
      distribution[article.source] = (distribution[article.source] || 0) + 1;
    }
    return distribution;
  }

  /**
   * Format news articles for display
   */
  formatNewsArticles(articles: NewsArticle[]): string {
    if (articles.length === 0) {
      return 'No news articles found.';
    }

    const formattedText = articles.map((article, index) =>
      `📰 ${index + 1}. ${article.title}\n` +
      `   Source: ${article.source}\n` +
      `   Category: ${article.category}\n` +
      `   Content: ${article.content.substring(0, 200)}${article.content.length > 200 ? '...' : ''}\n` +
      `   Read more: ${article.url}\n`
    ).join('\n');
    console.log("formattedText", formattedText);
    return formattedText;
  }

  /**
   * Get trending news topics
   */
  async getTrendingNews(): Promise<NewsArticle[]> {
    return this.scrapeNews('trending news today');
  }

  /**
   * Get news by category
   */
  async getNewsByCategory(category: string): Promise<NewsArticle[]> {
    return this.scrapeNews(`${category} news`);
  }
}

// Helper function to create NewsScrapeService instance
export function createNewsScrapeService(
  googleSearchService: GoogleSearchService,
  webScrapeService: WebScrapeService,
  config?: NewsScrapeConfig
): NewsScrapeService {
  return new NewsScrapeService(googleSearchService, webScrapeService, config);
}