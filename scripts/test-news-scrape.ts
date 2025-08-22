#!/usr/bin/env ts-node

import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../src/services/googleSearchService';
import { createWebScrapeService } from '../src/services/webScrapeService';
import { createNewsScrapeService } from '../src/services/newsScrapeService';

async function testNewsScraping() {
  console.log('🧪 Testing News Scraping Functionality\n');

  try {
    // Initialize services
    const googleSearchService = createGoogleSearchServiceFromEnv();
    const webScrapeService = createWebScrapeService();
    const newsScrapeService = createNewsScrapeService(googleSearchService, webScrapeService);

    console.log('✅ Services initialized successfully');

    // Test 1: Scrape general news
    console.log('\n📰 Test 1: Scraping general news...');
    const generalNews = await newsScrapeService.scrapeNews('latest news');
    console.log(`✅ Found ${generalNews.length} news articles`);

    if (generalNews.length > 0) {
      console.log('📋 Sample article:');
      console.log(`   Title: ${generalNews[0].title}`);
      console.log(`   Source: ${generalNews[0].source}`);
      console.log(`   Category: ${generalNews[0].category}`);
      console.log(`   Content preview: ${generalNews[0].content.substring(0, 100)}...`);
    }

    // Test 2: Scrape technology news
    console.log('\n💻 Test 2: Scraping technology news...');
    const techNews = await newsScrapeService.scrapeNews('technology news');
    console.log(`✅ Found ${techNews.length} technology news articles`);

    // Test 3: Format news articles
    console.log('\n📝 Test 3: Formatting news articles...');
    const formattedNews = newsScrapeService.formatNewsArticles(generalNews.slice(0, 2));
    console.log('✅ Formatted news output:');
    console.log(formattedNews);

    // Test 4: Test trending news
    console.log('\n🔥 Test 4: Getting trending news...');
    const trendingNews = await newsScrapeService.getTrendingNews();
    console.log(`✅ Found ${trendingNews.length} trending news articles`);

    // Test 5: Test category-specific news
    console.log('\n🏈 Test 5: Getting sports news...');
    const sportsNews = await newsScrapeService.getNewsByCategory('sports');
    console.log(`✅ Found ${sportsNews.length} sports news articles`);

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   General news: ${generalNews.length} articles`);
    console.log(`   Technology news: ${techNews.length} articles`);
    console.log(`   Trending news: ${trendingNews.length} articles`);
    console.log(`   Sports news: ${sportsNews.length} articles`);

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testNewsScraping().catch(console.error);
}

export { testNewsScraping };