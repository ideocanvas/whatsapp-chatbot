import { KnowledgeBasePostgres } from '../memory/KnowledgeBasePostgres';
import { WebScrapeService } from './webScrapeService';
import { GoogleSearchService, createGoogleSearchServiceFromEnv } from './googleSearchService';
import { OpenAIService, createOpenAIServiceFromConfig } from './openaiService';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface FavoriteSite {
  url: string;
  category: string;
  lastVisited: number;
  visitCount: number;
  addedAt: number;
  source: 'default' | 'user_added' | 'discovered';
}

interface LinkTrackingEntry {
  url: string;
  lastScraped: number;
  contentHash: string;
}

interface SearchChecklistItem {
  query: string;
  reason: string;
}

export class BrowserService {
  private favorites: FavoriteSite[] = [];
  private linkTracker: Map<string, LinkTrackingEntry> = new Map();
  
  private googleSearch?: GoogleSearchService;
  private openai?: OpenAIService;
  
  // Persistence Paths
  private readonly DATA_DIR = path.join(process.cwd(), 'data');
  private readonly FAVORITES_PATH = path.join(process.cwd(), 'data', 'favorites.json');
  private readonly TRACKER_PATH = path.join(process.cwd(), 'data', 'link_tracker.json');

  // Limits
  private readonly MAX_PAGES_PER_HOUR = 20;
  private readonly LINK_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
  
  private pagesVisitedThisHour = 0;

  // New control flags
  private isSurfing: boolean = false;
  private stopSignal: boolean = false;

