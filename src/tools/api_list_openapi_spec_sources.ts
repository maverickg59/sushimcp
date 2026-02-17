import { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { listOpenapiSources } from "#lib/api_client.js";
import { logger } from "#lib/logger.js";

export const api_list_openapi_spec_sources =
  async (): Promise<CallToolResult> => {
    logger.debug("api_list_openapi_spec_sources: fetching from API");
    const sources = await listOpenapiSources();

    if (sources.length === 0) {
      return {
        content: [
          { type: "text", text: "No OpenAPI specifications available." },
        ],
      };
    }

    const names = sources.map((s) => s.name).sort((a, b) => a.localeCompare(b));
    let formatted = `Available OpenAPI specifications (${sources.length}):\n`;
    for (const name of names) {
      formatted += `- ${name}\n`;
    }
    formatted += "\nUse search_fetch_openapi_spec to fetch a spec by name.";

    const content: TextContent[] = [
      { type: "text", text: formatted },
    ];
    return { content };
  };

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
