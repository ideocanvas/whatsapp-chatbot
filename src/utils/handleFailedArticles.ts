import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import { prisma } from '../config/prisma';
import { logger } from './logger';

const ERROR_SNIPPET = "<span>This site can’t be reached</span>";
const CACHE_DIR = path.join(process.cwd(), 'data/html/cache');
const FAILED_DIR = path.join(process.cwd(), 'data/html/failed');

export interface FailedArticlesOptions {
  action?: 'delete' | 'move';
  dryRun?: boolean;
  skipDb?: boolean;
}

export interface FailedArticlesResult {
  success: boolean;
  stats: {
    total: number;
    processed: number;
    failed: number;
    skipped: number;
  };
  message: string;
}

async function findFailedFiles(): Promise<string[]> {
  return new Promise((resolve) => {
    exec(
      `grep -R "${ERROR_SNIPPET}" ${CACHE_DIR} 2>/dev/null | cut -d: -f1`,
      { maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) {
          resolve([]);
          return;
        }

        const files = stdout
          .trim()
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);

        resolve(files);
      }
    );
  });
}

function extractHash(filePath: string): string | null {
  // Expect: /data/html/cache/YYYY-MM-DD/<hash>/article.html
  const parts = filePath.split(path.sep);
  if (parts.length < 4) return null;
  const hash = parts[parts.length - 2];
  return hash && hash.length >= 6 ? hash : null;
}

async function updateArticle(hash: string): Promise<number> {
  const result = await prisma.processedArticle.updateMany({
    where: { originalContent: { contains: hash } },
    data: {
      processingStatus: 'failed',
      errorMessage: "This site can't be reached",
      retryCount: { increment: 1 },
      updatedAt: new Date(),
    },
  });
  return result.count;
}

async function moveFile(filePath: string, dryRun: boolean): Promise<void> {
  const relative = path.relative(path.join(CACHE_DIR, '..'), filePath).replace(/^cache[\\/]/, '');
  const dest = path.join(FAILED_DIR, relative);
  if (dryRun) return;
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(filePath, dest);
}

async function deleteFile(filePath: string, dryRun: boolean): Promise<void> {
  if (dryRun) return;
  await fs.rm(filePath, { force: true });
}

export async function handleFailedArticles(options: FailedArticlesOptions = {}): Promise<FailedArticlesResult> {
  const { action = 'delete', dryRun = true, skipDb = false } = options;

  const files = await findFailedFiles();

  if (files.length === 0) {
    return {
      success: true,
      stats: { total: 0, processed: 0, failed: 0, skipped: 0 },
      message: 'No failed articles found',
    };
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const file of files) {
    try {
      const hash = extractHash(file);
      if (!hash) {
        skipped++;
        continue;
      }

      if (!skipDb) {
        const updated = await updateArticle(hash);
        if (updated === 0) {
          logger.logWarn(`No DB rows updated for hash ${hash} (${file})`);
        }
      }

      if (action === 'move') {
        await moveFile(file, dryRun);
      } else {
        await deleteFile(file, dryRun);
      }

      processed++;
    } catch (err) {
      failed++;
      logger.logError(`Failed to handle ${file}: ${err}`);
    }
  }

  return {
    success: failed === 0,
    stats: {
      total: files.length,
      processed,
      failed,
      skipped,
    },
    message: `Processed ${processed}/${files.length} failed articles (failed=${failed}, skipped=${skipped})`,
  };
}

export async function getFailedArticles(): Promise<string[]> {
  return findFailedFiles();
}
