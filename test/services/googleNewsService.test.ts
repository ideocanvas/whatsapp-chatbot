import { GoogleNewsService } from '../../src/services/GoogleNewsService';
import { WebScrapeService } from '../../src/services/WebScrapeService';
import { OpenAIService } from '../../src/services/OpenAIService';
import { PrismaClient } from '@prisma/client';

// Mock dependencies
jest.mock('../../src/services/webScrapeService');
jest.mock('../../src/services/openaiService');
jest.mock('@prisma/client');

describe('GoogleNewsService', () => {
  let googleNewsService: GoogleNewsService;
  let mockWebScrapeService: jest.Mocked<WebScrapeService>;
  let mockOpenAIService: jest.Mocked<OpenAIService>;
  let mockPrismaClient: {
    newsSource: { findMany: jest.Mock };
    newsKeyword: { findFirst: jest.Mock; update: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    blogPost: { count: jest.Mock };
    $connect: jest.Mock;
    $disconnect: jest.Mock;
  };

  beforeEach(() => {
    mockWebScrapeService = {
      scrapeUrl: jest.fn()
    } as any;

    mockOpenAIService = {
      generateTextResponse: jest.fn()
    } as any;

    mockPrismaClient = {
      newsSource: {
        findMany: jest.fn()
      },
      newsKeyword: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn()
      },
      blogPost: {
        count: jest.fn()
      },
      $connect: jest.fn(),
      $disconnect: jest.fn()
    };

    // Mock PrismaClient constructor to return our simplified mock
    (PrismaClient as jest.MockedClass<typeof PrismaClient>).mockImplementation(() => mockPrismaClient as any);

    googleNewsService = new GoogleNewsService(
      mockWebScrapeService,
      mockOpenAIService
    );
  });

  describe('Database News Sources Integration', () => {
    it('should load news sources from database on initialization', async () => {
      const mockSources = [
        { url: 'https://news.google.com/home?hl=en-US', isActive: true, priority: 10 },
        { url: 'https://news.google.com/home?hl=zh-HK', isActive: true, priority: 8 }
      ];

      (mockPrismaClient.newsSource.findMany as jest.Mock).mockResolvedValue(mockSources);

      // Access private method for testing
      await (googleNewsService as any).loadNewsSourcesFromDatabase();

      expect(mockPrismaClient.newsSource.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { priority: 'desc' }
      });

      // Configuration should now use database URLs
      expect((googleNewsService as any).config.urls).toEqual([
        'https://news.google.com/home?hl=en-US',
        'https://news.google.com/home?hl=zh-HK'
      ]);
    });

    it('should fallback to default URLs when database fails', async () => {
      (mockPrismaClient.newsSource.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      await (googleNewsService as any).loadNewsSourcesFromDatabase();

      // Should use fallback URLs when database fails
      expect((googleNewsService as any).config.urls).toEqual([
        'https://news.google.com/home?hl=en-HK&gl=HK&ceid=HK:en',
        'https://news.google.com/home?hl=zh-HK&gl=HK&ceid=HK:zh-Hant',
        'https://news.google.com/home?hl=en-US&gl=US&ceid=US:en'
      ]);
    });

    it('should refresh news sources on demand', async () => {
      const mockSources = [
        { url: 'https://news.google.com/new-source', isActive: true, priority: 10 }
      ];

      (mockPrismaClient.newsSource.findMany as jest.Mock).mockResolvedValue(mockSources);

      await googleNewsService.refreshNewsSources();

      expect((googleNewsService as any).config.urls).toEqual(['https://news.google.com/new-source']);
    });

    it('should ensure sources are loaded before operations', async () => {
      // Clear URLs to simulate uninitialized state
      (googleNewsService as any).config.urls = [];

      const mockSources = [
        { url: 'https://news.google.com/from-db', isActive: true, priority: 10 }
      ];
      (mockPrismaClient.newsSource.findMany as jest.Mock).mockResolvedValue(mockSources);

      await (googleNewsService as any).ensureNewsSources();

      expect((googleNewsService as any).config.urls).toEqual(['https://news.google.com/from-db']);
    });
  });

  describe('News Operations', () => {
    it('should handle empty news sources gracefully in deep browsing', async () => {
      (googleNewsService as any).config.urls = [];

      const result = await googleNewsService.performDeepNewsBrowsing();

      expect(result).toEqual([]);
      // Should have called ensureNewsSources internally
      expect(mockPrismaClient.newsSource.findMany).toHaveBeenCalled();
    });

    it('should handle empty news sources gracefully in quick check', async () => {
      (googleNewsService as any).config.urls = [];

      const result = await googleNewsService.performQuickNewsCheck();

      expect(result).toEqual([]);
      // Should have called ensureNewsSources internally
      expect(mockPrismaClient.newsSource.findMany).toHaveBeenCalled();
    });
  });
});
