import { WebScrapeService } from '../src/services/webScrapeService';

async function testYahooFinanceScrape() {
  console.log('🧪 Testing Yahoo Finance URL scraping with improved timeout handling...\n');

  // Create web scrape service with custom configuration for Yahoo Finance
  const webScrapeService = new WebScrapeService({
    timeout: 45000, // Longer timeout for financial sites
    maxRetries: 3,
    retryDelay: 3000,
    navigationTimeout: 20000,
    loadStateTimeout: 15000,
  });

  const testUrl = 'https://sg.finance.yahoo.com/quote/1810.HK/';

  try {
    console.log(`🌐 Testing URL: ${testUrl}`);
    console.log('📊 Configuration:', {
      timeout: webScrapeService['config'].timeout,
      maxRetries: webScrapeService['config'].maxRetries,
      retryDelay: webScrapeService['config'].retryDelay,
      navigationTimeout: webScrapeService['config'].navigationTimeout,
      loadStateTimeout: webScrapeService['config'].loadStateTimeout,
    });

    const startTime = Date.now();

    // Try scraping without a specific selector first
    const result = await webScrapeService.scrapeUrl(testUrl);

    const executionTime = Date.now() - startTime;

    console.log('✅ Yahoo Finance scrape successful!');
    console.log(`⏱️  Execution time: ${executionTime}ms`);
    console.log(`📝 Title: ${result.title}`);
    console.log(`📄 Content length: ${result.content.length} characters`);
    console.log(`📋 First 200 chars: ${result.content.substring(0, 200)}...\n`);

    // Test multiple URLs including the problematic one
    console.log('🧪 Testing multiple URLs including Yahoo Finance...');
    const multipleResults = await webScrapeService.scrapeUrls([
      testUrl,
      'https://httpbin.org/html' // Simple test URL as backup
    ]);

    console.log('✅ Multiple URLs test completed:');
    multipleResults.forEach((result, index) => {
      console.log(`   [${index + 1}] ${result.title} (${result.content.length} chars)`);
    });

  } catch (error) {
    console.error('❌ Yahoo Finance test failed:', error instanceof Error ? error.message : 'Unknown error');

    // Test fallback behavior
    console.log('\n🔄 Testing fallback to simple URL...');
    try {
      const fallbackResult = await webScrapeService.scrapeUrl('https://httpbin.org/html');
      console.log('✅ Fallback test successful:', {
        title: fallbackResult.title,
        contentLength: fallbackResult.content.length
      });
    } catch (fallbackError) {
      console.error('❌ Fallback test also failed:', fallbackError instanceof Error ? fallbackError.message : 'Unknown error');
    }
  } finally {
    await webScrapeService.close();
    console.log('\n🏁 Test completed.');
  }
}

// Run the test
testYahooFinanceScrape().catch(console.error);