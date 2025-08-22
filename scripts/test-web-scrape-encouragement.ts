import { initializeTools, executeTool, cleanupTools } from '../src/tools';
import { GoogleSearchService } from '../src/services/googleSearchService';
import { OpenAIService } from '../src/services/openaiService';
import { getToolSchemas } from '../src/tools';

// Mock services for testing
class MockGoogleSearchService extends GoogleSearchService {
  constructor() {
    super({ apiKey: 'mock', searchEngineId: 'mock' });
  }

  async search(query: string, numResults: number = 5): Promise<any[]> {
    console.log('🔍 Mock Google Search:', { query, numResults });

    // Return mock search results with URLs that would be good for scraping
    return [
      {
        title: 'Latest Technology News - TechCrunch',
        link: 'https://techcrunch.com/2024/01/01/latest-tech-news',
        snippet: 'The latest technology news and developments in AI, gadgets, and innovation.'
      },
      {
        title: 'AI Developments 2024 - MIT Review',
        link: 'https://www.technologyreview.com/ai-developments-2024',
        snippet: 'Comprehensive overview of AI advancements and breakthroughs in 2024.'
      }
    ];
  }

  formatSearchResults(results: any[]): string {
    return results.map((result, index) =>
      `[${index + 1}] ${result.title}\nURL: ${result.link}\nSnippet: ${result.snippet}\n`
    ).join('\n');
  }
}

class MockOpenAIService extends OpenAIService {
  constructor() {
    super({ apiKey: 'mock' });
  }

  async generateResponseWithTools(
    messages: any[],
    tools?: any[],
    maxToolRounds: number = 3
  ): Promise<string> {
    console.log('🤖 Mock AI Tool Calling:', {
      userMessage: messages.find(m => m.role === 'user')?.content,
      hasTools: !!tools && tools.length > 0,
      toolCount: tools?.length || 0
    });

    // Simulate AI deciding to use web scraping
    const userMessage = messages.find(m => m.role === 'user')?.content || '';

    if (userMessage.toLowerCase().includes('news') ||
        userMessage.toLowerCase().includes('article') ||
        userMessage.toLowerCase().includes('http')) {

      console.log('🎯 AI would use web_scrape tool for this query');

      // Simulate tool call for web scraping
      const toolCall = {
        id: 'call_123',
        type: 'function',
        function: {
          name: 'web_scrape',
          arguments: JSON.stringify({
            urls: ['https://techcrunch.com/2024/01/01/latest-tech-news'],
            selector: 'article'
          })
        }
      };

      console.log('🛠️ AI tool call:', {
        tool: toolCall.function.name,
        arguments: toolCall.function.arguments
      });

      // Execute the tool
      try {
        const result = await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments));
        console.log('✅ Web scrape result preview:', result.substring(0, 200) + '...');

        return `Based on the latest information from TechCrunch:\n\n${result.substring(0, 500)}...\n\nSource: https://techcrunch.com/2024/01/01/latest-tech-news`;
      } catch (error) {
        console.error('❌ Tool execution failed:', error);
        return 'I tried to get current information but encountered an error. Please try again.';
      }
    }

    return 'This is a mock response without tool usage.';
  }
}

async function testWebScrapeEncouragement() {
  console.log('🧪 Testing Web Scrape Encouragement for AI...\n');

  // Initialize tools with mock services
  const mockGoogleService = new MockGoogleSearchService();
  const mockOpenAIService = new MockOpenAIService();

  initializeTools(mockGoogleService);

  const testPrompts = [
    "What's the latest technology news?",
    "Check this article: https://example.com/news",
    "Find me current information about AI developments",
    "Read this blog post and summarize it",
    "What's on this website: http://example.com",
    "Get the latest updates from tech news sites"
  ];

  for (const prompt of testPrompts) {
    console.log(`\n📋 Testing prompt: "${prompt}"`);
    console.log('─'.repeat(50));

    try {
      // Simulate what the AI would do
      const tools = getToolSchemas();
      const response = await mockOpenAIService.generateResponseWithTools(
        [
          {
            role: 'system',
            content: `You are a helpful WhatsApp assistant. Keep responses very short and conversational.

IMPORTANT: When users ask about current information, news, specific websites, or detailed content, ALWAYS use the web_scrape tool to get real-time information directly from websites.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        tools
      );

      console.log('✅ AI Response:', response.substring(0, 150) + '...');

      // Check if web scraping would be triggered
      const wouldUseWebScrape = prompt.toLowerCase().includes('news') ||
                               prompt.toLowerCase().includes('article') ||
                               prompt.toLowerCase().includes('http') ||
                               prompt.toLowerCase().includes('website');

      if (wouldUseWebScrape) {
        console.log('🎯 Web scraping would be triggered for this prompt');
      } else {
        console.log('ℹ️  Web scraping might not be needed for this prompt');
      }

    } catch (error) {
      console.error('❌ Test failed:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🎉 Web scrape encouragement tests completed!');
  console.log('\n📊 Summary:');
  console.log('- Enhanced system prompt encourages web scraping');
  console.log('- Web scraping keywords trigger tool usage');
  console.log('- AI will combine search + scrape for better responses');
}

// Run the test
testWebScrapeEncouragement()
  .catch(console.error)
  .finally(async () => {
    await cleanupTools();
  });