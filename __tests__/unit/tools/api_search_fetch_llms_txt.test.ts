import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#lib/api_client", () => ({
  searchLlmsTxtSources: vi.fn(),
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

import { api_search_fetch_llms_txt } from "#tools/api_search_fetch_llms_txt";
import { searchLlmsTxtSources } from "#lib/api_client";
import { readCache, writeCache, formatCacheSummary } from "#lib/cache";

const mockSearch = vi.mocked(searchLlmsTxtSources);
const mockReadCache = vi.mocked(readCache);
const mockWriteCache = vi.mocked(writeCache);
const mockFormatSummary = vi.mocked(formatCacheSummary);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
});

describe("api_search_fetch_llms_txt", () => {
  it("should return not-found message when no sources match", async () => {
    mockSearch.mockResolvedValue([]);
    const result = await api_search_fetch_llms_txt("nonexistent");
    expect(result.content[0].text).toContain('No llms.txt sources found matching "nonexistent"');
  });

  it("should return no-URL message when source has no URLs", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "EmptySource", llmsTxtUrl: null, llmsFullTxtUrl: null, llmsMiniTxtUrl: null } as any,
    ]);
    const result = await api_search_fetch_llms_txt("empty");
    expect(result.content[0].text).toContain("no llms.txt URLs configured");
  });

  it("should show other matches when source has no URLs and others exist", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Empty", llmsTxtUrl: null, llmsFullTxtUrl: null, llmsMiniTxtUrl: null } as any,
      { id: 2, name: "React" } as any,
    ]);
    const result = await api_search_fetch_llms_txt("test");
    expect(result.content[0].text).toContain("Other matches: React");
  });

  it("should prefer llms-full.txt URL", async () => {
    mockSearch.mockResolvedValue([
      {
        id: 1, name: "React",
        llmsFullTxtUrl: "https://react.dev/llms-full.txt",
        llmsTxtUrl: "https://react.dev/llms.txt",
        llmsMiniTxtUrl: "https://react.dev/llms-mini.txt",
      } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "content" });
    mockWriteCache.mockResolvedValue({
      filePath: "/cache/test.txt",
      meta: { url: "test", fetchedAt: Date.now() },
      size: 7,
    });
    mockFormatSummary.mockReturnValue("summary");

    await api_search_fetch_llms_txt("react");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://react.dev/llms-full.txt",
      expect.any(Object),
    );
  });

  it("should fall back to llms.txt when llms-full.txt is missing", async () => {
    mockSearch.mockResolvedValue([
      {
        id: 1, name: "Test",
        llmsFullTxtUrl: null,
        llmsTxtUrl: "https://test.dev/llms.txt",
        llmsMiniTxtUrl: null,
      } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "content" });
    mockWriteCache.mockResolvedValue({
      filePath: "/cache/test.txt",
      meta: { url: "test", fetchedAt: Date.now() },
      size: 7,
    });
    mockFormatSummary.mockReturnValue("summary");

    await api_search_fetch_llms_txt("test");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://test.dev/llms.txt",
      expect.any(Object),
    );
  });

  it("should fall back to llms-mini.txt as last resort", async () => {
    mockSearch.mockResolvedValue([
      {
        id: 1, name: "Mini",
        llmsFullTxtUrl: null,
        llmsTxtUrl: null,
        llmsMiniTxtUrl: "https://mini.dev/llms-mini.txt",
      } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "mini content" });
    mockWriteCache.mockResolvedValue({
      filePath: "/cache/mini.txt",
      meta: { url: "test", fetchedAt: Date.now() },
      size: 12,
    });
    mockFormatSummary.mockReturnValue("summary");

    await api_search_fetch_llms_txt("mini");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mini.dev/llms-mini.txt",
      expect.any(Object),
    );
  });

  it("should return cached content when available", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Cached", llmsFullTxtUrl: "https://cached.dev/llms-full.txt" } as any,
    ]);
    const cachedHit = {
      filePath: "/cache/cached.txt",
      meta: { url: "https://cached.dev/llms-full.txt", fetchedAt: Date.now() },
      size: 100,
    };
    mockReadCache.mockResolvedValue(cachedHit);
    mockFormatSummary.mockReturnValue("Cached summary");

    const result = await api_search_fetch_llms_txt("cached");
    expect(result.content[0].text).toBe("Cached summary");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("should include other matches with cached response", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "React", llmsFullTxtUrl: "https://react.dev/llms-full.txt" } as any,
      { id: 2, name: "Preact" } as any,
    ]);
    mockReadCache.mockResolvedValue({
      filePath: "/cache/cached.txt",
      meta: { url: "test", fetchedAt: Date.now() },
      size: 100,
    });
    mockFormatSummary.mockReturnValue("summary");

    const result = await api_search_fetch_llms_txt("react");
    expect(result.content[0].text).toContain("Other matches: Preact");
  });

  it("should handle fetch errors gracefully", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Fail", llmsTxtUrl: "https://fail.dev/llms.txt" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    const result = await api_search_fetch_llms_txt("fail");
    expect(result.content[0].text).toContain("failed to fetch content");
    expect(result.content[0].text).toContain("Network error");
  });

  it("should handle non-ok HTTP responses", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "NotFound", llmsTxtUrl: "https://nf.dev/llms.txt" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await api_search_fetch_llms_txt("nf");
    expect(result.content[0].text).toContain("failed to fetch content");
    expect(result.content[0].text).toContain("HTTP 404");
  });

  it("should write to cache and return summary on successful fetch", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Fresh", llmsTxtUrl: "https://fresh.dev/llms.txt" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "fresh docs" });
    const hit = {
      filePath: "/cache/fresh.txt",
      meta: { url: "https://fresh.dev/llms.txt", fetchedAt: Date.now() },
      size: 10,
    };
    mockWriteCache.mockResolvedValue(hit);
    mockFormatSummary.mockReturnValue("Fresh summary");

    const result = await api_search_fetch_llms_txt("fresh");
    expect(mockWriteCache).toHaveBeenCalledWith(
      "https://fresh.dev/llms.txt",
      "fresh docs",
      "llms-txt",
      { sourceName: "Fresh", variant: "llms.txt" },
    );
    expect(result.content[0].text).toBe("Fresh summary");
  });

  it("should include other matches on fresh fetch", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "React", llmsTxtUrl: "https://react.dev/llms.txt" } as any,
      { id: 2, name: "Preact" } as any,
      { id: 3, name: "React Native" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "content" });
    mockWriteCache.mockResolvedValue({
      filePath: "/cache/test.txt",
      meta: { url: "test", fetchedAt: Date.now() },
      size: 7,
    });
    mockFormatSummary.mockReturnValue("summary");

    const result = await api_search_fetch_llms_txt("react");
    expect(result.content[0].text).toContain("Other matches: Preact, React Native");
  });

  it("should handle non-Error fetch failures", async () => {
    mockSearch.mockResolvedValue([
      { id: 1, name: "Weird", llmsTxtUrl: "https://weird.dev/llms.txt" } as any,
    ]);
    mockReadCache.mockResolvedValue(null);
    fetchMock.mockRejectedValueOnce("string error");

    const result = await api_search_fetch_llms_txt("weird");
    expect(result.content[0].text).toContain("failed to fetch content");
    expect(result.content[0].text).toContain("string error");
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
