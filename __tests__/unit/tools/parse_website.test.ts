import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("#lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("#lib/cache.js", () => ({
  readCache: vi.fn(),
  writeCache: vi.fn(),
  formatCacheSummary: vi.fn(),
}));

vi.mock("#lib/web_parser.js", () => ({
  fetchAndParse: vi.fn(),
  parsePages: vi.fn(),
}));

vi.mock("#lib/link_index.js", () => ({
  writeLinkIndex: vi.fn().mockResolvedValue(undefined),
}));

import {
  assembleSinglePageDocument,
  assembleMultiPageDocument,
  parse_website,
} from "#tools/parse_website.js";

import { readCache, writeCache, formatCacheSummary } from "#lib/cache.js";
import {
  fetchAndParse,
  parsePages,
  type ParsedPage,
} from "#lib/web_parser.js";
import { writeLinkIndex } from "#lib/link_index.js";

// --- assembleSinglePageDocument --- //

describe("assembleSinglePageDocument", () => {
  it("assembles document with title and description", () => {
    const page: ParsedPage = {
      url: "https://example.com",
      title: "Example Site",
      description: "An example website",
      content: "# Welcome\n\nHello world.",
      wordCount: 3,
      size: 23,
      links: [],
    };

    const doc = assembleSinglePageDocument(page);

    expect(doc).toContain("# Example Site");
    expect(doc).toContain("> An example website");
    expect(doc).toContain("- Source: https://example.com");
    expect(doc).toContain("- Word count: 3");
    expect(doc).toContain("# Welcome\n\nHello world.");
  });

  it("uses URL when title is null", () => {
    const page: ParsedPage = {
      url: "https://example.com",
      title: null,
      description: null,
      content: "Some content",
      wordCount: 2,
      size: 12,
      links: [],
    };

    const doc = assembleSinglePageDocument(page);

    expect(doc).toContain("# https://example.com");
    expect(doc).not.toContain("> ");
  });
});

// --- assembleMultiPageDocument --- //

describe("assembleMultiPageDocument", () => {
  it("assembles multi-page document with TOC", () => {
    const result = {
      pages: [
        {
          url: "https://example.com/",
          title: "Home",
          description: null,
          content: "Welcome home",
          wordCount: 2,
          size: 12,
          links: [],
        },
        {
          url: "https://example.com/docs",
          title: "Docs",
          description: null,
          content: "Documentation here",
          wordCount: 2,
          size: 18,
          links: [],
        },
      ],
      skipped: [],
      totalChars: 30,
      links: [],
    };

    const doc = assembleMultiPageDocument("https://example.com", result);

    expect(doc).toContain("# Home");
    expect(doc).toContain("- Source: https://example.com");
    expect(doc).toContain("- Pages parsed: 2");
    expect(doc).toContain("## Table of Contents");
    expect(doc).toContain("- [Home]");
    expect(doc).toContain("- [Docs]");
    expect(doc).toContain("## Home");
    expect(doc).toContain("Welcome home");
    expect(doc).toContain("## Docs");
    expect(doc).toContain("Documentation here");
  });

  it("includes skipped pages section", () => {
    const result = {
      pages: [
        {
          url: "https://example.com/",
          title: "Home",
          description: null,
          content: "Home page",
          wordCount: 2,
          size: 9,
          links: [],
        },
      ],
      skipped: ["https://example.com/big-page", "https://example.com/another"],
      totalChars: 9,
      links: [],
    };

    const doc = assembleMultiPageDocument("https://example.com", result);

    expect(doc).toContain("## Skipped Pages");
    expect(doc).toContain("- https://example.com/big-page");
    expect(doc).toContain("- https://example.com/another");
  });

  it("uses domain when no page title available", () => {
    const result = {
      pages: [
        {
          url: "https://example.com/",
          title: null,
          description: null,
          content: "Content",
          wordCount: 1,
          size: 7,
          links: [],
        },
      ],
      skipped: [],
      totalChars: 7,
      links: [],
    };

    const doc = assembleMultiPageDocument("https://example.com", result);

    expect(doc).toContain("# example.com");
  });

  it("omits TOC for single page", () => {
    const result = {
      pages: [
        {
          url: "https://example.com/",
          title: "Home",
          description: null,
          content: "Home page",
          wordCount: 2,
          size: 9,
          links: [],
        },
      ],
      skipped: [],
      totalChars: 9,
      links: [],
    };

    const doc = assembleMultiPageDocument("https://example.com", result);

    expect(doc).not.toContain("## Table of Contents");
  });
});

// --- parse_website handler --- //

