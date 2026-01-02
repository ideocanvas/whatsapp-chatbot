import { createDesktopToWebServiceFromEnv, DesktopToWebService } from './DesktopToWebService';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
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

export class HtmlToMarkdownService {
  private desktopService: DesktopToWebService;
  private cacheDir: string;

  constructor(cacheDir: string = './data/html/cache') {
    this.desktopService = createDesktopToWebServiceFromEnv();
    this.cacheDir = cacheDir;
    
    // Ensure cache directory exists
    this.ensureCacheDir();
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
   * Verify that the expected content is actually in the clipboard
   * This catches cases where sendToClipboard returns success but the clipboard wasn't updated
   *
   * @param expectedContent - The expected content in clipboard
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns true if verified, false if failed after all retries
   */
  private async verifyClipboardContent(
    expectedContent: string,
    maxRetries: number = 3
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const readResult = await this.desktopService.readFromClipboard();
      
      if (readResult.status === 'success' && readResult.text) {
        const actualContent = readResult.text.trim();
        const expectedTrimmed = expectedContent.trim();
        
        if (actualContent === expectedTrimmed) {
          console.log(`[DEBUG] Clipboard verified on attempt ${attempt}/${maxRetries}`);
          return true;
        }
        
        console.warn(
          `[DEBUG] Clipboard mismatch on attempt ${attempt}/${maxRetries}: ` +
          `expected "${expectedTrimmed.substring(0, 50)}${expectedTrimmed.length > 50 ? '...' : ''}", ` +
          `got "${actualContent.substring(0, 50)}${actualContent.length > 50 ? '...' : ''}"`
        );
      } else {
        console.warn(`[DEBUG] Failed to read clipboard on attempt ${attempt}/${maxRetries}: ${readResult.message}`);
      }
      
      // Wait before retry (exponential backoff: 500ms, 1000ms, 2000ms)
      if (attempt < maxRetries) {
        const delay = 500 * Math.pow(2, attempt - 1);
        console.log(`[DEBUG] Retrying clipboard verification in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    console.error(`[ERROR] Failed to verify clipboard content after ${maxRetries} attempts`);
    return false;
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
      /This site can(?:’|')t be reached/i,
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
      /<span>This site can(?:’|')t be reached<\/span>/i,
    ];
    
    return errorPatterns.some(pattern => pattern.test(html));
  }

  /**
   * Fetch HTML from URL using DesktopToWebService and save to file
   * Creates a fresh DesktopToWebService instance for each request to prevent connection issues
   * Now includes clipboard verification and error page detection
   */
  private async fetchHtmlToFile(url: string, htmlPath: string): Promise<void> {
    // Create a fresh service instance for this request to prevent connection reuse issues
    const desktopService = createDesktopToWebServiceFromEnv();
    
    // Step 1: Send URL to clipboard
    console.log(`[DEBUG] Sending URL to clipboard: ${url}`);
    const sendResult = await desktopService.sendToClipboard(url);
    if (sendResult.status !== 'success') {
      throw new Error(`Failed to send URL to clipboard: ${sendResult.message}`);
    }

    // Step 1.5: Verify URL is actually in clipboard (prevents silent clipboard failures)
    console.log(`[DEBUG] Verifying clipboard content...`);
    const verified = await this.verifyClipboardContent(url, 3);
    if (!verified) {
      throw new Error(
        `Failed to verify URL in clipboard after 3 attempts. ` +
        `This indicates a clipboard service issue. ` +
        `URL: ${url}`
      );
    }

    // Step 2: Execute get_page_content script
    console.log(`[DEBUG] Executing get_page_content script...`);
    const executeResult = await desktopService.executeScript('get_page_content', {}, 300);
    if (executeResult.status !== 'success') {
      throw new Error(`Failed to execute script: ${executeResult.message}`);
    }

    // Step 3: Read HTML content from clipboard
    console.log(`[DEBUG] Reading HTML from clipboard...`);
    const readResult = await desktopService.readFromClipboard();
    if (readResult.status !== 'success' || !readResult.text) {
      throw new Error(`Failed to read from clipboard: ${readResult.message}`);
    }

    // Step 3.5: Validate HTML is not an error page
    console.log(`[DEBUG] Checking if returned content is an error page...`);
    if (this.isErrorPage(readResult.text)) {
      throw new Error(
        `Browser returned an error page. ` +
        `This may indicate the URL was not properly sent to clipboard or the site is unreachable. ` +
        `URL: ${url}`
      );
    }

    // Step 4: Save HTML to file
    console.log(`[DEBUG] Saving HTML to file: ${htmlPath}`);
    fs.writeFileSync(htmlPath, readResult.text, 'utf-8');
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
   * Convert HTML file to markdown file using jsdom
   * Also extracts and downloads images in a single pass (no duplicate JSDOM creation)
   * Returns the image map for backward compatibility
   */
  private async convertHtmlToMarkdownFile(htmlPath: string, markdownPath: string, cacheFolder: string): Promise<Map<string, string>> {
    console.log(`[DEBUG] Reading HTML file: ${htmlPath}`);
    let html = fs.readFileSync(htmlPath, 'utf-8');
    console.log(`[DEBUG] HTML file size: ${html.length} bytes`);

    // Clean HTML BEFORE creating JSDOM to speed up parsing
    console.log(`[DEBUG] Cleaning HTML...`);
    const originalSize = html.length;
    html = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');
    console.log(`[DEBUG] HTML cleaned: ${originalSize} -> ${html.length} bytes (${((1 - html.length / originalSize) * 100).toFixed(1)}% reduction)`);

    console.log(`[DEBUG] Creating JSDOM...`);
    let dom: JSDOM;
    let document: Document;
    
    try {
      dom = new JSDOM(html);
      document = dom.window.document;
      console.log(`[DEBUG] JSDOM created successfully`);
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
        const classRegex = new RegExp(`\\b${pattern}\\b`, 'i');
        const idRegex = new RegExp(`\\b${pattern}\\b`, 'i');
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
    if (!articleElement) {
      articleElement = document.querySelector('main');
    }

    // Strategy 3: Look for AP News specific class (RichTextStoryBody)
    if (!articleElement) {
      articleElement = document.querySelector('.RichTextStoryBody');
    }

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
    if (!articleElement) {
      articleElement = document.body;
    }

    // Create images directory
    const imagesDir = path.join(cacheFolder, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Create image map
    const imageMap = new Map<string, string>();

    // Extract all image URLs from the document and download them
    const images = document.querySelectorAll('img');
    console.log(`[DEBUG] Found ${images.length} images to process`);
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
            console.log(`[DEBUG] Downloading image ${downloadedCount + 1}/${images.length}: ${src}`);
            await this.downloadImageWithCurl(src, filepath);
            downloadedCount++;
            console.log(`[DEBUG] Downloaded ${downloadedCount}/${images.length} images`);
          }
          
          // Use relative path (images/filename.jpg) for markdown
          const relativePath = `images/${filename}`;
          imageMap.set(src, relativePath);
        } catch (e) {
          // Silently skip failed image downloads
        }
      }
    }

    // Convert the article element to markdown
    let markdown = '';
    if (articleElement) {
      markdown = this.elementToMarkdown(articleElement, imageMap);
    }

    // Save markdown to file
    fs.writeFileSync(markdownPath, markdown, 'utf-8');

    // Save image map to JSON for backward compatibility
    this.saveImageMap(cacheFolder, imageMap);

    return imageMap;
  }

  /**
   * Convert HTML to markdown using jsdom for proper DOM parsing
   */
  private convertHtmlToMarkdown(html: string, imageMap: Map<string, string>): string {
    const dom = new JSDOM(html);
    const document = dom.window.document;

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
        const className = el.className || '';
        const id = el.id || '';
        const classRegex = new RegExp(`\\b${pattern}\\b`, 'i');
        const idRegex = new RegExp(`\\b${pattern}\\b`, 'i');
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
    if (!articleElement) {
      articleElement = document.querySelector('main');
    }

    // Strategy 3: Look for AP News specific class (RichTextStoryBody)
    if (!articleElement) {
      articleElement = document.querySelector('.RichTextStoryBody');
    }

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
    if (!articleElement) {
      articleElement = document.body;
    }

    // Convert the article element to markdown
    if (articleElement) {
      return this.elementToMarkdown(articleElement, imageMap);
    }

    return '';
  }

  /**
   * Convert a DOM element to markdown
   */
  private elementToMarkdown(element: Element, imageMap: Map<string, string>): string {
    let markdown = '';

    for (const child of element.childNodes) {
      if (child.nodeType === 3) { // TEXT_NODE = 3
        const text = child.textContent || '';
        if (text.trim()) {
          markdown += text;
        }
      } else if (child.nodeType === 1) { // ELEMENT_NODE = 1
        const el = child as Element;
        const tagName = el.tagName.toLowerCase();

        switch (tagName) {
          case 'h1':
            markdown += `\n# ${this.elementToMarkdown(el, imageMap).trim()}\n\n`;
            break;
          case 'h2':
            markdown += `\n## ${this.elementToMarkdown(el, imageMap).trim()}\n\n`;
            break;
          case 'h3':
            markdown += `\n### ${this.elementToMarkdown(el, imageMap).trim()}\n\n`;
            break;
          case 'h4':
            markdown += `\n#### ${this.elementToMarkdown(el, imageMap).trim()}\n\n`;
            break;
          case 'h5':
            markdown += `\n##### ${this.elementToMarkdown(el, imageMap).trim()}\n\n`;
            break;
          case 'h6':
            markdown += `\n###### ${this.elementToMarkdown(el, imageMap).trim()}\n\n`;
            break;
          case 'strong':
          case 'b':
            markdown += `**${this.elementToMarkdown(el, imageMap).trim()}**`;
            break;
          case 'em':
          case 'i':
            markdown += `*${this.elementToMarkdown(el, imageMap).trim()}*`;
            break;
          case 'a':
            const href = el.getAttribute('href');
            const linkText = this.elementToMarkdown(el, imageMap).trim();
            if (href) {
              markdown += `[${linkText}](${href})`;
            } else {
              markdown += linkText;
            }
            break;
          case 'img':
            const src = el.getAttribute('src');
            const alt = el.getAttribute('alt') || '';
            if (src) {
              const relativePath = imageMap.get(src);
              if (relativePath) {
                markdown += `![${alt}](${relativePath})`;
              } else {
                markdown += `![${alt}](${src})`;
              }
            }
            break;
          case 'ul':
            markdown += '\n';
            const liItems = el.querySelectorAll(':scope > li');
            liItems.forEach(li => {
              markdown += `- ${this.elementToMarkdown(li, imageMap).trim()}\n`;
            });
            markdown += '\n';
            break;
          case 'ol':
            markdown += '\n';
            const olItems = el.querySelectorAll(':scope > li');
            olItems.forEach((li, index) => {
              markdown += `${index + 1}. ${this.elementToMarkdown(li, imageMap).trim()}\n`;
            });
            markdown += '\n';
            break;
          case 'li':
            markdown += this.elementToMarkdown(el, imageMap).trim();
            break;
          case 'blockquote':
            const quoteText = this.elementToMarkdown(el, imageMap).trim();
            markdown += `\n> ${quoteText}\n\n`;
            break;
          case 'pre':
            const codeContent = el.textContent || '';
            markdown += `\n\`\`\`\n${codeContent}\n\`\`\`\n\n`;
            break;
          case 'code':
            if (el.parentElement?.tagName.toLowerCase() !== 'pre') {
              markdown += `\`${el.textContent || ''}\``;
            } else {
              markdown += el.textContent || '';
            }
            break;
          case 'p':
            const pText = this.elementToMarkdown(el, imageMap).trim();
            if (pText) {
              markdown += `${pText}\n\n`;
            }
            break;
          case 'br':
            markdown += '\n';
            break;
          case 'div':
          case 'section':
          case 'span':
            // Process children but don't add extra spacing
            markdown += this.elementToMarkdown(el, imageMap);
            break;
          case 'figure':
            // Handle figure with image and caption
            const img = el.querySelector('img');
            const figcaption = el.querySelector('figcaption');
            if (img) {
              const src = img.getAttribute('src');
              const alt = img.getAttribute('alt') || '';
              if (src) {
                const relativePath = imageMap.get(src);
                const imgPath = relativePath || src;
                markdown += `![${alt}](${imgPath})\n\n`;
              }
            }
            if (figcaption) {
              const captionText = this.elementToMarkdown(figcaption, imageMap).trim();
              markdown += `*${captionText}*\n\n`;
            }
            break;
          case 'figcaption':
            // Content is handled by figure
            break;
          case 'source':
            // Skip source tags (used for responsive images)
            break;
          case 'picture':
            // Process the img tag inside picture
            const pictureImg = el.querySelector('img');
            if (pictureImg) {
              markdown += this.elementToMarkdown(pictureImg, imageMap);
            }
            break;
          default:
            // For unknown elements, just process children
            markdown += this.elementToMarkdown(el, imageMap);
        }
      }
    }

    return markdown;
  }

