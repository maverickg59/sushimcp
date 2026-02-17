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

    let formatted = "Available OpenAPI specifications:\n";
    for (const source of sources) {
      formatted += `- ${source.name}: ${source.url}\n`;
    }

    const content: TextContent[] = [
      { type: "text", text: formatted.trim() },
    ];
    return { content };
  };

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
