import { WebScrapeService, WebScrapeResult } from './webScrapeService';
import { OpenAIService } from './openaiService';
import { PrismaClient } from '@prisma/client';

export interface GoogleNewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string;
  fullContent?: string;
  category?: string;
  keywords: string[];
}

export interface GoogleNewsConfig {
  urls: string[];
  deepBrowsingTime: string; // e.g., "06:00"
  quickCheckInterval: number; // in minutes
  maxArticlesPerDeepBrowse: number;
  maxArticlesPerQuickCheck: number;
}

export class GoogleNewsService {
  private prisma: PrismaClient;
  private webScrapeService: WebScrapeService;
  private openaiService: OpenAIService;
  private config: GoogleNewsConfig;

  constructor(
    webScrapeService: WebScrapeService,
    openaiService: OpenAIService,
    config?: Partial<GoogleNewsConfig>
  ) {
    this.prisma = new PrismaClient();
    this.webScrapeService = webScrapeService;
    this.openaiService = openaiService;
    this.config = {
      urls: [
        'https://news.google.com/home?hl=en-HK&gl=HK&ceid=HK:en',
        'https://news.google.com/home?hl=zh-HK&gl=HK&ceid=HK:zh-Hant',
        'https://news.google.com/home?hl=en-US&gl=US&ceid=US:en'
      ],
      deepBrowsingTime: '06:00',
      quickCheckInterval: 180, // 3 hours
      maxArticlesPerDeepBrowse: 15,
      maxArticlesPerQuickCheck: 5,
      ...config
    };
  }

  /**
   * Scrape Google News front page for article links
   */
  async scrapeGoogleNewsFrontPage(url: string): Promise<GoogleNewsArticle[]> {
    try {
      console.log(`🌐 Scraping Google News: ${url}`);
      
      // Use mobile view for better content extraction
      const result = await this.webScrapeService.scrapeUrl(url, undefined, true);
      
      if (!result.content) {
        console.warn(`⚠️ No content found for ${url}`);
        return [];
      }

      // Extract article links from Google News HTML
      const articles = this.extractArticlesFromGoogleNews(result.content, url);
      console.log(`📰 Found ${articles.length} articles on Google News front page`);
      
      return articles;
    } catch (error) {
      console.error(`❌ Error scraping Google News ${url}:`, error);
      return [];
    }
  }

