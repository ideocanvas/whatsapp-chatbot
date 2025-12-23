import dotenv from 'dotenv';
dotenv.config();

import { promises as fs } from 'fs';
import path from 'path';
import { GoogleSearchService } from './services/googleSearchService';

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
    const results = await svc.searchNewsFull(query, numResults);

    // Normalize output
    const out = results.map(r => ({
      title: r.title,
      link: r.link,
      image: r.image || null,
      pubDate: r.pubDate || null,
      snippet: r.snippet,
    }));

    const abs = path.resolve(process.cwd(), outPath);
    await fs.writeFile(abs, JSON.stringify(out, null, 2), 'utf-8');
    console.log(`Wrote ${out.length} items to ${abs}`);
  } catch (err) {
    console.error('Error running news CLI:', err);
    process.exit(1);
  }
}

if (require.main === module) main();
