import * as dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import * as path from 'path';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../services/GoogleSearchService';
import { createOpenAIServiceFromConfig } from '../services/OpenAIService';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm run news:cli [numResults] [output.json]');
    console.error('  numResults: Number of news articles to fetch (default: 100)');
    process.exit(2);
  }

  const numResults = args[0] && !args[0].startsWith('--') ? Math.max(1, parseInt(args[0], 10)) : 100;
  const outPath = args[1] && !args[1].startsWith('--') ? args[1] : args[0] && !args[0].startsWith('--') ? `news_results_${Date.now()}.json` : `news_results_${Date.now()}.json`;

  // Initialize OpenAIService from config (required for fetchLatestNews)
  const openaiService = await createOpenAIServiceFromConfig();

  // Initialize GoogleSearchService from env with OpenAI service
  const svc = createGoogleSearchServiceFromEnv(openaiService);

  try {
    // First, retry failed and stuck processing articles
    console.log('Retrying failed and stuck processing articles...');
    const retryResults = await svc.retryArticles();
    console.log(`Retry results: ${retryResults.failedSucceeded}/${retryResults.failedRetried} failed succeeded, ${retryResults.stuckSucceeded}/${retryResults.stuckRetried} stuck succeeded`);

    // Then fetch latest news articles
    console.log(`Fetching latest ${numResults} news articles`);
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
    console.log(`Wrote ${out.length} articles to ${abs}`);
  } catch (err) {
    console.error('Error running news CLI:', err);
    process.exit(1);
  }
}

if (require.main === module) main();