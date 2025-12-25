import { prisma } from '../config/prisma';
import { OpenAIService } from './OpenAIService';
import * as fs from 'fs';
import * as path from 'path';

export interface ClassificationConfig {
  keywordSimilarityThreshold?: number;
  maxKeywordsPerArticle?: number;
  maxTagsPerArticle?: number;
  useVlmForImages?: boolean;
  vlmFeaturedImageOnly?: boolean;
}

export interface ClassificationResult {
  keywords: string[];
  category?: string;
  tags: string[];
  imageDescriptions: Record<string, string>;
}

export class ArticleClassificationService {
  private openaiService: OpenAIService;
  private config: Required<ClassificationConfig>;

  constructor(
    openaiService: OpenAIService,
    config: ClassificationConfig = {}
  ) {
    this.openaiService = openaiService;
    this.config = {
      keywordSimilarityThreshold: config.keywordSimilarityThreshold ?? 0.7,
      maxKeywordsPerArticle: config.maxKeywordsPerArticle ?? 10,
      maxTagsPerArticle: config.maxTagsPerArticle ?? 5,
      useVlmForImages: config.useVlmForImages ?? true,
      vlmFeaturedImageOnly: config.vlmFeaturedImageOnly ?? true,
    };
  }

  /**
   * Classify an article with all metadata
   */
  async classifyArticle(
    title: string,
    content: string,
    imagePaths: string[],
    cacheFolder: string
  ): Promise<ClassificationResult> {
    const [keywords, category, tags, imageDescriptions] = await Promise.all([
      this.extractKeywords(content),
      this.classifyCategory(title, content),
      this.generateTags(title, content),
      this.generateImageDescriptions(imagePaths, cacheFolder, title, content),
    ]);

    return {
      keywords,
      category,
      tags,
      imageDescriptions,
    };
  }

  /**
   * Extract keywords using embedding-based matching against NewsKeyword table
   */
  async extractKeywords(content: string): Promise<string[]> {
    try {
      // Get all active keywords from NewsKeyword table
      const keywords = await prisma.newsKeyword.findMany({
        where: { relevance: { gte: 0.3 } }, // Filter by minimum relevance
        orderBy: { relevance: 'desc' },
        take: 100, // Limit to top 100 keywords for matching
      });

      if (keywords.length === 0) {
        return this.fallbackKeywordExtraction(content);
      }

      // For now, use simple text matching as fallback
      // TODO: Implement embedding-based matching when embeddings are available
      const matchedKeywords: string[] = [];
      const contentLower = content.toLowerCase();

      for (const kw of keywords) {
        if (matchedKeywords.length >= this.config.maxKeywordsPerArticle) break;
        
        // Check if keyword appears in content
        if (contentLower.includes(kw.keyword.toLowerCase())) {
          matchedKeywords.push(kw.keyword);
        }
      }

      // If no matches, use fallback
      if (matchedKeywords.length === 0) {
        return this.fallbackKeywordExtraction(content);
      }

      return matchedKeywords;
    } catch (error) {
      console.warn('⚠️ Keyword extraction failed, using fallback:', error);
      return this.fallbackKeywordExtraction(content);
    }
  }

  /**
   * Fallback keyword extraction using simple text analysis
   */
  private fallbackKeywordExtraction(text: string): string[] {
    const commonWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
      'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
      'what', 'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all',
      'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      'just', 'also', 'now', 'here', 'there', 'then', 'once', 'about', 'into',
      'through', 'during', 'before', 'after', 'above', 'below', 'between',
      'under', 'again', 'further', 'while', 'still', 'said', 'says', 'new',
      'first', 'last', 'long', 'great', 'little', 'own', 'good', 'bad', 'old'
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length > 3 && 
        !commonWords.has(word) &&
        !/^\d+$/.test(word)
      );

    // Count word frequency
    const frequency = new Map<string, number>();
    for (const word of words) {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    }

