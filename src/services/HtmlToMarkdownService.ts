import { ChromeRemoteDebugService, createChromeRemoteDebugServiceFromEnv } from './ChromeRemoteDebugService';
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
   * Find the cache folder for a URL across multiple date folders
   * @param url - The URL to search for
   * @param daysToSearch - Number of days back to search (default: 30)
   * @returns The cache folder path if found, null otherwise
   */
  private findCacheFolder(url: string, daysToSearch: number = 30): string | null {
    const hash = this.getUrlHash(url);
    
    for (let i = 0; i < daysToSearch; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateFolder = date.toISOString().split('T')[0];
      const cacheFolder = path.join(this.cacheDir, dateFolder, hash);
      
      if (fs.existsSync(cacheFolder)) {
        const markdownPath = path.join(cacheFolder, 'article.md');
        if (fs.existsSync(markdownPath)) {
          return cacheFolder;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a URL has already been processed
   * @param url - The URL to check
   * @param daysToSearch - Number of days back to search (default: 30)
   */
  private isCached(url: string, daysToSearch: number = 30): boolean {
    return this.findCacheFolder(url, daysToSearch) !== null;
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
  private async fetchHtmlToFile(url: string, htmlPath: string): Promise<void> {
    console.log(`[HtmlToMarkdown] Fetching HTML via CDP: ${url}`);
    
    try {
      // Connect to remote Chrome if not already connected
      if (!this.chromeService.isConnected()) {
        await this.chromeService.connect();
      }
      
      // Navigate and get content
      const content = await this.chromeService.navigateAndGetContent(url, {
        timeout: 60000,
        waitUntil: 'networkidle', // Wait for JavaScript to finish
      });
      
      // Check for error page
      if (this.isErrorPage(content.html)) {
        throw new Error(
          `Browser returned an error page. The site may be unreachable. URL: ${url}`
        );
      }
      
      // Save HTML to file
      console.log(`[HtmlToMarkdown] Saving HTML to file: ${htmlPath} (${content.html.length} bytes)`);
      fs.writeFileSync(htmlPath, content.html, 'utf-8');
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[HtmlToMarkdown] Failed to fetch HTML: ${errorMsg}`);
      throw error;
    }
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
   * Convert HTML file to markdown file using jsdom
   * Also extracts and downloads images in a single pass (no duplicate JSDOM creation)
   * Returns the image map for backward compatibility
   */
  private async convertHtmlToMarkdownFile(htmlPath: string, markdownPath: string, cacheFolder: string): Promise<Map<string, string>> {
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
              src.includes('javascript:') ||
              src.includes(')') ||  // Skip URLs with closing parenthesis (breaks curl)
              src.includes(';') ||   // Skip URLs with semicolons (tracking URLs)
              src.includes('?') && src.includes(';')) {  // Skip complex tracking URLs
            continue;
          }
          
          // Generate filename from URL
          const urlHash = crypto.createHash('md5').update(src).digest('hex').substring(0, 16);
          const ext = this.getImageExtension(src);
          const filename = `img_${urlHash}${ext}`;
          const filepath = path.join(imagesDir, filename);
          
          // Check if image already exists
          if (fs.existsSync(filepath)) {
            continue;
          } else {
            // Download image using curl (streams directly to disk)
            console.log(`[HtmlToMarkdown] Downloading image ${downloadedCount + 1}/${images.length}: ${src}`);
            await this.downloadImageWithCurl(src, filepath);
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
        return node.textContent || '';
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
    
    // Clean up excessive newlines
    markdown = markdown.replaceAll(/\n{3,}/g, '\n\n').trim();
    
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
          
          console.log(`[HtmlToMarkdown] Using cached result for: ${url}`);
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

      // Fetch HTML
      console.log(`[HtmlToMarkdown] Fetching HTML for: ${url}`);
      await this.fetchHtmlToFile(url, htmlPath);

      // Convert to markdown and download images
      console.log(`[HtmlToMarkdown] Converting to markdown...`);
      const imageMap = await this.convertHtmlToMarkdownFile(htmlPath, markdownPath, cacheFolder);

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
 */
export function createHtmlToMarkdownServiceFromEnv(cacheDir?: string): HtmlToMarkdownService {
  return new HtmlToMarkdownService(cacheDir);
}
