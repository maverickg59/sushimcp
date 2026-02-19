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

vi.mock("#lib/link_index.js", () => ({
  searchLinks: vi.fn(),
  listLinkIndexDomains: vi.fn(),
}));

import { search_website_links } from "#tools/search_website_links.js";
import { searchLinks, listLinkIndexDomains } from "#lib/link_index.js";

describe("search_website_links", () => {
  beforeEach(() => {
    vi.mocked(searchLinks).mockReset();
    vi.mocked(listLinkIndexDomains).mockReset();
  });

  it("returns matching links formatted as markdown", async () => {
    vi.mocked(searchLinks).mockResolvedValue([
      { text: "Auth Guide", url: "https://example.com/docs/auth" },
      { text: "Auth API", url: "https://example.com/api/auth" },
    ]);

    const result = await search_website_links({ query: "auth" });

    expect(result.content[0].text).toContain('Found 2 links matching "auth"');
    expect(result.content[0].text).toContain(
      "- [Auth Guide](https://example.com/docs/auth)",
    );
    expect(result.content[0].text).toContain(
      "- [Auth API](https://example.com/api/auth)",
    );
  });

  it("includes domain in header when domain filter is used", async () => {
    vi.mocked(searchLinks).mockResolvedValue([
      { text: "Page", url: "https://example.com/page" },
    ]);

    const result = await search_website_links({
      query: "page",
      domain: "example.com",
    });

    expect(result.content[0].text).toContain("on example.com");
  });

  it("suggests parsing when no matches and domain has no index", async () => {
    vi.mocked(searchLinks).mockResolvedValue([]);
    vi.mocked(listLinkIndexDomains).mockResolvedValue([]);

    const result = await search_website_links({
      query: "auth",
      domain: "newsite.com",
    });

    expect(result.content[0].text).toContain('No links found matching "auth"');
    expect(result.content[0].text).toContain(
      'No link index exists for "newsite.com"',
    );
  });

  it("lists available domains when no matches found", async () => {
    vi.mocked(searchLinks).mockResolvedValue([]);
    vi.mocked(listLinkIndexDomains).mockResolvedValue([
      "example.com",
      "other.com",
    ]);

    const result = await search_website_links({ query: "nonexistent" });

    expect(result.content[0].text).toContain("Available domains");
    expect(result.content[0].text).toContain("example.com");
  });

  it("suggests parsing when no indices exist at all", async () => {
    vi.mocked(searchLinks).mockResolvedValue([]);
    vi.mocked(listLinkIndexDomains).mockResolvedValue([]);

    const result = await search_website_links({ query: "anything" });

    expect(result.content[0].text).toContain("No link indices exist yet");
  });

  it("uses URL as text when link text is empty", async () => {
    vi.mocked(searchLinks).mockResolvedValue([
      { text: "", url: "https://example.com/page" },
    ]);

    const result = await search_website_links({ query: "page" });

    expect(result.content[0].text).toContain(
      "- [https://example.com/page](https://example.com/page)",
    );
  });
});
