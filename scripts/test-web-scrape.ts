import { WebScrapeService } from '../src/services/webScrapeService';

async function testWebScrape() {
  console.log('🧪 Testing Web Scrape Service...\n');

  const webScrapeService = new WebScrapeService();

  try {
    // Test scraping a simple website
    console.log('1. Testing basic URL scraping...');
    const result = await webScrapeService.scrapeUrl('https://httpbin.org/html');
    console.log('✅ Basic scrape successful:');
    console.log(`   Title: ${result.title}`);
    console.log(`   Content length: ${result.content.length} characters`);
    console.log(`   First 100 chars: ${result.content.substring(0, 100)}...\n`);

    // Test scraping with selector
    console.log('2. Testing scraping with selector...');
    const resultWithSelector = await webScrapeService.scrapeUrl('https://httpbin.org/html', 'h1');
    console.log('✅ Selector scrape successful:');
    console.log(`   Title: ${resultWithSelector.title}`);
    console.log(`   Content: ${resultWithSelector.content}\n`);

    // Test multiple URLs
    console.log('3. Testing multiple URLs...');
    const multipleResults = await webScrapeService.scrapeUrls([
      'https://httpbin.org/html',
      'https://httpbin.org/user-agent'
    ]);
    console.log('✅ Multiple URLs scrape successful:');
    multipleResults.forEach((result, index) => {
      console.log(`   [${index + 1}] ${result.title} (${result.content.length} chars)`);
    });
    console.log();

    // Test formatting
    console.log('4. Testing result formatting...');
    const formatted = webScrapeService.formatScrapeResults(multipleResults);
    console.log('✅ Formatting successful:');
    console.log(formatted.substring(0, 200) + '...\n');

    console.log('🎉 All web scrape tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : `${error}`);
  } finally {
    await webScrapeService.close();
  }
}

// Run the test
testWebScrape().catch(console.error);