import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, readdir, unlink, lstat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { logger } from "./logger.js";

export type CacheType = "llms-txt" | "openapi";

export interface CacheMeta {
  url: string;
  fetchedAt: number;
  sourceName?: string;
  variant?: string;
}

export interface CacheHit {
  filePath: string;
  meta: CacheMeta;
  size: number;
}

const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

function getTtlMs(): number {
  const envTtl = process.env.CACHE_TTL_MS;
  if (envTtl) {
    const parsed = parseInt(envTtl, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL_MS;
}

function cacheKey(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

export function getCacheDir(): string {
  return process.env.CACHE_DIR || join(tmpdir(), "sushimcp-cache");
}

function subDir(type: CacheType): string {
  return join(getCacheDir(), type);
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function readCache(url: string, type: CacheType): Promise<CacheHit | null> {
  const key = cacheKey(url);
  const dir = subDir(type);
  const contentPath = join(dir, `${key}.txt`);
  const metaPath = join(dir, `${key}.meta.json`);

  if (!(await isRegularFile(metaPath)) || !(await isRegularFile(contentPath))) {
    return null;
  }

  try {
    const metaRaw = await readFile(metaPath, "utf-8");
    const meta: CacheMeta = JSON.parse(metaRaw);

    const age = Date.now() - meta.fetchedAt;
    if (age > getTtlMs()) {
      logger.debug(`Cache expired for ${url} (age: ${Math.round(age / 1000)}s)`);
      return null;
    }

    const content = await readFile(contentPath, "utf-8");

    logger.debug(`Cache hit for ${url} (${content.length} chars)`);
    return {
      filePath: contentPath,
      meta,
      size: content.length,
    };
  } catch (err) {
    logger.debug(`Cache read error for ${url}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function writeCache(
  url: string,
  content: string,
  type: CacheType,
  meta?: Partial<CacheMeta>,
): Promise<CacheHit> {
  const key = cacheKey(url);
  const dir = subDir(type);
  await ensureDir(dir);

  const contentPath = join(dir, `${key}.txt`);
  const metaPath = join(dir, `${key}.meta.json`);

  const fullMeta: CacheMeta = {
    url,
    fetchedAt: Date.now(),
    ...meta,
  };

  await writeFile(contentPath, content, { mode: 0o600 });
  await writeFile(metaPath, JSON.stringify(fullMeta), { mode: 0o600 });

  logger.debug(`Cached ${content.length} chars for ${url} at ${contentPath}`);

  return {
    filePath: contentPath,
    meta: fullMeta,
    size: content.length,
  };
}

export async function cleanExpiredEntries(): Promise<void> {
  const ttl = getTtlMs();
  const baseDir = getCacheDir();
  const types: CacheType[] = ["llms-txt", "openapi"];
  let cleaned = 0;

  for (const type of types) {
    const dir = subDir(type);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue; // directory doesn't exist yet
    }

    const metaFiles = entries.filter((f) => f.endsWith(".meta.json"));

    for (const metaFile of metaFiles) {
      const metaPath = join(dir, metaFile);
      const contentFile = metaFile.replace(".meta.json", ".txt");
      const contentPath = join(dir, contentFile);

      let expired = true;
      try {
        if (await isRegularFile(metaPath)) {
          const metaRaw = await readFile(metaPath, "utf-8");
          const meta: CacheMeta = JSON.parse(metaRaw);
          expired = Date.now() - meta.fetchedAt > ttl;
        }
      } catch {
        expired = true; // corrupt meta → treat as expired
      }

      if (expired) {
        try { await unlink(metaPath); } catch { /* ignore */ }
        try { await unlink(contentPath); } catch { /* ignore */ }
        cleaned++;
      }
    }

    // Clean orphan .txt files (no matching .meta.json)
    const txtFiles = entries.filter((f) => f.endsWith(".txt") && !f.endsWith(".meta.json"));
    for (const txtFile of txtFiles) {
      const matchingMeta = txtFile.replace(".txt", ".meta.json");
      if (!entries.includes(matchingMeta)) {
        try {
          await unlink(join(dir, txtFile));
          cleaned++;
        } catch { /* ignore */ }
      }
    }
  }

  if (cleaned > 0) {
    logger.info(`Cleaned ${cleaned} expired cache entries from ${baseDir}`);
  } else {
    logger.debug("No expired cache entries to clean");
  }
}

export function formatCacheSummary(
  sourceName: string,
  variant: string,
  url: string,
  hit: CacheHit,
): string {
  const chars = hit.size.toLocaleString();
  return `Source: ${sourceName} (${variant})\nURL: ${url}\nFile: ${hit.filePath} (${chars} characters)\n\nRead the file above to access the documentation content.`;
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
