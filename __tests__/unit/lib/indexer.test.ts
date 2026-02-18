import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#lib/embeddings", () => ({
  checkOllamaHealth: vi.fn(),
}));

vi.mock("#lib/chunker", () => ({
  chunkMarkdown: vi.fn(),
  chunkOpenApi: vi.fn(),
}));

vi.mock("#lib/vectordb", () => ({
  VectorStore: {
    create: vi.fn(),
  },
}));

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { contentHash, indexContent } from "#lib/indexer";
import { checkOllamaHealth } from "#lib/embeddings";
import { chunkMarkdown, chunkOpenApi } from "#lib/chunker";
import { VectorStore } from "#lib/vectordb";

const mockCheckHealth = vi.mocked(checkOllamaHealth);
const mockChunkMarkdown = vi.mocked(chunkMarkdown);
const mockChunkOpenApi = vi.mocked(chunkOpenApi);
const mockVectorStoreCreate = vi.mocked(VectorStore.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("contentHash", () => {
  it("should return SHA-256 hex hash", () => {
    const hash = contentHash("hello world");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should return different hashes for different content", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });

  it("should return same hash for same content", () => {
    expect(contentHash("test")).toBe(contentHash("test"));
  });
});

describe("indexContent", () => {
  it("should skip indexing when Ollama is unavailable", async () => {
    mockCheckHealth.mockResolvedValue(false);
    await indexContent("https://example.com", "content", "llms-txt");
    expect(mockChunkMarkdown).not.toHaveBeenCalled();
    expect(mockChunkOpenApi).not.toHaveBeenCalled();
  });

  it("should use chunkMarkdown for llms-txt type", async () => {
    mockCheckHealth.mockResolvedValue(true);
    mockChunkMarkdown.mockReturnValue([
      { id: "test#intro", source: "test", heading: "(intro)", content: "hello", hash: "abc" },
    ]);
    const mockStore = {
      indexChunks: vi.fn().mockResolvedValue({ embedded: 1, unchanged: 0, deleted: 0 }),
    };
    mockVectorStoreCreate.mockResolvedValue(mockStore as any);

    await indexContent("https://example.com/docs", "# Hello", "llms-txt");

    expect(mockChunkMarkdown).toHaveBeenCalledWith("# Hello", "https://example.com/docs");
    expect(mockChunkOpenApi).not.toHaveBeenCalled();
    expect(mockStore.indexChunks).toHaveBeenCalled();
  });

  it("should use chunkOpenApi for openapi type", async () => {
    mockCheckHealth.mockResolvedValue(true);
    mockChunkOpenApi.mockReturnValue([
      { id: "test#get-users", source: "test", heading: "GET /users", content: "{}", hash: "abc" },
    ]);
    const mockStore = {
      indexChunks: vi.fn().mockResolvedValue({ embedded: 1, unchanged: 0, deleted: 0 }),
    };
    mockVectorStoreCreate.mockResolvedValue(mockStore as any);

    await indexContent("https://api.com/spec", '{"paths":{}}', "openapi");

    expect(mockChunkOpenApi).toHaveBeenCalledWith('{"paths":{}}', "https://api.com/spec");
    expect(mockChunkMarkdown).not.toHaveBeenCalled();
  });

  it("should skip when chunker produces no chunks", async () => {
    mockCheckHealth.mockResolvedValue(true);
    mockChunkMarkdown.mockReturnValue([]);

    await indexContent("https://example.com", "", "llms-txt");

    expect(mockVectorStoreCreate).not.toHaveBeenCalled();
  });

  it("should handle indexing errors gracefully", async () => {
    mockCheckHealth.mockResolvedValue(true);
    mockChunkMarkdown.mockReturnValue([
      { id: "test#a", source: "test", heading: "A", content: "content", hash: "h" },
    ]);
    mockVectorStoreCreate.mockRejectedValue(new Error("DB error"));

    // Should not throw — errors are logged internally
    await expect(indexContent("https://example.com", "content", "llms-txt")).resolves.not.toThrow();
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
