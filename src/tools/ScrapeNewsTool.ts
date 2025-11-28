import { BaseTool } from '../core/BaseTool';
import { NewsScrapeService } from '../services/newsScrapeService';

export class ScrapeNewsTool extends BaseTool {
  name = 'scrape_news';
  description = 'Get the latest headlines and news summaries. Use this when the user asks for news, updates, or current events.';
  
  parameters = {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['general', 'tech', 'business', 'sports', 'world'],
        description: 'The category of news to fetch (default: general)',
      }
    },
    required: ['category'],
    additionalProperties: false,
  };

  constructor(private newsService: NewsScrapeService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const category = args.category || 'general';
    return this.newsService.getCachedNews(category);
  }
}