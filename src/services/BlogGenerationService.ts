import { OpenAIService } from './OpenAIService';
import { prisma } from '../config/prisma';

// Local interface for article data (replaces GoogleNewsArticle)
export interface ArticleData {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description?: string;
  keywords?: string[];
  fullContent?: string;
}

export interface BlogPost {
  title: string;
  content: string; // Markdown formatted
  excerpt: string;
  sourceUrl: string;
  sourceTitle: string;
  featuredImage?: string;
  imageAlt?: string;
  imageCaption?: string;
  tags: string[];
  category: string;
  author: string;
}

export interface BlogGenerationConfig {
  postsPerDay: number;
  minArticleLength: number;
  minTitleLength: number;
  imageGenerationEnabled: boolean;
  qualityThreshold: number; // 0-1 score threshold
}

export class BlogGenerationService {
  private openaiService: OpenAIService;
  private config: BlogGenerationConfig;

  constructor(openaiService: OpenAIService, config?: Partial<BlogGenerationConfig>) {
    this.openaiService = openaiService;
    this.config = {
      postsPerDay: 5,
      minArticleLength: 500,
      minTitleLength: 20,
      imageGenerationEnabled: true,
      qualityThreshold: 0.7,
      ...config
    };
  }

  /**
   * Generate blog posts from news articles
   */
  async generateBlogPosts(articles: ArticleData[]): Promise<BlogPost[]> {
    console.log(`📝 Generating blog posts from ${articles.length} articles`);

    // Filter and score articles
    const scoredArticles = await this.scoreAndFilterArticles(articles);
    console.log(`📊 ${scoredArticles.length} articles passed quality threshold`);

    // Select top articles for blog generation
    const selectedArticles = scoredArticles
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.postsPerDay);

    const blogPosts: BlogPost[] = [];

