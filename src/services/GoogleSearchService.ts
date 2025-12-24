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
  // The original RSS/feed URL that produced this item (with locale params removed)
  feedUrl?: string;
  // Full article text fetched separately (keeps RSS snippet intact)
  fullText?: string;
  // The original link value provided by the RSS item (may be a domain root)
  originalLink?: string;
}

export interface NewsSourceGroup {
  /** The exact RSS URL fetched */
  sourceUrl: string;
  /** Normalized feed URL (no hl/gl/ceid) */
  feedUrl: string;
  items: SearchResult[];
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
  async searchNews(query?: string | null, numResults: number = 5): Promise<SearchResult[]> {
    try {
      console.log('📰 Making Google News RSS Request(s):', { query: query || '<none>', numResults });

      // Curated Google News feeds (Chinese + English; US + World + China + Hong Kong)
      const rssUrls = this.buildNewsRssUrls(query);
      const uniqRssUrls = Array.from(new Set(rssUrls));

      const items: SearchResult[] = [];

      // Fetch each RSS URL in sequence and collect up to `numResults` items per source
      for (const url of uniqRssUrls) {
        try {
          const response = await axios.get(url, { responseType: 'text' });
          const xml = response.data as string;
          const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
          let match: RegExpExecArray | null;
          let perSourceCount = 0;
          while ((match = itemRegex.exec(xml)) && perSourceCount < numResults) {
            const itemXml = match[1];
            // normalize feed URL (strip locale params hl/gl/ceid)
            const feedUrl = this.normalizeFeedUrl(url);
            const title = this.extractTag(itemXml, 'title') || 'No title';
            const description = this.extractTag(itemXml, 'description') || '';

            // Prefer the original article URL from <source url="...">, then the anchor inside description, then the <link>
            const sourceUrl = this.extractSourceUrl(itemXml);
            const descAnchor = this.extractHrefFromDescription(description);
            const candidateLink = (sourceUrl || descAnchor || this.extractTag(itemXml, 'link') || this.extractTag(itemXml, 'guid') || '').trim();
            let link = candidateLink;

              // If the chosen link is just the domain/root (not an article path), prefer description anchor if present
              if (link) {
                try {
                  const parsed = new URL(link);
                  const isRoot = (!parsed.pathname || parsed.pathname === '/' || parsed.pathname === '') && !parsed.search && !parsed.hash;
                  if (isRoot && descAnchor && descAnchor.startsWith('http')) {
                    link = descAnchor.trim();
                  }
                } catch (e) {
                  // non-URL or malformed, fall back
                }
              }
            const image = this.extractImageUrl(itemXml) || null;
            const pubDate = this.extractTag(itemXml, 'pubDate') || null;

            // Make relative images absolute when possible
            let normalizedImage: string | null = image;
            if (normalizedImage && !/^https?:\/\//i.test(normalizedImage)) {
              try {
                normalizedImage = new URL(normalizedImage, link || candidateLink || url).toString();
              } catch {
                // leave as-is
              }
            }

            items.push({
              title: this.decodeHtmlEntities(title).trim(),
              link: link.trim(),
              snippet: this.stripHtml(this.decodeHtmlEntities(description)).trim(),
              image: normalizedImage || undefined,
              pubDate: pubDate ? pubDate.trim() : undefined,
              feedUrl,
              originalLink: candidateLink || undefined,
            });
            perSourceCount++;
          }
        } catch (err) {
          console.warn('⚠️ Failed to fetch RSS URL:', url, err instanceof Error ? err.message : `${err}`);
          // continue to next feed
        }
      }

      // Deduplicate by link across all collected items
      const unique = items.filter((r, i, arr) => i === arr.findIndex(a => a.link === r.link));

      console.log('📊 Google News RSS parsed:', { query: query || '<none>', itemsFound: unique.length });

      // Return all deduplicated items (we collected up to `numResults` per source)
      return unique;
    } catch (error) {
      console.error('❌ Google News fetch error:', {
        error: error instanceof Error ? error.message : `${error}`,
        query,
      });
      throw new Error('Failed to fetch Google News RSS');
    }
  }

