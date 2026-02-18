import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies before importing
vi.mock("#lib/embeddings", () => ({
  isOllamaAvailable: vi.fn(),
  checkOllamaHealth: vi.fn(),
}));

vi.mock("#lib/vectordb", () => ({
  VectorStore: {
    create: vi.fn(),
  },
}));

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { rag_search } from "#tools/rag_search";
import { isOllamaAvailable, checkOllamaHealth } from "#lib/embeddings";
import { VectorStore } from "#lib/vectordb";

const mockIsOllamaAvailable = vi.mocked(isOllamaAvailable);
const mockCheckOllamaHealth = vi.mocked(checkOllamaHealth);
const mockVectorStoreCreate = vi.mocked(VectorStore.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rag_search", () => {
  it("should return error when Ollama is unavailable", async () => {
    mockIsOllamaAvailable.mockReturnValue(false);

    const result = await rag_search({ query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Ollama is not running"),
    });
  });

  it("should check health when availability is unknown", async () => {
    mockIsOllamaAvailable.mockReturnValue(null);
    mockCheckOllamaHealth.mockResolvedValue(false);

    const result = await rag_search({ query: "test" });
    expect(mockCheckOllamaHealth).toHaveBeenCalled();
    expect(result.isError).toBe(true);
  });

  it("should return message when index is empty", async () => {
    mockIsOllamaAvailable.mockReturnValue(true);

    const mockStore = { countRows: vi.fn().mockResolvedValue(0) };
    mockVectorStoreCreate.mockResolvedValue(mockStore as any);

    const result = await rag_search({ query: "test" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("No documents have been indexed"),
    });
  });

  it("should return message when no relevant chunks found", async () => {
    mockIsOllamaAvailable.mockReturnValue(true);

    const mockStore = {
      countRows: vi.fn().mockResolvedValue(100),
      search: vi.fn().mockResolvedValue({ text: "", count: 0 }),
    };
    mockVectorStoreCreate.mockResolvedValue(mockStore as any);

    const result = await rag_search({ query: "nonexistent topic" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("No relevant chunks found"),
    });
  });

  it("should return formatted chunks on successful search", async () => {
    mockIsOllamaAvailable.mockReturnValue(true);

    const mockStore = {
      countRows: vi.fn().mockResolvedValue(100),
      search: vi.fn().mockResolvedValue({
        text: "[1] Routing (source: test, score: 0.92)\n---\nRoute content",
        count: 1,
      }),
    };
    mockVectorStoreCreate.mockResolvedValue(mockStore as any);

    const result = await rag_search({ query: "routing" });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('Found 1 relevant chunks for "routing"'),
    });
    expect(result.content[0].text).toContain("Route content");
  });

  it("should pass limit parameter to search", async () => {
    mockIsOllamaAvailable.mockReturnValue(true);

    const searchFn = vi.fn().mockResolvedValue({ text: "result", count: 1 });
    const mockStore = {
      countRows: vi.fn().mockResolvedValue(100),
      search: searchFn,
    };
    mockVectorStoreCreate.mockResolvedValue(mockStore as any);

    await rag_search({ query: "test", limit: 3 });
    expect(searchFn).toHaveBeenCalledWith("test", 3);
  });

  it("should return error on unexpected failure", async () => {
    mockIsOllamaAvailable.mockReturnValue(true);
    mockVectorStoreCreate.mockRejectedValue(new Error("DB connection failed"));

    const result = await rag_search({ query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("DB connection failed"),
    });
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
