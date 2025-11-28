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
   * Main Autonomous Surfing Loop
   */
  async surf(intent?: string): Promise<{ urlsVisited: string[]; knowledgeGained: number }> {
    if (this.pagesVisitedThisHour >= this.MAX_PAGES_PER_HOUR) {
        console.log('💤 Browser resting (Rate limit reached)');
        return { urlsVisited: [], knowledgeGained: 0 };
    }

    const results = { urlsVisited: [] as string[], knowledgeGained: 0 };

    // 1. Pick a Favorite Site (Hub)
    const hub = this.pickFavorite(intent);
    if (!hub) {
        console.log('🤔 No favorites available to visit.');
        return results;
    }

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
    
    this.saveLinkTracker();
    return results;
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