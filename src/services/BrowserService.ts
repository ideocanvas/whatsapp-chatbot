import { KnowledgeBase } from '../memory/KnowledgeBase';
import { WebScrapeService } from './webScrapeService';

/**
 * Autonomous browser service that simulates "Person" browsing the web.
 * Accumulates knowledge independently of user input for proactive messaging.
 */
export class BrowserService {
  private dailyList: string[] = [
    'https://techcrunch.com',
    'https://news.ycombinator.com',
    'https://hongkongfp.com',
    'https://www.bbc.com/news/world',
    'https://www.cnbc.com/world'
  ];
  
  private visitedUrls: Set<string> = new Set();
  private maxPagesPerHour = 10;
  private pagesVisitedThisHour = 0;
  private lastSurfingSession: Date | null = null;
  private surfingStats = {
    totalSessions: 0,
    totalPagesVisited: 0,
    knowledgeLearned: 0
  };

  constructor(
    private scraper: WebScrapeService,
    private kb: KnowledgeBase
  ) {
    // Reset hourly counter
    setInterval(() => { 
      this.pagesVisitedThisHour = 0; 
      console.log('🔄 Browser hourly limit reset');
    }, 3600 * 1000);
  }

  /**
   * Main surfing method - autonomous knowledge acquisition
   */
  async surf(intent?: string): Promise<{ urlsVisited: string[]; knowledgeGained: number }> {
    if (this.pagesVisitedThisHour >= this.maxPagesPerHour) {
      console.log('💤 Browser resting (Rate limit reached)');
      return { urlsVisited: [], knowledgeGained: 0 };
    }

    // Determine surfing focus based on intent or random selection
    const urls = this.pickUrlsToSurf(intent);
    if (urls.length === 0) {
      console.log('🌐 No URLs to surf');
      return { urlsVisited: [], knowledgeGained: 0 };
    }

    const results = {
      urlsVisited: [] as string[],
      knowledgeGained: 0
    };

    for (const url of urls) {
      if (this.pagesVisitedThisHour >= this.maxPagesPerHour) break;

      try {
        console.log(`🌐 Bot is surfing: ${url}`);
        
        const result = await this.scraper.scrapeUrls([url], undefined, true); // Force mobile mode
        if (result.length === 0) continue;

        const scrapeResult = result[0];
        
        // Extract knowledge & Embed into long-term memory
        if (scrapeResult.content && scrapeResult.content.length > 100) {
          await this.kb.learnDocument({
            content: scrapeResult.content,
            source: url,
            tags: ['autonomous_browse', this.extractCategoryFromUrl(url)],
            timestamp: new Date(),
            category: this.extractCategoryFromUrl(url)
          });

          results.knowledgeGained++;
          this.surfingStats.knowledgeLearned++;
        }

        this.pagesVisitedThisHour++;
        this.visitedUrls.add(url);
        results.urlsVisited.push(url);
        this.surfingStats.totalPagesVisited++;

        console.log(`✅ Surfed ${url} - Learned: ${results.knowledgeGained} facts`);

        // Small delay between pages to simulate human browsing
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

      } catch (error) {
        console.error(`❌ Surfing failed for ${url}:`, error);
      }
    }

    this.lastSurfingSession = new Date();
    this.surfingStats.totalSessions++;
    
    console.log(`📊 Surfing session completed: ${results.urlsVisited.length} pages, ${results.knowledgeGained} facts learned`);

    return results;
  }

  /**
   * Pick URLs to surf based on intent or discovery patterns
   */
  private pickUrlsToSurf(intent?: string): string[] {
    const urls: string[] = [];

    if (intent) {
      // Intent-based surfing (e.g., "find tech news")
      urls.push(...this.dailyList.filter(url => 
        url.toLowerCase().includes(intent.toLowerCase()) ||
        this.urlMatchesIntent(url, intent)
      ));
    }

    // If no intent or no matches, use round-robin from daily list
    if (urls.length === 0) {
      const availableUrls = this.dailyList.filter(url => !this.visitedUrls.has(url));
      
      if (availableUrls.length > 0) {
        // Pick 1-3 random URLs from available list
        const count = Math.min(3, availableUrls.length);
        for (let i = 0; i < count; i++) {
          const randomIndex = Math.floor(Math.random() * availableUrls.length);
          urls.push(availableUrls[randomIndex]);
          // Remove to avoid duplicates in this session
          availableUrls.splice(randomIndex, 1);
        }
      } else {
        // All daily URLs visited, reset and start over
        this.visitedUrls.clear();
        console.log('🔄 Reset visited URLs (daily list exhausted)');
        return this.pickUrlsToSurf(intent); // Recursive call with reset
      }
    }

    return urls.slice(0, 3); // Limit to 3 URLs per session
  }

  /**
   * Check if URL matches surfing intent
   */
  private urlMatchesIntent(url: string, intent: string): boolean {
    const urlLower = url.toLowerCase();
    const intentLower = intent.toLowerCase();

    const categoryMapping: { [key: string]: string[] } = {
      'tech': ['tech', 'technology', 'hacker', 'programming'],
      'news': ['news', 'headlines', 'current', 'breaking'],
      'business': ['business', 'finance', 'market', 'economy'],
      'sports': ['sports', 'game', 'football', 'basketball'],
      'world': ['world', 'international', 'global']
    };

    for (const [category, keywords] of Object.entries(categoryMapping)) {
      if (intentLower.includes(category) || keywords.some(keyword => intentLower.includes(keyword))) {
        return keywords.some(keyword => urlLower.includes(keyword));
      }
    }

    return false;
  }

  /**
   * Extract category from URL for tagging
   */
  private extractCategoryFromUrl(url: string): string {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('tech') || urlLower.includes('hacker')) return 'tech';
    if (urlLower.includes('news') || urlLower.includes('headlines')) return 'news';
    if (urlLower.includes('business') || urlLower.includes('finance')) return 'business';
    if (urlLower.includes('sports') || urlLower.includes('game')) return 'sports';
    if (urlLower.includes('world') || urlLower.includes('international')) return 'world';
    
    return 'general';
  }

  /**
   * Get browsing statistics
   */
  getStats() {
    return {
      ...this.surfingStats,
      pagesVisitedThisHour: this.pagesVisitedThisHour,
      maxPagesPerHour: this.maxPagesPerHour,
      lastSurfingSession: this.lastSurfingSession,
      totalUrlsInMemory: this.visitedUrls.size
    };
  }

  /**
   * Force a surfing session with specific intent
   */
  async surfWithIntent(intent: string): Promise<{ urlsVisited: string[]; knowledgeGained: number }> {
    console.log(`🎯 Intent-based surfing: ${intent}`);
    return this.surf(intent);
  }

  /**
   * Check if browser can surf (rate limit check)
   */
  canSurf(): boolean {
    return this.pagesVisitedThisHour < this.maxPagesPerHour;
  }

  /**
   * Get time until next surfing session is available
   */
  getTimeUntilNextSurf(): number {
    if (this.canSurf()) return 0;
    
    // Calculate time until hourly reset (simplified)
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1);
    nextHour.setMinutes(0, 0, 0);
    
    return nextHour.getTime() - now.getTime();
  }
}