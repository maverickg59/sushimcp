import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#lib/api_client", () => ({
  searchOpenapiSources: vi.fn(),
}));

vi.mock("#lib/cache", () => ({
  readCache: vi.fn(),
  writeCache: vi.fn(),
  formatCacheSummary: vi.fn(),
}));

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { api_search_fetch_openapi_spec } from "#tools/api_search_fetch_openapi_spec";
import { searchOpenapiSources } from "#lib/api_client";
import { readCache, writeCache, formatCacheSummary } from "#lib/cache";

const mockSearch = vi.mocked(searchOpenapiSources);
const mockReadCache = vi.mocked(readCache);
const mockWriteCache = vi.mocked(writeCache);
const mockFormatSummary = vi.mocked(formatCacheSummary);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
});

describe("api_search_fetch_openapi_spec", () => {
  it("should return not-found message when no sources match", async () => {
    mockSearch.mockResolvedValue([]);
    const result = await api_search_fetch_openapi_spec("nonexistent");
    expect(result.content[0].text).toContain('No OpenAPI specs found matching "nonexistent"');
  });

  it("should return cached content when available", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Stripe", url: "https://api.stripe.com/spec" } as any,
    ]);
    const cachedHit = {
      filePath: "/cache/stripe.txt",
      meta: { url: "https://api.stripe.com/spec", fetchedAt: Date.now() },
      size: 500,
    };
    mockReadCache.mockResolvedValue(cachedHit);
    mockFormatSummary.mockReturnValue("Cached Stripe summary");

    const result = await api_search_fetch_openapi_spec("stripe");
    expect(result.content[0].text).toBe("Cached Stripe summary");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockFormatSummary).toHaveBeenCalledWith("Stripe", "OpenAPI spec", "https://api.stripe.com/spec", cachedHit);
  });

  it("should include other matches with cached response", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "GitHub", url: "https://api.github.com/spec" } as any,
      { id: 2, name: "GitLab" } as any,
    ]);
    mockReadCache.mockResolvedValue({
      filePath: "/cache/gh.txt",
      meta: { url: "test", fetchedAt: Date.now() },
      size: 100,
    });
    mockFormatSummary.mockReturnValue("summary");

    const result = await api_search_fetch_openapi_spec("git");
    expect(result.content[0].text).toContain("Other matches: GitLab");
  });

  it("should fetch and cache on cache miss", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Stripe", url: "https://api.stripe.com/spec" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '{"openapi":"3.0"}' });
    const hit = {
      filePath: "/cache/stripe.txt",
      meta: { url: "https://api.stripe.com/spec", fetchedAt: Date.now() },
      size: 17,
    };
    mockWriteCache.mockResolvedValue(hit);
    mockFormatSummary.mockReturnValue("Fresh Stripe summary");

    const result = await api_search_fetch_openapi_spec("stripe");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stripe.com/spec",
      expect.any(Object),
    );
    expect(mockWriteCache).toHaveBeenCalledWith(
      "https://api.stripe.com/spec",
      '{"openapi":"3.0"}',
      "openapi",
      { sourceName: "Stripe" },
    );
    expect(result.content[0].text).toBe("Fresh Stripe summary");
  });

  it("should handle fetch errors gracefully", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Fail", url: "https://fail.com/spec" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await api_search_fetch_openapi_spec("fail");
    expect(result.content[0].text).toContain("failed to fetch spec");
    expect(result.content[0].text).toContain("Connection refused");
  });

  it("should handle non-ok HTTP responses", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Gone", url: "https://gone.com/spec" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 410 });

    const result = await api_search_fetch_openapi_spec("gone");
    expect(result.content[0].text).toContain("failed to fetch spec");
    expect(result.content[0].text).toContain("HTTP 410");
  });

  it("should handle non-Error fetch failures", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Weird", url: "https://weird.com/spec" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockRejectedValueOnce("string error");

    const result = await api_search_fetch_openapi_spec("weird");
    expect(result.content[0].text).toContain("failed to fetch spec");
    expect(result.content[0].text).toContain("string error");
  });

  it("should include other matches on fresh fetch", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Stripe", url: "https://api.stripe.com/spec" } as any,
      { id: 2, name: "Square" } as any,
      { id: 3, name: "Braintree" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "{}" });
    mockWriteCache.mockResolvedValue({
      filePath: "/cache/test.txt",
      meta: { url: "test", fetchedAt: Date.now() },
      size: 2,
    });
    mockFormatSummary.mockReturnValue("summary");

    const result = await api_search_fetch_openapi_spec("stripe");
    expect(result.content[0].text).toContain("Other matches: Square, Braintree");
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
