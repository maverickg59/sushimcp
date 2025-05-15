import {
  CallToolResult,
  TextContent,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";

// --- List OpenAPI Specs Tool ---
export const list_api_spec_sources = async (
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  apiSpecSources: Record<string, string>
): Promise<CallToolResult> => {
  if (Object.keys(apiSpecSources).length === 0) {
    return {
      content: [
        { type: "text", text: "No OpenAPI specifications configured." },
      ],
    };
  }
  let formatted_specs = "Available OpenAPI specifications:\n";
  for (const name in apiSpecSources) {
    formatted_specs += `- ${name}: ${apiSpecSources[name]}\n`;
  }
  const content: TextContent[] = [
    { type: "text", text: formatted_specs.trim() },
  ];
  return { content };
};

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
