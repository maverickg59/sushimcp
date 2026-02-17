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

    let formatted = "Available llms.txt sources:\n";
    for (const source of sources) {
      const urls: string[] = [];
      if (source.llmsTxtUrl) {
        urls.push(`llms.txt: ${source.llmsTxtUrl}`);
      }
      if (source.llmsFullTxtUrl) {
        urls.push(`llms-full.txt: ${source.llmsFullTxtUrl}`);
      }
      if (source.llmsMiniTxtUrl) {
        urls.push(`llms-mini.txt: ${source.llmsMiniTxtUrl}`);
      }

      if (urls.length > 0) {
        formatted += `- ${source.name}: ${urls.join(", ")}\n`;
      } else {
        formatted += `- ${source.name}: ${source.baseUrl} (no llms.txt URLs configured)\n`;
      }
    }

    const content: TextContent[] = [
      { type: "text", text: formatted.trim() },
    ];
    return { content };
  };

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
