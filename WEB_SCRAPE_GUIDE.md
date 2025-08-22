# Web Scraping Tool Guide

## Overview

The WhatsApp ChatBot now includes a powerful web scraping tool that uses Playwright to extract real-time information from websites. This tool complements the existing Google Search functionality by allowing direct access to specific web content.

## Features

- **Real-time Content Extraction**: Scrape current information directly from websites
- **JavaScript Support**: Handles modern, JavaScript-heavy websites using Playwright
- **Selector Targeting**: Extract specific content using CSS selectors
- **Multiple URL Support**: Scrape content from multiple URLs in a single operation
- **Automatic Content Cleaning**: Clean and format extracted content for LLM consumption

## Tool Schema

The web scraping tool is available as `web_scrape` with the following parameters:

```json
{
  "name": "web_scrape",
  "description": "Scrape content from specific URLs to get real-time information from websites. Useful for getting current data, news articles, or specific page content.",
  "parameters": {
    "type": "object",
    "properties": {
      "urls": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "description": "Array of URLs to scrape content from"
      },
      "selector": {
        "type": "string",
        "description": "Optional CSS selector to target specific content on the page (e.g., \"article\", \".content\", \"#main\")"
      }
    },
    "required": ["urls"],
    "additionalProperties": false
  }
}
```

## Usage Examples

### Basic URL Scraping
```javascript
// Scrape content from a news website
const result = await executeTool('web_scrape', {
  urls: ['https://example.com/news/article']
});
```

### Targeted Content Extraction
```javascript
// Extract only the article content using a CSS selector
const result = await executeTool('web_scrape', {
  urls: ['https://example.com/news/article'],
  selector: 'article .content'
});
```

### Multiple URL Scraping
```javascript
// Scrape content from multiple news sources
const result = await executeTool('web_scrape', {
  urls: [
    'https://news-site1.com/latest',
    'https://news-site2.com/breaking',
    'https://news-site3.com/headlines'
  ]
});
```

## Common Selectors

Here are some useful CSS selectors for common content extraction:

- `article` - Main article content
- `main` - Main content area
- `.content` - Content container
- `#content` - Content container by ID
- `h1, h2, h3` - Headings
- `p` - Paragraph text
- `.article-body` - Article body content
- `.news-content` - News content container

## Integration with Google Search

The web scraping tool works seamlessly with the existing Google Search tool:

1. **Search First**: Use `google_search` to find relevant URLs
2. **Scrape Content**: Use `web_scrape` to extract detailed content from the found URLs
3. **Combine Results**: Use both tools together for comprehensive information gathering

Example workflow:
```javascript
// Step 1: Search for recent news
const searchResults = await executeTool('google_search', {
  query: 'latest technology news',
  num_results: 5
});

// Step 2: Extract URLs from search results and scrape content
const urls = extractUrlsFromSearchResults(searchResults);
const detailedContent = await executeTool('web_scrape', {
  urls: urls,
  selector: 'article'
});
```

## Performance Considerations

- **Timeout**: Default timeout is 30 seconds per URL
- **Content Limit**: Extracted content is limited to 4000 characters per URL
- **Concurrency**: Multiple URLs are processed sequentially for reliability
- **Caching**: Consider implementing caching for frequently accessed URLs

## Error Handling

The tool includes comprehensive error handling:
- Invalid URLs are skipped with warnings
- Selector not found errors are handled gracefully
- Network timeouts are caught and reported
- Browser initialization errors are properly handled

## Testing

Test scripts are available:
```bash
# Test the web scraping service
npm run test:web-scrape

# Test the tool integration
npm run test:web-scrape-tool
```

## Dependencies

- **Playwright**: Browser automation library
- **TypeScript**: Type definitions and development
- **Axios**: HTTP requests (already in project)

The web scraping tool enhances the chatbot's ability to provide real-time, current information by directly accessing and extracting content from websites, making it a valuable addition to the existing search capabilities.