import { GoogleSearchService, createGoogleSearchServiceFromEnv } from '../src/services/googleSearchService';

async function testGoogleSearch() {
  try {
    console.log('Testing Google Search Service...');

    const searchService = createGoogleSearchServiceFromEnv();

    if (!searchService.isConfigured()) {
      console.log('Google Search service is not configured. Please set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.');
      return;
    }

    console.log('Google Search service configured successfully.');

    // Test search
    const query = 'latest technology news';
    console.log(`\nSearching for: "${query}"`);

    const results = await searchService.search(query, 3);

    console.log(`\nFound ${results.length} results:`);
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.title}`);
      console.log(`   URL: ${result.link}`);
      console.log(`   Snippet: ${result.snippet.substring(0, 100)}...`);
    });

    // Test formatting
    console.log('\nFormatted results:');
    console.log(searchService.formatSearchResults(results));

  } catch (error) {
    console.error('Error testing Google Search:', error);
  }
}

// Run the test
testGoogleSearch();