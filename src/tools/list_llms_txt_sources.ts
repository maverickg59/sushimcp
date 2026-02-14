import {
  CallToolResult,
  TextContent,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";

// --- List llms.txt Sources Tool ---
export const list_llms_txt_sources = async (
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  docSources: Record<string, string>,
): Promise<CallToolResult> => {
  if (Object.keys(docSources).length === 0) {
    return {
      content: [{ type: "text", text: "No llms.txt sources configured." }],
    };
  }
  let formatted_sources = "Available llms.txt sources:\n";
  for (const name in docSources) {
    formatted_sources += `- ${name}: ${docSources[name]}\n`;
  }
  const content: TextContent[] = [
    { type: "text", text: formatted_sources.trim() },
  ];
  return { content };
};

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
