import { z } from "zod";
import {
  CallToolResult,
  TextContent,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { parseFetchTarget, fetchContent, checkDomainAccess } from "./utils.js";

// --- Tool Schemas ---
export const FetchDocsInputSchema = z.object({
  url: z
    .string()
    .url("Input must contain a valid URL string under the 'url' key."),
});

// --- Tool Implementations ---

// Renamed and updated signature
export const list_llms_txt_sources = async (
  // Params removed, context 'docSources' added
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  docSources: Record<string, string> // Pass docSources from server context
): Promise<CallToolResult> => {
  let formatted_sources = "Available documentation sources:\n";
  for (const name in docSources) {
    formatted_sources += `- ${name}: ${docSources[name]}\n`;
  }
  const content: TextContent[] = [
    { type: "text", text: formatted_sources.trim() },
  ];
  return { content };
};

// Renamed and updated signature
export const fetch_llms_txt = async (
  params: z.infer<typeof FetchDocsInputSchema>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  allowedDomains: Set<string>
): Promise<CallToolResult> => {
  const { url } = params;
  console.error(`Processing fetch_docs request for URL: ${url}`); // Log to stderr

  try {
    // Use utils.ts functions
    const targetInfo = await parseFetchTarget(url);

    if (targetInfo.type === "unsupported") {
      throw new Error(targetInfo.reason);
    }
    checkDomainAccess(targetInfo, allowedDomains);

    console.error(`Fetching content for: ${url}`); // Log to stderr
    const fileContent = await fetchContent(targetInfo);

    const result: TextContent[] = [
      {
        type: "text",
        text: fileContent,
      },
    ];

    return {
      content: result,
    };
  } catch (error: any) {
    console.error(`Error in fetch_docs for ${url}: ${error.message}`); // Log error to stderr
    throw new Error(
      `Failed to process fetch request for '${url}': ${error.message}`
    );
  }
};

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
