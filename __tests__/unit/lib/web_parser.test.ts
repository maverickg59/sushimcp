import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("#lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock defuddle/node
vi.mock("defuddle/node", () => ({
  Defuddle: vi.fn(),
}));

import { extractLinks, fetchAndParse, parsePages } from "#lib/web_parser.js";
import { Defuddle } from "defuddle/node";

// --- extractLinks --- //

describe("extractLinks", () => {
  const baseUrl = "https://example.com/docs/intro";

  it("extracts same-host links from HTML", () => {
    const html = `
      <a href="/docs/getting-started">Getting Started</a>
      <a href="/docs/api">API Reference</a>
    `;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      text: "Getting Started",
      url: "https://example.com/docs/getting-started",
    });
    expect(links[1]).toEqual({
      text: "API Reference",
      url: "https://example.com/docs/api",
    });
  });

  it("resolves relative URLs", () => {
    const html = `<a href="../guides/quickstart">Quickstart</a>`;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(1);
    // Base is /docs/intro, so .. goes from /docs/ to /, then /guides/quickstart
    expect(links[0].url).toBe("https://example.com/guides/quickstart");
  });

  it("filters out external links", () => {
    const html = `
      <a href="https://example.com/docs/page">Internal</a>
      <a href="https://other.com/page">External</a>
    `;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(1);
    expect(links[0].text).toBe("Internal");
  });

  it("deduplicates by URL", () => {
    const html = `
      <a href="/docs/page">First mention</a>
      <a href="/docs/page">Second mention</a>
    `;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(1);
    expect(links[0].text).toBe("First mention");
  });

  it("strips inner HTML tags from anchor text", () => {
    const html = `<a href="/docs/page"><span class="icon">📄</span> <strong>Bold</strong> Text</a>`;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(1);
    expect(links[0].text).toBe("📄 Bold Text");
  });

  it("skips anchors with empty href", () => {
    const html = `<a href="">Empty</a>`;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(0);
  });

  it("skips hash-only links", () => {
    const html = `<a href="#section">Jump</a>`;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(0);
  });

  it("skips mailto links", () => {
    const html = `<a href="mailto:test@example.com">Email</a>`;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(0);
  });

  it("skips javascript links", () => {
    const html = `<a href="javascript:void(0)">Click</a>`;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(0);
  });

  it("normalizes away hash fragments", () => {
    const html = `
      <a href="/docs/page#section1">Section 1</a>
      <a href="/docs/page#section2">Section 2</a>
    `;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(1);
  });

  it("returns empty array for invalid base URL", () => {
    const links = extractLinks(`<a href="/page">Link</a>`, "not-a-url");
    expect(links).toHaveLength(0);
  });

  it("handles absolute same-host URLs", () => {
    const html = `<a href="https://example.com/docs/page">Page</a>`;
    const links = extractLinks(html, baseUrl);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://example.com/docs/page");
  });
});

// --- fetchAndParse --- //

describe("fetchAndParse", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(Defuddle).mockReset();
  });

  it("fetches HTML and returns parsed markdown with links", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        '<html><body><a href="/docs/page">Link</a><h1>Hello</h1></body></html>',
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      ),
    );

    vi.mocked(Defuddle).mockResolvedValue({
      content: "# Hello",
      title: "Hello Page",
      description: "A test page",
      wordCount: 1,
      domain: "example.com",
      favicon: "",
      image: "",
      parseTime: 10,
      published: "",
      author: "",
      site: "",
      schemaOrgData: null,
    });

    const result = await fetchAndParse("https://example.com");

    expect(result.url).toBe("https://example.com");
    expect(result.title).toBe("Hello Page");
    expect(result.description).toBe("A test page");
    expect(result.content).toBe("# Hello");
    expect(result.wordCount).toBe(1);
    expect(result.size).toBe(7);
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toEqual({
      text: "Link",
      url: "https://example.com/docs/page",
    });
  });

  it("throws on non-HTML content type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response('{"json": true}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchAndParse("https://example.com/api")).rejects.toThrow(
      "Non-HTML content type",
    );
  });

  it("throws on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(fetchAndParse("https://example.com/missing")).rejects.toThrow(
      "HTTP 404",
    );
  });

  it("handles empty content from defuddle", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    vi.mocked(Defuddle).mockResolvedValue({
      content: "",
      title: "",
      description: "",
      wordCount: 0,
      domain: "",
      favicon: "",
      image: "",
      parseTime: 5,
      published: "",
      author: "",
      site: "",
      schemaOrgData: null,
    });

    const result = await fetchAndParse("https://example.com/empty");
    expect(result.content).toBe("");
    expect(result.size).toBe(0);
    expect(result.links).toEqual([]);
  });

  it("handles null title and description gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body><p>text</p></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    vi.mocked(Defuddle).mockResolvedValue({
      content: "text",
      title: "",
      description: "",
      wordCount: 1,
      domain: "",
      favicon: "",
      image: "",
      parseTime: 5,
      published: "",
      author: "",
      site: "",
      schemaOrgData: null,
    });

    const result = await fetchAndParse("https://example.com");
    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
  });
});

