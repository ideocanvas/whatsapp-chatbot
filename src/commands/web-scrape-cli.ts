#!/usr/bin/env node

import { Command } from 'commander';
import { WebScrapeService, WebScrapeResult } from '../services/WebScrapeService';
import * as fs from 'fs';
import * as path from 'path';

// Parse command line arguments
const program = new Command();

program
  .name('webscrape')
  .description('Web scraping command line tool for extracting content from URLs')
  .version('1.0.0');

// Single URL scraping command
program
  .command('scrape')
  .description('Scrape content from a single URL')
  .requiredOption('-u, --url <url>', 'URL to scrape (required)')
  .option('-s, --selector <selector>', 'CSS selector for specific content extraction')
  .option('-m, --mobile', 'Use mobile view for scraping')
  .option('-o, --output <file>', 'Output file path to save results (JSON format)')
  .option('--timeout <ms>', 'Timeout in milliseconds', '60000')
  .option('--retries <number>', 'Number of retry attempts', '2')
  .action(async (options) => {
    try {
      console.log(`🔍 Starting web scrape for: ${options.url}`);

      const config = {
        timeout: parseInt(options.timeout),
        maxRetries: parseInt(options.retries),
        mobileView: options.mobile || false
      };

      const service = new WebScrapeService(config);

      const result = await service.scrapeUrl(
        options.url,
        options.selector,
        options.mobile
      );

      console.log('✅ Scraping completed successfully!');
      console.log(`📄 Title: ${result.title}`);
      console.log(`🌐 URL: ${result.url}`);
      console.log(`📊 Method: ${result.method}`);
      console.log(`📱 Mobile View: ${result.mobileView ? 'Yes' : 'No'}`);
      console.log(`📏 Content Length: ${result.content.length} characters`);
      console.log(`🔗 Links Found: ${result.links.length}`);
      console.log(`⏰ Extracted At: ${result.extractedAt}`);

      if (result.lastUpdateDate) {
        console.log(`📅 Last Update: ${result.lastUpdateDate}`);
      }

      // Save to file if output path is provided
      if (options.output) {
        const outputPath = path.resolve(options.output);
        const outputDir = path.dirname(outputPath);

        // Create directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
        console.log(`💾 Results saved to: ${outputPath}`);
      }

      await service.close();
    } catch (error) {
      console.error('❌ Error during scraping:', error);
      process.exit(1);
    }
  });

// Batch URL scraping command
program
  .command('batch')
  .description('Scrape content from multiple URLs')
  .requiredOption('-f, --file <file>', 'File containing URLs (one per line)')
  .option('-s, --selector <selector>', 'CSS selector for specific content extraction')
  .option('-m, --mobile', 'Use mobile view for scraping')
  .option('-o, --output <file>', 'Output file path to save results (JSON format)')
  .option('--timeout <ms>', 'Timeout in milliseconds', '60000')
  .option('--retries <number>', 'Number of retry attempts', '2')
  .option('--concurrency <number>', 'Number of concurrent scrapes', '3')
  .action(async (options) => {
    try {
      if (!fs.existsSync(options.file)) {
        console.error(`❌ File not found: ${options.file}`);
        process.exit(1);
      }

      const urls = fs.readFileSync(options.file, 'utf-8')
        .split('\n')
        .map(url => url.trim())
        .filter(url => url.length > 0 && url.startsWith('http'));

      if (urls.length === 0) {
        console.error('❌ No valid URLs found in the file');
        process.exit(1);
      }

      console.log(`🔍 Starting batch scrape for ${urls.length} URLs`);

      const config = {
        timeout: parseInt(options.timeout),
        maxRetries: parseInt(options.retries),
        concurrency: parseInt(options.concurrency),
        mobileView: options.mobile || false
      };

      const service = new WebScrapeService(config);

      const results = await service.scrapeUrls(
        urls,
        options.selector,
        options.mobile
      );

      console.log('✅ Batch scraping completed!');
      console.log(`📊 Successful scrapes: ${results.length}`);
      console.log(`❌ Failed scrapes: ${urls.length - results.length}`);

      // Display summary
      results.forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.title}`);
        console.log(`   URL: ${result.url}`);
        console.log(`   Content Length: ${result.content.length} characters`);
        console.log(`   Method: ${result.method}`);
      });

      // Save to file if output path is provided
      if (options.output) {
        const outputPath = path.resolve(options.output);
        const outputDir = path.dirname(outputPath);

        // Create directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        console.log(`💾 Results saved to: ${outputPath}`);
      }

      await service.close();
    } catch (error) {
      console.error('❌ Error during batch scraping:', error);
      process.exit(1);
    }
  });

// Extract links command
program
  .command('links')
  .description('Extract article links from a hub page')
  .requiredOption('-u, --url <url>', 'URL of the hub page (required)')
  .option('-o, --output <file>', 'Output file path to save links (JSON format)')
  .action(async (options) => {
    try {
      console.log(`🔗 Extracting links from: ${options.url}`);

      const service = new WebScrapeService();

      const links = await service.extractArticleLinks(options.url);

      console.log('✅ Link extraction completed!');
      console.log(`📊 Links found: ${links.length}`);

      // Display links
      links.forEach((link, index) => {
        console.log(`\n${index + 1}. ${link.title}`);
        console.log(`   URL: ${link.url}`);
      });

      // Save to file if output path is provided
      if (options.output) {
        const outputPath = path.resolve(options.output);
        const outputDir = path.dirname(outputPath);

        // Create directory if it doesn't exist
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(links, null, 2));
        console.log(`💾 Links saved to: ${outputPath}`);
      }

      await service.close();
    } catch (error) {
      console.error('❌ Error during link extraction:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parseAsync(process.argv).catch((error) => {
  console.error('❌ Command execution failed:', error);
  process.exit(1);
});