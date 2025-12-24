import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import { GoogleSearchService } from './services/GoogleSearchService';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: pnpm run news:cli "search query" [numResults] [output.json]');
    process.exit(2);
  }

  const query = args[0];
  const numResults = args[1] ? Math.max(1, parseInt(args[1], 10)) : 10;
  const outPath = args[2] || `news_results_${Date.now()}.json`;

  const svc = new GoogleSearchService({ apiKey: '', searchEngineId: '' });

  try {
    console.log(`Searching Google News for: "${query}" (max ${numResults})`);
    const groups = await svc.searchNewsGroupedFull(query, numResults);

    // Normalize output
    const out = groups.map(g => ({
      sourceUrl: g.sourceUrl,
      feedUrl: g.feedUrl,
      items: g.items.map(r => ({
        title: r.title,
        link: r.link,
        originalLink: r.originalLink || null,
        image: r.image || null,
        pubDate: r.pubDate || null,
        feedUrl: r.feedUrl || null,
        snippet: r.snippet,
        fullText: r.fullText || null,
      }))
    }));

    const abs = path.resolve(process.cwd(), outPath);
    await fs.writeFile(abs, JSON.stringify(out, null, 2), 'utf-8');
    console.log(`Wrote ${out.length} groups to ${abs}`);
  } catch (err) {
    console.error('Error running news CLI:', err);
    process.exit(1);
  }
}

if (require.main === module) main();