  /**
   * Extract articles from Google News HTML content
   */
  private extractArticlesFromGoogleNews(html: string, baseUrl: string): GoogleNewsArticle[] {
    const articles: GoogleNewsArticle[] = [];
    
    // Google News article pattern - look for article elements
    const articlePattern = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    const articleMatches = html.match(articlePattern) || [];
    
    for (const articleHtml of articleMatches) {
      try {
        // Extract title
        const titleMatch = articleHtml.match(/<a[^>]*aria-label="([^"]*)"[^>]*>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';
        
        if (!title || title.length < 10) continue;
        
        // Extract URL (Google News uses relative URLs that need to be resolved)
        const urlMatch = articleHtml.match(/<a[^>]*href="([^"]*)"[^>]*>/i);
        if (!urlMatch) continue;
        
        let articleUrl = urlMatch[1];
        if (articleUrl.startsWith('./')) {
          articleUrl = `https://news.google.com${articleUrl.substring(1)}`;
        } else if (articleUrl.startsWith('/')) {
          articleUrl = `https://news.google.com${articleUrl}`;
        } else if (!articleUrl.startsWith('http')) {
          articleUrl = `https://news.google.com/${articleUrl}`;
        }
        
        // Extract source
        const sourceMatch = articleHtml.match(/<span[^>]*>([^<]*)<\/span>/i);
        const source = sourceMatch ? sourceMatch[1].trim() : 'Unknown';
        
        // Extract time (approximate)
        const timeMatch = articleHtml.match(/(\d+)\s*(minute|hour|day)s?\s*ago/i);
        const publishedAt = timeMatch ? this.calculatePublishedTime(timeMatch[1], timeMatch[2]) : new Date().toISOString();
        
        // Extract description/snippet
        const descMatch = articleHtml.match(/<div[^>]*>([^<]{50,300})<\/div>/i);
        const description = descMatch ? descMatch[1].trim() : '';
        
        articles.push({
          title,
          url: articleUrl,
          source,
          publishedAt,
          description,
          keywords: []
        });
      } catch (error) {
        console.warn('⚠️ Error parsing article HTML:', error);
      }
    }
    
    return articles;
  }

  /**
   * Calculate published time from relative time string
   */
  private calculatePublishedTime(amount: string, unit: string): string {
    const now = new Date();
    const num = parseInt(amount);
    
    switch (unit.toLowerCase()) {
      case 'minute':
        now.setMinutes(now.getMinutes() - num);
        break;
      case 'hour':
        now.setHours(now.getHours() - num);
        break;
      case 'day':
        now.setDate(now.getDate() - num);
        break;
    }
    
    return now.toISOString();
  }

  /**
   * Follow article link and extract full content
   */
  async extractFullArticleContent(article: GoogleNewsArticle): Promise<GoogleNewsArticle> {
    try {
      console.log(`📖 Reading full article: ${article.title}`);
      
      const result = await this.webScrapeService.scrapeUrl(article.url, undefined, true);
      
      if (result.content && result.content.length > 300) {
        article.fullContent = result.content;
        
        // Extract keywords from content
        article.keywords = await this.extractKeywords(article.title, result.content);
        
        console.log(`✅ Extracted ${article.keywords.length} keywords from article`);
      } else {
        console.warn(`⚠️ Article content too short: ${article.url}`);
      }
      
      return article;
    } catch (error) {
      console.error(`❌ Error extracting full article content:`, error);
      return article;
    }
  }

  /**
   * Extract keywords from article content using AI
   */
  private async extractKeywords(title: string, content: string): Promise<string[]> {
    try {
      const prompt = `
        Extract 5-10 key topics, entities, or keywords from this news article.
        Focus on proper nouns, technical terms, and important concepts.
        Return as a JSON array of strings.
        
        Title: ${title}
        Content: ${content.substring(0, 2000)}
        
        Return only the JSON array, no other text.
      `;
      
      const response = await this.openaiService.generateTextResponse(prompt);
      
      try {
        const keywords = JSON.parse(response);
        return Array.isArray(keywords) ? keywords.slice(0, 10) : [];
      } catch (parseError) {
        // Fallback: simple keyword extraction
        return this.fallbackKeywordExtraction(title + ' ' + content);
      }
    } catch (error) {
      console.warn('⚠️ AI keyword extraction failed, using fallback');
      return this.fallbackKeywordExtraction(title + ' ' + content);
    }
  }

  /**
   * Fallback keyword extraction using simple text analysis
   */
  private fallbackKeywordExtraction(text: string): string[] {
    // Remove common words and extract capitalized words, numbers, and technical terms
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 10);
    
    return [...new Set(words)]; // Remove duplicates
  }

  /**
   * Deep news browsing - comprehensive article reading
   */
  async performDeepNewsBrowsing(): Promise<GoogleNewsArticle[]> {
    console.log('🌅 Starting deep news browsing...');
    const allArticles: GoogleNewsArticle[] = [];
    
    for (const url of this.config.urls) {
      try {
        const articles = await this.scrapeGoogleNewsFrontPage(url);
        const articlesWithContent: GoogleNewsArticle[] = [];
        
        // Process a limited number of articles
        for (const article of articles.slice(0, this.config.maxArticlesPerDeepBrowse)) {
          const fullArticle = await this.extractFullArticleContent(article);
          if (fullArticle.fullContent) {
            articlesWithContent.push(fullArticle);
          }
          
          // Small delay to be respectful
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        allArticles.push(...articlesWithContent);
        console.log(`✅ Processed ${articlesWithContent.length} articles from ${url}`);
        
      } catch (error) {
        console.error(`❌ Error processing Google News URL ${url}:`, error);
      }
    }
    
    // Update keyword database
    await this.updateKeywordDatabase(allArticles);
    
    console.log(`🎯 Deep browsing completed: ${allArticles.length} articles processed`);
    return allArticles;
  }

  /**
   * Quick news check - focused on recent keywords
   */
  async performQuickNewsCheck(): Promise<GoogleNewsArticle[]> {
    console.log('⚡ Performing quick news check...');
    
    // Get recent keywords to focus on
    const recentKeywords = await this.getRecentKeywords();
    const allArticles: GoogleNewsArticle[] = [];
    
    for (const url of this.config.urls) {
      try {
        const articles = await this.scrapeGoogleNewsFrontPage(url);
        
        // Filter articles by recent keywords
        const relevantArticles = articles.filter(article =>
          recentKeywords.some(keyword =>
            article.title.toLowerCase().includes(keyword.toLowerCase()) ||
            article.description.toLowerCase().includes(keyword.toLowerCase())
          )
        );
        
        // Process relevant articles
        const articlesWithContent: GoogleNewsArticle[] = [];
        for (const article of relevantArticles.slice(0, this.config.maxArticlesPerQuickCheck)) {
          const fullArticle = await this.extractFullArticleContent(article);
          if (fullArticle.fullContent) {
            articlesWithContent.push(fullArticle);
          }
        }
        
        allArticles.push(...articlesWithContent);
        console.log(`✅ Quick check: ${articlesWithContent.length} relevant articles from ${url}`);
        
      } catch (error) {
        console.error(`❌ Error in quick check for ${url}:`, error);
      }
    }
    
    // Update keywords with new content
    await this.updateKeywordDatabase(allArticles);
    
    return allArticles;
  }

  /**
   * Update keyword tracking database
   */
  private async updateKeywordDatabase(articles: GoogleNewsArticle[]): Promise<void> {
    try {
      for (const article of articles) {
        for (const keyword of article.keywords) {
          // Check if keyword exists
          const existing = await this.prisma.newsKeyword.findFirst({
            where: { keyword }
          });
          
          if (existing) {
            // Update relevance and last used
            await this.prisma.newsKeyword.update({
              where: { id: existing.id },
              data: {
                relevance: Math.min(1.0, existing.relevance + 0.1),
                lastUsed: new Date()
              }
            });
          } else {
            // Create new keyword
            await this.prisma.newsKeyword.create({
              data: {
                keyword,
                relevance: 0.5,
                category: article.category,
                lastUsed: new Date()
              }
            });
          }
        }
      }
      
      console.log(`📊 Updated keyword database with ${articles.length} articles`);
    } catch (error) {
      console.error('❌ Error updating keyword database:', error);
    }
  }

  /**
   * Get recent keywords for focused browsing
   */
  private async getRecentKeywords(): Promise<string[]> {
    try {
      const keywords = await this.prisma.newsKeyword.findMany({
        where: {
          lastUsed: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        orderBy: {
          relevance: 'desc'
        },
        take: 10
      });
      
      return keywords.map(k => k.keyword);
    } catch (error) {
      console.error('❌ Error getting recent keywords:', error);
      return [];
    }
  }

  /**
   * Save articles to database for blog generation
   */
  async saveArticlesForBlogGeneration(articles: GoogleNewsArticle[]): Promise<void> {
    try {
      // This will be used by the blog generation system
      // For now, we'll store them in a temporary location
      console.log(`💾 Saving ${articles.length} articles for blog generation`);
      
      // In a real implementation, this would store articles in a queue or database
      // for the blog generation system to process
    } catch (error) {
      console.error('❌ Error saving articles for blog generation:', error);
    }
  }

  /**
   * Get news source configuration
   */
  async getNewsSources(): Promise<any[]> {
    try {
      return await this.prisma.newsSource.findMany({
        where: { isActive: true },
        orderBy: { priority: 'desc' }
      });
    } catch (error) {
      console.error('❌ Error getting news sources:', error);
      return [];
    }
  }

  /**
   * Add a new news source
   */
  async addNewsSource(url: string, name?: string, region?: string, language?: string): Promise<void> {
    try {
      await this.prisma.newsSource.create({
        data: {
          url,
          name: name || this.extractSourceName(url),
          region,
          language,
          priority: 5,
          isActive: true,
          sourceType: url.includes('news.google.com') ? 'google_news' : 'direct_site'
        }
      });
      
      console.log(`✅ Added news source: ${url}`);
    } catch (error) {
      console.error('❌ Error adding news source:', error);
      throw error;
    }
  }

  /**
   * Extract source name from URL
   */
  private extractSourceName(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '').split('.')[0];
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Get service statistics
   */
  async getStats(): Promise<any> {
    try {
      const articleCount = await this.prisma.blogPost.count();
      const keywordCount = await this.prisma.newsKeyword.count();
      const sourceCount = await this.prisma.newsSource.count();
      
      return {
        articlesProcessed: articleCount,
        keywordsTracked: keywordCount,
        activeSources: sourceCount,
        config: this.config
      };
    } catch (error) {
      console.error('❌ Error getting stats:', error);
      return {};
    }
  }
}

export function createGoogleNewsService(
  webScrapeService: WebScrapeService,
  openaiService: OpenAIService,
  config?: Partial<GoogleNewsConfig>
): GoogleNewsService {
  return new GoogleNewsService(webScrapeService, openaiService, config);
}