import { createHash } from "node:crypto";
import { logger } from "./logger.js";
import { chunkMarkdown, chunkOpenApi } from "./chunker.js";
import { VectorStore } from "./vectordb.js";
import { checkOllamaHealth } from "./embeddings.js";
import type { CacheType } from "./cache.js";

/**
 * Compute SHA-256 hex hash of content for change detection.
 */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Index content into the vector store.
 * Chunks the content based on type, embeds, and upserts.
 *
 * This is the main entry point called fire-and-forget from writeCache.
 */
export async function indexContent(
  url: string,
  content: string,
  type: CacheType,
): Promise<void> {
  const available = await checkOllamaHealth();
  if (!available) {
    logger.debug(`Skipping indexing for ${url} — Ollama unavailable`);
    return;
  }

  try {
    const start = Date.now();

    // Choose chunker based on content type
    const chunks =
      type === "openapi"
        ? chunkOpenApi(content, url)
        : chunkMarkdown(content, url);

    if (chunks.length === 0) {
      logger.debug(`No chunks produced for ${url}`);
      return;
    }

    const store = await VectorStore.create();
    const result = await store.indexChunks(chunks);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    logger.info(
      `Indexed ${url}: ${result.embedded} embedded, ${result.unchanged} unchanged, ${result.deleted} deleted (${elapsed}s)`,
    );
  } catch (err) {
    logger.error(
      `Indexing failed for ${url}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
