import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock logger
vi.mock("#lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Use a temp directory for cache in tests
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "link-index-test-"));
  process.env.CACHE_DIR = tempDir;
});

afterEach(async () => {
  delete process.env.CACHE_DIR;
  await rm(tempDir, { recursive: true, force: true });
});

import {
  writeLinkIndex,
  readLinkIndex,
  searchLinks,
  listLinkIndexDomains,
} from "#lib/link_index.js";

describe("writeLinkIndex / readLinkIndex", () => {
  it("writes and reads a link index", async () => {
    const links = [
      { text: "Getting Started", url: "https://example.com/docs/start" },
      { text: "API Reference", url: "https://example.com/docs/api" },
    ];

    await writeLinkIndex("example.com", ["https://example.com/docs"], links);

    const index = await readLinkIndex("example.com");
    expect(index).not.toBeNull();
    expect(index!.domain).toBe("example.com");
    expect(index!.sources).toEqual(["https://example.com/docs"]);
    expect(index!.links).toHaveLength(2);
    expect(index!.links[0].text).toBe("Getting Started");
  });

  it("returns null for nonexistent domain", async () => {
    const index = await readLinkIndex("nonexistent.com");
    expect(index).toBeNull();
  });

  it("merges new links with existing index", async () => {
    await writeLinkIndex(
      "example.com",
      ["https://example.com/page1"],
      [{ text: "Link A", url: "https://example.com/a" }],
    );

    await writeLinkIndex(
      "example.com",
      ["https://example.com/page2"],
      [
        { text: "Link A", url: "https://example.com/a" }, // duplicate
        { text: "Link B", url: "https://example.com/b" }, // new
      ],
    );

    const index = await readLinkIndex("example.com");
    expect(index!.sources).toEqual([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
    expect(index!.links).toHaveLength(2); // deduped
    expect(index!.links.map((l) => l.text)).toEqual(["Link A", "Link B"]);
  });

  it("merges sources without duplicates", async () => {
    await writeLinkIndex(
      "example.com",
      ["https://example.com/page1"],
      [{ text: "Link", url: "https://example.com/link" }],
    );

    await writeLinkIndex(
      "example.com",
      ["https://example.com/page1"], // same source
      [{ text: "Link 2", url: "https://example.com/link2" }],
    );

    const index = await readLinkIndex("example.com");
    expect(index!.sources).toEqual(["https://example.com/page1"]);
  });
});

describe("searchLinks", () => {
  it("finds links matching query in text", async () => {
    await writeLinkIndex("example.com", ["https://example.com"], [
      { text: "Authentication Guide", url: "https://example.com/auth" },
      { text: "Getting Started", url: "https://example.com/start" },
      { text: "Auth API", url: "https://example.com/api/auth" },
    ]);

    const results = await searchLinks("auth");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.text)).toContain("Authentication Guide");
    expect(results.map((r) => r.text)).toContain("Auth API");
  });

  it("finds links matching query in URL", async () => {
    await writeLinkIndex("example.com", ["https://example.com"], [
      { text: "Page One", url: "https://example.com/getting-started" },
      { text: "Page Two", url: "https://example.com/other" },
    ]);

    const results = await searchLinks("getting-started");
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("Page One");
  });

  it("is case-insensitive", async () => {
    await writeLinkIndex("example.com", ["https://example.com"], [
      { text: "Authentication", url: "https://example.com/auth" },
    ]);

    const results = await searchLinks("AUTHENTICATION");
    expect(results).toHaveLength(1);
  });

  it("filters by domain when specified", async () => {
    await writeLinkIndex("example.com", ["https://example.com"], [
      { text: "Auth Guide", url: "https://example.com/auth" },
    ]);
    await writeLinkIndex("other.com", ["https://other.com"], [
      { text: "Auth Page", url: "https://other.com/auth" },
    ]);

    const results = await searchLinks("auth", "example.com");
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://example.com/auth");
  });

  it("returns empty array when no matches", async () => {
    await writeLinkIndex("example.com", ["https://example.com"], [
      { text: "Page", url: "https://example.com/page" },
    ]);

    const results = await searchLinks("nonexistent-term");
    expect(results).toHaveLength(0);
  });

  it("returns empty array when no indices exist", async () => {
    const results = await searchLinks("anything");
    expect(results).toHaveLength(0);
  });
});

describe("listLinkIndexDomains", () => {
  it("lists domains with indices", async () => {
    await writeLinkIndex("example.com", ["https://example.com"], [
      { text: "Link", url: "https://example.com/page" },
    ]);
    await writeLinkIndex("other.com", ["https://other.com"], [
      { text: "Link", url: "https://other.com/page" },
    ]);

    const domains = await listLinkIndexDomains();
    expect(domains).toContain("example.com");
    expect(domains).toContain("other.com");
  });

  it("returns empty array when no indices exist", async () => {
    const domains = await listLinkIndexDomains();
    expect(domains).toHaveLength(0);
  });
});