// --- parsePages --- //

describe("parsePages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(Defuddle).mockReset();
  });

  function mockFetchAndDefuddle(
    pages: { url: string; content: string; title: string; html?: string }[],
  ) {
    const pageMap = new Map(pages.map((p) => [p.url, p]));

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      const page = pageMap.get(url);
      if (page) {
        const html =
          page.html ||
          `<html><body><a href="/link-from-${page.title.toLowerCase()}">${page.title} Link</a>${page.content}</body></html>`;
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    vi.mocked(Defuddle).mockImplementation(async (html: any, url?: string) => {
      const page = url ? pageMap.get(url) : undefined;
      return {
        content: page?.content || "",
        title: page?.title || "",
        description: "",
        wordCount: page ? page.content.split(/\s+/).length : 0,
        domain: "",
        favicon: "",
        image: "",
        parseTime: 5,
        published: "",
        author: "",
        site: "",
        schemaOrgData: null,
      };
    });
  }

  it("parses multiple pages and aggregates links", async () => {
    mockFetchAndDefuddle([
      { url: "https://example.com/a", content: "Page A", title: "A" },
      { url: "https://example.com/b", content: "Page B", title: "B" },
    ]);

    const result = await parsePages([
      "https://example.com/a",
      "https://example.com/b",
    ]);

    expect(result.pages).toHaveLength(2);
    expect(result.totalChars).toBe(12); // "Page A" + "Page B"
    expect(result.links.length).toBeGreaterThan(0);
  });

  it("deduplicates links across pages", async () => {
    // Both pages have a link to the same URL
    mockFetchAndDefuddle([
      {
        url: "https://example.com/a",
        content: "Page A",
        title: "A",
        html: '<html><body><a href="/shared">Shared</a>Page A</body></html>',
      },
      {
        url: "https://example.com/b",
        content: "Page B",
        title: "B",
        html: '<html><body><a href="/shared">Shared</a>Page B</body></html>',
      },
    ]);

    const result = await parsePages([
      "https://example.com/a",
      "https://example.com/b",
    ]);

    const sharedLinks = result.links.filter((l) =>
      l.url.includes("/shared"),
    );
    expect(sharedLinks).toHaveLength(1);
  });

  it("stops at budget limit", async () => {
    mockFetchAndDefuddle([
      { url: "https://example.com/a", content: "Short", title: "A" },
      { url: "https://example.com/b", content: "Also short", title: "B" },
    ]);

    const result = await parsePages(
      ["https://example.com/a", "https://example.com/b"],
      8, // budget just enough for "Short" but not both
    );

    expect(result.pages).toHaveLength(1);
    expect(result.skipped.length).toBeGreaterThanOrEqual(1);
  });

  it("caps at maxPages", async () => {
    mockFetchAndDefuddle([
      { url: "https://example.com/1", content: "One", title: "1" },
      { url: "https://example.com/2", content: "Two", title: "2" },
      { url: "https://example.com/3", content: "Three", title: "3" },
    ]);

    const result = await parsePages(
      [
        "https://example.com/1",
        "https://example.com/2",
        "https://example.com/3",
      ],
      300_000,
      2, // maxPages = 2
    );

    expect(result.pages).toHaveLength(2);
    expect(result.skipped).toContain("https://example.com/3");
  });

  it("skips pages that fail to fetch", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/good")) {
        return new Response("<html><body>Good</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("Error", { status: 500 });
    });

    vi.mocked(Defuddle).mockResolvedValue({
      content: "Good",
      title: "Good",
      description: "",
      wordCount: 1,
      domain: "",
      favicon: "",
      image: "",
      parseTime: 5,
      published: "",
      author: "",
      site: "",
      schemaOrgData: null,
    });

    const result = await parsePages([
      "https://example.com/good",
      "https://example.com/bad",
    ]);

    expect(result.pages).toHaveLength(1);
    expect(result.skipped).toContain("https://example.com/bad");
  });

  it("skips pages with empty content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body></body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    vi.mocked(Defuddle).mockResolvedValue({
      content: "",
      title: "",
      description: "",
      wordCount: 0,
      domain: "",
      favicon: "",
      image: "",
      parseTime: 5,
      published: "",
      author: "",
      site: "",
      schemaOrgData: null,
    });

    const result = await parsePages(["https://example.com/empty"]);

    expect(result.pages).toHaveLength(0);
    expect(result.skipped).toContain("https://example.com/empty");
  });
});
