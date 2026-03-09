import { ChromeRemoteDebugService, createChromeRemoteDebugServiceFromEnv } from './ChromeRemoteDebugService';
import { getChromeProcessService } from './ChromeProcessService';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { JSDOM } from 'jsdom';

export interface HtmlToMarkdownResult {
  success: boolean;
  markdownUrl?: string;
  htmlPath?: string;
  markdownPath?: string;
  imagesDownloaded?: number;
  error?: string;
  cached?: boolean;
}

/**
 * HtmlToMarkdownService
 * 
 * Fetches HTML content from URLs using ChromeRemoteDebugService (CDP)
 * and converts it to Markdown with image downloading support.
 * 
 * This service uses a remote Chrome browser via CDP, which allows:
 * - Preserving user sessions (cookies, logins)
 * - Rendering JavaScript-heavy pages
 * - Accessing authenticated content
 */
export class HtmlToMarkdownService {
  private readonly chromeService: ChromeRemoteDebugService;
  private readonly cacheDir: string;

  constructor(cacheDir: string = './data/html/cache') {
    this.chromeService = createChromeRemoteDebugServiceFromEnv();
    this.cacheDir = cacheDir;
    
    // Ensure cache directory exists
    this.ensureCacheDir();
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    // ChromeRemoteDebugService is always configured with defaults
    return true;
  }

  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Get today's date folder (YYYY-MM-DD)
   */
  private getDateFolder(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  /**
   * Generate a hash from a URL for use as a cache folder name
   */
  private getUrlHash(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Get the cache folder path for a given URL (organized by date)
   * Structure: data/html/cache/YYYY-MM-DD/<hash>/
   */
  private getCacheFolder(url: string): string {
    const dateFolder = this.getDateFolder();
    const hash = this.getUrlHash(url);
    return path.join(this.cacheDir, dateFolder, hash);
  }

  /**
   * Minimum content length for a cached article to be considered valid
   * Articles with less content will be reprocessed
   */
  private static readonly MIN_VALID_CONTENT_LENGTH = 100;

  /**
   * Find the cache folder for a URL across multiple date folders
   * @param url - The URL to search for
   * @param daysToSearch - Number of days back to search (default: 30)
   * @param requireValidContent - If true, only return folder if article.md has valid content (default: true)
   * @returns The cache folder path if found, null otherwise
   */
  private findCacheFolder(url: string, daysToSearch: number = 30, requireValidContent: boolean = true): string | null {
    const hash = this.getUrlHash(url);
    
    for (let i = 0; i < daysToSearch; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateFolder = date.toISOString().split('T')[0];
      const cacheFolder = path.join(this.cacheDir, dateFolder, hash);
      
      if (fs.existsSync(cacheFolder)) {
        const markdownPath = path.join(cacheFolder, 'article.md');
        if (fs.existsSync(markdownPath)) {
          // Check if the content is valid (not empty or minimal)
          if (requireValidContent) {
            const content = fs.readFileSync(markdownPath, 'utf-8');
            const trimmedContent = content.trim();
            // Skip if file is empty or has very little content
            if (trimmedContent.length < HtmlToMarkdownService.MIN_VALID_CONTENT_LENGTH) {
              console.log(`[HtmlToMarkdown] Cache folder found but content is empty/minimal (${trimmedContent.length} chars), will reprocess: ${url}`);
              continue; // Continue searching in other date folders
            }
          }
          return cacheFolder;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if images need to be re-downloaded for a cached article
   * Returns true if any referenced image is missing from the images folder
   * 
   * @param cacheFolder - The cache folder path
   * @returns true if images need to be re-downloaded
   */
  private needsImageRedownload(cacheFolder: string): boolean {
    const markdownPath = path.join(cacheFolder, 'article.md');
    const imagesDir = path.join(cacheFolder, 'images');
    
    if (!fs.existsSync(markdownPath)) {
      return false;
    }
    
    const content = fs.readFileSync(markdownPath, 'utf-8');
    
    // Check if markdown references any images
    // Match pattern: ![alt text](images/filename.jpg)
    const imageRefs = content.match(/!\[.*?\]\(images\/([^)]+)\)/g);
    if (!imageRefs || imageRefs.length === 0) {
      return false; // No images referenced, no need to re-download
    }
    
    // Extract just the filenames from the references
    const referencedFiles = new Set<string>();
    imageRefs.forEach(ref => {
      const match = ref.match(/images\/([^)]+)/);
      if (match) {
        referencedFiles.add(match[1]);
      }
    });
    
    // Check if images directory exists
    if (!fs.existsSync(imagesDir)) {
      console.log(`[HtmlToMarkdown] Images directory missing, need to re-download ${referencedFiles.size} images`);
      return true;
    }
    
    // Check each referenced image file
    const missingImages: string[] = [];
    for (const filename of referencedFiles) {
      const filepath = path.join(imagesDir, filename);
      if (!fs.existsSync(filepath)) {
        missingImages.push(filename);
      } else if (!this.isValidImageFile(filepath)) {
        missingImages.push(filename);
      }
    }
    
    if (missingImages.length > 0) {
      console.log(`[HtmlToMarkdown] Missing/invalid images: ${missingImages.slice(0, 5).join(', ')}${missingImages.length > 5 ? ` (and ${missingImages.length - 5} more)` : ''}`);
      return true;
    }
    
    return false;
  }

  /**
   * Check if a file is a valid image by checking its magic bytes
   * This detects files that are actually error responses or corrupted
   * 
   * @param filepath - Path to the file to check
   * @returns true if the file appears to be a valid image
   */
  private isValidImageFile(filepath: string): boolean {
    try {
      const stats = fs.statSync(filepath);
      
      // Too small to be a valid image (most images are at least a few hundred bytes)
      if (stats.size < 100) {
        return false;
      }
      
      // Read first few bytes to check magic numbers
      const fd = fs.openSync(filepath, 'r');
      const buffer = Buffer.alloc(16);
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);
      
      // Check for common image format magic bytes
      // JPEG: FF D8 FF
      if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return true;
      }
      
      // PNG: 89 50 4E 47 0D 0A 1A 0A
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return true;
      }
      
      // GIF: 47 49 46 38 (GIF8)
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return true;
      }
      
      // WebP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
          buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return true;
      }
      
      // BMP: 42 4D
      if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        return true;
      }
      
