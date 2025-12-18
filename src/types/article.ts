export interface ProcessedArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  originalContent: string;
  processedContent: string; // Markdown format
  keywords: string[];
  category?: string;
  imagePaths: string[];
  imageDescriptions?: Record<string, string>; // filename -> description
}