#!/usr/bin/env ts-node

import dotenv from 'dotenv';
dotenv.config();

import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../src/services/googleSearchService';
import { createWebScrapeService } from '../src/services/webScrapeService';
import { createNewsScrapeService, NewsArticle } from '../src/services/newsScrapeService';
import { OpenAIService, createOpenAIServiceFromEnv } from '../src/services/openaiService';

async function summarizeNewsWithLLM(openaiService: OpenAIService, articles: NewsArticle[]): Promise<string> {
  if (articles.length === 0) {
    return 'No news articles to summarize.';
  }

  try {
    const newsContent = articles.map((article, index) =>
      `Article ${index + 1}:
Title: ${article.title}
Source: ${article.source}
Category: ${article.category}
Content: ${article.content.substring(0, 500)}${article.content.length > 500 ? '...' : ''}`
    ).join('\n\n');

    const prompt = `Please provide a concise summary of the following news articles.
Focus on the key points and main developments. Format the summary in a clear, readable way.

${newsContent}

Summary:`;

    const summary = await openaiService.generateTextResponse(
      prompt,
      'You are a helpful assistant that summarizes news articles concisely and clearly. Focus on key points and main developments.'
    );

    return summary || 'Failed to generate summary.';
  } catch (error) {
    console.error('❌ LLM summarization failed:', error instanceof Error ? error.message : error || `${error}`);
    return 'Summary generation failed due to an error.';
  }
}

async function testNewsScraping() {
  console.log('🧪 Testing News Scraping Functionality\n');

  try {
    // Initialize services
    const googleSearchService = createGoogleSearchServiceFromEnv();
    const webScrapeService = createWebScrapeService();
    const newsScrapeService = createNewsScrapeService(googleSearchService, webScrapeService);
    const openaiService = createOpenAIServiceFromEnv();

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

    // Test 6: LLM Summarization
    console.log('\n🤖 Test 6: LLM News Summarization...');
    const articlesToSummarize = [...generalNews.slice(0, 2), ...techNews.slice(0, 1)].filter(Boolean);
    if (articlesToSummarize.length > 0) {
      const llmSummary = await summarizeNewsWithLLM(openaiService, articlesToSummarize);
      console.log('✅ LLM Summary generated:');
      console.log('📋 ' + llmSummary.replace(/\n/g, '\n   '));
    } else {
      console.log('⚠️  No articles available for LLM summarization');
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   General news: ${generalNews.length} articles`, generalNews);
    console.log(`   Technology news: ${techNews.length} articles`, techNews);
    console.log(`   Trending news: ${trendingNews.length} articles`, trendingNews);
    console.log(`   Sports news: ${sportsNews.length} articles`, sportsNews);
    console.log(`   LLM summarized: ${articlesToSummarize.length} articles`, articlesToSummarize);

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : `${error}`);
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