      // SVG: starts with <?xml or <svg
      const header = buffer.toString('utf8', 0, 16).trim();
      if (header.startsWith('<?xml') || header.startsWith('<svg')) {
        return true;
      }
      
      // Not a recognized image format
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Re-download images for an existing cached article
   * 
   * @param cacheFolder - The cache folder path
   * @param baseUrl - The base URL for resolving relative image URLs
   * @returns Number of images downloaded
   */
  private async redownloadImages(cacheFolder: string, baseUrl: string): Promise<number> {
    const htmlPath = path.join(cacheFolder, 'article.html');
    const markdownPath = path.join(cacheFolder, 'article.md');
    
    if (!fs.existsSync(htmlPath)) {
      console.log(`[HtmlToMarkdown] No HTML file found, cannot re-download images`);
      return 0;
    }
    
    console.log(`[HtmlToMarkdown] Re-downloading images for cached article...`);
    
    // Create images directory if it doesn't exist
    const imagesDir = path.join(cacheFolder, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // Delete ALL existing image files so they can be re-downloaded with correct URLs
    const existingFiles = fs.readdirSync(imagesDir);
    let deletedCount = 0;
    for (const file of existingFiles) {
      const filepath = path.join(imagesDir, file);
      try {
        fs.unlinkSync(filepath);
        deletedCount++;
      } catch (e) {
        // Ignore errors
      }
    }
    if (deletedCount > 0) {
      console.log(`[HtmlToMarkdown] Deleted ${deletedCount} existing image files for re-download`);
    }
    
    // Read HTML and fix URLs that were resolved against Google's domain
    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = this.fixGoogleResolvedUrls(html, baseUrl);
    
    // Write the fixed HTML back
    fs.writeFileSync(htmlPath, html, 'utf-8');
    
    // Re-process the HTML to download images
    const imageMap = await this.convertHtmlToMarkdownFile(htmlPath, markdownPath, cacheFolder, baseUrl);
    
    return imageMap.size;
  }

  /**
   * Fix URLs in HTML that were resolved against Google's domain instead of the actual site
   * For example: https://news.google.com/hk/bkn/cnt/news/... should be https://hk.on.cc/hk/bkn/cnt/news/...
   */
  private fixGoogleResolvedUrls(html: string, baseUrl: string): string {
    try {
      const baseUrlObj = new URL(baseUrl);
      const actualDomain = baseUrlObj.hostname;
      
      // Skip if the base URL is already a Google domain
      if (actualDomain.includes('google.com')) {
        return html;
      }
      
      // Replace news.google.com URLs that should point to the actual domain
      // Pattern: https://news.google.com/path/to/content -> https://actual-domain/path/to/content
      const googleNewsPattern = /https?:\/\/news\.google\.com\//g;
      
      // Count matches for logging
      const matches = html.match(googleNewsPattern);
      if (matches && matches.length > 0) {
        console.log(`[HtmlToMarkdown] Fixing ${matches.length} URLs resolved against news.google.com -> ${actualDomain}`);
        html = html.replace(googleNewsPattern, `https://${actualDomain}/`);
      }
      
      return html;
    } catch {
      return html;
    }
  }

  /**
   * Check if a URL has already been processed with valid content
   * @param url - The URL to check
   * @param daysToSearch - Number of days back to search (default: 30)
   */
  private isCached(url: string, daysToSearch: number = 30): boolean {
    return this.findCacheFolder(url, daysToSearch, true) !== null;
  }

  /**
   * Save the final URL to a metadata file for future reference
   * This is needed for re-downloading images with the correct base URL
   */
  private saveFinalUrlToCache(cacheFolder: string, finalUrl: string): void {
    const metadataPath = path.join(cacheFolder, 'metadata.json');
    try {
      const metadata = { finalUrl, timestamp: new Date().toISOString() };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (error) {
      console.warn(`[HtmlToMarkdown] Failed to save metadata: ${error}`);
    }
  }

  /**
   * Get the final URL from the metadata file
   * Returns null if the file doesn't exist or is invalid
   */
  private getFinalUrlFromCache(cacheFolder: string): string | null {
    const metadataPath = path.join(cacheFolder, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      // Try to extract base URL from HTML file as fallback
      return this.extractBaseUrlFromHtml(cacheFolder);
    }
    try {
      const data = fs.readFileSync(metadataPath, 'utf-8');
      const metadata = JSON.parse(data);
      return metadata.finalUrl || null;
    } catch {
      return this.extractBaseUrlFromHtml(cacheFolder);
    }
  }

  /**
   * Extract the base URL from the HTML file by looking at canonical URL, og:url, or links
   * This is a fallback when metadata.json doesn't exist
   */
  private extractBaseUrlFromHtml(cacheFolder: string): string | null {
    const htmlPath = path.join(cacheFolder, 'article.html');
    if (!fs.existsSync(htmlPath)) {
      return null;
    }
    
    try {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      
      // Try to find canonical URL
      const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      if (canonicalMatch) {
        console.log(`[HtmlToMarkdown] Extracted base URL from canonical: ${canonicalMatch[1]}`);
        return canonicalMatch[1];
      }
      
      // Try to find og:url
      const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
      if (ogUrlMatch) {
        console.log(`[HtmlToMarkdown] Extracted base URL from og:url: ${ogUrlMatch[1]}`);
        return ogUrlMatch[1];
      }
      
      // Look for actual article URLs in the HTML (not google.com or googleusercontent.com)
      const urlMatch = html.match(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})[^"'\s]*/g);
      if (urlMatch) {
        // Find the first URL that's not from google.com or googleusercontent.com
        for (const url of urlMatch) {
          const hostMatch = url.match(/https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (hostMatch) {
            const host = hostMatch[1];
            if (!host.includes('google.com') && 
                !host.includes('googleusercontent.com') &&
                !host.includes('gstatic.com') &&
                !host.includes('googleapis.com')) {
              console.log(`[HtmlToMarkdown] Extracted base URL from HTML content: ${url}`);
              return url;
            }
          }
        }
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get the cached markdown URL for a URL
   * @param url - The URL to get the cached markdown for
   * @param daysToSearch - Number of days back to search (default: 30)
   */
  private getCachedMarkdownUrl(url: string, daysToSearch: number = 30): string {
    const cacheFolder = this.findCacheFolder(url, daysToSearch);
    if (!cacheFolder) {
      // Fallback to today's folder if not found
      const dateFolder = this.getDateFolder();
      const hash = this.getUrlHash(url);
      return `/html/cache/${dateFolder}/${hash}/article.md`;
    }
    
    // Extract date folder and hash from the found cache folder path
    const relativePath = path.relative(this.cacheDir, cacheFolder);
    return `/html/cache/${relativePath}/article.md`;
  }

  /**
   * Check if HTML content is a browser error page
   * This prevents error pages from being processed as valid content
   *
   * @param html - The HTML content to check
   * @returns true if the HTML is an error page
   */
  private isErrorPage(html: string): boolean {
    const errorPatterns = [
      // Chrome error messages
      /This site can(?:')?t be reached/i,
      /ERR_CONNECTION_REFUSED/i,
      /ERR_NAME_NOT_RESOLVED/i,
      /ERR_CONNECTION_TIMED_OUT/i,
      /DNS_PROBE_FINISHED_NXDOMAIN/i,
      /ERR_CONNECTION_RESET/i,
      /ERR_INTERNET_DISCONNECTED/i,
      // Firefox error messages
      /err_connection_refused/i,
      /Server not found/i,
      // General error indicators
      /no internet/i,
      /Unable to connect/i,
      /Connection refused/i,
      // The error snippet from handleFailedArticles.ts
      /<span>This site can(?:')?t be reached<\/span>/i,
    ];
    
    return errorPatterns.some(pattern => pattern.test(html));
  }

  /**
   * Fetch HTML from URL using ChromeRemoteDebugService and save to file
   * This replaces the complex clipboard-based workflow with direct CDP navigation
   */
  /**
   * Delay helper for waiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch HTML from URL and save to file
   * Returns the final URL after any redirects (important for resolving relative image URLs)
   */
  private async fetchHtmlToFile(url: string, htmlPath: string): Promise<{ finalUrl: string }> {
    console.log(`[HtmlToMarkdown] Fetching HTML via CDP: ${url}`);
    
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Connect to remote Chrome if not already connected
        if (!this.chromeService.isConnected()) {
          await this.chromeService.connect();
        }
        
        // Navigate and get content
        // Use 'domcontentloaded' instead of 'networkidle' for more reliable navigation
        // 'networkidle' can timeout on sites with continuous network activity (ads, analytics, etc.)
        const content = await this.chromeService.navigateAndGetContent(url, {
          timeout: 60000,
          waitUntil: 'domcontentloaded', // Wait for DOM to be ready (more reliable than networkidle)
        });
        
        // Add a small delay to allow JavaScript to render content
        // This helps with JS-heavy pages that render content after DOMContentLoaded
        await this.delay(2000);
        
        // Check for error page
        if (this.isErrorPage(content.html)) {
          throw new Error(
            `Browser returned an error page. The site may be unreachable. URL: ${url}`
          );
        }
        
        // Check if content is too small (might indicate JS rendering issue)
        if (content.html.length < 500) {
          console.log(`[HtmlToMarkdown] Warning: Small content (${content.html.length} bytes), waiting for JS...`);
          await this.delay(3000);
        }
        
        // Fix URLs that were resolved against Google's domain instead of the actual site
        let html = content.html;
        if (content.url && !content.url.includes('google.com')) {
          html = this.fixGoogleResolvedUrls(content.html, content.url);
        }
        
        // Save HTML to file
        console.log(`[HtmlToMarkdown] Saving HTML to file: ${htmlPath} (${html.length} bytes)`);
        fs.writeFileSync(htmlPath, html, 'utf-8');
        
        // Return the final URL after redirects (for resolving relative image URLs)
        console.log(`[HtmlToMarkdown] Final URL after redirects: ${content.url}`);
        return { finalUrl: content.url };
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message;
        console.error(`[HtmlToMarkdown] Attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          const waitTime = attempt * 2000;
          console.log(`[HtmlToMarkdown] Retrying in ${waitTime}ms...`);
          await this.delay(waitTime);
        }
      }
    }
    
    // All retries failed
    const errorMsg = lastError?.message || 'Unknown error';
    console.error(`[HtmlToMarkdown] Failed to fetch HTML after ${maxRetries} attempts: ${errorMsg}`);
    throw lastError || new Error('Failed to fetch HTML');
  }

  /**
   * Load image map from JSON file (backward compatibility)
   */
  private loadImageMap(cacheFolder: string): Map<string, string> | null {
    const imageMapPath = path.join(cacheFolder, 'image-map.json');
    if (!fs.existsSync(imageMapPath)) {
      return null;
    }
    try {
      const data = fs.readFileSync(imageMapPath, 'utf-8');
      const obj = JSON.parse(data);
      return new Map(Object.entries(obj));
    } catch {
      return null;
    }
  }

  /**
   * Save image map to JSON file
   */
  private saveImageMap(cacheFolder: string, imageMap: Map<string, string>): void {
    const imageMapPath = path.join(cacheFolder, 'image-map.json');
    const obj = Object.fromEntries(imageMap);
    fs.writeFileSync(imageMapPath, JSON.stringify(obj, null, 2), 'utf-8');
  }

  /**
   * Get image file extension from URL
   */
  private getImageExtension(url: string): string {
    const urlPath = url.split('?')[0]; // Remove query string
    const ext = path.extname(urlPath).toLowerCase();
    
    // Valid image extensions
    const validExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    if (validExts.includes(ext)) {
      return ext;
    }
    
    // Default to .jpg
    return '.jpg';
  }

  /**
   * Download image using curl (streams directly to disk)
   */
  private async downloadImageWithCurl(url: string, filepath: string): Promise<void> {
    const { spawn } = await import('node:child_process');
    
    return new Promise((resolve, reject) => {
      const curl = spawn('curl', [
        '-s', '-L',           // Silent, follow redirects
        '--max-time', '30',   // 30 second timeout
        '--connect-timeout', '10',
        '-o', filepath,       // Output file
        url
      ]);

      curl.on('close', (code) => {
        if (code === 0) {
          // Verify file was created and has content
          if (fs.existsSync(filepath) && fs.statSync(filepath).size > 0) {
            resolve();
          } else {
            reject(new Error('Downloaded file is empty or missing'));
          }
        } else {
          reject(new Error(`curl exited with code ${code}`));
        }
      });

      curl.on('error', (err) => {
        reject(new Error(`curl error: ${err.message}`));
      });
    });
  }

  /**
   * Resolve a relative URL against a base URL
   * Handles protocol-relative URLs (//example.com/img.jpg)
   * and path-relative URLs (/img.jpg, img.jpg)
   * 
   * @param src - The relative or absolute URL
   * @param baseUrl - The base URL to resolve against
   * @returns The resolved absolute URL, or null if invalid
   */
  private resolveImageUrl(src: string, baseUrl: string): string | null {
    try {
      // Already an absolute URL
      if (src.startsWith('http://') || src.startsWith('https://')) {
        return src;
      }
      
      // Protocol-relative URL: //example.com/img.jpg
      if (src.startsWith('//')) {
        const parsedBase = new URL(baseUrl);
        return `${parsedBase.protocol}${src}`;
      }
      
      // Path-relative URL: resolve against base URL
      const resolved = new URL(src, baseUrl);
      return resolved.href;
    } catch {
      return null;
    }
  }

  /**
   * Convert HTML file to markdown file using jsdom
   * Also extracts and downloads images in a single pass (no duplicate JSDOM creation)
   * Returns the image map for backward compatibility
   */
  private async convertHtmlToMarkdownFile(htmlPath: string, markdownPath: string, cacheFolder: string, baseUrl?: string): Promise<Map<string, string>> {
    console.log(`[HtmlToMarkdown] Reading HTML file: ${htmlPath}`);
    let html = fs.readFileSync(htmlPath, 'utf-8');
    console.log(`[HtmlToMarkdown] HTML file size: ${html.length} bytes`);

    // Clean HTML BEFORE creating JSDOM to speed up parsing
    console.log(`[HtmlToMarkdown] Cleaning HTML...`);
    const originalSize = html.length;
    html = html
      .replaceAll(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replaceAll(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replaceAll(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replaceAll(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replaceAll(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');
    console.log(`[HtmlToMarkdown] HTML cleaned: ${originalSize} -> ${html.length} bytes (${((1 - html.length / originalSize) * 100).toFixed(1)}% reduction)`);

    console.log(`[HtmlToMarkdown] Creating JSDOM...`);
    let dom: JSDOM;
    let document: Document;
    
    try {
      dom = new JSDOM(html);
      document = dom.window.document;
      console.log(`[HtmlToMarkdown] JSDOM created successfully`);
    } catch (jsdomError) {
      const errorMsg = jsdomError instanceof Error ? jsdomError.message : String(jsdomError);
      throw new Error(`Failed to parse HTML: ${errorMsg}`);
    }

    // Remove non-content elements
    const elementsToRemove = [
      'script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer',
      'header', 'aside', 'button', 'form', 'input', 'select', 'textarea', 'label'
    ];
    
    elementsToRemove.forEach(tag => {
      const elements = document.querySelectorAll(tag);
      elements.forEach(el => el.remove());
    });

    // Remove comments
    const comments = document.createNodeIterator(
      document.body,
      dom.window.NodeFilter.SHOW_COMMENT
    );
    let commentNode;
    while ((commentNode = comments.nextNode())) {
      if (commentNode.parentNode) {
        commentNode.parentNode.removeChild(commentNode);
      }
    }

    // Remove ad/tracking elements by class/id patterns
    const adPatterns = ['ad', 'cookie', 'sidebar', 'promo', 'advertisement', 'tracking'];
    adPatterns.forEach(pattern => {
      document.querySelectorAll(`[class*="${pattern}"], [id*="${pattern}"]`).forEach(el => {
        // Check if the class/id contains the pattern as a whole word
        const className = String(el.className || '');
        const id = String(el.id || '');
        const classRegex = new RegExp(String.raw`\b${pattern}\b`, 'i');
        const idRegex = new RegExp(String.raw`\b${pattern}\b`, 'i');
        if (classRegex.test(className) || idRegex.test(id)) {
          el.remove();
        }
      });
    });

    // Extract article content using multiple strategies
    let articleElement: Element | null = null;

    // Strategy 1: Look for <article> tag
    articleElement = document.querySelector('article');

    // Strategy 2: Look for <main> tag
    articleElement ??= document.querySelector('main');

    // Strategy 3: Look for AP News specific class (RichTextStoryBody)
    articleElement ??= document.querySelector('.RichTextStoryBody');

    // Strategy 4: Look for common article content class names
    if (!articleElement) {
      const contentClasses = [
        'article-body', 'story-body', 'content-body', 'article-content',
        'post-content', 'entry-content', 'ArticleBody', 'RichTextBody',
        'article__content', 'story-content', 'post-body'
      ];
      for (const className of contentClasses) {
        articleElement = document.querySelector(`.${className}`);
        if (articleElement) break;
      }
    }

    // Strategy 5: Look for <body> content as fallback
    articleElement ??= document.body;

    // Create images directory
    const imagesDir = path.join(cacheFolder, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Create image map
    const imageMap = new Map<string, string>();

    // Extract all image URLs from the document and download them
    const images = document.querySelectorAll('img');
    console.log(`[HtmlToMarkdown] Found ${images.length} images to process`);
    let downloadedCount = 0;
    for (const img of images) {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:')) {
        try {
          // Skip invalid URLs that contain special characters that break URL parsing
          // These are typically tracking/ad URLs that don't point to actual images
          if (src.includes('Not)A') ||
              src.includes('activityi;') ||
              src.includes('javascript:')) {
            continue;
          }
          
          // Resolve relative URLs against base URL
          let resolvedUrl = src;
          if (baseUrl) {
            const resolved = this.resolveImageUrl(src, baseUrl);
            if (resolved) {
              resolvedUrl = resolved;
            } else {
              console.warn(`[HtmlToMarkdown] Could not resolve relative URL: ${src}`);
              continue;
            }
          }
          
          // Skip URLs that still don't have a valid protocol
          if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://')) {
            console.warn(`[HtmlToMarkdown] Skipping invalid URL (no protocol): ${resolvedUrl}`);
            continue;
          }
          
          // Generate filename from the RESOLVED URL (not the original src)
          // This ensures consistent filenames regardless of how the URL was represented in HTML
          const urlHash = crypto.createHash('md5').update(resolvedUrl).digest('hex').substring(0, 16);
          const ext = this.getImageExtension(resolvedUrl);
          const filename = `img_${urlHash}${ext}`;
          const filepath = path.join(imagesDir, filename);
          
          // Check if image already exists
          if (fs.existsSync(filepath)) {
            // Still add to imageMap even if file exists (for markdown reference)
            const relativePath = `images/${filename}`;
            imageMap.set(src, relativePath);
            continue;
          } else {
            // Download image using curl (streams directly to disk)
            console.log(`[HtmlToMarkdown] Downloading image ${downloadedCount + 1}/${images.length}: ${resolvedUrl}`);
            await this.downloadImageWithCurl(resolvedUrl, filepath);
            downloadedCount++;
            console.log(`[HtmlToMarkdown] Downloaded ${downloadedCount}/${images.length} images`);
          }
          
          // Use relative path (images/filename.jpg) for markdown
          const relativePath = `images/${filename}`;
          imageMap.set(src, relativePath);
        } catch (e) {
          // Log but don't fail - images are best-effort
          console.warn(`[HtmlToMarkdown] Failed to download image ${src}:`, e instanceof Error ? e.message : e);
        }
      }
    }

    // Convert to markdown
    const markdown = this.elementToMarkdown(articleElement, imageMap);

    // Save markdown file
    fs.writeFileSync(markdownPath, markdown, 'utf-8');
    console.log(`[HtmlToMarkdown] Saved markdown to: ${markdownPath}`);

    // Save image map
    this.saveImageMap(cacheFolder, imageMap);

    return imageMap;
  }

  /**
   * Convert an HTML element to Markdown
   */
  private elementToMarkdown(element: Element | null, imageMap: Map<string, string>): string {
    if (!element) return '';

    let markdown = '';
    
    const processNode = (node: Node, depth: number = 0): string => {
      if (node.nodeType === 3) { // Text node
        // Normalize whitespace: collapse multiple spaces/tabs/newlines into single space
        const text = node.textContent || '';
        const normalized = text.replaceAll(/[\t\n\r]+/g, ' ').replaceAll(/ {2,}/g, ' ');
        // If the text node is only whitespace, return empty (ignore indentation)
        return normalized.trim() === '' ? '' : normalized;
      }
      
      if (node.nodeType !== 1) return ''; // Not an element
      
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();
      
      let result = '';
      
      switch (tagName) {
        case 'h1':
          result = `# ${getTextContent(el)}\n\n`;
          break;
        case 'h2':
          result = `## ${getTextContent(el)}\n\n`;
          break;
        case 'h3':
          result = `### ${getTextContent(el)}\n\n`;
          break;
        case 'h4':
          result = `#### ${getTextContent(el)}\n\n`;
          break;
        case 'h5':
          result = `##### ${getTextContent(el)}\n\n`;
          break;
        case 'h6':
          result = `###### ${getTextContent(el)}\n\n`;
          break;
        case 'p':
          { const pContent = processChildren(el, depth);
          if (pContent.trim()) {
            result = `${pContent}\n\n`;
          }
          break; }
        case 'br':
          result = '\n';
          break;
        case 'hr':
          result = '\n---\n\n';
          break;
        case 'a':
          { const href = el.getAttribute('href');
          const linkText = getTextContent(el);
          if (href && linkText) {
            result = `[${linkText}](${href})`;
          } else {
            result = linkText;
          }
          break; }
        case 'img':
          { const src = el.getAttribute('src');
          const alt = el.getAttribute('alt') || 'Image';
          if (src) {
            const mappedSrc = imageMap.get(src) || src;
            result = `![${alt}](${mappedSrc})\n\n`;
          }
          break; }
        case 'ul':
        case 'ol':
          { const listItems: string[] = [];
          el.querySelectorAll(':scope > li').forEach((li, index) => {
            const liText = processChildren(li, depth + 1).trim();
            const prefix = tagName === 'ol' ? `${index + 1}. ` : '- ';
            listItems.push(`${'  '.repeat(depth)}${prefix}${liText}`);
          });
          result = listItems.join('\n') + '\n\n';
          break; }
        case 'blockquote':
          { const quoteContent = processChildren(el, depth);
          const quotedLines = quoteContent.split('\n').map(line => `> ${line}`).join('\n');
          result = `${quotedLines}\n\n`;
          break; }
        case 'code':
          if (el.parentElement?.tagName.toLowerCase() === 'pre') {
            // Code block - already handled by pre
            result = getTextContent(el);
          } else {
            // Inline code
            result = `\`${getTextContent(el)}\``;
          }
          break;
        case 'pre':
          { const codeEl = el.querySelector('code');
          const codeContent = codeEl ? getTextContent(codeEl) : getTextContent(el);
          result = `\`\`\`\n${codeContent}\n\`\`\`\n\n`;
          break; }
        case 'strong':
        case 'b':
          result = `**${getTextContent(el)}**`;
          break;
        case 'em':
        case 'i':
          result = `*${getTextContent(el)}*`;
          break;
        case 'del':
        case 's':
          result = `~~${getTextContent(el)}~~`;
          break;
        case 'figure':
          result = processChildren(el, depth) + '\n';
          break;
        case 'figcaption':
          result = `*${getTextContent(el)}*\n\n`;
          break;
        case 'div':
        case 'section':
        case 'article':
        case 'main':
        case 'span':
          result = processChildren(el, depth);
          break;
        default:
          // For other elements, just process children
          result = processChildren(el, depth);
      }
      
      return result;
    };
    
    const processChildren = (el: Element, depth: number): string => {
      let result = '';
      for (const child of Array.from(el.childNodes)) {
        result += processNode(child, depth);
      }
      return result;
    };
    
    const getTextContent = (el: Element): string => {
      return (el.textContent || '').trim();
    };
    
    markdown = processNode(element);
    
    // Clean up excessive newlines and lines with only whitespace
    markdown = markdown
      .split('\n')
      .map(line => line.trimEnd()) // Remove trailing whitespace
      .filter(line => line.length > 0) // Remove empty lines (we'll restore paragraph spacing)
      .join('\n')
      .replaceAll(/\n{3,}/g, '\n\n') // Collapse multiple blank lines to double
      .trim();
    
    return markdown;
  }

  /**
   * Process a URL: fetch HTML, convert to markdown, download images
   * 
   * @param url - The URL to process
   * @param forceRefresh - If true, reprocess even if cached
   * @returns Result with paths to generated files
   */
  async processUrl(url: string, forceRefresh: boolean = false): Promise<HtmlToMarkdownResult> {
    try {
      // Check cache first
      if (!forceRefresh && this.isCached(url)) {
        const cacheFolder = this.findCacheFolder(url);
        if (cacheFolder) {
          const markdownPath = path.join(cacheFolder, 'article.md');
          const htmlPath = path.join(cacheFolder, 'article.html');
          
          // Check if images need to be re-downloaded
          if (this.needsImageRedownload(cacheFolder)) {
            console.log(`[HtmlToMarkdown] Cached article found but images need re-download: ${url}`);
            // Read the final URL from the metadata file if it exists
            const finalUrl = this.getFinalUrlFromCache(cacheFolder) || url;
            const imagesDownloaded = await this.redownloadImages(cacheFolder, finalUrl);
            console.log(`[HtmlToMarkdown] Re-downloaded ${imagesDownloaded} images`);
          } else {
            console.log(`[HtmlToMarkdown] Using cached result for: ${url}`);
          }
          
          return {
            success: true,
            cached: true,
            markdownUrl: this.getCachedMarkdownUrl(url),
            htmlPath: fs.existsSync(htmlPath) ? htmlPath : undefined,
            markdownPath: fs.existsSync(markdownPath) ? markdownPath : undefined,
          };
        }
      }

      // Create cache folder
      const cacheFolder = this.getCacheFolder(url);
      if (!fs.existsSync(cacheFolder)) {
        fs.mkdirSync(cacheFolder, { recursive: true });
      }

      const htmlPath = path.join(cacheFolder, 'article.html');
      const markdownPath = path.join(cacheFolder, 'article.md');

      // Fetch HTML and get the final URL after redirects
      console.log(`[HtmlToMarkdown] Fetching HTML for: ${url}`);
      const { finalUrl } = await this.fetchHtmlToFile(url, htmlPath);
      
      // Save the final URL to a metadata file for future reference
      this.saveFinalUrlToCache(cacheFolder, finalUrl);

      // Convert to markdown and download images (use final URL for relative image resolution)
      console.log(`[HtmlToMarkdown] Converting to markdown...`);
      const imageMap = await this.convertHtmlToMarkdownFile(htmlPath, markdownPath, cacheFolder, finalUrl);

      console.log(`[HtmlToMarkdown] Successfully processed: ${url}`);
      return {
        success: true,
        cached: false,
        markdownUrl: this.getCachedMarkdownUrl(url),
        htmlPath,
        markdownPath,
        imagesDownloaded: imageMap.size,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[HtmlToMarkdown] Failed to process URL: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Disconnect from the Chrome browser
   * Call this when shutting down the service
   */
  async disconnect(): Promise<void> {
    await this.chromeService.disconnect();
  }
}

/**
 * Helper function to create HtmlToMarkdownService instance
 * This creates a ChromeProcessService singleton to enable auto-starting Chrome
 */
export function createHtmlToMarkdownServiceFromEnv(cacheDir?: string): HtmlToMarkdownService {
  // Get or create the ChromeProcessService singleton for auto-starting Chrome
  const chromeProcessService = getChromeProcessService();
  
  // Create ChromeRemoteDebugService with ChromeProcessService for auto-start
  const chromeRemoteDebugService = createChromeRemoteDebugServiceFromEnv(chromeProcessService);
  
  // Create HtmlToMarkdownService with the configured ChromeRemoteDebugService
  const service = new HtmlToMarkdownService(cacheDir);
  
  // Replace the chromeService with our configured one that has ChromeProcessService
  (service as any).chromeService = chromeRemoteDebugService;
  
  return service;
}
