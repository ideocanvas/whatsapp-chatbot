import axios from 'axios';

export interface GoogleSearchConfig {
  apiKey: string;
  searchEngineId: string;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  image?: string;
  pubDate?: string;
}

export class GoogleSearchService {
  private config: GoogleSearchConfig;

  constructor(config: GoogleSearchConfig) {
    this.config = config;
  }

  /**
   * Perform a Google News search by fetching the Google News RSS feed
   * and parsing items. This avoids adding an XML dependency.
   */
  async searchNews(query: string, numResults: number = 5): Promise<SearchResult[]> {
    try {
      console.log('📰 Making Google News RSS Request:', { query: query, numResults });

      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const response = await axios.get(rssUrl, { responseType: 'text' });
      const xml = response.data as string;

      const items: SearchResult[] = [];
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match: RegExpExecArray | null;

      while ((match = itemRegex.exec(xml)) && items.length < numResults) {
        const itemXml = match[1];
        const title = this.extractTag(itemXml, 'title') || 'No title';
        const description = this.extractTag(itemXml, 'description') || '';

        // Prefer the original article URL from <source url="...">, then the anchor inside description, then the <link>
        const sourceUrl = this.extractSourceUrl(itemXml);
        const descAnchor = this.extractHrefFromDescription(description);
        const link = (sourceUrl || descAnchor || this.extractTag(itemXml, 'link') || this.extractTag(itemXml, 'guid') || '').trim();
        const image = this.extractImageUrl(itemXml) || null;
        const pubDate = this.extractTag(itemXml, 'pubDate') || null;

        items.push({
          title: this.decodeHtmlEntities(title).trim(),
          link: link.trim(),
          snippet: this.stripHtml(this.decodeHtmlEntities(description)).trim(),
          image: image || undefined,
          pubDate: pubDate ? pubDate.trim() : undefined,
        });
      }

      console.log('📊 Google News RSS parsed:', { query, itemsFound: items.length });

      return items;
    } catch (error) {
      console.error('❌ Google News fetch error:', {
        error: error instanceof Error ? error.message : `${error}`,
        query,
      });
      throw new Error('Failed to fetch Google News RSS');
    }
  }

