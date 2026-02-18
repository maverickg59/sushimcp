import * as lancedb from "@lancedb/lancedb";
import {
  Field,
  Float32,
  FixedSizeList,
  Schema,
  Utf8,
} from "apache-arrow";
import type { Table } from "@lancedb/lancedb";
import type { DocChunk } from "./chunker.js";
import { embedTexts, EMBED_DIMS } from "./embeddings.js";
import { logger } from "./logger.js";
import { getCacheDir } from "./cache.js";
import { join } from "node:path";

const TABLE_NAME = "documents";

function getDbPath(): string {
  return join(getCacheDir(), "vectordb");
}

export class VectorStore {
  private table: Table;

  private constructor(table: Table) {
    this.table = table;
  }

  /**
   * Connect to (or create) the LanceDB vector store.
   * Uses an explicit Apache Arrow schema to avoid type inference issues.
   */
  static async create(): Promise<VectorStore> {
    const dbPath = getDbPath();
    const db = await lancedb.connect(dbPath);
    const tableNames = await db.tableNames();

    let table: Table;
    if (tableNames.includes(TABLE_NAME)) {
      table = await db.openTable(TABLE_NAME);
    } else {
      const schema = new Schema([
        new Field("id", new Utf8(), false),
        new Field("text", new Utf8(), false),
        new Field("source", new Utf8(), false),
        new Field("heading", new Utf8(), false),
        new Field("hash", new Utf8(), false),
        new Field(
          "vector",
          new FixedSizeList(
            EMBED_DIMS,
            new Field("item", new Float32(), true),
          ),
          false,
        ),
      ]);
      table = await db.createEmptyTable(TABLE_NAME, schema);
      logger.info(`Created new vector store at ${dbPath}`);
    }

    return new VectorStore(table);
  }

  async countRows(): Promise<number> {
    return this.table.countRows();
  }

  /**
   * Index chunks using mergeInsert upsert.
   * Compares hashes to skip unchanged chunks, deletes removed chunks.
   */
  async indexChunks(
    chunks: DocChunk[],
  ): Promise<{ embedded: number; unchanged: number; deleted: number }> {
    const newChunkMap = new Map(chunks.map((c) => [c.id, c]));

    // Query existing rows for id + hash
    const existingMap = new Map<string, string>();
    const rowCount = await this.table.countRows();
    if (rowCount > 0) {
      const rows = await this.table
        .query()
        .select(["id", "hash"])
        .toArray();
      for (const row of rows) {
        existingMap.set(row.id as string, row.hash as string);
      }
    }

    // Determine what changed
    const toEmbed: DocChunk[] = [];
    let unchanged = 0;
    for (const chunk of chunks) {
      const existingHash = existingMap.get(chunk.id);
      if (existingHash === chunk.hash) {
        unchanged++;
      } else {
        toEmbed.push(chunk);
      }
    }

    // Find deleted IDs (existing IDs not in new chunk set)
    const deletedIds: string[] = [];
    for (const existingId of existingMap.keys()) {
      if (!newChunkMap.has(existingId)) {
        deletedIds.push(existingId);
      }
    }

    // Delete removed chunks
    if (deletedIds.length > 0) {
      const inClause = deletedIds
        .map((id) => `'${id.replace(/'/g, "''")}'`)
        .join(", ");
      await this.table.delete(`id IN (${inClause})`);
    }

    // Embed and upsert new/changed chunks
    if (toEmbed.length > 0) {
      const texts = toEmbed.map((c) => c.content);
      const vectors = await embedTexts(texts);

      const records = toEmbed.map((chunk, i) => ({
        id: chunk.id,
        text: chunk.content,
        source: chunk.source,
        heading: chunk.heading,
        hash: chunk.hash,
        vector: vectors[i],
      }));

      await this.table
        .mergeInsert("id")
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute(records);
    }

    return { embedded: toEmbed.length, unchanged, deleted: deletedIds.length };
  }

  /**
   * Delete all rows for a given source.
   */
  async deleteBySource(source: string): Promise<void> {
    const escaped = source.replace(/'/g, "''");
    await this.table.delete(`source = '${escaped}'`);
  }

  /**
   * Search for chunks similar to a query string.
   * Returns formatted text with a hard character cap.
   */
  async search(
    query: string,
    topK?: number,
    maxChars?: number,
  ): Promise<{ text: string; count: number }> {
    const k = topK ?? 5;
    const cap = maxChars ?? 9000;

    const [queryVec] = await embedTexts([query]);
    const results = await this.table
      .vectorSearch(queryVec)
      .limit(k)
      .toArray();

    if (results.length === 0) {
      return { text: "", count: 0 };
    }

    const maxPerChunk = Math.floor(cap / 2);
    const parts: string[] = [];
    let totalChars = 0;

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const heading = row.heading as string;
      const source = row.source as string;
      const score = row._distance != null ? (1 - (row._distance as number)).toFixed(2) : "?";
      let text = row.text as string;

      if (text.length > maxPerChunk) {
        text = text.slice(0, maxPerChunk) + "\n\n[...truncated]";
      }

      const part = `[${i + 1}] ${heading} (source: ${source}, score: ${score})\n---\n${text}`;

      if (totalChars + part.length > cap && parts.length > 0) {
        logger.debug(
          `Search capped at ${parts.length} chunks (${totalChars} chars, limit ${cap})`,
        );
        break;
      }

      parts.push(part);
      totalChars += part.length;
    }

    return { text: parts.join("\n\n"), count: parts.length };
  }
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
