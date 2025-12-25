import { createHtmlToMarkdownServiceFromEnv } from '../src/services/HtmlToMarkdownService';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Test URLs - actual article links from output.json (not site home pages)
const TEST_URLS = [
  {
    name: 'AP News - Explosion at Pennsylvania nursing home',
    url: 'https://news.google.com/rss/articles/CBMiqwFBVV95cUxQQlZHbjhmRlRTZnpTeTVfNDhwS296Q2lYYWliSkdOdngtMXkzMnNtM0Z3YzVjRXRKMHVlMjNxaWFOa0FSZnU3dTFPanVUN0N0cHdKTDBFV1kyd29HeHd5Q05lMGdzYWNBclloX2x1TklrUUdyYXQtc1JFZ0NRRFU3dnBEdzY2aUZWR29BR2hST2tZRF9oZ0k3dDN4dHZ5OFJIdTNRZlFSVDNQMHc?oc=5',
    originalLink: 'https://apnews.com'
  },
  {
    name: 'ABC News - Ashlee Buzzard arrested',
    url: 'https://news.google.com/rss/articles/CBMisAFBVV95cUxOeXdnQzIxN0hraDBMbE1tbDBZeXdfR2F4VU5uSmJONjI4VEJxaXFXSG5Sbmhzc0Z0Nk56RzZlUDBHU1BEcEVremxBeUMxNXRQMUJMWkdFLWZVNXpFV2JJWW5XX084VWgxdExUc25PakxEUE11SFZTeUZYWms4bXRfeDlzZ2pGWXRya0pEYmxBZ0Z2T0tkTHNVQ3BYa1ZNWUJsQmdmODRXaExNaWhCTFU2Q9IBtgFBVV95cUxQeW01bEo0aGlNWDRObXk5LVN1aVpqTF9CaEF3Q053TVJCN3NIZVVDbkEtZWFJTHZCZG51akhoTHQyakFGV05rV0RYUExjWWFNSUdrZ3RRRHVJY2FGN0VwM2FGanoxRExacjR2ZXA4RXBWejFndWI4RmJlQXVRRjJxSmF1cGx6cDlsOU1BRHdueWtuU1l5VEUzanU5NmtFZkNCS2VjOTFMLTRBS1NQeHNrY2xXVmRRZw?oc=5',
    originalLink: 'https://abcnews.go.com'
  },
  {
    name: 'CNN - Russian attack on Ukraine',
    url: 'https://news.google.com/rss/articles/CBMihwFBVV95cUxPc0tUeWNTQmZHaF9RNHdXak5sNlprTC1kenAybnRMZ2k3Y0xmMTNUWGlwdXdGQWM4OHl3WHVFR25LSG40MUhmajYyemV3djdLcFhhOFEyUHl3SVJuWXJZZ3dVaUdKdEpTa2UzSkFzOVhaWkJBNF93SHMyaF8zeV9hZzctUUdEdVE?oc=5',
    originalLink: 'https://www.cnn.com'
  },
  {
    name: 'BBC - India-Bangladesh relations',
    url: 'https://news.google.com/rss/articles/CBMiWkFVX3lxTE9tVGlObjdGZHZnWDBkLXdoR3Q2cEwzdndHZFJ6SlJRNXBLRC1EeHhabjBDT2h2azlId2o3QUZHNGwwMzN2TDhkV2RFV2g4bDJpQ1VWenF6amYxUdIBX0FVX3lxTFBJRjUyS3RXMnVZWEZ5Wkp6a0R4ZEhSUkp6LUdtdVBONW1VWXVBaE1idVdoLTBtWl9FazF6Vmw0VV9ONlpfNkRyZ1p0czl2aEtrNFctTXpoVThKMGNyUVBF?oc=5',
    originalLink: 'https://www.bbc.com'
  },
  {
    name: 'Al Jazeera - Explosion in Moscow',
    url: 'https://news.google.com/rss/articles/CBMiqgFBVV95cUxPLS1DSEJ3bnNsZkplaVJKa2oxUk41blVqcHp0Nm5Hby14b00zQkZVRlZON1IyUmZnLXg5TDdRWnlwalF3QU5kMzlnWE9JbjFUaG5QSmVaZUMyazExb1l1TkEtQmd1UTJtSHQxS25ZVUFGd3NJdVp2ZDJEekxpdDhEZ1FWeVRxS3pVdGhwRlFsOG5sbWFXRThUaVFuYjRmOXJ3ZkxZLVJOUTNKQdIBrwFBVV95cUxOWDdNcU9RTWMtUHpGamJ3TTJEUEItNnd2ZlpDVHZzY2ZNSThSUG9vT1RXeVhZbGNuLUg4WE9fbUp4djItYjVoNDhGRzRMNjJieFNQeWNtU1hiMWZxb1pfMkhvd1RCeUhiYmd1RkFyOTk1LTFOS2c2czgtbkVFYlRqbmZrTmI5N3NsWUlhWHRvT0FaTGI2bGd3UGFIMERrTkg3NnpiWWxRc3FwUVN2SUk0?oc=5',
    originalLink: 'https://www.aljazeera.com'
  },
  {
    name: 'Hong Kong 01 - 粵車南下車主呻無泊位',
    url: 'https://news.google.com/rss/articles/CBMioANBVV95cUxPTUE0d3VjaWp4dl9DVDZTUl9KYXJIZXlDSjRfalJXZmVvalZBc1ZhVXo1S3plTlBOVm53OUVyWlRMY2J0QUQ1Nm90ODg2ZHYzSHpuTnNwTDl3azVNSEFuMkRmT3NPY2M0Q1cwRm5QTy1QRk5xVDU5RExwQmJBQk9yN0RXcFRYTTFoRW82dk9aX0hHczNmODdhYmIycWJYNXZTckZvTU44QXNsZ0MtZ3BJUWs5ZjhKc09ib0xpLURPeVlTd0pJSGJGa241eEJRNHI4OGp5UEdWT3VXVXVaTnZEczljSWxzckFHRDVPMlQxa1VfZUxYeGIxYUctOWg3NzdYcHNmTllVajkxSFgzNGhNQ0FqY0t0d200ZkFRQmg5OXNtMElTcS1pN0dWZ0VnejJXSnlJUkFLSkZsQ09EelViX1ZCbzlNZ0hzbVIxN3d1djZIdllzLVVldEpqQWZYbDVFUHRUQVpDYmU1MkhhNkkxSXRVX0p0a1h5WkFHQjBlQm5hak12aDZ5S0dINXp4TW9Ba3ZkQU5oSFFyc01nYzFiYw?oc=5',
    originalLink: 'https://www.hk01.com'
  },
  {
    name: 'Hong Kong Economic Journal - 以雄安為鑑 海南擁抱改開2.0',
    url: 'https://news.google.com/rss/articles/CBMixwJBVV95cUxORXZ5bVgzWUVyRUJ1WWJyY3ctUGJVaU5oWUxKY2RvQmNlQWdyYkZmU25hSWdENjh0RXdpTWZJdElSTzlFVTVIaEFFc2w2UEhCaWxpSHdCbmE0MkxDX1R1aWc1YldpOXUwbGZUNDFaVlk0amYxVFVObGpteWt1SndubGZ0aXdCMTlsX0k3NmtzbFdPZ2FQdjU0alJuZVBXSnRLVlVSUjFzZjBZWUhaV0dCNjFpWTA3M2xXRUZ5aTZIVGxiLTlRRDZjT0d2LU92cUlqZDZ0Rlo3cGlPOEVreFJxVUFobFk5b2NRMW1kNElvYzNJUGY4Q1BTYXBtRHI3enFtZWRFQXpxaGRza1FLMXlwWmY4TGxFeGhRWVo3MHltaXNuODdCbklWUHFKcHpFNzg1OWJncTJYN0o1Q2VXaTBoVFUyQWFvNlU?oc=5',
    originalLink: 'https://www.hkej.com'
  }
];

