# Tool Calling and Google Search Integration Guide

This guide explains how to set up and use the tool calling functionality with Google Search integration in your WhatsApp chatbot.

## Overview

The tool calling system allows your chatbot to:
- Perform web searches using Google Custom Search API
- Integrate search results into LLM responses
- Handle tool execution and response processing automatically

## Setup Requirements

### 1. Google Custom Search API

To enable web search functionality, you need to set up Google Custom Search:

1. **Create a Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one

2. **Enable Custom Search API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Custom Search API"
   - Click "Enable"

3. **Create API Key**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key

4. **Create Search Engine**:
   - Visit [Programmable Search Engine](https://programmablesearchengine.google.com/about/)
   - Create a new search engine
   - Configure search settings (you can search the entire web)
   - Copy the Search Engine ID

### 2. Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Google Custom Search API Configuration
GOOGLE_SEARCH_API_KEY=your_google_search_api_key_here
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id_here

# Enable/Disable Tool Calling (default: true)
OPENAI_ENABLE_TOOL_CALLING=true
```

## How It Works

### Tool Calling Flow

1. **Message Analysis**: The system analyzes incoming messages for search-related keywords
2. **Tool Selection**: If search is needed, the system uses OpenAI's tool calling functionality
3. **Search Execution**: The Google search tool is executed with the appropriate query
4. **Response Generation**: Search results are incorporated into the final response
5. **Response Cleaning**: Tool call artifacts are removed from the final output

### Search Trigger Keywords

The system automatically triggers search for messages containing:
- Current/latest information requests
- News and updates
- "What is", "Who is", "When is", "Where is", "How to"
- Search/find/look up requests
- Weather, stock prices, scores, results

## Usage Examples

### Example 1: Current Information Request
**User**: "What's the latest news about AI?"
**Bot**: (Performs Google search for "latest AI news") → Provides summarized results

### Example 2: Factual Query
**User**: "Who won the last World Cup?"
**Bot**: (Searches for "last World Cup winner") → Provides accurate answer

### Example 3: Weather Information
**User**: "What's the weather in Tokyo today?"
**Bot**: (Searches for "Tokyo weather today") → Provides weather information

## Configuration Options

### Customizing Search Behavior

You can modify the search trigger logic in [`src/handlers/messageHandler.ts`](src/handlers/messageHandler.ts:227-240):

```typescript
private shouldUseSearch(messageText: string): boolean {
  // Add or remove keywords as needed
  const searchKeywords = [
    'current', 'latest', 'news', 'today', 'recent', 'update',
    'what is', 'who is', 'when is', 'where is', 'how to',
    'search', 'find', 'look up', 'information about',
    'weather', 'stock', 'price', 'score', 'results'
  ];
  return searchKeywords.some(keyword => lowerMessage.includes(keyword));
}
```

### Response Formatting

Search result formatting can be customized in [`src/services/googleSearchService.ts`](src/services/googleSearchService.ts:54-62):

```typescript
formatSearchResults(results: SearchResult[]): string {
  // Customize the output format
  return results.map((result, index) =>
    `[${index + 1}] ${result.title}\n${result.link}\n${result.snippet}\n`
  ).join('\n');
}
```

## Testing

### Test Google Search

Run the test script to verify your Google Search setup:

```bash
npm run test:google-search
```

### Test Tool Integration

You can test the complete tool calling flow by sending messages that trigger search functionality.

## Troubleshooting

### Common Issues

1. **API Key Errors**: Verify your Google Search API key and Search Engine ID
2. **Rate Limiting**: Google Search API has usage limits; monitor your usage
3. **Search Results Empty**: Check if your search engine is configured to search the entire web
4. **Tool Calling Not Working**: Ensure `OPENAI_ENABLE_TOOL_CALLING=true` is set

### Debug Mode

Enable debug logging by setting environment variables:

```bash
DEBUG=tools,search
```

## Performance Considerations

- **Response Time**: Web searches add latency; typical response times are 2-5 seconds
- **Cost**: Google Custom Search API has free tier limits; monitor usage for cost control
- **Caching**: Consider implementing result caching for frequent queries

## Security Considerations

- Keep API keys secure in environment variables
- Validate and sanitize search queries to prevent abuse
- Monitor search usage for suspicious patterns

## Extending Functionality

You can add more tools by:

1. Creating new tool functions in [`src/tools/index.ts`](src/tools/index.ts)
2. Adding tool schemas for OpenAI function calling
3. Updating the tool initialization in the message handler

Example additional tools could include:
- Calculator functions
- Unit conversions
- Translation services
- Database queries

## Support

For issues with this implementation, check:
- Google Custom Search API documentation
- OpenAI tool calling documentation
- Project README for general setup instructions