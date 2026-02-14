#!/usr/bin/env node
/**
 * Test script to fetch HTML content from a Google News article URL
 * using the ChromeRemoteDebugService
 * 
 * Usage: npx ts-node scripts/test-chrome-news-article.ts
 */

import { ChromeRemoteDebugService } from '../src/services/ChromeRemoteDebugService';

// Configuration
const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const TEST_URL = 'https://news.google.com/rss/articles/CBMid0FVX3lxTE5NZ1hSSmFIdk9TTmQ1MWxOTDF3LWFpT3pVcTdNb1dKbzJ2VDFpRldxSW5XN1c1R2hoWG1MMDFoTTFnT1RTVm5hWWZvMVVvN0RDS0FWVEpqUVhFanNhRy1Ec3NPakVrS2dzQWJ4N1E2QWRYejM2ajNF?oc=5';

async function main() {
  console.log('='.repeat(60));
  console.log('Chrome Remote Debug - News Article HTML Fetcher');
  console.log('='.repeat(60));
  console.log(`CDP Endpoint: ${CDP_ENDPOINT}`);
  console.log(`Target URL: ${TEST_URL}`);
  console.log('');

  const service = new ChromeRemoteDebugService({
    endpoint: CDP_ENDPOINT,
    timeout: 60000, // 60 seconds for slow pages
    retries: 3,
  });

  try {
    // Connect to remote Chrome
    console.log('[Step 1] Connecting to remote Chrome...');
    await service.connect();
    console.log('✅ Connected successfully!');
    console.log('');

    // Check health
    console.log('[Step 2] Checking connection health...');
    const health = await service.healthCheck();
    console.log(`   Healthy: ${health.healthy}`);
    if (health.browserVersion) {
      console.log(`   Browser: ${health.browserVersion}`);
    }
    console.log('');

    // Navigate and get content
    console.log('[Step 3] Navigating to Google News article...');
    const startTime = Date.now();
    
    const content = await service.navigateAndGetContent(TEST_URL, {
      timeout: 60000,
      waitUntil: 'networkidle', // Wait for network to settle
    });
    
    const loadTime = Date.now() - startTime;
    console.log(`✅ Page loaded in ${loadTime}ms`);
    console.log('');

    // Display results
    console.log('[Step 4] Content retrieved:');
    console.log('-'.repeat(40));
    console.log(`URL: ${content.url}`);
    console.log(`Title: ${content.title}`);
    console.log(`HTML Size: ${content.html.length} characters`);
    console.log(`Timestamp: ${content.timestamp.toISOString()}`);
    console.log('-'.repeat(40));
    console.log('');

    // Show HTML preview
    console.log('[Step 5] HTML Preview (first 2000 chars):');
    console.log('='.repeat(40));
    console.log(content.html.substring(0, 2000));
    if (content.html.length > 2000) {
      console.log(`\n... (${content.html.length - 2000} more characters)`);
    }
    console.log('='.repeat(40));
    console.log('');

    // Save to file
    const fs = await import('fs');
    const outputPath = '/tmp/news-article.html';
    fs.writeFileSync(outputPath, content.html);
    console.log(`📄 Full HTML saved to: ${outputPath}`);
    console.log('');

    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed!');
    console.error('='.repeat(60));
    
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      console.error(error.stack);
    } else {
      console.error(error);
    }
    
    process.exit(1);
    
  } finally {
    // Disconnect
    console.log('');
    console.log('Disconnecting from remote Chrome...');
    await service.disconnect();
    console.log('Disconnected.');
  }
}

// Run
main().catch(console.error);