  /**
   * Decode HTML entities
   */
  private decodeHtmlEntities(str: string): string {
    if (!str) return str;
    return str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, "'")
      .replace(/'/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–')
      .replace(/&hellip;/g, '...');
  }

  /**
   * Download a single image using curl (streams directly to disk, no memory buffering)
   */
  private async downloadImageWithCurl(imgUrl: string, filepath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[DEBUG] Starting curl download: ${imgUrl}`);
      const curl = spawn('curl', [
        '-s',           // Silent mode
        '-L',           // Follow redirects
        '-g',           // Disable globbing (important for URLs with special chars like ')')
        '-o', filepath, // Output to file
        '--max-time', '30', // 30 second timeout
        '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', // User agent
        imgUrl
      ]);

      curl.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`curl exited with code ${code}`));
        }
      });

      curl.on('error', reject);
    });
  }

  /**
   * Get image extension from URL (no HEAD request needed)
   */
  private getImageExtension(url: string): string {
    try {
      // Handle malformed URLs by extracting the path manually
      // Some URLs contain special characters like ')' that break URL parsing
      let urlPath: string;
      
      try {
        urlPath = new URL(url).pathname;
      } catch {
        // If URL parsing fails, try to extract path manually
        // Remove protocol and domain to get the path
        const withoutProtocol = url.replace(/^https?:\/\//, '');
        const firstSlash = withoutProtocol.indexOf('/');
        if (firstSlash >= 0) {
          urlPath = withoutProtocol.substring(firstSlash);
        } else {
          urlPath = url;
        }
      }
      
      const ext = path.extname(urlPath);
      if (ext && ext.length <= 5) {
        return ext;
      }
    } catch {
      // Invalid URL
    }
    // Fallback to .jpg
    return '.jpg';
  }


  /**
   * Process a URL: fetch HTML, convert to markdown, download images
   * Returns the markdown URL path
   */
  async processUrl(url: string): Promise<HtmlToMarkdownResult> {
    // Create cache folder
    const cacheFolder = this.getCacheFolder(url);
    if (!fs.existsSync(cacheFolder)) {
      fs.mkdirSync(cacheFolder, { recursive: true });
    }

    const htmlPath = path.join(cacheFolder, 'article.html');
    const markdownPath = path.join(cacheFolder, 'article.md');

    try {
      // Check if already cached
      if (this.isCached(url)) {
        return {
          success: true,
          markdownUrl: this.getCachedMarkdownUrl(url),
          cached: true
        };
      }

      // Step 1: Fetch HTML and save to file (skip if already exists)
      if (!fs.existsSync(htmlPath)) {
        await this.fetchHtmlToFile(url, htmlPath);
      }

      // Step 2: Convert HTML to markdown and download images in a single pass
      // This avoids creating JSDOM twice and saves memory
      console.log(`[DEBUG] Converting HTML to markdown: ${htmlPath} -> ${markdownPath}`);
      const imageMap = await this.convertHtmlToMarkdownFile(htmlPath, markdownPath, cacheFolder);

      // Step 3: Return markdown URL
      const dateFolder = this.getDateFolder();
      const hash = this.getUrlHash(url);
      const markdownUrl = `/html/cache/${dateFolder}/${hash}/article.md`;

      return {
        success: true,
        markdownUrl,
        htmlPath,
        markdownPath,
        imagesDownloaded: imageMap.size,
        cached: false
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.desktopService.isConfigured();
  }
}

// Helper function to create HtmlToMarkdownService instance from environment variables
export function createHtmlToMarkdownServiceFromEnv(cacheDir?: string): HtmlToMarkdownService {
  return new HtmlToMarkdownService(cacheDir);
}