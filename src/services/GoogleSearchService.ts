import axios from 'axios';
import { DesktopToWebService, createDesktopToWebServiceFromEnv } from './DesktopToWebService';
import { HtmlToMarkdownService, createHtmlToMarkdownServiceFromEnv } from './HtmlToMarkdownService';
import { ProcessedArticleService } from './ProcessedArticleService';
import { ArticleClassificationService, createArticleClassificationService } from './ArticleClassificationService';
import { OpenAIService } from './OpenAIService';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface GoogleSearchConfig {
  apiKey: string;
  searchEngineId: string;
  useDesktopService?: boolean; // Enable desktop service for page content fetching
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

export interface ProcessedNewsResult {
  id: string;
  title: string;
  url: string;
  source: string;
  feedUrl?: string;
  publishedAt: string;
  originalContent: string; // Path to HTML file
  processedContent: string; // Path to Markdown file
  imagePaths: string[];
  imageDescriptions: Record<string, string>;
  keywords: string[];
  tags: string[];
  category?: string;
  processingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  isNew: boolean; // true if article was just created, false if it already existed
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
  private desktopService?: DesktopToWebService;
  private htmlToMarkdownService?: HtmlToMarkdownService;
  private processedArticleService?: ProcessedArticleService;
  private classificationService?: ArticleClassificationService;
  private desktopLock: Promise<void> = Promise.resolve(); // Mutex for desktop service operations

  constructor(
    config: GoogleSearchConfig,
    openaiService?: OpenAIService
  ) {
    this.config = config;
    if (config.useDesktopService) {
      try {
        this.desktopService = createDesktopToWebServiceFromEnv();
        this.htmlToMarkdownService = createHtmlToMarkdownServiceFromEnv();
      } catch (e) {
        console.warn('⚠️ DesktopToWebService not configured, falling back to direct HTTP requests');
      }
    }
    
    // Initialize services for article processing
    if (openaiService) {
      this.processedArticleService = new ProcessedArticleService();
      this.classificationService = createArticleClassificationService(openaiService);
      // HtmlToMarkdownService is required for article processing
      if (!this.htmlToMarkdownService) {
        try {
          this.htmlToMarkdownService = createHtmlToMarkdownServiceFromEnv();
        } catch (e) {
          console.warn('⚠️ HtmlToMarkdownService not configured, article processing will be limited');
        }
      }
    }
  }

  /**
   * Acquire lock for desktop service operations to prevent concurrent access
   */
  private async withDesktopLock<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for the current lock to resolve
    await this.desktopLock;
    
    // Create a new lock that resolves when our operation completes
    let resolveLock: (() => void) | undefined;
    const newLock = new Promise<void>(resolve => {
      resolveLock = resolve;
    });
    
    // Set the new lock before starting our operation
    const oldLock = this.desktopLock;
    this.desktopLock = newLock;
    
    try {
      // Execute the operation
      return await fn();
    } finally {
      // Release the lock
      if (resolveLock) {
        resolveLock();
      }
    }
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
    // Note: Based on testing, the following combinations return no content:
    // - China: all editions (enUS, base, zhHK) return empty
    // - Hong Kong: enHK and base return empty, only zhHK works
    // - US: zhHK returns empty, only enUS and base work
    const categoryEditions: Record<Category, Edition[]> = {
      us: [editions.enUS], // zhHK returns no content
      world: [editions.enUS, editions.zhHK], // all work
      china: [], // all editions return no content
      hongkong: [editions.zhHK], // only zhHK works, enHK and base return no content
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
   * Fetch full article text for a given URL using HtmlToMarkdownService if available.
   * Falls back to direct HTTP requests if desktop service is not configured.
   *
   * HtmlToMarkdownService workflow:
   * 1. Check cache for existing markdown
   * 2. Fetch HTML using DesktopToWebService
   * 3. Convert HTML to markdown with image downloads
   * 4. Return the markdown content
   *
   * Direct HTTP fallback:
   * Attempts to follow canonical redirects and extract the main article or largest
   * paragraph blocks. Returns a cleaned plain-text version of the article.
   */
  async fetchFullArticle(url: string, timeoutMs: number = 8000): Promise<string> {
    // Try using HtmlToMarkdownService if configured
    if (this.htmlToMarkdownService && this.htmlToMarkdownService.isConfigured()) {
      try {
        return await this.fetchFullArticleViaHtmlToMarkdown(url);
      } catch (e) {
        console.warn('⚠️ HtmlToMarkdownService fetch failed, falling back to direct HTTP:', e instanceof Error ? e.message : `${e}`);
        console.error('Full error:', e);
      }
    }

    // Fallback to direct HTTP request
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

  /**
   * Fetch full article text using HtmlToMarkdownService.
   *
   * Workflow:
   * 1. Check cache for existing markdown
   * 2. Fetch HTML using DesktopToWebService
   * 3. Convert HTML to markdown with image downloads
   * 4. Return the markdown content
   */
  private async fetchFullArticleViaHtmlToMarkdown(url: string): Promise<string> {
    return this.withDesktopLock(async () => {
      console.log(`📄 Fetching article via HtmlToMarkdownService: ${url}`);

      // Process the URL using HtmlToMarkdownService
      const result = await this.htmlToMarkdownService!.processUrl(url);

      if (!result.success) {
        throw new Error(`Failed to process URL: ${result.error}`);
      }

      // Read the markdown file content
      if (result.markdownPath && fs.existsSync(result.markdownPath)) {
        const markdownContent = fs.readFileSync(result.markdownPath, 'utf-8');
        console.log(`✅ Article fetched via HtmlToMarkdownService: ${markdownContent.length} characters, ${result.imagesDownloaded || 0} images downloaded`);
        return markdownContent;
      }

      // If cached, we need to find the markdown file
      if (result.cached && result.markdownUrl) {
        // Convert markdownUrl to file path
        const cacheDir = './data/html/cache';
        const markdownPath = path.join(cacheDir, result.markdownUrl.replace('/html/cache/', ''));
        if (fs.existsSync(markdownPath)) {
          const markdownContent = fs.readFileSync(markdownPath, 'utf-8');
          console.log(`✅ Article loaded from cache: ${markdownContent.length} characters`);
          return markdownContent;
        }
      }

      throw new Error('Failed to read markdown content');
    });
  }

  /**
   * Clean HTML content by removing scripts, styles, and extracting main text content.
   */
  private cleanHtmlContent(html: string): string {
    // Remove scripts and styles
    let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

    // Remove HTML comments
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, ' ');

    // Prefer <article> content
    const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned);
    if (articleMatch && articleMatch[1]) {
      cleaned = articleMatch[1];
    }

    // Extract text from common content tags
    const contentTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'span', 'div'];
    const textParts: string[] = [];
    
    for (const tag of contentTags) {
      const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(cleaned))) {
        const text = this.stripHtml(this.decodeHtmlEntities(match[1] || ''));
        if (text && text.trim().length > 10) {
          textParts.push(text.trim());
        }
      }
    }

    // If we found content tags, use them; otherwise strip all HTML
    let result = textParts.length > 0
      ? textParts.join('\n\n')
      : this.stripHtml(this.decodeHtmlEntities(cleaned));

    // Clean up whitespace
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n')
                   .replace(/^\s+|\s+$/g, '')
                   .replace(/\s{2,}/g, ' ');

    return result;
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

    // When using htmlToMarkdownService, use concurrency of 1 to prevent concurrent access
    const concurrency = this.htmlToMarkdownService && this.htmlToMarkdownService.isConfigured() ? 1 : 3;
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

    // When using htmlToMarkdownService, use concurrency of 1 to prevent concurrent access
    const concurrency = this.htmlToMarkdownService && this.htmlToMarkdownService.isConfigured() ? 1 : 3;
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
   * Process news articles and return ProcessedNewsResult with full metadata
   * This is the main method for the redesigned GoogleSearchService
   */
  async searchNewsProcessed(query?: string | null, numResults: number = 5): Promise<ProcessedNewsResult[]> {
    if (!this.processedArticleService || !this.classificationService) {
      throw new Error('ProcessedArticleService and ClassificationService are required. Provide OpenAIService in constructor.');
    }

    console.log('📰 Processing news articles with full metadata:', { query: query || '<none>', numResults });

    // Get RSS items
    const rssItems = await this.searchNews(query, numResults);
    const results: ProcessedNewsResult[] = [];

    // Process each article
    for (const item of rssItems) {
      try {
        const result = await this.processArticle(item);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error('❌ Failed to process article:', item.link, error);
      }
    }

    console.log(`✅ Processed ${results.length} articles`);
    return results;
  }

  /**
   * Process a single article from RSS item
   */
  private async processArticle(item: SearchResult): Promise<ProcessedNewsResult | null> {
    if (!this.processedArticleService) {
      console.warn('⚠️ ProcessedArticleService not available, cannot process article:', item.title);
      return null;
    }
    if (!this.classificationService) {
      console.warn('⚠️ ClassificationService not available, cannot process article:', item.title);
      return null;
    }
    if (!this.htmlToMarkdownService) {
      console.warn('⚠️ HtmlToMarkdownService not available, cannot process article:', item.title);
      return null;
    }

    const url = item.link;
    if (!url) return null;

    let articleId: string;

    // Check if article already exists
    const existing = await this.processedArticleService.getProcessedArticleByUrl(url);
    if (existing) {
      // Only skip if already completed - failed/processing articles should be retried
      if (existing.processingStatus === 'completed') {
        console.log(`⏭️ Article already processed: ${url}`);
        return {
          id: existing.id,
          title: existing.title,
          url: existing.url,
          source: existing.source,
          feedUrl: undefined, // TODO: Add feedUrl to ProcessedArticle type
          publishedAt: existing.publishedAt,
          originalContent: existing.originalContent,
          processedContent: existing.processedContent,
          imagePaths: existing.imagePaths,
          imageDescriptions: existing.imageDescriptions || {},
          keywords: existing.keywords,
          tags: [], // TODO: Add tags to ProcessedArticle type
          category: existing.category,
          processingStatus: 'completed',
          isNew: false,
        };
      }
      // Article exists but is not completed - will retry it
      console.log(`🔄 Retrying article (${existing.processingStatus}): ${url}`);
      articleId = existing.id;
    } else {
      // Create pending record
      articleId = await this.processedArticleService.createProcessedArticle({
        title: item.title,
        url: url,
        source: item.originalLink || url,
        publishedAt: item.pubDate || new Date().toISOString(),
        originalContent: '', // Will be updated after processing
        processedContent: '', // Will be updated after processing
        imagePaths: [],
        keywords: [],
        processingStatus: 'pending',
      });
    }

    // Update to processing
    await this.processedArticleService.updateProcessedArticle(articleId, {
      processingStatus: 'processing',
    });

    try {
      // Use the actual article URL (from source field) for processing
      // The url field might be a Google News redirect URL which won't work
      const actualUrl = existing?.source || item.originalLink || url;
      console.log(`📄 Processing article URL: ${actualUrl}`);
      
      // Process URL with HtmlToMarkdownService
      const htmlResult = await this.htmlToMarkdownService.processUrl(actualUrl);

      if (!htmlResult.success) {
        const errorMsg = htmlResult.error || 'Failed to process URL';
        console.log(`❌ HtmlToMarkdownService failed: ${errorMsg}`);
        
        // Check if this is a parsing error (malformed HTML/JS/CSS)
        // These errors are persistent and won't be fixed by retrying
        const isParsingError = errorMsg.includes('not found') ||
                               errorMsg.includes('SyntaxError') ||
                               errorMsg.includes('ParseError') ||
                               errorMsg.includes('Unexpected token');
        
        if (isParsingError) {
          console.log(`⚠️ Parsing error detected - this article cannot be processed due to malformed HTML`);
          // Mark as permanently failed to prevent infinite retries
          await this.processedArticleService.updateProcessedArticle(articleId, {
            processingStatus: 'failed',
            errorMessage: `Parsing error: ${errorMsg} (malformed HTML/JS/CSS)`,
          });
          return null;
        }
        
        throw new Error(errorMsg);
      }

      // Log if content was salvaged from a parsing error
      if (htmlResult.error && htmlResult.error.includes('Salvaged from parsing error')) {
        console.log(`⚠️ Content salvaged from parsing error: ${htmlResult.error}`);
      }

      // Get markdown path - handle both cached and fresh results
      let markdownPath: string;
      if (htmlResult.markdownPath) {
        markdownPath = htmlResult.markdownPath;
      } else if (htmlResult.markdownUrl) {
        // Convert markdownUrl to file path for cached results
        markdownPath = path.join('./data', htmlResult.markdownUrl);
      } else {
        throw new Error('No markdown path or URL returned');
      }

      // Get cache folder
      const cacheFolder = path.dirname(markdownPath);

      // Read image map
      const imageMap = this.loadImageMap(cacheFolder);
      const imagePaths = Array.from(imageMap.values());

      // Read markdown content for classification
      const markdownContent = fs.readFileSync(markdownPath, 'utf-8');

      // Classify article
      const classification = await this.classificationService.classifyArticle(
        item.title,
        markdownContent,
        imagePaths,
        cacheFolder
      );

      // Update article with processed data
      await this.processedArticleService.updateProcessedArticle(articleId, {
        originalContent: `/html/cache/${path.relative('./data/html/cache', path.join(cacheFolder, 'article.html'))}`,
        processedContent: `/html/cache/${path.relative('./data/html/cache', markdownPath)}`,
        imagePaths,
        imageDescriptions: classification.imageDescriptions,
        keywords: classification.keywords,
        tags: classification.tags,
        category: classification.category,
        processingStatus: 'completed',
      });

      console.log(`✅ Article processed: ${item.title}`);

      return {
        id: articleId,
        title: item.title,
        url: url,
        source: item.originalLink || url,
        feedUrl: item.feedUrl,
        publishedAt: item.pubDate || new Date().toISOString(),
        originalContent: `/html/cache/${path.relative('./data/html/cache', path.join(cacheFolder, 'article.html'))}`,
        processedContent: `/html/cache/${path.relative('./data/html/cache', markdownPath)}`,
        imagePaths,
        imageDescriptions: classification.imageDescriptions,
        keywords: classification.keywords,
        tags: classification.tags,
        category: classification.category,
        processingStatus: 'completed',
        isNew: true,
      };
    } catch (error) {
      // Update to failed with error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.processedArticleService.updateProcessedArticle(articleId, {
        processingStatus: 'failed',
        errorMessage,
      });

      console.error(`❌ Article processing failed: ${item.title}`, error);

      // Note: Failed articles will be retried by the scheduled retry mechanism
      // See retryArticles() method

      return null;
    }
  }

  /**
   * Load image map from cache folder
   */
  private loadImageMap(cacheFolder: string): Map<string, string> {
    const imageMapPath = path.join(cacheFolder, 'image-map.json');
    
    if (!fs.existsSync(imageMapPath)) {
      return new Map();
    }

    try {
      const data = fs.readFileSync(imageMapPath, 'utf-8');
      const obj = JSON.parse(data);
      return new Map(Object.entries(obj));
    } catch (error) {
      console.warn('⚠️ Failed to load image map:', error);
      return new Map();
    }
  }

  /**
   * Get cache folder for a URL
   */
  private getCacheFolder(url: string): string {
    const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
    const today = new Date().toISOString().split('T')[0];
    return path.join('./data/html/cache', today, hash);
  }

  /**
   * Fetch the latest news articles (up to 100)
   * This method is designed for scheduled news fetching
   * Returns only new articles that haven't been processed before
   */
  async fetchLatestNews(numResults: number = 100): Promise<ProcessedNewsResult[]> {
    if (!this.processedArticleService || !this.classificationService) {
      throw new Error('ProcessedArticleService and ClassificationService are required. Provide OpenAIService in constructor.');
    }

    console.log(`📰 Fetching latest ${numResults} news articles`);

    // Get the most recent article's published date from the database
    // This helps us filter out old articles that are still in the RSS feed
    const recentArticles = await this.processedArticleService.searchProcessedArticles(undefined, {
      limit: 1,
      status: 'completed',
      orderBy: 'publishedAt',
      orderDirection: 'desc'
    });

    const lastPublishedDate = recentArticles.articles.length > 0
      ? new Date(recentArticles.articles[0].publishedAt)
      : null;

    if (lastPublishedDate) {
      console.log(`📅 Filtering articles published after: ${lastPublishedDate.toISOString()}`);
    } else {
      console.log(`📅 No existing articles found, processing all RSS items`);
    }

    // Get RSS items without query (general news)
    const rssItems = await this.searchNews(null, numResults);
    const results: ProcessedNewsResult[] = [];

    // Process each article
    for (const item of rssItems) {
      try {
        // Skip articles without a publication date
        if (!item.pubDate) {
          console.log(`⏭️ Skipping article without pubDate: ${item.title}`);
          continue;
        }

        const itemPubDate = new Date(item.pubDate);

        // If we have a last published date, skip articles older than or equal to it
        if (lastPublishedDate && itemPubDate <= lastPublishedDate) {
          console.log(`⏭️ Skipping old article (${itemPubDate.toISOString()}): ${item.title}`);
          continue;
        }

        const result = await this.processArticle(item);
        // Only include new articles
        if (result && result.isNew) {
          results.push(result);
        }
      } catch (error) {
        console.error('❌ Failed to process article:', item.link, error);
      }
    }

    console.log(`✅ Fetched ${results.length} new news articles`);
    return results;
  }

  /**
   * Retry failed articles and articles stuck in processing status
   * This is called by the scheduled maintenance task
   */
  async retryArticles(options: {
    maxRetries?: number;
    failedCooldownMs?: number;
    processingTimeoutMs?: number;
  } = {}): Promise<{
    failedRetried: number;
    failedSucceeded: number;
    failedFailed: number;
    stuckRetried: number;
    stuckSucceeded: number;
    stuckFailed: number;
  }> {
    if (!this.processedArticleService || !this.classificationService || !this.htmlToMarkdownService) {
      console.warn('⚠️ Required services not available for retry');
      return {
        failedRetried: 0,
        failedSucceeded: 0,
        failedFailed: 0,
        stuckRetried: 0,
        stuckSucceeded: 0,
        stuckFailed: 0,
      };
    }

    console.log('🔄 Starting article retry process');

    const maxRetries = options.maxRetries ?? 5;
    const failedCooldownMs = options.failedCooldownMs ?? (60 * 60 * 1000); // 1 hour
    const processingTimeoutMs = options.processingTimeoutMs ?? (30 * 60 * 1000); // 30 minutes

    // Get articles needing retry
    const { failedArticles, stuckProcessingArticles } = await this.processedArticleService.getArticlesNeedingRetry({
      maxRetries,
      failedCooldownMs,
      processingTimeoutMs,
    });

    console.log(`📊 Found ${failedArticles.length} failed articles and ${stuckProcessingArticles.length} stuck processing articles to retry`);

    let failedSucceeded = 0;
    let failedFailed = 0;
    let stuckSucceeded = 0;
    let stuckFailed = 0;

    // Retry failed articles
    for (const article of failedArticles) {
      try {
        console.log(`🔄 Retrying failed article (${article.retryCount + 1}/${maxRetries}): ${article.title}`);

        // Increment retry count and set to processing
        await this.processedArticleService.updateProcessedArticle(article.id, {
          retryCount: article.retryCount + 1,
          processingStatus: 'processing',
          errorMessage: undefined,
        });

        // Re-process the article (skip existing check)
        const item: SearchResult = {
          title: article.title,
          link: article.url,
          snippet: '',
        };

        const result = await this.processArticle(item);

        if (result && result.processingStatus === 'completed') {
          failedSucceeded++;
          console.log(`✅ Failed article retry succeeded: ${article.title}`);
        } else {
          failedFailed++;
          console.log(`❌ Failed article retry failed: ${article.title}`);
        }
      } catch (error) {
        failedFailed++;
        console.error(`❌ Failed article retry error: ${article.title}`, error);
      }
    }

    // Retry stuck processing articles
    for (const article of stuckProcessingArticles) {
      try {
        console.log(`🔄 Retrying stuck processing article: ${article.title}`);

        // Mark as failed first (stuck for > 30 minutes)
        await this.processedArticleService.updateProcessedArticle(article.id, {
          processingStatus: 'failed',
          errorMessage: 'Processing timeout - marked as failed before retry',
        });

        // Re-process the article
        const item: SearchResult = {
          title: article.title,
          link: article.url,
          snippet: '',
        };

        const result = await this.processArticle(item);

        if (result && result.processingStatus === 'completed') {
          stuckSucceeded++;
          console.log(`✅ Stuck processing article retry succeeded: ${article.title}`);
        } else {
          stuckFailed++;
          console.log(`❌ Stuck processing article retry failed: ${article.title}`);
        }
      } catch (error) {
        stuckFailed++;
        console.error(`❌ Stuck processing article retry error: ${article.title}`, error);
      }
    }

    console.log(`📊 Retry complete: ${failedSucceeded}/${failedArticles.length} failed succeeded, ${stuckSucceeded}/${stuckProcessingArticles.length} stuck succeeded`);

    return {
      failedRetried: failedArticles.length,
      failedSucceeded,
      failedFailed,
      stuckRetried: stuckProcessingArticles.length,
      stuckSucceeded,
      stuckFailed,
    };
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey && !!this.config.searchEngineId;
  }
}

// Helper function to create GoogleSearchService instance from environment variables
export function createGoogleSearchServiceFromEnv(openaiService?: OpenAIService): GoogleSearchService {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    throw new Error('GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables are required');
  }

  return new GoogleSearchService({
    apiKey,
    searchEngineId,
  }, openaiService);
}