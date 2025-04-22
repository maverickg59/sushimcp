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
export const ListSourcesInputSchema = z.object({});

export const FetchLlmsTextInputSchema = z.object({
  url: z
    .string()
    .describe("The URL or local path of the llms.txt file to fetch."),
});

// --- Tool Implementations ---
export const list_llms_txt_sources = async (
  params: z.infer<typeof ListSourcesInputSchema>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  docSources: Record<string, string> // Pass docSources from server context
): Promise<CallToolResult> => {
  console.error("Processing list_llms_txt_sources request..."); // Log to stderr
  const sourceList = Object.entries(docSources)
    .map(([name, url]) => `- ${name}: ${url}`)
    .join("\n");

  const content: TextContent[] = [
    {
      type: "text",
      text: `Available llms.txt Sources:\n${sourceList}`,
    },
  ];

  return {
    content,
  };
};

export const fetch_llms_txt = async (
  params: z.infer<typeof FetchLlmsTextInputSchema>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  allowedDomains: Set<string>
): Promise<CallToolResult> => {
  const { url } = params;
  console.error(`Processing fetch_llms_txt request for URL: ${url}`); // Log to stderr

  try {
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
    console.error(`Error in fetch_llms_txt for ${url}: ${error.message}`); // Log error to stderr
    throw new Error(
      `Failed to process fetch request for '${url}': ${error.message}`
    );
  }
};

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
