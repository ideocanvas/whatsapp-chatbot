# AI Web Scraping Usage Guide

## When to Use Web Scraping

The AI should actively use web scraping in the following scenarios:

### High Priority (Always Use Web Scrape)
- **News and Current Events**: "latest news about X", "current events in Y"
- **Specific URLs**: "check this website: https://example.com", "what's on this page"
- **Product Information**: "product details for iPhone", "price of Samsung TV"
- **Technical Documentation**: "React documentation", "Python API reference"
- **Blog Posts/Articles**: "read this article", "what does this blog post say"

### Medium Priority (Consider Web Scrape)
- **How-to Guides**: "how to cook pasta", "instructions for assembly"
- **Reviews**: "product reviews for MacBook", "customer feedback"
- **Tutorials**: "programming tutorial", "DIY guide"
- **Specifications**: "tech specs for camera", "system requirements"

### Low Priority (Use Judgement)
- **General Information**: "information about dogs", "facts about space"
- **Definitions**: "what is AI", "meaning of blockchain"

## Optimal Usage Patterns

### Pattern 1: Search + Scrape Combo
```javascript
// Step 1: Search for relevant URLs
const searchResults = await executeTool('google_search', {
  query: 'latest technology news',
  num_results: 3
});

// Step 2: Extract URLs and scrape content
const urls = extractUrlsFromSearchResults(searchResults);
const detailedContent = await executeTool('web_scrape', {
  urls: urls,
  selector: 'article'
});
```

### Pattern 2: Direct URL Scraping
```javascript
// When user provides specific URLs
await executeTool('web_scrape', {
  urls: ['https://example.com/article'],
  selector: '.content'
});
```

### Pattern 3: Multi-Source Verification
```javascript
// Scrape multiple sources for comprehensive information
await executeTool('web_scrape', {
  urls: [
    'https://news-site1.com/story',
    'https://news-site2.com/article',
    'https://blog-site3.com/post'
  ],
  selector: 'article'
});
```

## Best Practices for AI

### 1. Always Prefer Web Scrape Over Search Alone
When you find relevant URLs through search, ALWAYS use web_scrape to get the actual content rather than relying on search snippets.

### 2. Use Specific Selectors
- `article` - For news articles and blog posts
- `main` or `#main` - Main content areas
- `.content` or `#content` - Content containers
- Specific class/ID selectors when known

### 3. Combine Tools Intelligently
- Use `google_search` first to find relevant URLs
- Then use `web_scrape` to extract detailed content
- This provides the most accurate and comprehensive information

### 4. Handle Multiple URLs
When scraping multiple URLs, process them sequentially and combine the results for a comprehensive response.

### 5. Error Handling
- If web scraping fails, fall back to search results
- Log errors but continue with other URLs
- Provide graceful degradation in responses

## Example Prompts That Should Trigger Web Scraping

### High Priority Examples
- "What's the latest news about AI developments?"
- "Check this article: https://techcrunch.com/2024/01/01/ai-news"
- "What does this product page say about the new iPhone?"
- "Read this blog post and summarize it for me"

### Medium Priority Examples
- "Find me tutorials on React programming"
- "What are the reviews for this product?"
- "Get the specifications for this camera model"
- "What's in this documentation page?"

### Response Templates
When using web scraping, structure responses like:
```
Based on the latest information from [Website Name]:

[Summary of scraped content]

Source: [URL]
```

## Performance Considerations

- **Timeout**: 30 seconds per URL (configurable)
- **Content Limit**: 4000 characters per URL
- **Concurrency**: Sequential processing for reliability
- **Caching**: Consider implementing for frequent URLs

## Testing Web Scraping Usage

Test the AI's web scraping behavior with prompts like:
- "What's the latest technology news?"
- "Check this website: https://httpbin.org/html"
- "Find me information about climate change from reliable sources"
- "Read this article and tell me the main points"

## Monitoring and Optimization

Monitor these metrics:
- Web scrape tool usage frequency
- Success rate of web scraping operations
- Response quality improvement with web scraping
- Common errors and failure patterns

By following these guidelines, the AI will provide more accurate, current, and comprehensive responses by leveraging real-time web content extraction.