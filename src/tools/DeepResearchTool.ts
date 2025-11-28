// src/tools/DeepResearchTool.ts
import { BaseTool } from '../core/BaseTool';
import { BrowserService } from '../services/BrowserService';

export class DeepResearchTool extends BaseTool {
  name = 'deep_research';
  description = 'Perform an extensive, deep online research task. Use this ONLY when standard "web_search" or "search_knowledge" fails to provide a sufficient answer. This tool takes longer but searches and reads multiple websites.';
  
  parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The specific question or topic to research deeply.',
      }
    },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private browserService: BrowserService) {
    super();
  }

  async execute(args: any): Promise<string> {
    const { query } = args;
    // Note: The Agent will call this, which calls the BrowserService logic
    return await this.browserService.performDeepResearch(query);
  }
}