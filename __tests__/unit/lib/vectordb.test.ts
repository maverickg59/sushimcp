import { describe, it, expect, vi, beforeEach } from "vitest";

// All mock fns must be created inside the factory to avoid hoisting issues
vi.mock("@lancedb/lancedb", () => {
  const mockFns = {
    toArray: vi.fn(),
    limit: vi.fn(),
    vectorSearch: vi.fn(),
    select: vi.fn(),
    query: vi.fn(),
    countRows: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
    whenNotMatchedInsertAll: vi.fn(),
    whenMatchedUpdateAll: vi.fn(),
    mergeInsert: vi.fn(),
    openTable: vi.fn(),
    createEmptyTable: vi.fn(),
    tableNames: vi.fn(),
  };

  // Wire up the chain
  mockFns.limit.mockReturnValue({ toArray: mockFns.toArray });
  mockFns.vectorSearch.mockReturnValue({ limit: mockFns.limit });
  mockFns.select.mockReturnValue({ toArray: mockFns.toArray });
  mockFns.query.mockReturnValue({ select: mockFns.select });
  mockFns.whenNotMatchedInsertAll.mockReturnValue({ execute: mockFns.execute });
  mockFns.whenMatchedUpdateAll.mockReturnValue({ whenNotMatchedInsertAll: mockFns.whenNotMatchedInsertAll });
  mockFns.mergeInsert.mockReturnValue({ whenMatchedUpdateAll: mockFns.whenMatchedUpdateAll });

  const table = {
    countRows: mockFns.countRows,
    query: mockFns.query,
    delete: mockFns.delete,
    mergeInsert: mockFns.mergeInsert,
    vectorSearch: mockFns.vectorSearch,
  };

  mockFns.openTable.mockResolvedValue(table);
  mockFns.createEmptyTable.mockResolvedValue(table);
  mockFns.tableNames.mockResolvedValue([]);

  return {
    connect: vi.fn().mockResolvedValue({
      tableNames: mockFns.tableNames,
      openTable: mockFns.openTable,
      createEmptyTable: mockFns.createEmptyTable,
    }),
    __mocks: mockFns, // expose for test access
  };
});

vi.mock("apache-arrow", () => ({
  Field: vi.fn(),
  Float32: vi.fn(),
  FixedSizeList: vi.fn(),
  Schema: vi.fn(),
  Utf8: vi.fn(),
}));

vi.mock("#lib/embeddings", () => ({
  EMBED_DIMS: 2560,
  embedTexts: vi.fn(),
}));