describe("parse_website", () => {
  beforeEach(() => {
    vi.mocked(readCache).mockReset();
    vi.mocked(writeCache).mockReset();
    vi.mocked(formatCacheSummary).mockReset();
    vi.mocked(fetchAndParse).mockReset();
    vi.mocked(parsePages).mockReset();
    vi.mocked(writeLinkIndex).mockReset();
    vi.mocked(writeLinkIndex).mockResolvedValue(undefined);
  });

  it("returns cached result on cache hit (single URL)", async () => {
    vi.mocked(readCache).mockResolvedValue({
      filePath: "/cache/abc.txt",
      meta: { url: "https://example.com", fetchedAt: Date.now() },
      size: 5000,
    });
    vi.mocked(formatCacheSummary).mockReturnValue("Cached summary");

    const result = await parse_website({ url: "https://example.com" });

    expect(result.content[0].text).toBe("Cached summary");
    expect(fetchAndParse).not.toHaveBeenCalled();
  });

  it("fetches single page and writes link index", async () => {
    vi.mocked(readCache).mockResolvedValue(null);
    vi.mocked(fetchAndParse).mockResolvedValue({
      url: "https://example.com",
      title: "Example",
      description: "Test",
      content: "# Hello",
      wordCount: 1,
      size: 7,
      links: [
        { text: "Docs", url: "https://example.com/docs" },
      ],
    });
    vi.mocked(writeCache).mockResolvedValue({
      filePath: "/cache/abc.txt",
      meta: { url: "https://example.com", fetchedAt: Date.now() },
      size: 100,
    });
    vi.mocked(formatCacheSummary).mockReturnValue("Single page summary");

    const result = await parse_website({ url: "https://example.com" });

    expect(result.content[0].text).toBe("Single page summary");
    expect(fetchAndParse).toHaveBeenCalledWith("https://example.com");
    expect(writeLinkIndex).toHaveBeenCalledWith(
      "example.com",
      ["https://example.com"],
      [{ text: "Docs", url: "https://example.com/docs" }],
    );
  });

  it("returns message when single page has no content", async () => {
    vi.mocked(readCache).mockResolvedValue(null);
    vi.mocked(fetchAndParse).mockResolvedValue({
      url: "https://example.com",
      title: null,
      description: null,
      content: "",
      wordCount: 0,
      size: 0,
      links: [],
    });

    const result = await parse_website({ url: "https://example.com" });

    expect(result.content[0].text).toContain("No content could be extracted");
  });

  it("handles multiple URLs", async () => {
    vi.mocked(readCache).mockResolvedValue(null);
    vi.mocked(parsePages).mockResolvedValue({
      pages: [
        {
          url: "https://example.com/a",
          title: "A",
          description: null,
          content: "Page A",
          wordCount: 2,
          size: 6,
          links: [{ text: "Link A", url: "https://example.com/link-a" }],
        },
        {
          url: "https://example.com/b",
          title: "B",
          description: null,
          content: "Page B",
          wordCount: 2,
          size: 6,
          links: [{ text: "Link B", url: "https://example.com/link-b" }],
        },
      ],
      skipped: [],
      totalChars: 12,
      links: [
        { text: "Link A", url: "https://example.com/link-a" },
        { text: "Link B", url: "https://example.com/link-b" },
      ],
    });
    vi.mocked(writeCache).mockResolvedValue({
      filePath: "/cache/abc.txt",
      meta: { url: "https://example.com/a", fetchedAt: Date.now() },
      size: 200,
    });
    vi.mocked(formatCacheSummary).mockReturnValue("Multi URL summary");

    const result = await parse_website({
      url: ["https://example.com/a", "https://example.com/b"],
    });

    expect(result.content[0].text).toBe("Multi URL summary");
    expect(parsePages).toHaveBeenCalledWith([
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(writeLinkIndex).toHaveBeenCalled();
  });

  it("returns message when all multi-URL pages fail", async () => {
    vi.mocked(readCache).mockResolvedValue(null);
    vi.mocked(parsePages).mockResolvedValue({
      pages: [],
      skipped: ["https://example.com/a", "https://example.com/b"],
      totalChars: 0,
      links: [],
    });

    const result = await parse_website({
      url: ["https://example.com/a", "https://example.com/b"],
    });

    expect(result.content[0].text).toContain("Failed to parse any pages");
  });

  it("does not write link index when no links found", async () => {
    vi.mocked(readCache).mockResolvedValue(null);
    vi.mocked(fetchAndParse).mockResolvedValue({
      url: "https://example.com",
      title: "Example",
      description: null,
      content: "Content",
      wordCount: 1,
      size: 7,
      links: [],
    });
    vi.mocked(writeCache).mockResolvedValue({
      filePath: "/cache/abc.txt",
      meta: { url: "https://example.com", fetchedAt: Date.now() },
      size: 50,
    });
    vi.mocked(formatCacheSummary).mockReturnValue("Summary");

    await parse_website({ url: "https://example.com" });

    expect(writeLinkIndex).not.toHaveBeenCalled();
  });

  it("uses URL as cache key for single URL mode", async () => {
    vi.mocked(readCache).mockResolvedValue(null);
    vi.mocked(fetchAndParse).mockResolvedValue({
      url: "https://example.com/docs/intro",
      title: "Intro",
      description: null,
      content: "Hello",
      wordCount: 1,
      size: 5,
      links: [],
    });
    vi.mocked(writeCache).mockResolvedValue({
      filePath: "/cache/abc.txt",
      meta: { url: "https://example.com/docs/intro", fetchedAt: Date.now() },
      size: 50,
    });
    vi.mocked(formatCacheSummary).mockReturnValue("Summary");

    await parse_website({ url: "https://example.com/docs/intro" });

    expect(readCache).toHaveBeenCalledWith(
      "https://example.com/docs/intro",
      "llms-txt",
    );
    expect(writeCache).toHaveBeenCalledWith(
      "https://example.com/docs/intro",
      expect.any(String),
      "llms-txt",
      expect.any(Object),
    );
  });
});
