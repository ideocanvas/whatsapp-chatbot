import { OpenAIService } from './openaiService';
import { GoogleSearchService } from './googleSearchService';
import { VectorStoreServicePostgres } from './VectorStoreServicePostgres';
import { NewsArticle } from './newsScrapeService';

export class NewsProcessorService {
  private openaiService: OpenAIService;
  private googleService: GoogleSearchService;
  private vectorStore: VectorStoreServicePostgres;

  constructor(
    openaiService: OpenAIService,
    googleService: GoogleSearchService,
    vectorStore: VectorStoreServicePostgres
  ) {
    this.openaiService = openaiService;
    this.googleService = googleService;
    this.vectorStore = vectorStore;
  }

  /**
   * Analyzes an article, enriches it with Google Search if complex, and learns it.
   */
  async processAndLearn(article: NewsArticle, category: string): Promise<void> {
    try {
      console.log(`🤔 Learning: ${article.title}`);

      // 1. Check if we need to search Google (same as before)
      const analysisPrompt = `
        Analyze this news article.
        1. Summarize the key facts in 2 sentences.
        2. Identify if this topic requires more context to be fully understood (e.g., technical terms, historical context, stock symbols).
        3. If yes, generate a specific search query. If no, output "NO_SEARCH".
        
        Article:
        ${article.title}
        ${article.content.substring(0, 1000)}
      `;

      const analysis = await this.openaiService.generateTextResponse(analysisPrompt);
      
      let fullContent = `Title: ${article.title}\n\n${article.content}`;
      let sourceLabel = 'web_scrape';

      // 2. Enrichment Step (Google Search)
      // If the LLM suggests a search (and it's not NO_SEARCH), we enrich.
      const searchMatch = analysis.match(/Search Query: "(.*)"/i) || analysis.split('\n').pop()?.match(/"(.*)"/);
      
      if (!analysis.includes("NO_SEARCH") && searchMatch) {
        const query = searchMatch[1];
        console.log(`🔍 Enriching knowledge with Google Search: ${query}`);
        
        const searchResults = await this.googleService.search(query, 3);
        const searchContext = this.googleService.formatSearchResults(searchResults);

        // Append context to the content we want to save
        fullContent += `\n\n--- Additional Context from Google Search ---\n${searchContext}`;
        sourceLabel = 'web_scrape_enriched';
      }

      // 3. Store in Vector DB (The DB handles chunking and embedding now)
      await this.vectorStore.addDocument(fullContent, {
        source: sourceLabel,
        date: new Date().toISOString().split('T')[0],
        category: category,
        title: article.title
      });

    } catch (error) {
      console.error('Error processing news for learning:', error);
    }
  }
}