  // Default Favorites (Used if no file exists)
  private readonly DEFAULT_FAVORITES: FavoriteSite[] = [
    { url: 'https://news.ycombinator.com', category: 'tech', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' },
    { url: 'https://techcrunch.com', category: 'tech', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' },
    { url: 'https://www.bbc.com/news/world', category: 'world', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' },
    { url: 'https://hongkongfp.com', category: 'news', lastVisited: 0, visitCount: 0, addedAt: Date.now(), source: 'default' }
  ];

  constructor(
    private scraper: WebScrapeService,
    private kb: KnowledgeBasePostgres
  ) {
    this.initialize();
  }

  private async initialize() {
    this.loadFavorites();
    this.loadLinkTracker();
    
    try { this.openai = await createOpenAIServiceFromConfig(); } catch (e) { console.error('Browser: OpenAI init failed'); }
    try { this.googleSearch = createGoogleSearchServiceFromEnv(); } catch (e) { console.warn('Browser: Google Search not configured'); }

    // Hourly Reset
    setInterval(() => { 
        this.pagesVisitedThisHour = 0; 
        console.log('🔄 Browser hourly limit reset');
        this.saveLinkTracker(); // Periodic save
    }, 3600 * 1000);
  }

  /**
   * Signal the browser to stop the current surfing session immediately
   */
  public stopBrowsing() {
    if (this.isSurfing) {
      console.log('🛑 Interrupt signal received. Stopping autonomous browsing...');
      this.stopSignal = true;
    }
  }

  /**
   * Main Autonomous Surfing Loop
   */
  async surf(intent?: string): Promise<{ urlsVisited: string[]; knowledgeGained: number }> {
    // Reset flags
    this.stopSignal = false;
    this.isSurfing = true;

    if (this.pagesVisitedThisHour >= this.MAX_PAGES_PER_HOUR) {
        console.log('💤 Browser resting (Rate limit reached)');
        this.isSurfing = false;
        return { urlsVisited: [], knowledgeGained: 0 };
    }

    const results = { urlsVisited: [] as string[], knowledgeGained: 0 };

    try {
        // 1. Pick a Favorite Site (Hub)
        const hub = this.pickFavorite(intent);
        if (!hub) {
            console.log('🤔 No favorites available to visit.');
            this.isSurfing = false;
            return results;
        }

        // Check interrupt
        if (this.stopSignal) { this.isSurfing = false; return results; }

        console.log(`🌐 Browsing Hub: ${hub.url}`);
        
        // 2. Extract Article Candidates
        const candidates = await this.scraper.extractArticleLinks(hub.url);
        this.pagesVisitedThisHour++;
        hub.lastVisited = Date.now();
        hub.visitCount++;
        this.saveFavorites();

        console.log(`🔍 Found ${candidates.length} candidate articles on ${hub.url}`);

        // 3. Process Candidates (Shuffle to vary browsing)
        const shuffled = candidates.sort(() => 0.5 - Math.random()).slice(0, 5);

        for (const article of shuffled) {
            // CRITICAL: Check for interrupt signal before every action
            if (this.stopSignal) {
                console.log('🛑 Browsing loop interrupted.');
                break;
            }
            if (this.pagesVisitedThisHour >= this.MAX_PAGES_PER_HOUR) break;

            // 4. Check Stale/Tracker Status
            const trackInfo = this.linkTracker.get(article.url);
            const isStale = trackInfo && (Date.now() - trackInfo.lastScraped > this.LINK_STALE_THRESHOLD_MS);
            
            // Skip if visited recently (unless stale)
            if (trackInfo && !isStale) continue;

            // 5. Scrape Article
            try {
                console.log(`📖 Reading${isStale ? ' (Update Check)' : ''}: ${article.title}`);
                const result = await this.scraper.scrapeUrl(article.url, undefined, true);
                this.pagesVisitedThisHour++;
                results.urlsVisited.push(article.url);

                if (result.content.length < 300) {
                    console.log('⏩ Skipping: Content too short');
                    continue;
                }

                // 6. Calculate Hash
                const currentHash = createHash('md5').update(result.content).digest('hex');

                // 7. Check for Changes (Local)
                if (trackInfo && trackInfo.contentHash === currentHash) {
                    console.log('⏩ Skipping: Content unchanged');
                    this.updateLinkTracker(article.url, currentHash);
                    continue;
                }

                // 8. Check for Changes (Global KB)
                const globalExists = await this.kb.hasContentHash(currentHash);
                if (globalExists) {
                     console.log('⏩ Skipping: Content exists in KB (Duplicate/Syndicated)');
                     this.updateLinkTracker(article.url, currentHash);
                     continue;
                }

                console.log(`✨ New/Updated Content Found! (Hash: ${currentHash.substring(0,8)})`);

                // 9. Generate Google Search Checklist
                let finalContent = result.content;
                let tags = ['autonomous_browse', hub.category];
                if (trackInfo) tags.push('updated_content'); // Mark as update

                if (this.googleSearch && this.openai) {
                    const checklist = await this.generateSearchChecklist(article.title, result.content);
                    if (checklist.length > 0) {
                        console.log(`🕵️ Enrichment Checklist (${checklist.length} items)`);
                        const enrichmentData = await this.processChecklist(checklist);
                        if (enrichmentData) {
                            finalContent += `\n\n--- 🔍 Research Context ---\n${enrichmentData}`;
                            tags.push('enriched');
                        }
                    }
                }

                // 10. Save Knowledge
                await this.kb.learnDocument({
                    content: finalContent,
                    source: article.url,
                    category: hub.category,
                    tags: tags,
                    timestamp: new Date(),
                    contentHash: currentHash
                });

                results.knowledgeGained++;
                this.updateLinkTracker(article.url, currentHash);

                // 11. Discovery (Chance to add new domain to favorites)
                if (Math.random() < 0.05) {
                    this.maybeDiscoverNewFavorite(article.url, hub.category);
                }

            } catch (e) {
                console.error(`Failed to process article ${article.url}:`, e);
            }
        }
    } catch (e) {
        console.error('Error during surfing:', e);
    } finally {
        this.isSurfing = false;
        this.stopSignal = false;
    }
    
    this.saveLinkTracker();
    return results;
  }

  /**
   * Deep Research Task: Bypasses hourly limits to find specific answers
   * Performs: Search -> Scrape -> Summarize -> Repeat if needed
   */
  async performDeepResearch(query: string): Promise<string> {
    console.log(`🕵️ Starting Deep Research for: "${query}"`);
    
    if (!this.googleSearch || !this.openai) {
        return "Deep research unavailable (Missing Google Search or OpenAI configuration).";
    }

    let summary = "";
    const maxIterations = 2; // Prevent infinite loops
    let currentQuery = query;

    for (let i = 0; i < maxIterations; i++) {
        console.log(`🕵️ Deep Research Iteration ${i + 1}/${maxIterations}: Searching for "${currentQuery}"`);
        
        // 1. Google Search
        const searchResults = await this.googleSearch.search(currentQuery, 3);
        
        if (searchResults.length === 0) break;

        // 2. Scrape Top Results (Bypassing hourly limit logic by not incrementing pagesVisitedThisHour)
        const scrapedContents = [];
        for (const result of searchResults) {
            try {
                // Check interrupt just in case the user spams messages
                if (this.stopSignal) break;

                console.log(`📖 Deep Research Reading: ${result.title}`);
                const scrapeResult = await this.scraper.scrapeUrl(result.link, undefined, true); // Force mobile view
                if (scrapeResult.content.length > 200) {
                    scrapedContents.push(`Source: ${result.link}\nTitle: ${result.title}\nContent: ${scrapeResult.content.substring(0, 3000)}`);
                }
            } catch (e) {
                console.warn(`Failed to scrape ${result.link} for research`);
            }
        }

        if (scrapedContents.length === 0) {
             if (i === maxIterations - 1) return "I couldn't find any readable websites for your query. The search results were either blocked or contained no readable content.";
             continue;
        }

        // 3. Analyze & Synthesize
        const researchPrompt = `
        User Question: "${query}"
        
        I have gathered information from the following sources:
        ${scrapedContents.join('\n\n---\n\n')}

        Task:
        Provide a natural, conversational answer to the user's question based on the information gathered.
        If you can answer the question clearly, provide the answer in a friendly, WhatsApp-appropriate format.
        If the information is insufficient to answer the question, explain what you found and suggest what additional information might be needed.
        `;

        const response = await this.openai.generateTextResponse(researchPrompt);

        // Check if the response seems to answer the question (contains relevant information)
        const lowerResponse = response.toLowerCase();
        const lowerQuery = query.toLowerCase();
        
        // Simple heuristic: if response contains key terms from query and is substantial
        const queryWords = lowerQuery.split(/\s+/).filter(word => word.length > 3);
        const matchingWords = queryWords.filter(word => lowerResponse.includes(word));
        
        if (matchingWords.length >= queryWords.length * 0.5 && response.length > 50) {
            // Save this new knowledge to the DB for future speed
            await this.kb.learnDocument({
                content: `Deep Research on "${query}":\n${response.trim()}`,
                source: "deep_research_task",
                category: "research",
                tags: ["deep_research", "user_query"],
                timestamp: new Date()
            });
            
            return response.trim();
        } else {
            // Update query for next iteration if needed
            if (i < maxIterations - 1) {
                console.log(`🕵️ Information insufficient. Continuing research...`);
                // Try a more specific query for next iteration
                currentQuery = query + " detailed explanation";
                summary = "I found some related information but need to search more specifically.";
            } else {
                return response.trim(); // Return whatever we got
            }
        }
    }

    return "After searching multiple sources, I couldn't find a definitive answer to your question. The information available was either incomplete or didn't directly address your specific query.";
  }

  // --- Helpers ---

  private async generateSearchChecklist(title: string, content: string): Promise<SearchChecklistItem[]> {
    if (!this.openai) return [];
    // Ask LLM to create a checklist of things to verify
    const prompt = `Read this news article snippet. Identify 1-2 facts, technical terms, or historical events that need verification or more context. Return valid JSON array only: [{"query": "search query", "reason": "why"}] \n\nTitle: ${title}\nContent: ${content.substring(0, 1000)}...`;
    try {
        const raw = await this.openai.generateTextResponse(prompt);
        const jsonMatch = raw.match(/\[.*\]/s);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch (e) { return []; }
  }

  private async processChecklist(items: SearchChecklistItem[]): Promise<string> {
      if (!this.googleSearch) return '';
      let context = '';
      for (const item of items) {
          try {
              const results = await this.googleSearch.search(item.query, 2);
              if (results.length > 0) {
                  context += `Query: ${item.query} (${item.reason})\n` + results.map(r => `- ${r.title}: ${r.snippet}`).join('\n') + '\n\n';
              }
              await new Promise(r => setTimeout(r, 1000));
          } catch (e) {}
      }
      return context;
  }

  private pickFavorite(intent?: string): FavoriteSite | null {
      this.loadFavorites();
      let candidates = this.favorites;
      if (intent) {
          const filtered = candidates.filter(f => f.category.includes(intent.toLowerCase()) || f.url.includes(intent.toLowerCase()));
          if (filtered.length > 0) candidates = filtered;
      }
      candidates.sort((a, b) => a.lastVisited - b.lastVisited);
      // Wait at least 2 hours before revisiting same hub
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      const staleCandidates = candidates.filter(f => f.lastVisited < twoHoursAgo);
      return staleCandidates.length > 0 ? staleCandidates[0] : (intent && candidates.length > 0 ? candidates[0] : null);
  }

  private maybeDiscoverNewFavorite(url: string, category: string) {
      try {
          const urlObj = new URL(url);
          const rootUrl = `${urlObj.protocol}//${urlObj.hostname}`;
          if (!this.favorites.some(f => f.url === rootUrl)) {
              this.addFavorite(rootUrl, category, 'discovered');
          }
      } catch (e) {}
  }

  // --- Persistence ---

  public addFavorite(url: string, category: string, source: 'user_added' | 'discovered' = 'user_added') {
      if (this.favorites.some(f => f.url === url)) return;
      this.favorites.push({ url, category, lastVisited: 0, visitCount: 0, addedAt: Date.now(), source });
      this.saveFavorites();
      console.log(`⭐ New favorite added: ${url}`);
  }

  private updateLinkTracker(url: string, hash: string) {
      this.linkTracker.set(url, { url, lastScraped: Date.now(), contentHash: hash });
  }

  private loadFavorites() {
    try {
        if (!fs.existsSync(this.DATA_DIR)) fs.mkdirSync(this.DATA_DIR, { recursive: true });
        if (fs.existsSync(this.FAVORITES_PATH)) {
            this.favorites = JSON.parse(fs.readFileSync(this.FAVORITES_PATH, 'utf8'));
        } else {
            this.favorites = [...this.DEFAULT_FAVORITES];
            this.saveFavorites();
        }
    } catch (e) { this.favorites = [...this.DEFAULT_FAVORITES]; }
  }

  private saveFavorites() {
      try { fs.writeFileSync(this.FAVORITES_PATH, JSON.stringify(this.favorites, null, 2)); } catch (e) {}
  }

  private loadLinkTracker() {
      try {
          if (fs.existsSync(this.TRACKER_PATH)) {
              const data = JSON.parse(fs.readFileSync(this.TRACKER_PATH, 'utf8'));
              this.linkTracker = new Map(data.map((i: any) => [i.url, i]));
          }
      } catch (e) { console.error('Error loading link tracker', e); }
  }

  private saveLinkTracker() {
      try {
          const data = Array.from(this.linkTracker.values());
          fs.writeFileSync(this.TRACKER_PATH, JSON.stringify(data, null, 2));
      } catch (e) { console.error('Error saving link tracker', e); }
  }

  getStats() {
      return {
          favoritesCount: this.favorites.length,
          pagesVisitedThisHour: this.pagesVisitedThisHour,
          mostVisited: this.favorites.sort((a,b) => b.visitCount - a.visitCount)[0]?.url
      };
  }
}