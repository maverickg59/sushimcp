import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { searchLlmsTxtSources, type LlmsTxtSource } from "#lib/api_client.js";
import { logger } from "#lib/logger.js";

function pickBestUrl(
  source: LlmsTxtSource,
): { url: string; type: string } | null {
  if (source.llmsFullTxtUrl) {
    return { url: source.llmsFullTxtUrl, type: "llms-full.txt" };
  }
  if (source.llmsTxtUrl) {
    return { url: source.llmsTxtUrl, type: "llms.txt" };
  }
  if (source.llmsMiniTxtUrl) {
    return { url: source.llmsMiniTxtUrl, type: "llms-mini.txt" };
  }
  return null;
}

const FETCH_TIMEOUT_MS = 30_000;

export const api_search_fetch_llms_txt = async (
  query: string,
): Promise<CallToolResult> => {
  logger.debug(`api_search_fetch_llms_txt: searching for "${query}"`);

  const sources = await searchLlmsTxtSources(query);

  if (sources.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No llms.txt sources found matching "${query}". Try a different search term, or use list_llms_txt_sources to browse all available sources.`,
        },
      ],
    };
  }

  const source = sources[0];
  const best = pickBestUrl(source);

  if (!best) {
    const otherMatches =
      sources.length > 1
        ? `\n\nOther matches: ${sources
            .slice(1, 6)
            .map((s) => s.name)
            .join(", ")}`
        : "";
    return {
      content: [
        {
          type: "text",
          text: `Found "${source.name}" but it has no llms.txt URLs configured.${otherMatches}`,
        },
      ],
    };
  }

  logger.debug(
    `Fetching ${best.type} for "${source.name}" from ${best.url}`,
  );

  let content: string;
  try {
    const response = await fetch(best.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    content = await response.text();
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `Found "${source.name}" (${best.type}: ${best.url}) but failed to fetch content: ${msg}`,
        },
      ],
    };
  }

  const header = `Source: ${source.name} (${best.type})\nURL: ${best.url}`;
  const otherMatches =
    sources.length > 1
      ? `\nOther matches: ${sources
          .slice(1, 6)
          .map((s) => s.name)
          .join(", ")}`
      : "";

  return {
    content: [
      {
        type: "text",
        text: `${header}${otherMatches}\n\n${content}`,
      },
    ],
  };
};

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
