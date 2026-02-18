import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFile, readFile, rm } from "node:fs/promises";

// Mock the indexer to prevent actual embedding calls
vi.mock("#lib/indexer", () => ({
  contentHash: vi.fn((content: string) => {
    const { createHash } = require("node:crypto");
    return createHash("sha256").update(content).digest("hex");
  }),
  indexContent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  readCache,
  writeCache,
  cleanExpiredEntries,
  getCacheDir,
  formatCacheSummary,
  type CacheHit,
} from "#lib/cache";
import { contentHash, indexContent } from "#lib/indexer";

const mockIndexContent = vi.mocked(indexContent);
const mockContentHash = vi.mocked(contentHash);

// Use a unique temp dir for each test run
const TEST_CACHE_DIR = join(tmpdir(), `sushimcp-test-cache-${Date.now()}`);

beforeEach(async () => {
  process.env.CACHE_DIR = TEST_CACHE_DIR;
  vi.clearAllMocks();
});

afterEach(async () => {
  delete process.env.CACHE_DIR;
  try {
    await rm(TEST_CACHE_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures
  }
});

describe("getCacheDir", () => {
  it("should use CACHE_DIR env var when set", () => {
    process.env.CACHE_DIR = "/custom/path";
    expect(getCacheDir()).toBe("/custom/path");
    process.env.CACHE_DIR = TEST_CACHE_DIR;
  });

  it("should default to ~/.sushimcp/cache when CACHE_DIR is not set", () => {
    delete process.env.CACHE_DIR;
    const dir = getCacheDir();
    expect(dir).toContain(".sushimcp");
    expect(dir).toContain("cache");
    process.env.CACHE_DIR = TEST_CACHE_DIR;
  });
});

describe("writeCache", () => {
  it("should write content and meta files", async () => {
    const hit = await writeCache(
      "https://example.com/docs",
      "Hello World",
      "llms-txt",
    );
    expect(hit.filePath).toContain("llms-txt");
    expect(hit.filePath).toMatch(/\.txt$/);
    expect(hit.size).toBe(11);
    expect(hit.meta.url).toBe("https://example.com/docs");
    expect(hit.meta.fetchedAt).toBeGreaterThan(0);
    expect(hit.meta.contentHash).toBeDefined();
  });

  it("should include custom meta fields", async () => {
    const hit = await writeCache(
      "https://example.com/docs",
      "content",
      "llms-txt",
      {
        sourceName: "React",
        variant: "llms-full.txt",
      },
    );
    expect(hit.meta.sourceName).toBe("React");
    expect(hit.meta.variant).toBe("llms-full.txt");
  });

  it("should trigger indexContent for new content", async () => {
    await writeCache(
      "https://example.com/new",
      "brand new content",
      "llms-txt",
    );
    expect(mockIndexContent).toHaveBeenCalledWith(
      "https://example.com/new",
      "brand new content",
      "llms-txt",
    );
  });

  it("should skip indexing when content hash is unchanged", async () => {
    // First write
    await writeCache("https://example.com/same", "same content", "llms-txt");
    mockIndexContent.mockClear();

    // Second write with same content
    await writeCache("https://example.com/same", "same content", "llms-txt");
    expect(mockIndexContent).not.toHaveBeenCalled();
  });

  it("should re-index when content changes", async () => {
    await writeCache("https://example.com/changing", "version 1", "llms-txt");
    mockIndexContent.mockClear();

    await writeCache("https://example.com/changing", "version 2", "llms-txt");
    expect(mockIndexContent).toHaveBeenCalledWith(
      "https://example.com/changing",
      "version 2",
      "llms-txt",
    );
  });

  it("should handle openapi type", async () => {
    const hit = await writeCache(
      "https://api.com/spec",
      '{"openapi":"3.0"}',
      "openapi",
    );
    expect(hit.filePath).toContain("openapi");
  });
});

describe("readCache", () => {
  it("should return null for uncached URL", async () => {
    const result = await readCache("https://never-cached.com", "llms-txt");
    expect(result).toBeNull();
  });

  it("should return cached content within TTL", async () => {
    await writeCache(
      "https://example.com/cached",
      "cached content",
      "llms-txt",
    );
    mockIndexContent.mockClear();

    const hit = await readCache("https://example.com/cached", "llms-txt");
    expect(hit).not.toBeNull();
    expect(hit!.size).toBe(14);
    expect(hit!.meta.url).toBe("https://example.com/cached");
  });

  it("should return null for expired cache", async () => {
    process.env.CACHE_TTL_MS = "1"; // 1ms TTL
    await writeCache("https://example.com/expires", "will expire", "llms-txt");

    // Wait for TTL to pass
    await new Promise((r) => setTimeout(r, 10));

    const hit = await readCache("https://example.com/expires", "llms-txt");
    expect(hit).toBeNull();
    delete process.env.CACHE_TTL_MS;
  });

  it("should backfill indexing for cache entries without contentHash", async () => {
    // Write cache entry, then strip contentHash from meta to simulate pre-RAG entry
    const hit = await writeCache(
      "https://example.com/old",
      "old content",
      "llms-txt",
    );
    mockIndexContent.mockClear();

    // Read the meta, remove contentHash, rewrite it
    const metaPath = hit.filePath.replace(".txt", ".meta.json");
    const meta = JSON.parse(await readFile(metaPath, "utf-8"));
    delete meta.contentHash;
    await writeFile(metaPath, JSON.stringify(meta));

    const result = await readCache("https://example.com/old", "llms-txt");
    expect(result).not.toBeNull();
    expect(mockIndexContent).toHaveBeenCalledWith(
      "https://example.com/old",
      "old content",
      "llms-txt",
    );
  });

  it("should not re-index entries that already have contentHash", async () => {
    await writeCache(
      "https://example.com/indexed",
      "indexed content",
      "llms-txt",
    );
    mockIndexContent.mockClear();

    await readCache("https://example.com/indexed", "llms-txt");
    expect(mockIndexContent).not.toHaveBeenCalled();
  });
});

describe("cleanExpiredEntries", () => {
  it("should clean expired entries", async () => {
    process.env.CACHE_TTL_MS = "1";
    await writeCache("https://example.com/a", "content a", "llms-txt");
    await writeCache("https://example.com/b", "content b", "openapi");

    await new Promise((r) => setTimeout(r, 10));

    await cleanExpiredEntries();

    const hitA = await readCache("https://example.com/a", "llms-txt");
    const hitB = await readCache("https://example.com/b", "openapi");
    expect(hitA).toBeNull();
    expect(hitB).toBeNull();
    delete process.env.CACHE_TTL_MS;
  });

  it("should not clean fresh entries", async () => {
    await writeCache("https://example.com/fresh", "fresh content", "llms-txt");
    await cleanExpiredEntries();

    const hit = await readCache("https://example.com/fresh", "llms-txt");
    expect(hit).not.toBeNull();
  });

  it("should handle missing cache directories gracefully", async () => {
    // No cache dir exists yet — should not throw
    delete process.env.CACHE_DIR;
    process.env.CACHE_DIR = join(tmpdir(), "nonexistent-sushimcp-test");
    await expect(cleanExpiredEntries()).resolves.not.toThrow();
    process.env.CACHE_DIR = TEST_CACHE_DIR;
  });
});

describe("formatCacheSummary", () => {
  it("should format a summary string", () => {
    const hit: CacheHit = {
      filePath: "/cache/llms-txt/abc123.txt",
      meta: { url: "https://example.com", fetchedAt: Date.now() },
      size: 12345,
    };
    const summary = formatCacheSummary(
      "React",
      "llms-full.txt",
      "https://example.com",
      hit,
    );
    expect(summary).toContain("React");
    expect(summary).toContain("llms-full.txt");
    expect(summary).toContain("https://example.com");
    expect(summary).toContain("12,345");
    expect(summary).toContain("/cache/llms-txt/abc123.txt");
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