    for (const article of selectedArticles) {
      try {
        const blogPost = await this.generateBlogPostFromArticle(article.article);
        if (blogPost) {
          blogPosts.push(blogPost);
          console.log(`✅ Generated blog post: ${blogPost.title}`);
        }
      } catch (error) {
        console.error(`❌ Error generating blog post from article:`, error);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Save blog posts to database
    await this.saveBlogPosts(blogPosts);

    console.log(`🎯 Blog generation completed: ${blogPosts.length} posts created`);
    return blogPosts;
  }

  /**
   * Score and filter articles based on quality criteria
   */
  private async scoreAndFilterArticles(articles: ArticleData[]): Promise<{ article: ArticleData; score: number }[]> {
    const scoredArticles: { article: ArticleData; score: number }[] = [];

    for (const article of articles) {
      const score = await this.calculateArticleScore(article);

      if (score >= this.config.qualityThreshold) {
        scoredArticles.push({ article, score });
      }
    }

    return scoredArticles;
  }

  /**
   * Calculate article quality score (0-1)
   */
  private async calculateArticleScore(article: ArticleData): Promise<number> {
    let score = 0.0;

    // 1. Content length score
    const contentLength = article.fullContent?.length || 0;
    if (contentLength >= this.config.minArticleLength) {
      score += 0.3;
    }

    // 2. Title quality score
    const titleLength = article.title.length;
    if (titleLength >= this.config.minTitleLength) {
      score += 0.2;
    }

    // 3. Keyword richness score
    const keywordScore = Math.min((article.keywords?.length || 0) / 10, 0.3);
    score += keywordScore;

    // 4. Source credibility score (simple heuristic)
    const credibleSources = ['bbc', 'reuters', 'associated press', 'cnn', 'the guardian'];
    const sourceCredibility = credibleSources.some(source =>
      article.source.toLowerCase().includes(source)
    ) ? 0.2 : 0.1;
    score += sourceCredibility;

    // 5. Image presence score (if image generation is enabled)
    if (this.config.imageGenerationEnabled) {
      score += 0.1; // Bonus for potential image content
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate a blog post from a news article using AI
   */
  private async generateBlogPostFromArticle(article: ArticleData): Promise<BlogPost | null> {
    try {
      const prompt = this.createBlogGenerationPrompt(article);
      const response = await this.openaiService.generateTextResponse(prompt);

      const blogPost = this.parseBlogPostResponse(response, article);

      // Generate featured image if enabled
      if (this.config.imageGenerationEnabled) {
        await this.generateFeaturedImage(blogPost, article);
      }

      return blogPost;
    } catch (error) {
      console.error('❌ Error generating blog post with AI:', error);
      return null;
    }
  }

  /**
   * Generate featured image for blog post
   */
  private async generateFeaturedImage(blogPost: BlogPost, article: ArticleData): Promise<void> {
    try {
      if (!this.config.imageGenerationEnabled) return;

      // Use AI to generate image description based on article content
      const imagePrompt = `
        Create a descriptive prompt for generating a featured image for this blog post.
        Focus on the main theme or key visual elements from the article.

        Article Title: ${article.title}
        Blog Post Title: ${blogPost.title}
        Key Topics: ${blogPost.tags.slice(0, 3).join(', ')}

        Return a concise image generation prompt (max 100 words).
      `;

      const imageDescription = await this.openaiService.generateTextResponse(imagePrompt);

      // In a real implementation, this would call an image generation API
      // For now, we'll simulate the image generation
      blogPost.featuredImage = `https://via.placeholder.com/800x400/4F46E5/FFFFFF?text=${encodeURIComponent(blogPost.title.substring(0, 30))}`;
      blogPost.imageAlt = `Featured image for: ${blogPost.title}`;
      blogPost.imageCaption = `Image representing: ${imageDescription.substring(0, 100)}`;

      console.log(`🖼️ Generated featured image for: ${blogPost.title}`);
    } catch (error) {
      console.warn('⚠️ Error generating featured image:', error);
      // Continue without image if generation fails
    }
  }

  /**
   * Create prompt for blog post generation
   */
  private createBlogGenerationPrompt(article: ArticleData): string {
    return `
      You are a professional blog writer. Create a high-quality blog post based on the following news article.

      REQUIREMENTS:
      - Write in engaging, professional tone
      - Use proper Markdown formatting (headings, lists, bold, italics)
      - Include an engaging introduction
      - Use subheadings to organize content
      - Include a "Key Takeaways" section with bullet points
      - Include a conclusion section
      - Keep it accessible but informative

      BLOG POST STRUCTURE:
      # [Engaging Title]

      [Introduction paragraph that hooks the reader]

      ## [First Subheading]
      [Content section]

      ## [Second Subheading]
      [Content section]

      ## Key Takeaways
      - [Bullet point 1]
      - [Bullet point 2]
      - [Bullet point 3]

      ## Conclusion
      [Summary and forward-looking statement]

      SOURCE ARTICLE:
      Title: ${article.title}
      Source: ${article.source}
      Published: ${article.publishedAt}
      Content: ${article.fullContent?.substring(0, 3000) || article.description}

      Return ONLY the complete blog post in Markdown format. Do not include any explanatory text before or after the blog post.
    `;
  }

  /**
   * Parse AI response into BlogPost object
   */
  private parseBlogPostResponse(response: string, sourceArticle: ArticleData): BlogPost {
    // Extract title from first heading
    const titleMatch = response.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : sourceArticle.title;

    // Generate excerpt from first paragraph
    const excerpt = this.generateExcerpt(response);

    // Extract tags from content and source keywords
    const tags = this.extractTags(response, sourceArticle);

    // Determine category
    const category = this.determineCategory(sourceArticle, tags);

    return {
      title,
      content: response,
      excerpt,
      sourceUrl: sourceArticle.url,
      sourceTitle: sourceArticle.title,
      tags,
      category,
      author: 'AI Assistant'
    };
  }

  /**
   * Generate excerpt from blog content
   */
  private generateExcerpt(content: string): string {
    // Remove markdown headers and get first meaningful paragraph
    const cleanContent = content.replace(/^#+.+$/gm, '').trim();
    const paragraphs = cleanContent.split('\n\n');

    for (const paragraph of paragraphs) {
      if (paragraph.length > 50 && paragraph.length < 200) {
        return paragraph.substring(0, 150) + '...';
      }
    }

    // Fallback: first 150 characters of content
    return cleanContent.substring(0, 150) + '...';
  }

  /**
   * Extract tags from blog content and source article
   */
  private extractTags(content: string, sourceArticle: ArticleData): string[] {
    const tags = new Set<string>();

    // Add source keywords
    sourceArticle.keywords?.forEach((keyword: string) => tags.add(keyword));

    // Extract proper nouns and important terms from content
    const words = content.split(/\s+/);
    const potentialTags = words.filter(word =>
      word.length > 3 &&
      /[A-Z]/.test(word[0]) && // Starts with capital letter
      !word.match(/^[#*\-_]/) // Not markdown symbols
    );

    potentialTags.slice(0, 5).forEach(tag => tags.add(tag));

    return Array.from(tags).slice(0, 10); // Limit to 10 tags
  }

  /**
   * Determine category based on content and keywords
   */
  private determineCategory(article: ArticleData, tags: string[]): string {
    const categoryKeywords: Record<string, string[]> = {
      'technology': ['tech', 'software', 'ai', 'machine learning', 'computer', 'digital', 'internet'],
      'business': ['business', 'economy', 'market', 'finance', 'investment', 'company'],
      'world': ['world', 'international', 'global', 'politics', 'government'],
      'science': ['science', 'research', 'study', 'discovery', 'scientific'],
      'health': ['health', 'medical', 'medicine', 'hospital', 'disease'],
      'sports': ['sports', 'game', 'team', 'player', 'championship']
    };

    const allText = article.title + ' ' + article.description + ' ' + tags.join(' ');
    const lowerText = allText.toLowerCase();

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Save blog posts to database
   */
  private async saveBlogPosts(blogPosts: BlogPost[]): Promise<void> {
    try {
      for (const post of blogPosts) {
        await prisma.blogPost.create({
          data: {
            title: post.title,
            content: post.content,
            excerpt: post.excerpt,
            sourceUrl: post.sourceUrl,
            sourceTitle: post.sourceTitle,
            featuredImage: post.featuredImage,
            imageAlt: post.imageAlt,
            imageCaption: post.imageCaption,
            tags: post.tags,
            category: post.category,
            author: post.author,
            status: 'published',
            publishedAt: new Date()
          }
        });
      }

      console.log(`💾 Saved ${blogPosts.length} blog posts to database`);
    } catch (error) {
      console.error('❌ Error saving blog posts:', error);
    }
  }

  /**
   * Generate daily digest from blog posts
   */
  async generateDailyDigest(date: Date): Promise<string> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const posts = await prisma.blogPost.findMany({
        where: {
          publishedAt: {
            gte: startOfDay,
            lte: endOfDay
          },
          status: 'published'
        },
        orderBy: { publishedAt: 'desc' }
      });

      if (posts.length === 0) {
        return ''; // No posts for this day
      }

      const digestContent = this.formatDailyDigest(posts, date);

      // Save daily digest
      await prisma.dailyDigest.create({
        data: {
          date: startOfDay,
          title: `Daily Digest - ${date.toISOString().split('T')[0]}`,
          content: digestContent
        }
      });

      console.log(`📅 Generated daily digest for ${date.toISOString().split('T')[0]} with ${posts.length} posts`);
      return digestContent;
    } catch (error) {
      console.error('❌ Error generating daily digest:', error);
      return '';
    }
  }

  /**
   * Format daily digest content
   */
  private formatDailyDigest(posts: any[], date: Date): string {
    let content = `# Daily News Digest - ${date.toISOString().split('T')[0]}\n\n`;
    content += `*${posts.length} articles summarized for your convenience*\n\n`;

    for (const post of posts) {
      content += `## ${post.title}\n\n`;
      content += `*Source: ${post.sourceTitle}*\n\n`;
      content += `${post.excerpt}\n\n`;
      content += `[Read Full Article](${post.sourceUrl})\n\n`;
      content += `---\n\n`;
    }

    return content;
  }

  /**
   * Generate weekly digest from daily digests
   */
  async generateWeeklyDigest(startDate: Date): Promise<string> {
    try {
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // End of week (Saturday)

      const dailyDigests = await prisma.dailyDigest.findMany({
        where: {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        include: {
          blogPosts: true
        },
        orderBy: { date: 'asc' }
      });

      if (dailyDigests.length === 0) {
        return ''; // No digests for this week
      }

      const weeklyContent = this.formatWeeklyDigest(dailyDigests, startDate, endDate);

      // Save weekly digest
      await prisma.weeklyDigest.create({
        data: {
          startDate,
          endDate,
          title: `Weekly Digest - ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
          content: weeklyContent
        }
      });

      console.log(`📊 Generated weekly digest with ${dailyDigests.length} daily digests`);
      return weeklyContent;
    } catch (error) {
      console.error('❌ Error generating weekly digest:', error);
      return '';
    }
  }

  /**
   * Format weekly digest content
   */
  private formatWeeklyDigest(dailyDigests: any[], startDate: Date, endDate: Date): string {
    let content = `# Weekly News Digest\n\n`;
    content += `*${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}*\n\n`;

    let totalPosts = 0;

    for (const digest of dailyDigests) {
      const postCount = digest.blogPosts.length;
      totalPosts += postCount;

      content += `## ${digest.date.toISOString().split('T')[0]} (${postCount} articles)\n\n`;

      if (postCount > 0) {
        // Show top 3 posts from each day
        const topPosts = digest.blogPosts.slice(0, 3);
        for (const post of topPosts) {
          content += `### ${post.title}\n\n`;
          content += `${post.excerpt}\n\n`;
        }

        if (postCount > 3) {
          content += `*... and ${postCount - 3} more articles*\n\n`;
        }
      } else {
        content += `*No articles published this day*\n\n`;
      }

      content += `---\n\n`;
    }

    content += `## Weekly Summary\n\n`;
    content += `This week featured **${totalPosts} articles** across **${dailyDigests.length} days**.\n\n`;

    return content;
  }

  /**
   * Get blog post statistics
   */
  async getStats(): Promise<any> {
    try {
      const totalPosts = await prisma.blogPost.count();
      const publishedPosts = await prisma.blogPost.count({ where: { status: 'published' } });
      const dailyDigests = await prisma.dailyDigest.count();
      const weeklyDigests = await prisma.weeklyDigest.count();

      return {
        totalPosts,
        publishedPosts,
        dailyDigests,
        weeklyDigests,
        config: this.config
      };
    } catch (error) {
      console.error('❌ Error getting blog stats:', error);
      return {};
    }
  }
}

export function createBlogGenerationService(
  openaiService: OpenAIService,
  config?: Partial<BlogGenerationConfig>
): BlogGenerationService {
  return new BlogGenerationService(openaiService, config);
}