  /**
   * Perform a Google search using the Custom Search JSON API
   */
  async search(query: string, numResults: number = 5, startIndex: number = 1): Promise<SearchResult[]> {
    try {
      console.log('🌐 Making Google API Request:', {
        query: query,
        numResults: numResults,
        startIndex: startIndex,
        engineId: this.config.searchEngineId.substring(0, 10) + '...'
      });

      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: this.config.apiKey,
          cx: this.config.searchEngineId,
          q: query,
          num: Math.min(numResults, 10), // Google API max is 10 results per request
          start: startIndex,
        },
      });

      const items = response.data.items || [];

      console.log('📊 Google API Response:', {
        query: query,
        totalResults: response.data.searchInformation?.totalResults || 0,
        itemsFound: items.length,
        startIndex: startIndex,
        items: items.map((item: any) => ({
          title: item.title?.substring(0, 30) + (item.title?.length > 30 ? '...' : ''),
          link: item.link?.substring(0, 30) + (item.link?.length > 30 ? '...' : '')
        }))
      });

      if (items.length > 0) {
        return items.map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet,
        }));
      }

      return [];
    } catch (error) {
      console.error('❌ Google search error:', {
        error: error instanceof Error ? error.message : `${error}`,
        query: query,
        startIndex: startIndex
      });
      throw new Error('Failed to perform Google search');
    }
  }

  /**
   * Perform multiple Google search requests to get more results
   */
  async searchMultiple(query: string, totalResults: number = 10): Promise<SearchResult[]> {
    const maxPerRequest = 10;
    const results: SearchResult[] = [];
    let startIndex = 1;
    let requestsMade = 0;
    const maxRequests = 3; // Limit to avoid excessive API calls

    while (results.length < totalResults && requestsMade < maxRequests) {
      const resultsNeeded = totalResults - results.length;
      const numResults = Math.min(resultsNeeded, maxPerRequest);

      try {
        const batchResults = await this.search(query, numResults, startIndex);
        results.push(...batchResults);

        if (batchResults.length < numResults) {
          break; // No more results available
        }

        startIndex += batchResults.length;
        requestsMade++;

        // Add small delay between requests to avoid rate limiting
        if (requestsMade < maxRequests && results.length < totalResults) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.warn('⚠️ Partial Google search failure:', {
          error: error instanceof Error ? error.message : `${error}`,
          query: query,
          startIndex: startIndex
        });
        break; // Continue with partial results
      }
    }

    // Remove duplicates by URL
    const uniqueResults = results.filter((result, index, self) =>
      index === self.findIndex(r => r.link === result.link)
    );

    console.log('📈 Multiple search requests completed:', {
      query: query,
      totalRequested: totalResults,
      totalObtained: uniqueResults.length,
      requestsMade: requestsMade
    });

    return uniqueResults.slice(0, totalResults);
  }

  /**
   * Format search results for LLM consumption
   */
  formatSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
      return 'No search results found.';
    }

    return results.map((result, index) =>
      `[${index + 1}] ${result.title}\n${result.link}\n${result.snippet}\n`
    ).join('\n');
  }

  // --- Small helpers for RSS parsing ---
  private extractTag(xml: string, tag: string): string | null {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const m = re.exec(xml);
    return m && m[1] ? m[1] : null;
  }

  private extractSourceUrl(xml: string): string | null {
    const m = /<source\s+url=["']([^"']+)["'][^>]*>/i.exec(xml);
    return m && m[1] ? m[1] : null;
  }

  private extractHrefFromDescription(description: string): string | null {
    if (!description) return null;
    const m = /href=\"([^\"]+)\"|href=\'([^\']+)\'/i.exec(description);
    if (!m) return null;
    return m[1] || m[2] || null;
  }

  private extractImageUrl(xml: string): string | null {
    // Try common RSS/media tags
    const mediaContent = /<media:content[^>]*url=["']([^"']+)["'][^>]*>/i.exec(xml);
    if (mediaContent && mediaContent[1]) return mediaContent[1];

    const mediaThumb = /<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i.exec(xml);
    if (mediaThumb && mediaThumb[1]) return mediaThumb[1];

    const enclosure = /<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i.exec(xml);
    if (enclosure && enclosure[1]) return enclosure[1];

    // Fallback: look for <img src="..."> inside description
    const desc = this.extractTag(xml, 'description') || '';
    const imgInDesc = /<img[^>]*src=["']([^"']+)["'][^>]*>/i.exec(desc);
    if (imgInDesc && imgInDesc[1]) return imgInDesc[1];

    return null;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private decodeHtmlEntities(str: string): string {
    if (!str) return str;
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'");
  }

  /**
   * Fetch full article text for a given URL. Attempts to follow canonical redirects
   * and extract the main article or largest paragraph blocks. Returns a cleaned
   * plain-text version of the article (may be truncated on very long pages).
   */
  async fetchFullArticle(url: string, timeoutMs: number = 8000): Promise<string> {
    try {
      const res = await axios.get(url, { responseType: 'text', timeout: timeoutMs, maxRedirects: 5 });
      let html = String(res.data || '');

      // Try to find canonical link and fetch that instead (often points to original article)
      const canonicalMatch = /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i.exec(html);
      if (canonicalMatch && canonicalMatch[1]) {
        const canonical = canonicalMatch[1];
        if (!canonical.includes('news.google')) {
          try {
            const res2 = await axios.get(canonical, { responseType: 'text', timeout: timeoutMs, maxRedirects: 5 });
            html = String(res2.data || '');
          } catch (e) {
            // ignore and fall back to original HTML
          }
        }
      }

      // remove scripts/styles
      const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');

      // Prefer <article> content
      const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned);
      if (articleMatch && articleMatch[1]) {
        return this.truncateText(this.stripHtml(this.decodeHtmlEntities(articleMatch[1])));
      }

      // Otherwise collect <p> tags and pick the largest contiguous block
      const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      const paragraphs: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = pRegex.exec(cleaned))) {
        const text = this.stripHtml(this.decodeHtmlEntities(m[1] || ''));
        if (text) paragraphs.push(text);
      }

      if (paragraphs.length > 0) {
        // find the longest contiguous sequence of paragraphs (heuristic)
        let bestStart = 0;
        let bestLen = 0;
        for (let i = 0; i < paragraphs.length; i++) {
          let len = 0;
          for (let j = i; j < Math.min(paragraphs.length, i + 20); j++) {
            len += paragraphs[j].length;
          }
          if (len > bestLen) { bestLen = len; bestStart = i; }
        }

        const chosen = paragraphs.slice(bestStart, bestStart + 20).join('\n\n');
        if (chosen.length > 50) return this.truncateText(chosen);
      }

      // Fallback to meta description
      const metaMatch = /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
      if (metaMatch && metaMatch[1]) return this.truncateText(this.decodeHtmlEntities(metaMatch[1]));

      return this.truncateText(this.stripHtml(this.decodeHtmlEntities(cleaned)).slice(0, 4000));
    } catch (error) {
      console.warn('⚠️ fetchFullArticle failed for URL:', url, error instanceof Error ? error.message : `${error}`);
      throw error;
    }
  }

  /**
   * Attempt to extract an article image (og:image, twitter:image, image_src) from the page HTML.
   */
  async fetchImageFromUrl(url: string, timeoutMs: number = 8000): Promise<string | null> {
    try {
      const res = await axios.get(url, { responseType: 'text', timeout: timeoutMs, maxRedirects: 5 });
      const html = String(res.data || '');

      const og = /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
      if (og && og[1]) return og[1];

      const tw = /<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i.exec(html);
      if (tw && tw[1]) return tw[1];

      const linkImg = /<link[^>]*rel=["']image_src["'][^>]*href=["']([^"']+)["'][^>]*>/i.exec(html);
      if (linkImg && linkImg[1]) return linkImg[1];

      // fallback: first <img src=...> in body
      const img = /<img[^>]*src=["']([^"']+)["'][^>]*>/i.exec(html);
      if (img && img[1]) return img[1];

      return null;
    } catch (error) {
      // don't throw — image extraction is best-effort
      console.warn('⚠️ fetchImageFromUrl failed for URL:', url, error instanceof Error ? error.message : `${error}`);
      return null;
    }
  }

  private truncateText(text: string, maxChars: number = 20000): string {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n...[truncated]';
  }

  /**
   * Fetch Google News RSS items and replace snippets with full article text.
   * Returns the same `SearchResult[]` but with `snippet` containing full story.
   */
  async searchNewsFull(query: string, numResults: number = 5): Promise<SearchResult[]> {
    const items = await this.searchNews(query, numResults);
    const results: SearchResult[] = [];

    // Fetch full articles with a small concurrency limit
    const concurrency = 3;
    let index = 0;

    const workers: Promise<void>[] = [];
    const doWork = async () => {
      while (index < items.length) {
        const i = index++;
        const item = items[i];

        let full = item.snippet || '';
        let image = item.image || undefined;

        if (item.link) {
          try {
            full = await this.fetchFullArticle(item.link);
          } catch (e) {
            console.warn('⚠️ Could not fetch full article, keeping RSS snippet for:', item.link);
          }

          // If RSS didn't include an image, try extracting og:image/twitter:image from the article page
          if (!image) {
            try {
              const img = await this.fetchImageFromUrl(item.link);
              if (img) image = img;
            } catch (e) {
              // ignore
            }
          }
        }

        results[i] = {
          title: item.title,
          link: item.link,
          snippet: full || item.snippet,
          image: image,
          pubDate: (item as any).pubDate,
        };
      }
    };

    for (let w = 0; w < concurrency; w++) workers.push(doWork());
    await Promise.all(workers);

    return results.filter(Boolean).slice(0, numResults);
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey && !!this.config.searchEngineId;
  }
}

// Helper function to create GoogleSearchService instance from environment variables
export function createGoogleSearchServiceFromEnv(): GoogleSearchService {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    throw new Error('GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables are required');
  }

  return new GoogleSearchService({
    apiKey,
    searchEngineId,
  });
}