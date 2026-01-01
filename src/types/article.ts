export interface ProcessedArticle {
  id?: string; // UUID from database
  title: string;
  url: string;
  source: string;
  feedUrl?: string;
  publishedAt: string;
  originalContent: string; // Path to HTML file
  processedContent: string; // Path to Markdown file
  keywords: string[];
  tags: string[];
  category?: string;
  imagePaths: string[];
  imageDescriptions?: Record<string, string>; // filename -> description
  processingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  retryCount?: number;
}