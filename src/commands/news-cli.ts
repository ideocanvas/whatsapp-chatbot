import * as dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import * as path from 'path';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../services/GoogleSearchService';
import { createOpenAIServiceFromConfig } from '../services/OpenAIService';
import { ProcessedArticleService } from '../services/ProcessedArticleService';
import { prisma } from '../config/prisma';

async function main() {
  const args = process.argv.slice(2);
  
  // Check for --retry-only flag
  const retryOnlyIndex = args.indexOf('--retry-only');
  const retryOnly = retryOnlyIndex !== -1;
  
  // Check for --force-reprocess flag
  const forceReprocessIndex = args.indexOf('--force-reprocess');
  const forceReprocess = forceReprocessIndex !== -1;
  
  // Filter out flags for argument parsing
  const filteredArgs = args.filter(arg => arg !== '--retry-only' && arg !== '--force-reprocess');
  
  if (filteredArgs.length === 0 && !retryOnly && !forceReprocess) {
    console.error('Usage: pnpm run news:cli [numResults] [output.json]');
    console.error('  numResults: Number of news articles to fetch (default: 100)');
    console.error('  --retry-only: Only retry failed and stuck processing articles, do not fetch new articles');
    console.error('  --force-reprocess: Force reprocess all articles in "processing" status');
    process.exit(2);
  }

  const numResults = filteredArgs[0] && !filteredArgs[0].startsWith('--') ? Math.max(1, parseInt(filteredArgs[0], 10)) : 100;
  const outPath = filteredArgs[1] && !filteredArgs[1].startsWith('--') ? filteredArgs[1] : filteredArgs[0] && !filteredArgs[0].startsWith('--') ? `news_results_${Date.now()}.json` : `news_results_${Date.now()}.json`;

  // Initialize OpenAIService from config (required for fetchLatestNews)
  const openaiService = await createOpenAIServiceFromConfig();

  // Initialize GoogleSearchService from env with OpenAI service
  const svc = createGoogleSearchServiceFromEnv(openaiService);

  try {
    if (forceReprocess) {
      // Force reprocess all articles in "processing" status
      console.log('🔄 Force reprocess mode: Reprocessing all articles in "processing" status...');
      
      // Get all articles in processing status
      const processingArticles = await prisma.processedArticle.findMany({
        where: { processingStatus: 'processing' },
        select: {
          id: true,
          title: true,
          url: true,
          source: true,
        }
      });
      
      console.log(`📊 Found ${processingArticles.length} articles in "processing" status`);
      
      let succeeded = 0;
      let failed = 0;
      
      for (const article of processingArticles) {
        try {
          console.log(`🔄 Reprocessing: ${article.title}`);
          
          // Mark as failed first to reset status
          await prisma.processedArticle.update({
            where: { id: article.id },
            data: {
              processingStatus: 'failed',
              errorMessage: 'Force reprocess - marked as failed before retry',
            }
          });
          
          // Re-process the article
          const item: any = {
            title: article.title,
            link: article.url,
            snippet: '',
            originalLink: article.source,
          };
          
          const result = await (svc as any).processArticle(item);
          
          if (result && result.processingStatus === 'completed') {
            succeeded++;
            console.log(`✅ Reprocess succeeded: ${article.title}`);
          } else {
            failed++;
            console.log(`❌ Reprocess failed: ${article.title}`);
          }
        } catch (error) {
          failed++;
          console.error(`❌ Reprocess error: ${article.title}`, error);
        }
      }
      
      console.log(`📊 Force reprocess complete: ${succeeded}/${processingArticles.length} succeeded, ${failed} failed`);
      
      // Get all processed articles to show the current status
      const detailedArticles = await prisma.processedArticle.findMany({
        select: {
          id: true,
          title: true,
          url: true,
          source: true,
          publishedAt: true,
          originalContent: true,
          processedContent: true,
          imagePaths: true,
          imageDescriptions: true,
          keywords: true,
          tags: true,
          category: true,
          processingStatus: true,
          errorMessage: true,
          retryCount: true,
          updatedAt: true,
        },
        orderBy: { publishedAt: 'desc' }
      });
      
      // Normalize output
      const out = detailedArticles.map((r: any) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        feedUrl: null,
        publishedAt: r.publishedAt,
        originalContent: r.originalContent,
        processedContent: r.processedContent,
        imagePaths: r.imagePaths,
        imageDescriptions: r.imageDescriptions || {},
        keywords: r.keywords,
        tags: r.tags || [],
        category: r.category || null,
        processingStatus: r.processingStatus,
        errorMessage: r.errorMessage || null,
        retryCount: r.retryCount || 0,
        updatedAt: r.updatedAt,
      }));

      const abs = path.resolve(process.cwd(), outPath);
      await fs.writeFile(abs, JSON.stringify(out, null, 2), 'utf-8');
      console.log(`📝 Wrote ${out.length} articles to ${abs}`);
      console.log(`📊 Status breakdown:`);
      const statusCounts = out.reduce((acc: Record<string, number>, a: any) => {
        const status = a.processingStatus || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`   - completed: ${statusCounts.completed || 0}`);
      console.log(`   - failed: ${statusCounts.failed || 0}`);
      console.log(`   - processing: ${statusCounts.processing || 0}`);
      console.log(`   - pending: ${statusCounts.pending || 0}`);
    } else if (retryOnly) {
      // Only retry failed and stuck processing articles
      console.log('🔄 Retry-only mode: Retrying failed and stuck processing articles...');
      const retryResults = await svc.retryArticles();
      console.log(`✅ Retry results: ${retryResults.failedSucceeded}/${retryResults.failedRetried} failed succeeded, ${retryResults.stuckSucceeded}/${retryResults.stuckRetried} stuck succeeded`);
      
      // Get all processed articles to show the current status
      const articleService = new ProcessedArticleService();
      const allArticles = await articleService.searchProcessedArticles(undefined, {
        limit: 1000,
        orderBy: 'publishedAt',
        orderDirection: 'desc'
      });
      
      // Get detailed article data with id and updatedAt
      const detailedArticles = await prisma.processedArticle.findMany({
        select: {
          id: true,
          title: true,
          url: true,
          source: true,
          publishedAt: true,
          originalContent: true,
          processedContent: true,
          imagePaths: true,
          imageDescriptions: true,
          keywords: true,
          tags: true,
          category: true,
          processingStatus: true,
          errorMessage: true,
          retryCount: true,
          updatedAt: true,
        },
        orderBy: { publishedAt: 'desc' }
      });
      
      // Normalize output
      const out = detailedArticles.map((r: any) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        feedUrl: null,
        publishedAt: r.publishedAt,
        originalContent: r.originalContent,
        processedContent: r.processedContent,
        imagePaths: r.imagePaths,
        imageDescriptions: r.imageDescriptions || {},
        keywords: r.keywords,
        tags: r.tags || [],
        category: r.category || null,
        processingStatus: r.processingStatus,
        errorMessage: r.errorMessage || null,
        retryCount: r.retryCount || 0,
        updatedAt: r.updatedAt,
      }));

      const abs = path.resolve(process.cwd(), outPath);
      await fs.writeFile(abs, JSON.stringify(out, null, 2), 'utf-8');
      console.log(`📝 Wrote ${out.length} articles to ${abs}`);
      console.log(`📊 Status breakdown:`);
      const statusCounts = out.reduce((acc: Record<string, number>, a: any) => {
        const status = a.processingStatus || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`   - completed: ${statusCounts.completed || 0}`);
      console.log(`   - failed: ${statusCounts.failed || 0}`);
      console.log(`   - processing: ${statusCounts.processing || 0}`);
      console.log(`   - pending: ${statusCounts.pending || 0}`);
    } else {
      // Normal mode: retry failed articles and fetch new ones
      console.log('🔄 Retrying failed and stuck processing articles...');
      const retryResults = await svc.retryArticles();
      console.log(`✅ Retry results: ${retryResults.failedSucceeded}/${retryResults.failedRetried} failed succeeded, ${retryResults.stuckSucceeded}/${retryResults.stuckRetried} stuck succeeded`);

      // Then fetch latest news articles
      console.log(`📰 Fetching latest ${numResults} news articles`);
      const results = await svc.fetchLatestNews(numResults);

      // Normalize output
      const out = results.map(r => ({
        id: r.id,
        title: r.title,
        url: r.url,
        source: r.source,
        feedUrl: r.feedUrl || null,
        publishedAt: r.publishedAt,
        originalContent: r.originalContent,
        processedContent: r.processedContent,
        imagePaths: r.imagePaths,
        imageDescriptions: r.imageDescriptions,
        keywords: r.keywords,
        tags: r.tags,
        category: r.category || null,
        processingStatus: r.processingStatus,
        errorMessage: r.errorMessage || null,
        isNew: r.isNew,
      }));

      const abs = path.resolve(process.cwd(), outPath);
      await fs.writeFile(abs, JSON.stringify(out, null, 2), 'utf-8');
      console.log(`📝 Wrote ${out.length} articles to ${abs}`);
    }
  } catch (err) {
    console.error('❌ Error running news CLI:', err);
    process.exit(1);
  }
}

if (require.main === module) main();