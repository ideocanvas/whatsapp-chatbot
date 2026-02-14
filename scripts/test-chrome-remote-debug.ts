#!/usr/bin/env node
/**
 * Test script to validate Chrome Remote Debug connection
 * 
 * Usage: npx ts-node scripts/test-chrome-remote-debug.ts
 * 
 * Prerequisites:
 * 1. Chrome running on remote machine with remote debugging enabled
 * 2. Chrome started with: chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0
 * 
 * Note: The remote Chrome must be started with --remote-debugging-address=0.0.0.0 to accept external connections
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';

// Configuration - change these as needed
const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const TEST_URL = process.env.TEST_URL || 'https://example.com';

interface TestResult {
  success: boolean;
  url: string;
  title: string;
  htmlLength: number;
}

async function testConnection(): Promise<TestResult> {
  console.log('='.repeat(60));
  console.log('Chrome Remote Debug Connection Test');
  console.log('='.repeat(60));
  console.log(`CDP Endpoint: ${CDP_ENDPOINT}`);
  console.log(`Test URL: ${TEST_URL}`);
  console.log('');

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Step 1: Connect to remote Chrome
    console.log('[Step 1] Connecting to remote Chrome via CDP...');
    browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    console.log('✅ Connected successfully!');
    
    // Get browser info
    const browserVersion = browser.version();
    console.log(`   Browser version: ${browserVersion}`);
    console.log('');

    // Step 2: Get or create a context
    console.log('[Step 2] Getting browser contexts...');
    const contexts = browser.contexts();
    console.log(`   Found ${contexts.length} context(s)`);
    
    if (contexts.length > 0) {
      context = contexts[0];
      console.log('   Using existing context (preserves cookies/sessions!)');
    } else {
      context = await browser.newContext();
      console.log('   Created new context');
    }
    console.log('');

    // Step 3: Get or create a page
    console.log('[Step 3] Getting pages...');
    const pages = context.pages();
    console.log(`   Found ${pages.length} page(s)`);
    
    if (pages.length > 0) {
      page = pages[0];
      console.log('   Using existing page');
    } else {
      page = await context.newPage();
      console.log('   Created new page');
    }
    console.log('');

    // Step 4: Navigate to test URL
    console.log(`[Step 4] Navigating to ${TEST_URL}...`);
    const startTime = Date.now();
    
    const response = await page.goto(TEST_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    const loadTime = Date.now() - startTime;
    console.log(`✅ Page loaded in ${loadTime}ms`);
    
    if (response) {
      console.log(`   Status: ${response.status()} ${response.statusText()}`);
    }
    
    const finalUrl = page.url();
    console.log(`   Final URL: ${finalUrl}`);
    console.log('');

    // Step 5: Get page content
    console.log('[Step 5] Extracting HTML content...');
    const html = await page.content();
    console.log(`✅ HTML content retrieved: ${html.length} characters`);
    console.log('');

    // Step 6: Get page title
    console.log('[Step 6] Getting page title...');
    const title = await page.title();
    console.log(`   Title: ${title}`);
    console.log('');

    // Step 7: Show content preview
    console.log('[Step 7] Content preview (first 500 chars):');
    console.log('-'.repeat(40));
    console.log(html.substring(0, 500));
    console.log('-'.repeat(40));
    console.log('');

    // Summary
    console.log('='.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Summary:');
    console.log(`  - Connection: OK`);
    console.log(`  - Navigation: OK`);
    console.log(`  - Content extraction: OK`);
    console.log(`  - Page title: ${title}`);
    console.log(`  - HTML size: ${html.length} bytes`);
    console.log('');

    return {
      success: true,
      url: finalUrl,
      title,
      htmlLength: html.length
    };

  } catch (error) {
    console.error('');
    console.error('❌ TEST FAILED!');
    console.error('='.repeat(60));
    
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      
      // Provide helpful hints based on error type
      if (error.message.includes('ECONNREFUSED')) {
        console.error('');
        console.error('Hint: Could not connect to remote Chrome. Check:');
        console.error('  1. Chrome is running on the remote machine');
        console.error('  2. Chrome was started with --remote-debugging-port=9222');
        console.error('  3. Chrome was started with --remote-debugging-address=0.0.0.0');
        console.error('  4. Firewall allows connections on port 9222');
      } else if (error.message.includes('timeout')) {
        console.error('');
        console.error('Hint: Navigation timed out. The page might be slow or unreachable.');
      }
    }
    
    throw error;
    
  } finally {
    // Cleanup - close the connection (not the remote browser)
    if (browser) {
      console.log('Closing connection to remote Chrome...');
      await browser.close();
      console.log('Connection closed.');
    }
  }
}

// Run the test
(async () => {
  try {
    const result = await testConnection();
    console.log('Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();
