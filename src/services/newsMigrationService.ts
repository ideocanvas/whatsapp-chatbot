import { PrismaClient } from '@prisma/client';
import { GoogleNewsService } from './googleNewsService';
import { BlogGenerationService } from './blogGenerationService';
import * as fs from 'fs';
import * as path from 'path';

export class NewsMigrationService {
  private prisma: PrismaClient;
  private googleNewsService: GoogleNewsService;
  private blogGenerationService: BlogGenerationService;

  constructor(googleNewsService: GoogleNewsService, blogGenerationService: BlogGenerationService) {
    this.prisma = new PrismaClient();
    this.googleNewsService = googleNewsService;
    this.blogGenerationService = blogGenerationService;
  }

  /**
   * Migrate from old news system to new Google News system
   */
  async migrateToGoogleNewsSystem(): Promise<void> {
    console.log('🔄 Starting migration to Google News system...');
    
    try {
      // 1. Add default Google News sources
      await this.addDefaultGoogleNewsSources();
      
      // 2. Migrate existing news data if available
      await this.migrateExistingNewsData();
      
      // 3. Initialize keyword database with common topics
      await this.initializeKeywordDatabase();
      
      console.log('✅ Migration to Google News system completed');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Add default Google News sources
   */
  private async addDefaultGoogleNewsSources(): Promise<void> {
    const defaultSources = [
      {
        url: 'https://news.google.com/home?hl=en-HK&gl=HK&ceid=HK:en',
        name: 'Google News Hong Kong (English)',
        region: 'HK',
        language: 'en',
        priority: 10
      },
      {
        url: 'https://news.google.com/home?hl=zh-HK&gl=HK&ceid=HK:zh-Hant',
        name: 'Google News Hong Kong (Chinese)',
        region: 'HK',
        language: 'zh-Hant',
        priority: 9
      },
      {
        url: 'https://news.google.com/home?hl=en-US&gl=US&ceid=US:en',
        name: 'Google News United States',
        region: 'US',
        language: 'en',
        priority: 8
      }
    ];

    for (const source of defaultSources) {
      try {
        await this.prisma.newsSource.upsert({
          where: { url: source.url },
          update: source,
          create: {
            ...source,
            isActive: true,
            sourceType: 'google_news'
          }
        });
        console.log(`✅ Added/Updated source: ${source.name}`);
      } catch (error) {
        console.warn(`⚠️ Failed to add source ${source.name}:`, error);
      }
    }
  }

  /**
   * Migrate existing news data from old system
   */
  private async migrateExistingNewsData(): Promise<void> {
    console.log('📊 Checking for existing news data to migrate...');
    
    try {
      // Check if there are existing news files in the old data structure
      const oldNewsDir = path.join(process.cwd(), 'data', 'news');
      
      if (fs.existsSync(oldNewsDir)) {
        console.log('📁 Found existing news data directory, analyzing...');
        
        // Get all date directories
        const dateDirs = fs.readdirSync(oldNewsDir).filter(dir => 
          fs.statSync(path.join(oldNewsDir, dir)).isDirectory()
        );
        
        console.log(`📅 Found ${dateDirs.length} date directories with news data`);
        
        // For each date directory, process the news files
        for (const dateDir of dateDirs.slice(-7)) { // Only process last 7 days
          await this.processOldNewsDateDirectory(path.join(oldNewsDir, dateDir));
        }
      } else {
        console.log('ℹ️ No existing news data found to migrate');
      }
    } catch (error) {
      console.warn('⚠️ Error migrating existing news data:', error);
    }
  }

  /**
   * Process news files from a specific date directory
   */
  private async processOldNewsDateDirectory(dateDirPath: string): Promise<void> {
    try {
      const newsFiles = fs.readdirSync(dateDirPath).filter(file => file.endsWith('.json'));
      
      for (const newsFile of newsFiles) {
        const filePath = path.join(dateDirPath, newsFile);
        const category = newsFile.replace('.json', '');
        
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const articles = JSON.parse(fileContent);
        
        console.log(`📖 Processing ${articles.length} articles from ${category} (${path.basename(dateDirPath)})`);
        
        // Convert old articles to new format and create blog posts
        for (const article of articles.slice(0, 5)) { // Limit to 5 articles per category
          await this.convertOldArticleToBlogPost(article, category);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error processing directory ${dateDirPath}:`, error);
    }
  }

  /**
   * Convert old article format to new blog post
   */
  private async convertOldArticleToBlogPost(oldArticle: any, category: string): Promise<void> {
    try {
      // Check if blog post already exists for this article
      const existingPost = await this.prisma.blogPost.findFirst({
        where: {
          sourceUrl: oldArticle.url,
          sourceTitle: oldArticle.title
        }
      });
      
      if (existingPost) {
        console.log(`⏩ Skipping duplicate article: ${oldArticle.title}`);
        return;
      }
      
      // Create a GoogleNewsArticle-like object from old data
      const googleNewsArticle = {
        title: oldArticle.title,
        url: oldArticle.url,
        source: oldArticle.source || 'web_scrape',
        publishedAt: oldArticle.scrapedAt || new Date().toISOString(),
        description: oldArticle.content?.substring(0, 200) || '',
        fullContent: oldArticle.content,
        category: category,
        keywords: await this.extractKeywordsFromOldArticle(oldArticle)
      };
      
      // Generate blog post using the new service
      const blogPosts = await this.blogGenerationService.generateBlogPosts([googleNewsArticle]);
      
      if (blogPosts.length > 0) {
        console.log(`✅ Converted old article to blog post: ${oldArticle.title}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error converting article ${oldArticle.title}:`, error);
    }
  }

  /**
   * Extract keywords from old article data
   */
  private async extractKeywordsFromOldArticle(article: any): Promise<string[]> {
    // Simple keyword extraction from title and content
    const text = (article.title + ' ' + (article.content || '')).toLowerCase();
    
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    const words = text
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 10);
    
    return [...new Set(words)];
  }

  /**
   * Initialize keyword database with common topics
   */
  private async initializeKeywordDatabase(): Promise<void> {
    const commonKeywords = [
      'technology', 'ai', 'machine learning', 'artificial intelligence',
      'business', 'economy', 'finance', 'investment',
      'politics', 'government', 'international relations',
      'science', 'research', 'discovery', 'innovation',
      'health', 'medicine', 'wellness', 'healthcare',
      'environment', 'climate change', 'sustainability',
      'education', 'learning', 'academia',
      'entertainment', 'culture', 'arts', 'media'
    ];
    
    for (const keyword of commonKeywords) {
      try {
        // First check if keyword exists
        const existing = await this.prisma.newsKeyword.findFirst({
          where: { keyword }
        });
        
        if (existing) {
          await this.prisma.newsKeyword.update({
            where: { id: existing.id },
            data: { relevance: 0.7, lastUsed: new Date() }
          });
        } else {
          await this.prisma.newsKeyword.create({
            data: {
              keyword,
              relevance: 0.7,
              category: this.categorizeKeyword(keyword),
              lastUsed: new Date()
            }
          });
        }
      } catch (error) {
        console.warn(`⚠️ Error adding keyword ${keyword}:`, error);
      }
    }
    
    console.log(`✅ Initialized keyword database with ${commonKeywords.length} common topics`);
  }

  /**
   * Categorize keyword based on content
   */
  private categorizeKeyword(keyword: string): string {
    const techKeywords = ['technology', 'ai', 'machine learning', 'artificial intelligence', 'innovation'];
    const businessKeywords = ['business', 'economy', 'finance', 'investment'];
    const scienceKeywords = ['science', 'research', 'discovery'];
    const healthKeywords = ['health', 'medicine', 'wellness', 'healthcare'];
    const environmentKeywords = ['environment', 'climate change', 'sustainability'];
    
    if (techKeywords.some(tk => keyword.includes(tk))) return 'technology';
    if (businessKeywords.some(bk => keyword.includes(bk))) return 'business';
    if (scienceKeywords.some(sk => keyword.includes(sk))) return 'science';
    if (healthKeywords.some(hk => keyword.includes(hk))) return 'health';
    if (environmentKeywords.some(ek => keyword.includes(ek))) return 'environment';
    
    return 'general';
  }

  /**
   * Get migration status and statistics
   */
  async getMigrationStatus(): Promise<any> {
    try {
      const sourceCount = await this.prisma.newsSource.count();
      const keywordCount = await this.prisma.newsKeyword.count();
      const blogPostCount = await this.prisma.blogPost.count();
      const dailyDigestCount = await this.prisma.dailyDigest.count();
      const weeklyDigestCount = await this.prisma.weeklyDigest.count();
      
      // Check for old news data
      const oldNewsDir = path.join(process.cwd(), 'data', 'news');
      const hasOldData = fs.existsSync(oldNewsDir);
      let oldDataStats = null;
      
      if (hasOldData) {
        const dateDirs = fs.existsSync(oldNewsDir) ? 
          fs.readdirSync(oldNewsDir).filter(dir => 
            fs.statSync(path.join(oldNewsDir, dir)).isDirectory()
          ) : [];
        oldDataStats = {
          dateDirectories: dateDirs.length,
          hasData: dateDirs.length > 0
        };
      }
      
      return {
        migration: {
          sourcesConfigured: sourceCount,
          keywordsInitialized: keywordCount,
          blogPostsGenerated: blogPostCount,
          digestsCreated: {
            daily: dailyDigestCount,
            weekly: weeklyDigestCount
          }
        },
        oldSystem: {
          hasData: hasOldData,
          ...oldDataStats
        },
        status: 'ready'
      };
    } catch (error) {
      console.error('❌ Error getting migration status:', error);
      return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Clean up old news data after migration
   */
  async cleanupOldNewsData(): Promise<void> {
    console.log('🧹 Cleaning up old news data...');
    
    try {
      const oldNewsDir = path.join(process.cwd(), 'data', 'news');
      
      if (fs.existsSync(oldNewsDir)) {
        // Archive old data instead of deleting (for safety)
        const archiveDir = path.join(process.cwd(), 'data', 'news_archive');
        if (!fs.existsSync(archiveDir)) {
          fs.mkdirSync(archiveDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = path.join(archiveDir, `migration_${timestamp}`);
        
        fs.renameSync(oldNewsDir, archivePath);
        console.log(`✅ Old news data archived to: ${archivePath}`);
      } else {
        console.log('ℹ️ No old news data found to clean up');
      }
    } catch (error) {
      console.warn('⚠️ Error cleaning up old news data:', error);
    }
  }
}

export function createNewsMigrationService(
  googleNewsService: GoogleNewsService,
  blogGenerationService: BlogGenerationService
): NewsMigrationService {
  return new NewsMigrationService(googleNewsService, blogGenerationService);
}