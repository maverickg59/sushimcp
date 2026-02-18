import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock before importing the module
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Dynamic import after mocking
let embedTexts: typeof import("#lib/embeddings").embedTexts;
let checkOllamaHealth: typeof import("#lib/embeddings").checkOllamaHealth;
let isOllamaAvailable: typeof import("#lib/embeddings").isOllamaAvailable;
let EMBED_DIMS: number;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  const mod = await import("#lib/embeddings");
  embedTexts = mod.embedTexts;
  checkOllamaHealth = mod.checkOllamaHealth;
  isOllamaAvailable = mod.isOllamaAvailable;
  EMBED_DIMS = mod.EMBED_DIMS;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("EMBED_DIMS", () => {
  it("should default to 2560", () => {
    expect(EMBED_DIMS).toBe(2560);
  });
});

describe("checkOllamaHealth", () => {
  it("should return true when Ollama responds with models", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        models: [{ name: "qwen3-embedding:4b" }],
      }),
    });

    const result = await checkOllamaHealth();
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/tags"),
      expect.any(Object),
    );
  });

  it("should cache the result after first successful check", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: "qwen3-embedding:4b" }] }),
    });

    await checkOllamaHealth();
    const result = await checkOllamaHealth();
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only called once
  });

  it("should return false after retries when Ollama is down", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const promise = checkOllamaHealth();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;
    expect(result).toBe(false);
    expect(fetchMock.mock.calls.length).toBe(3); // 3 retries
  });

  it("should return true even when model is not found", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: "other-model:latest" }] }),
    });

    const result = await checkOllamaHealth();
    expect(result).toBe(true); // Ollama running = available
  });
});

describe("isOllamaAvailable", () => {
  it("should return null before health check", () => {
    expect(isOllamaAvailable()).toBeNull();
  });

  it("should return cached value after health check", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    });
    await checkOllamaHealth();
    expect(isOllamaAvailable()).toBe(true);
  });
});

describe("embedTexts", () => {
  it("should embed texts via Ollama API", async () => {
    const fakeVectors = [[0.1, 0.2], [0.3, 0.4]];

    // Health check response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: "qwen3-embedding:4b" }] }),
    });
    // Embed response
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: fakeVectors }),
    });

    const result = await embedTexts(["hello", "world"]);
    expect(result).toEqual(fakeVectors);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/embed"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"input":["hello","world"]'),
      }),
    );
  });

  it("should throw when Ollama is not available", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    // Attach rejection handler before advancing timers to avoid unhandled rejection
    const assertion = expect(embedTexts(["test"])).rejects.toThrow(
      "Ollama is not available",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it("should throw on non-ok embed response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: "qwen3-embedding:4b" }] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(embedTexts(["test"])).rejects.toThrow(
      "Ollama embed failed (500)",
    );
  });

  it("should batch large inputs", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: "qwen3-embedding:4b" }] }),
    });

    const batchSize = 3;
    const texts = ["a", "b", "c", "d", "e"];

    // Two batches expected
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: [[1], [2], [3]] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ embeddings: [[4], [5]] }),
    });

    const result = await embedTexts(texts, batchSize);
    expect(result).toEqual([[1], [2], [3], [4], [5]]);
    // health check + 2 embed calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