async function testSingleUrl(service: any, testUrl: { name: string; url: string; originalLink: string }, index: number) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 Test ${index + 1}/${TEST_URLS.length}: ${testUrl.name}`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📰 URL: ${testUrl.url}`);
  console.log(`📰 Original Link: ${testUrl.originalLink}\n`);

  try {
    // Process URL using HtmlToMarkdownService
    console.log('Step 1: Processing URL (fetch HTML, convert to markdown, download images)...');
    const result = await service.processUrl(testUrl.url);
    
    if (!result.success) {
      throw new Error(result.error || 'Unknown error');
    }

    console.log(`✅ URL processed successfully\n`);

    if (result.cached) {
      console.log('📦 Result was cached (already processed)\n');
    } else {
      console.log(`📄 HTML saved to: ${result.htmlPath}`);
      console.log(`📝 Markdown saved to: ${result.markdownPath}`);
      console.log(`📷 Images downloaded: ${result.imagesDownloaded || 0}\n`);
    }

    console.log(`🌐 Markdown URL: ${result.markdownUrl}\n`);

    // Read and display markdown preview
    if (result.markdownPath && fs.existsSync(result.markdownPath)) {
      const markdown = fs.readFileSync(result.markdownPath, 'utf-8');
      console.log('📊 Summary:');
      console.log(`   Markdown length: ${markdown.length} characters\n`);

      console.log('📝 Markdown preview (first 800 chars):');
      console.log(markdown.substring(0, 800) + '...\n');

      // Count images in markdown
      const imageCount = (markdown.match(/!\[.*?\]\(.*?\)/g) || []).length;
      console.log(`📷 Images referenced in markdown: ${imageCount}\n`);
    }

    return {
      success: true,
      name: testUrl.name,
      markdownUrl: result.markdownUrl,
      cached: result.cached,
      imagesDownloaded: result.imagesDownloaded || 0
    };

  } catch (error) {
    console.error(`❌ Test failed for ${testUrl.name}:`, error instanceof Error ? error.message : error);
    return {
      success: false,
      name: testUrl.name,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function testDesktopToMarkdown() {
  console.log('🧪 Testing HtmlToMarkdownService');
  console.log(`📰 Testing ${TEST_URLS.length} actual article links from different news sites\n`);

  const service = createHtmlToMarkdownServiceFromEnv();

  if (!service.isConfigured()) {
    console.error('❌ HtmlToMarkdownService is not configured. Please set DESKTOP_TO_WEB_API_URL and DESKTOP_TO_WEB_API_KEY environment variables.');
    process.exit(1);
  }

  const results: any[] = [];

  for (let i = 0; i < TEST_URLS.length; i++) {
    const result = await testSingleUrl(service, TEST_URLS[i], i);
    results.push(result);
    
    // Add a small delay between tests
    if (i < TEST_URLS.length - 1) {
      console.log('⏳ Waiting 3 seconds before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Print final summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const cached = results.filter(r => r.cached);
  
  console.log(`\n✅ Successful: ${successful.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  console.log(`📦 Cached: ${cached.length}/${results.length}\n`);
  
  if (successful.length > 0) {
    console.log('Successful Tests:');
    successful.forEach(r => {
      const cacheStatus = r.cached ? ' (cached)' : '';
      console.log(`   ✅ ${r.name}: ${r.markdownUrl}${cacheStatus}, ${r.imagesDownloaded} images`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\nFailed Tests:');
    failed.forEach(r => {
      console.log(`   ❌ ${r.name}: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n💡 Access the markdown files via:');
  console.log('   http://localhost:3000/html/cache/<hash>/article.md');
  console.log('   (where <hash> is the 16-character hash of the URL)');
  console.log('\n💡 Access the images via:');
  console.log('   http://localhost:3000/html/cache/<hash>/images/<filename>');
  console.log('='.repeat(80) + '\n');
}

// Run the test
testDesktopToMarkdown();