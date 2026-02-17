import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { searchOpenapiSources } from "#lib/api_client.js";
import { logger } from "#lib/logger.js";
import { readCache, writeCache, formatCacheSummary } from "#lib/cache.js";

const FETCH_TIMEOUT_MS = 30_000;

export const api_search_fetch_openapi_spec = async (
  query: string,
): Promise<CallToolResult> => {
  logger.debug(`api_search_fetch_openapi_spec: searching for "${query}"`);

  const sources = await searchOpenapiSources(query);

  if (sources.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No OpenAPI specs found matching "${query}". Try a different search term, or use list_openapi_spec_sources to browse all available specs.`,
        },
      ],
    };
  }

  const source = sources[0];

  const otherMatches =
    sources.length > 1
      ? `\nOther matches: ${sources
          .slice(1, 6)
          .map((s) => s.name)
          .join(", ")}`
      : "";

  // Check cache first
  const cached = await readCache(source.url, "openapi");
  if (cached) {
    const summary = formatCacheSummary(source.name, "OpenAPI spec", source.url, cached);
    return {
      content: [
        {
          type: "text",
          text: `${summary}${otherMatches}`,
        },
      ],
    };
  }

  logger.debug(
    `Fetching OpenAPI spec for "${source.name}" from ${source.url}`,
  );

  let content: string;
  try {
    const response = await fetch(source.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    content = await response.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `Found "${source.name}" (${source.url}) but failed to fetch spec: ${msg}`,
        },
      ],
    };
  }

  // Write to cache and return file path summary
  const hit = await writeCache(source.url, content, "openapi", {
    sourceName: source.name,
  });

  const summary = formatCacheSummary(source.name, "OpenAPI spec", source.url, hit);
  return {
    content: [
      {
        type: "text",
        text: `${summary}${otherMatches}`,
      },
    ],
  };
};

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
