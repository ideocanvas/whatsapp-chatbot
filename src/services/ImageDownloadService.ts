import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface DownloadedImage {
  filename: string;
  filepath: string;
  url: string;
  mimeType: string;
  size: number;
  sha256: string;
  timestamp: string;
}

export interface ImageDownloadResult {
  success: boolean;
  images: DownloadedImage[];
  error?: string;
}

export class ImageDownloadService {
  private baseDir: string;

  constructor(baseDir: string = 'data/images') {
    this.baseDir = baseDir;
    this.ensureDirectoryStructure();
  }

  /**
   * Ensure the directory structure exists
   */
  private ensureDirectoryStructure(): void {
    const today = new Date();
    const dateDir = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const processedDir = path.join(this.baseDir, 'processed');
    
    const directories = [
      this.baseDir,
      path.join(this.baseDir, dateDir),
      processedDir
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Download images from a web page and extract them
   */
  async downloadImagesFromUrl(articleUrl: string, htmlContent: string): Promise<ImageDownloadResult> {
    try {
      console.log(`📸 Extracting images from: ${articleUrl}`);
      
      // Extract image URLs from HTML content
      const imageUrls = this.extractImageUrls(htmlContent, articleUrl);
      console.log(`🔍 Found ${imageUrls.length} potential images`);

      if (imageUrls.length === 0) {
        return { success: true, images: [] };
      }

      const downloadedImages: DownloadedImage[] = [];
      const today = new Date();
      const dateDir = today.toISOString().split('T')[0];
      const articleHash = this.generateArticleHash(articleUrl);

      for (const imageUrl of imageUrls.slice(0, 5)) { // Limit to 5 images per article
        try {
          const image = await this.downloadSingleImage(imageUrl, dateDir, articleHash);
          if (image) {
            downloadedImages.push(image);
            console.log(`✅ Downloaded image: ${image.filename}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to download image ${imageUrl}:`, error);
        }

        // Small delay to be respectful
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return { success: true, images: downloadedImages };
    } catch (error) {
      console.error(`❌ Error downloading images from ${articleUrl}:`, error);
      return { 
        success: false, 
        images: [], 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Extract image URLs from HTML content
   */
  private extractImageUrls(html: string, baseUrl: string): string[] {
    const imageUrls: string[] = [];
    const imagePattern = /<img[^>]+src="([^">]+)"/gi;
    
    let match;
    while ((match = imagePattern.exec(html)) !== null) {
      let imageUrl = match[1].trim();
      
      // Resolve relative URLs
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        try {
          const urlObj = new URL(baseUrl);
          imageUrl = urlObj.origin + imageUrl;
        } catch {
          // Skip invalid URLs
          continue;
        }
      } else if (!imageUrl.startsWith('http')) {
        try {
          const urlObj = new URL(baseUrl);
          imageUrl = urlObj.origin + '/' + imageUrl;
        } catch {
          // Skip invalid URLs
          continue;
        }
      }

      // Filter out common tracking/analytics images
      if (this.isValidImageUrl(imageUrl)) {
        imageUrls.push(imageUrl);
      }
    }

    return [...new Set(imageUrls)]; // Remove duplicates
  }

  /**
   * Check if URL is a valid image (not tracking pixel, etc.)
   */
  private isValidImageUrl(url: string): boolean {
    const invalidPatterns = [
      /pixel\./i,
      /tracking\./i,
      /beacon\./i,
      /analytics\./i,
      /1x1\./i,
      /clear\.gif/i,
      /spacer\.gif/i,
      /transparent\.gif/i
    ];

    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const hasValidExtension = validExtensions.some(ext => url.toLowerCase().includes(ext));

    return hasValidExtension && !invalidPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Download a single image
   */
  private async downloadSingleImage(
    imageUrl: string, 
    dateDir: string, 
    articleHash: string
  ): Promise<DownloadedImage | null> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.status !== 200) {
        return null;
      }

      const imageBuffer = Buffer.from(response.data);
      const sha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');
      const timestamp = Date.now();
      
      // Determine file extension from content type or URL
      const contentType = response.headers['content-type'];
      const extension = this.getExtensionFromContentType(contentType, imageUrl);
      
      if (!extension) {
        return null; // Skip if we can't determine extension
      }

      const filename = `article_${articleHash}_image_${timestamp}.${extension}`;
      const filepath = path.join(this.baseDir, dateDir, filename);

      // Save the image
      fs.writeFileSync(filepath, imageBuffer);

      return {
        filename,
        filepath,
        url: imageUrl,
        mimeType: contentType || 'image/jpeg',
        size: imageBuffer.length,
        sha256,
        timestamp: new Date(timestamp).toISOString()
      };
    } catch (error) {
      console.warn(`⚠️ Failed to download image: ${imageUrl}`, error);
      return null;
    }
  }

  /**
   * Get file extension from content type or URL
   */
  private getExtensionFromContentType(contentType: string | undefined, url: string): string | null {
    if (contentType) {
      const mimeToExt: { [key: string]: string } = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/bmp': 'bmp',
        'image/svg+xml': 'svg'
      };

      const cleanType = contentType.split(';')[0].trim();
      if (mimeToExt[cleanType]) {
        return mimeToExt[cleanType];
      }
    }

    // Fallback: extract from URL
    const urlExt = url.split('.').pop()?.toLowerCase();
    const validExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
    
    if (urlExt && validExts.includes(urlExt)) {
      return urlExt;
    }

    return null;
  }

  /**
   * Generate a hash for article identification
   */
  private generateArticleHash(url: string): string {
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  }

  /**
   * Clean up old images (optional maintenance function)
   */
  async cleanupOldImages(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      if (!fs.existsSync(this.baseDir)) {
        return;
      }

      const dateDirs = fs.readdirSync(this.baseDir);
      
      for (const dateDir of dateDirs) {
        if (dateDir === 'processed') continue;

        const dirDate = new Date(dateDir);
        if (isNaN(dirDate.getTime()) || dirDate < cutoffDate) {
          const fullPath = path.join(this.baseDir, dateDir);
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`🧹 Cleaned up old images from: ${dateDir}`);
        }
      }
    } catch (error) {
      console.error('❌ Error cleaning up old images:', error);
    }
  }
}

export function createImageDownloadService(baseDir?: string): ImageDownloadService {
  return new ImageDownloadService(baseDir);
}