    // Sort by frequency and take top N
    const sorted = Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, this.config.maxKeywordsPerArticle)
      .map(([word]) => word);

    return sorted;
  }

  /**
   * Classify category using LLM
   * Categories are loaded from NewsKeyword table
   */
  async classifyCategory(title: string, content: string): Promise<string | undefined> {
    try {
      // Get unique categories from NewsKeyword table
      const categories = await prisma.newsKeyword.findMany({
        where: { category: { not: null } },
        select: { category: true },
        distinct: ['category'],
      });

      const uniqueCategories = categories
        .map(c => c.category)
        .filter((c): c is string => c !== null);

      if (uniqueCategories.length === 0) {
        return undefined;
      }

      const prompt = `
Classify this news article into one of these categories:
${uniqueCategories.join(', ')}

Return only the category name. If none match well, return "general".

Title: ${title}
Content: ${content.substring(0, 1000)}
`;

      const response = await this.openaiService.generateTextResponse(prompt);
      const category = response.trim().toLowerCase();

      // Validate category exists
      if (uniqueCategories.includes(category)) {
        return category;
      }

      // Try case-insensitive match
      const matched = uniqueCategories.find(c => c.toLowerCase() === category);
      if (matched) {
        return matched;
      }

      return undefined;
    } catch (error) {
      console.warn('⚠️ Category classification failed:', error);
      return undefined;
    }
  }

  /**
   * Generate tags using LLM-based dynamic extraction
   */
  async generateTags(title: string, content: string): Promise<string[]> {
    try {
      const prompt = `
Analyze this news article and generate ${this.config.maxTagsPerArticle} relevant hashtags.
Requirements:
- Use lowercase letters
- Use hyphens for multi-word tags (e.g., #artificial-intelligence)
- Focus on: main topics, entities (people, companies, locations), events
- Avoid generic tags like #news or #article
- Make tags specific and searchable

Title: ${title}
Content: ${content.substring(0, 1500)}

Return only the hashtags, comma-separated.
Example: #artificial-intelligence, #openai, #tech-funding, #startup
`;

      const response = await this.openaiService.generateTextResponse(prompt);
      
      // Parse hashtags from response
      const tags = response
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.startsWith('#'))
        .slice(0, this.config.maxTagsPerArticle);

      return tags;
    } catch (error) {
      console.warn('⚠️ Tag generation failed:', error);
      return [];
    }
  }

  /**
   * Generate image descriptions
   * Primary: Extract from HTML (alt text, figcaptions)
   * Secondary: VLM for featured image (if enabled)
   */
  async generateImageDescriptions(
    imagePaths: string[],
    cacheFolder: string,
    title: string,
    content: string
  ): Promise<Record<string, string>> {
    const descriptions: Record<string, string> = {};

    if (imagePaths.length === 0) {
      return descriptions;
    }

    try {
      // Read HTML file to extract alt text and captions
      const htmlPath = path.join(cacheFolder, 'article.html');
      let htmlContent = '';

      if (fs.existsSync(htmlPath)) {
        htmlContent = fs.readFileSync(htmlPath, 'utf-8');
      }

      // Extract alt text and figcaptions from HTML
      const altTexts = this.extractAltTexts(htmlContent);
      const captions = this.extractFigcaptions(htmlContent);

      // Map images to descriptions
      for (const imagePath of imagePaths) {
        const filename = path.basename(imagePath);
        
        // Try to find matching alt text or caption
        const altText = altTexts.find(alt => alt.filename === filename);
        const caption = captions.find(cap => cap.filename === filename);
        
        if (altText?.text) {
          descriptions[filename] = altText.text;
        } else if (caption?.text) {
          descriptions[filename] = caption.text;
        } else {
          // Generic description
          descriptions[filename] = `Image from article: ${title}`;
        }
      }

      // Use VLM for featured image if enabled
      if (this.config.useVlmForImages && imagePaths.length > 0) {
        const featuredImage = imagePaths[0]; // First image is featured
        const featuredFilename = path.basename(featuredImage);
        
        try {
          const vlmDescription = await this.generateVlmDescription(
            path.join(cacheFolder, featuredImage),
            title,
            content
          );
          
          if (vlmDescription) {
            descriptions[featuredFilename] = vlmDescription;
          }
        } catch (error) {
          console.warn('⚠️ VLM description failed for featured image:', error);
          // Keep the HTML-extracted description
        }
      }

      return descriptions;
    } catch (error) {
      console.warn('⚠️ Image description generation failed:', error);
      
      // Fallback: generic descriptions
      for (const imagePath of imagePaths) {
        const filename = path.basename(imagePath);
        descriptions[filename] = `Image from article: ${title}`;
      }
      
      return descriptions;
    }
  }

  /**
   * Extract alt texts from HTML
   */
  private extractAltTexts(html: string): Array<{ filename: string; text: string }> {
    const results: Array<{ filename: string; text: string }> = [];
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*alt=["']([^"']+)["'][^>]*>/gi;
    
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const src = match[1];
      const alt = match[2];
      const filename = path.basename(src);
      
      if (alt && alt.trim()) {
        results.push({ filename, text: alt.trim() });
      }
    }
    
    return results;
  }

  /**
   * Extract figcaptions from HTML
   */
  private extractFigcaptions(html: string): Array<{ filename: string; text: string }> {
    const results: Array<{ filename: string; text: string }> = [];
    const figureRegex = /<figure[^>]*>([\s\S]*?)<\/figure>/gi;
    
    let match;
    while ((match = figureRegex.exec(html)) !== null) {
      const figureContent = match[1];
      
      // Extract image filename
      const imgMatch = /<img[^>]+src=["']([^"']+)["'][^>]*>/i.exec(figureContent);
      const figcaptionMatch = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(figureContent);
      
      if (imgMatch && figcaptionMatch) {
        const src = imgMatch[1];
        const caption = figcaptionMatch[1];
        const filename = path.basename(src);
        const captionText = caption.replace(/<[^>]+>/g, '').trim();
        
        if (captionText) {
          results.push({ filename, text: captionText });
        }
      }
    }
    
    return results;
  }

  /**
   * Generate VLM description for an image
   * Note: This requires VLM capability in OpenAIService
   */
  private async generateVlmDescription(
    imagePath: string,
    title: string,
    content: string
  ): Promise<string | null> {
    try {
      // Check if OpenAIService supports vision
      if (typeof (this.openaiService as any).generateImageDescription !== 'function') {
        return null;
      }

      const description = await (this.openaiService as any).generateImageDescription(
        imagePath,
        `Describe this image from the article "${title}". Focus on the main subject and context.`
      );

      return description;
    } catch (error) {
      console.warn('⚠️ VLM description failed:', error);
      return null;
    }
  }

}

export function createArticleClassificationService(
  openaiService: OpenAIService,
  config?: ClassificationConfig
): ArticleClassificationService {
  return new ArticleClassificationService(openaiService, config);
}