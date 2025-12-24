#!/usr/bin/env node

import { GoogleSearchService } from '../src/services/GoogleSearchService';

(async () => {
  const svc = new GoogleSearchService({ apiKey: '', searchEngineId: '' });

  try {
    console.log('=== searchNews() without query ===');
    const res1 = await svc.searchNews(undefined, 5);
    console.log(`found ${res1.length} items`);
    console.dir(res1, { depth: 2 });

    console.log('\n=== searchNews("Hong Kong") ===');
    const res2 = await svc.searchNews('Hong Kong', 5);
    console.log(`found ${res2.length} items`);
    console.dir(res2, { depth: 2 });
  } catch (err) {
    console.error('Test failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
})();
