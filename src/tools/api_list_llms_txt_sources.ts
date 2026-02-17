import { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { listLlmsTxtSources } from "#lib/api_client.js";
import { logger } from "#lib/logger.js";

export const api_list_llms_txt_sources =
  async (): Promise<CallToolResult> => {
    logger.debug("api_list_llms_txt_sources: fetching from API");
    const sources = await listLlmsTxtSources();

    if (sources.length === 0) {
      return {
        content: [{ type: "text", text: "No llms.txt sources available." }],
      };
    }

    const grouped = new Map<string, string[]>();
    for (const source of sources) {
      const category = source.category ?? "Other";
      const names = grouped.get(category) ?? [];
      names.push(source.name);
      grouped.set(category, names);
    }

    const sortedCategories = [...grouped.keys()].sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });

    let formatted = `Available llms.txt sources (${sources.length}):\n\n`;
    for (const category of sortedCategories) {
      const names = grouped.get(category)!.sort((a, b) => a.localeCompare(b));
      formatted += `${category}: ${names.join(", ")}\n`;
    }
    formatted += "\nUse search_fetch_llms_txt to fetch documentation for any source by name.";

    const content: TextContent[] = [
      { type: "text", text: formatted },
    ];
    return { content };
  };

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
