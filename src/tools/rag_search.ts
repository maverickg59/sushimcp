import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "#lib/logger.js";
import { VectorStore } from "#lib/vectordb.js";
import { isOllamaAvailable, checkOllamaHealth } from "#lib/embeddings.js";

export interface RagSearchParams {
  query: string;
  source?: string;
  limit?: number;
}

/**
 * Search the RAG vector index for chunks relevant to a query.
 */
export const rag_search = async (
  params: RagSearchParams,
): Promise<CallToolResult> => {
  const { query, limit } = params;

  logger.debug(`rag_search: query="${query}", limit=${limit ?? 5}`);

  // Check Ollama availability
  const available = isOllamaAvailable() ?? (await checkOllamaHealth());
  if (!available) {
    return {
      content: [
        {
          type: "text",
          text: "RAG search is unavailable — Ollama is not running. Please start Ollama and try again.",
        },
      ],
      isError: true,
    };
  }

  try {
    const store = await VectorStore.create();
    const rowCount = await store.countRows();

    if (rowCount === 0) {
      return {
        content: [
          {
            type: "text",
            text: "No documents have been indexed yet. Fetch some documentation first — indexing happens automatically in the background.",
          },
        ],
      };
    }

    const result = await store.search(query, limit);

    if (result.count === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No relevant chunks found for "${query}". Try a different search term or fetch more documentation.`,
          },
        ],
      };
    }

    const header = `Found ${result.count} relevant chunks for "${query}":\n\n`;
    return {
      content: [
        {
          type: "text",
          text: header + result.text,
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`rag_search failed: ${msg}`);
    return {
      content: [
        {
          type: "text",
          text: `RAG search failed: ${msg}`,
        },
      ],
      isError: true,
    };
  }
};

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
