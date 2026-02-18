import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  initApiClient,
  isApiMode,
  listLlmsTxtSources,
  searchLlmsTxtSources,
  listOpenapiSources,
  searchOpenapiSources,
  proxyGitHubIssues,
  proxyGitHubPullRequests,
  proxyGitHubProjects,
} from "#lib/api_client";

beforeEach(() => {
  fetchMock.mockReset();
  initApiClient("https://api.example.com", "test-key");
});

describe("initApiClient", () => {
  it("should enable API mode", () => {
    expect(isApiMode()).toBe(true);
  });

  it("should strip trailing slash from URL", async () => {
    initApiClient("https://api.example.com/", "test-key");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await listLlmsTxtSources();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/llms-txt-sources",
      expect.any(Object),
    );
  });
});

describe("isApiMode", () => {
  it("should return false before initialization", async () => {
    vi.resetModules();
    const mod = await import("#lib/api_client");
    expect(mod.isApiMode()).toBe(false);
  });
});

describe("apiRequest (via exported functions)", () => {
  it("should throw when client is not initialized", async () => {
    vi.resetModules();
    const mod = await import("#lib/api_client");
    await expect(mod.listLlmsTxtSources()).rejects.toThrow("not initialized");
  });

  it("should send GET request with correct headers", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [{ id: 1 }] });
    const result = await listLlmsTxtSources();
    expect(result).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/llms-txt-sources",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          Accept: "application/json",
        }),
      }),
    );
  });

  it("should send POST request with body and Content-Type header", async () => {
    const input = { action: "list", repo: "test" };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    await proxyGitHubIssues(input);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/github/issues",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(input),
      }),
    );
  });

  it("should not set Content-Type for GET requests", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await listLlmsTxtSources();
    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders["Content-Type"]).toBeUndefined();
  });

  it("should throw on non-ok response with sanitized body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });
    await expect(listLlmsTxtSources()).rejects.toThrow(
      "API GET /llms-txt-sources failed with status 404: Not Found",
    );
  });

  it("should truncate long error bodies with ellipsis", async () => {
    const longBody = "x".repeat(300);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => longBody,
    });
    await expect(listLlmsTxtSources()).rejects.toThrow(/\.\.\.$/);
  });

  it("should not add ellipsis for short error bodies", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });
    try {
      await listLlmsTxtSources();
    } catch (err) {
      expect((err as Error).message).not.toContain("...");
      expect((err as Error).message).toContain("Bad Request");
    }
  });

  it("should handle timeout errors", async () => {
    const timeoutError = new DOMException("Signal timed out", "TimeoutError");
    fetchMock.mockRejectedValueOnce(timeoutError);
    await expect(listLlmsTxtSources()).rejects.toThrow("timed out");
  });

  it("should rethrow other fetch errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
    await expect(listLlmsTxtSources()).rejects.toThrow("Network error");
  });
});

describe("searchLlmsTxtSources", () => {
  it("should encode query parameter", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await searchLlmsTxtSources("hello world");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/llms-txt-sources/search?q=hello%20world"),
      expect.any(Object),
    );
  });
});

describe("listOpenapiSources", () => {
  it("should call correct endpoint", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await listOpenapiSources();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/openapi-sources"),
      expect.any(Object),
    );
  });
});

describe("searchOpenapiSources", () => {
  it("should encode query parameter", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await searchOpenapiSources("stripe api");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/openapi-sources/search?q=stripe%20api"),
      expect.any(Object),
    );
  });
});

describe("proxyGitHubIssues", () => {
  it("should POST to github/issues endpoint", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ issues: [] }) });
    const result = await proxyGitHubIssues({ action: "list", repo: "test" });
    expect(result).toEqual({ issues: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/github/issues"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("proxyGitHubPullRequests", () => {
  it("should POST to github/pulls endpoint", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ pulls: [] }) });
    const result = await proxyGitHubPullRequests({ action: "list", repo: "test" });
    expect(result).toEqual({ pulls: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/github/pulls"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("proxyGitHubProjects", () => {
  it("should POST to github/projects endpoint", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    const result = await proxyGitHubProjects({ action: "list", projectNumber: 1 });
    expect(result).toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/github/projects"),
      expect.objectContaining({ method: "POST" }),
    );
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