  /**
   * Fetch Google News RSS results grouped by each source RSS URL.
   * Each group aims to contain `numResults` items (best-effort).
   */
  async searchNewsGrouped(query?: string | null, numResults: number = 5): Promise<NewsSourceGroup[]> {
    console.log('📰 Making Google News RSS Request(s) [grouped]:', { query: query || '<none>', numResults });

    const rssUrls = this.buildNewsRssUrls(query);
    const uniqRssUrls = Array.from(new Set(rssUrls));

    const groups: NewsSourceGroup[] = [];

    for (const sourceUrl of uniqRssUrls) {
      const feedUrl = this.normalizeFeedUrl(sourceUrl);
      try {
        const response = await axios.get(sourceUrl, { responseType: 'text' });
        const xml = response.data as string;

        const raw: SearchResult[] = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match: RegExpExecArray | null;

        // Parse more than needed to survive duplicates / malformed items
        const parseLimit = Math.max(numResults * 6, numResults);
        while ((match = itemRegex.exec(xml)) && raw.length < parseLimit) {
          const itemXml = match[1];
          const title = this.extractTag(itemXml, 'title') || 'No title';
          const description = this.extractTag(itemXml, 'description') || '';

          // Prefer <source url>, then description <a href>, then <link>/<guid>
          const sourceUrlFromItem = this.extractSourceUrl(itemXml);
          const descAnchor = this.extractHrefFromDescription(description);
          const candidateLink = (sourceUrlFromItem || descAnchor || this.extractTag(itemXml, 'link') || this.extractTag(itemXml, 'guid') || '').trim();
          let link = candidateLink;

          // If it's just a domain root, try description anchor
          if (link) {
            try {
              const parsed = new URL(link);
              const isRoot = (!parsed.pathname || parsed.pathname === '/' || parsed.pathname === '') && !parsed.search && !parsed.hash;
              if (isRoot && descAnchor && descAnchor.startsWith('http')) {
                link = descAnchor.trim();
              }
            } catch {
              // ignore
            }
          }

          const image = this.extractImageUrl(itemXml) || null;
          const pubDate = this.extractTag(itemXml, 'pubDate') || null;

          let normalizedImage: string | null = image;
          if (normalizedImage && !/^https?:\/\//i.test(normalizedImage)) {
            try {
              normalizedImage = new URL(normalizedImage, link || candidateLink || sourceUrl).toString();
            } catch {
              // leave as-is
            }
          }

          raw.push({
            title: this.decodeHtmlEntities(title).trim(),
            link: link.trim(),
            snippet: this.stripHtml(this.decodeHtmlEntities(description)).trim(),
            image: normalizedImage || undefined,
            pubDate: pubDate ? pubDate.trim() : undefined,
            feedUrl,
            originalLink: candidateLink || undefined,
          });
        }

        const chosen: SearchResult[] = [];
        const seen = new Set<string>();
        for (const it of raw) {
          if (!it.link) continue;
          if (seen.has(it.link)) continue;
          seen.add(it.link);
          chosen.push(it);
          if (chosen.length >= numResults) break;
        }

        groups.push({ sourceUrl, feedUrl, items: chosen.slice(0, numResults) });
      } catch (err) {
        console.warn('⚠️ Failed to fetch RSS URL:', sourceUrl, err instanceof Error ? err.message : `${err}`);
        groups.push({ sourceUrl, feedUrl, items: [] });
      }
    }

    return groups;
  }

  private normalizeQuery(query?: string | null): string {
    return (query ?? '').toString().trim();
  }

  private buildNewsRssUrls(query?: string | null): string[] {
    type Edition = { hl: string; gl: string; ceid: string; lang: 'en' | 'zh' };
    type Category = 'us' | 'world' | 'china' | 'hongkong';

    const q = this.normalizeQuery(query);

    const editions: Record<string, Edition> = {
      enUS: { hl: 'en-US', gl: 'US', ceid: 'US:en', lang: 'en' },
      enHK: { hl: 'en-HK', gl: 'HK', ceid: 'HK:en', lang: 'en' },
      zhHK: { hl: 'zh-HK', gl: 'HK', ceid: 'HK:zh-Hant', lang: 'zh' },
    };

    // Categories we must cover
    const categories: Category[] = ['us', 'world', 'china', 'hongkong'];

    // Which editions apply to which category
    const categoryEditions: Record<Category, Edition[]> = {
      us: [editions.enUS, editions.zhHK],
      world: [editions.enUS, editions.zhHK],
      china: [editions.enUS, editions.zhHK],
      hongkong: [editions.enHK, editions.zhHK],
    };

    // Query suffixes per category/language to keep coverage broad while applying query everywhere
    const suffix: Record<Category, { en: string; zh: string }> = {
      us: { en: 'United States', zh: '美國' },
      world: { en: 'World', zh: '世界' },
      china: { en: 'China', zh: '中國' },
      hongkong: { en: 'Hong Kong', zh: '香港' },
    };

    const urls: string[] = [];

    for (const cat of categories) {
      for (const ed of categoryEditions[cat]) {
        if (q) {
          const s = ed.lang === 'zh' ? suffix[cat].zh : suffix[cat].en;
          const qq = `${q} ${s}`.trim();
          urls.push(...this.withOriginalVariant(this.buildSearchRssUrl(qq, ed)));
        } else {
          // No query: use topic/geo feeds for clean coverage.
          if (cat === 'world') {
            urls.push(...this.withOriginalVariant(this.buildTopicRssUrl('WORLD', ed)));
          } else {
            const geo =
              cat === 'us' ? 'United States' :
              cat === 'china' ? 'China' :
              'Hong Kong';
            urls.push(...this.withOriginalVariant(this.buildGeoRssUrl(geo, ed)));
          }
        }
      }
    }

    return urls;
  }

