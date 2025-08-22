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
  private webScrapeService: WebScrapeService;
  private config: NewsScrapeConfig;
  private hardcodedNewsUrls: string[];

  constructor(
    webScrapeService: WebScrapeService,
    config: NewsScrapeConfig = {}
  ) {
    this.webScrapeService = webScrapeService;
    this.config = {
      maxArticles: config.maxArticles || 5,
      maxArticlesPerSite: config.maxArticlesPerSite || 3,
      searchQuery: config.searchQuery || 'latest news',
      timeout: config.timeout || 30000,
      newsSources: config.newsSources || [
        'www.scmp.com',
      ]
    };

    // Hardcoded news URLs from popular news sources
    this.hardcodedNewsUrls = [
      'https://www.scmp.com/news/hong-kong',
      'https://www.scmp.com/news/china',
      'https://www.scmp.com/business',
      'https://www.scmp.com/tech',
      'https://www.scmp.com/sport',
      'https://www.bbc.com/news',
      'https://www.bbc.com/news/world',
      'https://www.bbc.com/news/business',
      'https://www.bbc.com/news/technology',
      'https://www.bbc.com/news/science_and_environment',
      'https://edition.cnn.com/world',
      'https://edition.cnn.com/business',
      'https://edition.cnn.com/tech',
      'https://edition.cnn.com/health',
      'https://edition.cnn.com/entertainment',
      'https://www.reuters.com/news/world',
      'https://www.reuters.com/news/technology',
      'https://www.reuters.com/news/business',
      'https://www.reuters.com/news/markets',
      'https://www.reuters.com/news/sports'
    ];
  }

  /**
   * Scrape news articles based on a query
   */
  async scrapeNews(query?: string): Promise<NewsArticle[]> {
    const maxArticles = this.config.maxArticles!;
    const maxArticlesPerSite = this.config.maxArticlesPerSite!;

    console.log('📰 Starting news scrape from hardcoded URLs:', {
      maxArticles,
      maxArticlesPerSite,
      totalHardcodedUrls: this.hardcodedNewsUrls.length
    });

    try {
      // Step 1: Use hardcoded URLs directly instead of Google search
      const newsUrls = this.hardcodedNewsUrls.slice(0, maxArticles);

      console.log('🔍 Selected hardcoded URLs:', {
        totalSelected: newsUrls.length,
        urls: newsUrls.map(url => new URL(url).hostname)
      });

      // Step 2: Scrape content from hardcoded URLs
      const scrapeResults = await this.webScrapeService.scrapeUrls(newsUrls);

      // Step 3: Convert to NewsArticle format
      const newsArticles = scrapeResults.map(result => this.convertToNewsArticle(result));

      console.log('✅ News scrape completed:', {
        successfulArticles: newsArticles.length,
        totalAttempted: newsUrls.length,
        distribution: this.getArticleDistribution(newsArticles)
      });

      return newsArticles;
    } catch (error) {
      console.error('❌ News scrape error:', {
        error: error instanceof Error ? error.message : `${error}`
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
   * Format news articles for WhatsApp display - concise and easy to read
   */
  formatNewsArticles(articles: NewsArticle[]): string {
    if (articles.length === 0) {
      return '📰 No news articles found at the moment.';
    }

    // WhatsApp-friendly format with emojis and concise information
    const header = `📰 *Today's Top ${articles.length} News Updates* 📰\n\n`;

    const formattedText = articles.map((article, index) => {
      // Extract the main domain for cleaner source display
      const sourceDomain = article.source.replace('www.', '').split('.')[0];
      const sourceEmoji = this.getSourceEmoji(article.source);

      // Create a concise summary from the content (first 2-3 sentences)
      const summary = this.extractSummary(article.content);

      return `*${index + 1}. ${article.title}*\n` +
             `${sourceEmoji} ${sourceDomain} • ${article.category}\n` +
             `📝 ${summary}\n`;
    }).join('\n');

    const footer = `\n💬 *Reply with the number* for more details on any story!`;

    return header + formattedText + footer;
  }

  /**
   * Get appropriate emoji for news source
   */
  private getSourceEmoji(source: string): string {
    if (source.includes('scmp')) return '🇭🇰';
    if (source.includes('bbc')) return '🇬🇧';
    if (source.includes('cnn')) return '🇺🇸';
    if (source.includes('reuters')) return '🌍';
    return '📰';
  }

  /**
   * Extract a concise summary from article content (2-3 sentences)
   */
  private extractSummary(content: string, maxSentences: number = 2): string {
    if (!content) return 'No summary available';

    // Split into sentences and take first few
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const summary = sentences.slice(0, maxSentences).join('. ') + '.';

    // Ensure it's not too long for WhatsApp
    return summary.length > 120 ? summary.substring(0, 117) + '...' : summary;
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
  webScrapeService: WebScrapeService,
  config?: NewsScrapeConfig
): NewsScrapeService {
  return new NewsScrapeService(webScrapeService, config);
}