vi.mock("#lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { VectorStore } from "#lib/vectordb";
import { embedTexts } from "#lib/embeddings";
import * as lancedbModule from "@lancedb/lancedb";

const mockEmbedTexts = vi.mocked(embedTexts);
const mocks = (lancedbModule as any).__mocks;

beforeEach(() => {
  vi.clearAllMocks();
  // Re-wire chains after clear
  mocks.limit.mockReturnValue({ toArray: mocks.toArray });
  mocks.vectorSearch.mockReturnValue({ limit: mocks.limit });
  mocks.select.mockReturnValue({ toArray: mocks.toArray });
  mocks.query.mockReturnValue({ select: mocks.select });
  mocks.whenNotMatchedInsertAll.mockReturnValue({ execute: mocks.execute });
  mocks.whenMatchedUpdateAll.mockReturnValue({ whenNotMatchedInsertAll: mocks.whenNotMatchedInsertAll });
  mocks.mergeInsert.mockReturnValue({ whenMatchedUpdateAll: mocks.whenMatchedUpdateAll });
  mocks.countRows.mockResolvedValue(0);
  mocks.tableNames.mockResolvedValue([]);

  const table = {
    countRows: mocks.countRows,
    query: mocks.query,
    delete: mocks.delete,
    mergeInsert: mocks.mergeInsert,
    vectorSearch: mocks.vectorSearch,
  };
  mocks.openTable.mockResolvedValue(table);
  mocks.createEmptyTable.mockResolvedValue(table);
});

describe("VectorStore.create", () => {
  it("should create a new table when none exists", async () => {
    mocks.tableNames.mockResolvedValue([]);
    const store = await VectorStore.create();
    expect(store).toBeDefined();
    expect(mocks.createEmptyTable).toHaveBeenCalledWith("documents", expect.anything());
  });

  it("should open existing table when it exists", async () => {
    mocks.tableNames.mockResolvedValue(["documents"]);
    const store = await VectorStore.create();
    expect(store).toBeDefined();
    expect(mocks.openTable).toHaveBeenCalledWith("documents");
    expect(mocks.createEmptyTable).not.toHaveBeenCalled();
  });
});

describe("VectorStore.countRows", () => {
  it("should return the row count", async () => {
    mocks.tableNames.mockResolvedValue(["documents"]);
    mocks.countRows.mockResolvedValue(42);
    const store = await VectorStore.create();
    expect(await store.countRows()).toBe(42);
  });
});

describe("VectorStore.indexChunks", () => {
  it("should embed and upsert new chunks", async () => {
    mocks.countRows.mockResolvedValue(0);
    mockEmbedTexts.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);

    const store = await VectorStore.create();
    const result = await store.indexChunks([
      { id: "a#intro", source: "a", heading: "(intro)", content: "hello", hash: "h1" },
      { id: "a#routing", source: "a", heading: "Routing", content: "routes", hash: "h2" },
    ]);

    expect(result.embedded).toBe(2);
    expect(result.unchanged).toBe(0);
    expect(result.deleted).toBe(0);
    expect(mockEmbedTexts).toHaveBeenCalledWith(["hello", "routes"]);
    expect(mocks.mergeInsert).toHaveBeenCalledWith("id");
  });

  it("should skip unchanged chunks", async () => {
    mocks.countRows.mockResolvedValue(1);
    mocks.toArray.mockResolvedValueOnce([{ id: "a#intro", hash: "same_hash" }]);

    const store = await VectorStore.create();
    const result = await store.indexChunks([
      { id: "a#intro", source: "a", heading: "(intro)", content: "hello", hash: "same_hash" },
    ]);

    expect(result.unchanged).toBe(1);
    expect(result.embedded).toBe(0);
    expect(mockEmbedTexts).not.toHaveBeenCalled();
  });

  it("should delete removed chunks", async () => {
    mocks.countRows.mockResolvedValue(2);
    mocks.toArray.mockResolvedValueOnce([
      { id: "a#intro", hash: "h1" },
      { id: "a#old-section", hash: "h2" },
    ]);
    mockEmbedTexts.mockResolvedValue([[0.1]]);

    const store = await VectorStore.create();
    await store.indexChunks([
      { id: "a#intro", source: "a", heading: "(intro)", content: "updated", hash: "h1_new" },
    ]);

    expect(mocks.delete).toHaveBeenCalledWith(expect.stringContaining("a#old-section"));
  });
});

describe("VectorStore.search", () => {
  it("should return formatted results", async () => {
    mockEmbedTexts.mockResolvedValue([[0.1, 0.2]]);
    mocks.toArray.mockResolvedValue([
      { heading: "Routing", source: "test://doc", text: "Route content", _distance: 0.1 },
    ]);

    const store = await VectorStore.create();
    const result = await store.search("routing");

    expect(result.count).toBe(1);
    expect(result.text).toContain("Routing");
    expect(result.text).toContain("Route content");
    expect(result.text).toContain("0.90");
  });

  it("should return empty when no results", async () => {
    mockEmbedTexts.mockResolvedValue([[0.1]]);
    mocks.toArray.mockResolvedValue([]);

    const store = await VectorStore.create();
    const result = await store.search("nothing");

    expect(result.count).toBe(0);
    expect(result.text).toBe("");
  });

  it("should truncate oversized chunks", async () => {
    mockEmbedTexts.mockResolvedValue([[0.1]]);
    const hugeText = "x".repeat(10000);
    mocks.toArray.mockResolvedValue([
      { heading: "Big", source: "test", text: hugeText, _distance: 0.05 },
    ]);

    const store = await VectorStore.create();
    const result = await store.search("test", 1, 9000);

    expect(result.text).toContain("[...truncated]");
    expect(result.text.length).toBeLessThan(hugeText.length);
  });
});

describe("VectorStore.deleteBySource", () => {
  it("should delete rows matching the source", async () => {
    const store = await VectorStore.create();
    await store.deleteBySource("https://example.com/docs");

    expect(mocks.delete).toHaveBeenCalledWith("source = 'https://example.com/docs'");
  });

  it("should escape single quotes in source", async () => {
    const store = await VectorStore.create();
    await store.deleteBySource("test's source");

    expect(mocks.delete).toHaveBeenCalledWith("source = 'test''s source'");
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