  private buildParams(ed: { hl: string; gl: string; ceid: string }): string {
    return `hl=${ed.hl}&gl=${ed.gl}&ceid=${ed.ceid}`;
  }

  private buildSearchRssUrl(query: string, ed: { hl: string; gl: string; ceid: string }): string {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${this.buildParams(ed)}`;
  }

  private buildTopicRssUrl(topic: string, ed: { hl: string; gl: string; ceid: string }): string {
    return `https://news.google.com/rss/headlines/section/topic/${encodeURIComponent(topic)}?${this.buildParams(ed)}`;
  }

  private buildGeoRssUrl(geo: string, ed: { hl: string; gl: string; ceid: string }): string {
    return `https://news.google.com/rss/headlines/section/geo/${encodeURIComponent(geo)}?${this.buildParams(ed)}`;
  }

  // Return [fullUrl, urlWithoutLocaleParams] (if different)
  private withOriginalVariant(fullUrl: string): string[] {
    const base = this.normalizeFeedUrl(fullUrl);
    return base && base !== fullUrl ? [fullUrl, base] : [fullUrl];
  }

  // Normalize a feed URL by removing locale-specific query params (hl, gl, ceid)
  // Keeps other params like `q` for search feeds.
  private normalizeFeedUrl(raw: string): string {
    try {
      const u = new URL(raw);
      u.searchParams.delete('hl');
      u.searchParams.delete('gl');
      u.searchParams.delete('ceid');
      const search = u.searchParams.toString();
      return u.origin + u.pathname + (search ? `?${search}` : '');
    } catch (e) {
      // fallback — strip known locale params heuristically
      const parts = raw.split('?');
      if (parts.length === 1) return raw;
      const params = new URLSearchParams(parts[1]);
      params.delete('hl');
      params.delete('gl');
      params.delete('ceid');
      const qs = params.toString();
      return parts[0] + (qs ? `?${qs}` : '');
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
          // Keep the original RSS snippet and place fetched article in `fullText`
          snippet: item.snippet,
          fullText: full || undefined,
          image: image,
          pubDate: (item as any).pubDate,
          feedUrl: (item as any).feedUrl,
          originalLink: (item as any).originalLink,
        };
      }
    };

    for (let w = 0; w < concurrency; w++) workers.push(doWork());
    await Promise.all(workers);

    return results.filter(Boolean).slice(0, numResults);
  }

  /**
   * Like `searchNewsGrouped`, but also fetches full article text into `fullText`.
   * Keeps RSS `snippet` intact.
   */
  async searchNewsGroupedFull(query?: string | null, numResults: number = 5): Promise<NewsSourceGroup[]> {
    const groups = await this.searchNewsGrouped(query, numResults);

    const tasks: Array<{ groupIndex: number; itemIndex: number }> = [];
    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      for (let itemIndex = 0; itemIndex < groups[groupIndex].items.length; itemIndex++) {
        tasks.push({ groupIndex, itemIndex });
      }
    }

    const concurrency = 3;
    let cursor = 0;
    const workers: Promise<void>[] = [];

    const doWork = async () => {
      while (cursor < tasks.length) {
        const { groupIndex, itemIndex } = tasks[cursor++];
        const item = groups[groupIndex].items[itemIndex];

        let fullText = '';
        let image = item.image || undefined;

        if (item.link) {
          try {
            fullText = await this.fetchFullArticle(item.link);
          } catch {
            // best-effort
          }

          if (!image) {
            try {
              const img = await this.fetchImageFromUrl(item.link);
              if (img) image = img;
            } catch {
              // ignore
            }
          }
        }

        groups[groupIndex].items[itemIndex] = {
          ...item,
          snippet: item.snippet,
          fullText: fullText || undefined,
          image,
        };
      }
    };

    for (let w = 0; w < concurrency; w++) workers.push(doWork());
    await Promise.all(workers);

    return groups;
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