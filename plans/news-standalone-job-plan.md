# News Download Standalone Job Plan

## Summary

Move the news download feature out of the autonomous bot's Scheduler into a standalone job that can be run via cron. The Desktop-to-Web API will continue to be used by the news job for fetching article content.

## Implementation Status: ✅ COMPLETED

### Changes Made

1. **Removed from Scheduler** ([`src/core/Scheduler.ts`](src/core/Scheduler.ts)):
   - Removed `shouldFetchNews()` method
   - Removed `performNewsFetching()` method
   - Removed news fetching check from `tick()` method
   - Kept `accumulateNews()` and `flushNewsBatches()` for digest functionality

2. **Created Cron Configuration** ([`deploy/news-fetch.cron`](deploy/news-fetch.cron)):
   - Runs every 6 hours (at 0:00, 6:00, 12:00, 18:00)
   - Includes installation instructions

3. **Updated Documentation** ([`README.md`](README.md)):
   - Added News Fetching section with manual and scheduled execution instructions
   - Added cron installation guide

### Architecture After Changes

```
┌─────────────────────────────────────────────────────────────┐
│                   Standalone News Job                        │
│  (Run via cron: pnpm run news:cli 100)                      │
│                                                              │
│  ┌──────────────┐    ┌───────────────────┐                  │
│  │ news-cli.ts  │───▶│ GoogleSearchService │                 │
│  └──────────────┘    │   .fetchLatestNews()│                 │
│                      └─────────┬─────────┘                   │
│                                │                             │
│                      ┌─────────▼─────────┐                   │
│                      │ DesktopToWebService │ ◀── Still used  │
│                      │   (fetch HTML)      │     for news    │
│                      └─────────┬─────────┘                   │
│                                │                             │
│                      ┌─────────▼─────────┐                   │
│                      │ ProcessedArticle   │                   │
│                      │     Database       │                   │
│                      └───────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                    Chatbot Process                           │
│                                                              │
│  ┌──────────────┐    ┌───────────────────┐                  │
│  │  Scheduler   │───▶│  accumulateNews() │──▶ Send digests  │
│  │    .tick()   │    │  flushNewsBatches()│    to users     │
│  └──────────────┘    └───────────────────┘                  │
│                                                              │
│  ┌──────────────┐    ┌───────────────────┐                  │
│  │WebSearchTool │───▶│ Google API (direct)│ ◀── NOT using    │
│  └──────────────┘    └───────────────────┘     Desktop-to-Web│
└─────────────────────────────────────────────────────────────┘
```

### Key Findings

1. **WebSearchTool** - Uses Google Custom Search API directly via axios. It does **NOT** use Desktop-to-Web service. No changes needed.

2. **News Fetching** - Uses `GoogleSearchService.fetchLatestNews()` which uses Desktop-to-Web to fetch HTML content. This is now a standalone job.

3. **Digest Functionality** - `accumulateNews()` and `flushNewsBatches()` remain in the Scheduler to send news digests to users.

### Files Modified

| File                     | Changes                                                         |
| ------------------------ | --------------------------------------------------------------- |
| `src/core/Scheduler.ts`  | Removed `shouldFetchNews()` and `performNewsFetching()` methods |
| `README.md`              | Added News Fetching section with cron instructions              |
| `deploy/news-fetch.cron` | New file - cron configuration                                   |

### Files Unchanged

| Component                      | Reason                                       |
| ------------------------------ | -------------------------------------------- |
| `WebSearchTool`                | Uses direct Google API, not Desktop-to-Web   |
| `GoogleSearchService.search()` | Direct API call, no Desktop-to-Web           |
| `news-cli.ts`                  | Already works for manual/scheduled execution |
| `accumulateNews()`             | Still needed for digest generation           |
| `flushNewsBatches()`           | Still needed for digest generation           |

## How to Use

### Manual Execution

```bash
# Fetch latest 100 news articles
pnpm run news:cli 100

# Retry failed articles only
pnpm run news:cli --retry-only

# Sync completed articles to knowledge base
pnpm run news:cli --sync-to-kb
```

### Scheduled Execution (Cron)

```bash
# Install cron job
sudo cp deploy/news-fetch.cron /etc/cron.d/whatsapp-news-fetch

# Or add to user crontab
crontab -e
# Add: 0 */6 * * * cd /path/to/whatsapp-chatbot && pnpm run news:cli 100 >> /var/log/news-fetch.log 2>&1
```

## Benefits of This Change

1. **Separation of Concerns**: News fetching is independent of chatbot operation
2. **Flexibility**: News fetching can be scheduled independently
3. **Reliability**: News fetching failures won't affect chatbot operation
4. **Maintainability**: Easier to debug and monitor news fetching separately
