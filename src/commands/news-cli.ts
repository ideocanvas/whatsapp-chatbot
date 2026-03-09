import * as dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import pgvector from 'pgvector';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../services/GoogleSearchService';
import { createOpenAIServiceFromConfig } from '../services/OpenAIService';
import { ProcessedArticleService } from '../services/ProcessedArticleService';
import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { prisma } from '../config/prisma';
import { handleFailedArticles } from '../utils/handleFailedArticles';

async function main() {
  const args = process.argv.slice(2);
  
  // Check for --retry-only flag
  const retryOnlyIndex = args.indexOf('--retry-only');
  const retryOnly = retryOnlyIndex !== -1;
  
  // Check for --force flag (used with --retry-only to bypass cooldown)
  const forceIndex = args.indexOf('--force');
  const force = forceIndex !== -1;
  
  // Check for --force-reprocess flag
  const forceReprocessIndex = args.indexOf('--force-reprocess');
  const forceReprocess = forceReprocessIndex !== -1;
  
  // Check for --sync-to-kb flag
  const syncToKbIndex = args.indexOf('--sync-to-kb');
  const syncToKb = syncToKbIndex !== -1;

  // Check for --handle-failed flag
  const handleFailedIndex = args.indexOf('--handle-failed');
  const handleFailed = handleFailedIndex !== -1;

  const failedActionIdx = args.indexOf('--failed-action');
  const failedAction = failedActionIdx !== -1 && args[failedActionIdx + 1] && !args[failedActionIdx + 1].startsWith('--')
    ? args[failedActionIdx + 1]
    : 'delete';

  const failedApply = args.indexOf('--failed-apply') !== -1;
  const failedDryRun = !failedApply; // default dry-run unless explicitly applied
  const failedSkipDb = args.indexOf('--failed-skip-db') !== -1;
  
  // Check for --reclassify-null flag
  const reclassifyNullIndex = args.indexOf('--reclassify-null');
  const reclassifyNull = reclassifyNullIndex !== -1;

  // Check for --rebuild-embeddings flag
  const rebuildEmbeddingsIndex = args.indexOf('--rebuild-embeddings');
  const rebuildEmbeddings = rebuildEmbeddingsIndex !== -1;
  
  // Filter out flags for argument parsing
  const filteredArgs = args.filter((arg, idx) => {
    if (arg === '--retry-only' || arg === '--force' || arg === '--force-reprocess' || arg === '--sync-to-kb' || arg === '--handle-failed' || arg === '--failed-apply' || arg === '--failed-skip-db' || arg === '--reclassify-null' || arg === '--rebuild-embeddings') {
      return false;
    }
    if (arg === '--failed-action') {
      // Skip the flag and its value
      return false;
    }
    if (args[idx - 1] === '--failed-action') {
      return false;
    }
    return true;
  });
  
  if (filteredArgs.length === 0 && !retryOnly && !forceReprocess && !syncToKb && !handleFailed && !reclassifyNull && !rebuildEmbeddings) {
    console.error('Usage: pnpm run news:cli [numResults] [output.json]');
    console.error('  numResults: Number of news articles to fetch (default: 100)');
    console.error('  --retry-only: Only retry failed and stuck processing articles, do not fetch new articles');
    console.error('     --force: Bypass cooldown period for failed articles (use with --retry-only)');
    console.error('  --force-reprocess: Force reprocess all articles in "processing" status');
    console.error('  --sync-to-kb: Sync all completed articles to knowledge base (deduplicates by content hash)');
    console.error('  --handle-failed: Mark/cache files with "This site can\'t be reached" as failed and remove or move them');
    console.error('     --failed-action [delete|move] (default delete)');
    console.error('     --failed-apply  (required to actually modify files/DB; default is dry-run)');
    console.error('     --failed-skip-db');
    console.error('  --reclassify-null: Re-process category for completed articles with NULL category');
    console.error('  --rebuild-embeddings: Rebuild all embeddings in Knowledge table using current embedding model');
    process.exit(2);
  }

  const numResults = filteredArgs[0] && !filteredArgs[0].startsWith('--') ? Math.max(1, parseInt(filteredArgs[0], 10)) : 100;
  const outPath = filteredArgs[1] && !filteredArgs[1].startsWith('--') ? filteredArgs[1] : filteredArgs[0] && !filteredArgs[0].startsWith('--') ? `news_results_${Date.now()}.json` : `news_results_${Date.now()}.json`;

  // Initialize OpenAIService from config (required for fetchLatestNews)
  const openaiService = await createOpenAIServiceFromConfig();

  // Initialize KnowledgeBase for --sync-to-kb mode
  const kb = new KnowledgeBasePostgres(openaiService);

  // Initialize GoogleSearchService from env with OpenAI service and KB
  const svc = createGoogleSearchServiceFromEnv(openaiService, kb);

  if (handleFailed) {
    console.log('🛠 Handling failed article downloads...');
    const result = await handleFailedArticles({
      action: failedAction === 'move' ? 'move' : 'delete',
      dryRun: failedDryRun,
      skipDb: failedSkipDb,
    });

    console.log(`📊 ${result.message}`);
    console.log(`   - total: ${result.stats.total}`);
    console.log(`   - processed: ${result.stats.processed}`);
    console.log(`   - failed: ${result.stats.failed}`);
    console.log(`   - skipped: ${result.stats.skipped}`);

    process.exit(result.success ? 0 : 1);
  }

  if (reclassifyNull) {
    console.log('🔄 Reclassify-null mode: Re-processing category for completed articles with NULL category...');
    
    // Import ArticleClassificationService for reclassification
    const { createArticleClassificationService } = await import('../services/ArticleClassificationService');
    const articleClassificationService = createArticleClassificationService(openaiService);
    
    // Get all completed articles with NULL category
    const articlesToReclassify = await prisma.processedArticle.findMany({
      where: {
        processingStatus: 'completed',
        category: null,
      },
      select: {
        id: true,
        title: true,
        url: true,
        source: true,
        processedContent: true,
      },
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log(`📊 Found ${articlesToReclassify.length} completed articles with NULL category`);
    
    if (articlesToReclassify.length === 0) {
      console.log('✅ No articles to reclassify. All completed articles have a category.');
      process.exit(0);
    }
    
    let succeeded = 0;
    let failed = 0;
    
    for (const article of articlesToReclassify) {
      try {
        console.log(`🔄 Reclassifying: ${article.title}`);
        
        // Read markdown content
        const markdownPath = path.join('./data', article.processedContent);
        const markdownContent = await fs.readFile(markdownPath, 'utf-8');
        
        // Re-classify category
        const category = await articleClassificationService.classifyCategory(
          article.title,
          markdownContent
        );
        
        // Update article with new category
        await prisma.processedArticle.update({
          where: { id: article.id },
          data: { category: category || null }
        });
        
        if (category) {
          succeeded++;
          console.log(`✅ Reclassified with category: ${category}`);
        } else {
          console.log(`⚠️ Could not classify, category remains NULL`);
          succeeded++; // Count as success even if category is null (we tried)
        }
      } catch (error) {
        failed++;
        console.error(`❌ Reclassify error: ${article.title}`, error);
      }
    }
    
    console.log(`\n📊 Reclassification complete: ${succeeded}/${articlesToReclassify.length} processed, ${failed} failed`);
    
    // Get updated article data
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
    
    // Show category distribution
    const categoryCounts = out.reduce((acc: Record<string, number>, a: any) => {
      const cat = a.category || 'NULL';
      acc[cat] = (acc[cat] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`📊 Category distribution:`);
    Object.entries(categoryCounts).forEach(([cat, count]) => {
      console.log(`   - ${cat}: ${count}`);
    });
    
    process.exit(failed > 0 ? 1 : 0);
  }

  if (rebuildEmbeddings) {
    console.log('🔄 Rebuild-embeddings mode: Rebuilding all embeddings in Knowledge table...');
    
    // Get all knowledge entries
    const allKnowledge = await prisma.knowledge.findMany({
      select: {
        id: true,
        content: true,
        source: true,
        category: true,
        tags: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' }
    });
    
    console.log(`📊 Found ${allKnowledge.length} knowledge entries to rebuild`);
    
    if (allKnowledge.length === 0) {
      console.log('✅ No knowledge entries to rebuild.');
      process.exit(0);
    }
    
    let succeeded = 0;
    let failed = 0;
    
    for (const knowledge of allKnowledge) {
      try {
        console.log(`🔄 Rebuilding embedding: ${knowledge.source?.substring(0, 50)}...`);
        
        // Create new embedding using current model (use large text method for safety)
        const newEmbedding = await openaiService.createEmbeddingForLargeText(knowledge.content);
        const embeddingSql = pgvector.toSql(newEmbedding);
        
        // Update knowledge with new embedding (using pgvector format)
        await prisma.$executeRaw`
          UPDATE "Knowledge"
          SET "embedding" = ${embeddingSql}::vector
          WHERE id = ${knowledge.id}
        `;
        
        succeeded++;
        console.log(`✅ Rebuilt embedding [${succeeded}/${allKnowledge.length}]: ${knowledge.source?.substring(0, 50)}...`);
      } catch (error) {
        failed++;
        console.error(`❌ Rebuild error: ${knowledge.source?.substring(0, 50)}...`, error);
      }
    }
    
    console.log(`\n📊 Rebuild complete: ${succeeded}/${allKnowledge.length} succeeded, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }

  try {
    if (syncToKb) {
      // Sync all completed articles to knowledge base
      console.log('🔄 Sync-to-KB mode: Syncing all completed articles to knowledge base...');
      
      // Get all completed articles
      const completedArticles = await prisma.processedArticle.findMany({
        where: { processingStatus: 'completed' },
        select: {
          id: true,
          title: true,
          url: true,
          source: true,
          feedUrl: true,
          publishedAt: true,
          processedContent: true,
          tags: true,
          category: true,
        },
        orderBy: { publishedAt: 'desc' }
      });
      
      console.log(`📊 Found ${completedArticles.length} completed articles`);
      
      let added = 0;
      let skipped = 0;
      let errors = 0;
      
      for (const article of completedArticles) {
        try {
          // Read markdown content
          const markdownPath = path.join('./data', article.processedContent);
          
          if (!await fs.access(markdownPath).then(() => true).catch(() => false)) {
            console.log(`⚠️ Markdown file not found: ${article.title}`);
            errors++;
            continue;
          }
          
          const markdownContent = await fs.readFile(markdownPath, 'utf-8');
          
          // Truncate to 4000 chars (KB limit)
          const truncatedContent = markdownContent.substring(0, 4000);
          
          // Compute content hash
          const contentHash = crypto.createHash('md5').update(truncatedContent).digest('hex');
          
          // Check if already in KB
          const exists = await kb.hasContentHash(contentHash);
          
          if (exists) {
            console.log(`⏭️ Already in KB: ${article.title.substring(0, 50)}...`);
            skipped++;
            continue;
          }
          
          // Add tags
          const kbTags = [
            'news_article',
            ...(article.tags || []),
            ...(article.category ? [`category:${article.category}`] : []),
            ...(article.feedUrl ? [`feed:${new URL(article.feedUrl).hostname}`] : [])
          ];
          
          // Add to KB
          await kb.learnDocument({
            content: truncatedContent,
            source: article.url,
            tags: kbTags,
            timestamp: new Date(article.publishedAt),
            category: article.category || 'news',
            contentHash: contentHash
          });
          
          added++;
          console.log(`✅ Added to KB [${added}/${completedArticles.length}]: ${article.title.substring(0, 50)}...`);
        } catch (error) {
          errors++;
          console.error(`❌ Error syncing article: ${article.title}`, error);
        }
      }
      
      console.log(`\n📊 Sync complete:`);
      console.log(`   - Added: ${added}`);
      console.log(`   - Skipped (duplicates): ${skipped}`);
      console.log(`   - Errors: ${errors}`);
      console.log(`   - Total: ${completedArticles.length}`);
      
      const abs = path.resolve(process.cwd(), outPath);
      await fs.writeFile(abs, JSON.stringify({
        mode: 'sync-to-kb',
        timestamp: new Date().toISOString(),
        stats: { added, skipped, errors, total: completedArticles.length }
      }, null, 2), 'utf-8');
      console.log(`📝 Wrote sync stats to ${abs}`);
    } else if (forceReprocess) {
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
      const retryResults = await svc.retryArticles({
        // If --force is specified, bypass cooldown period
        failedCooldownMs: force ? 0 : undefined,
      });
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