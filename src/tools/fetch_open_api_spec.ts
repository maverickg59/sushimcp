import { z } from "zod";
import {
  CallToolResult,
  TextContent,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  parseFetchTarget,
  fetchContent,
  checkDomainAccess,
} from "#lib/index.js";

// --- Fetch llms.txt Content Tool ---
export const FetchOpenApiSpecInputSchema = z.union([
  z.object({
    url: z
      .string()
      .url("Input must contain a valid URL string under the 'url' key."),
  }),
  z.array(z.string().url("Each array item must be a valid URL string")),
]);

export const fetch_open_api_spec = async (
  params: z.infer<typeof FetchOpenApiSpecInputSchema>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  allowedDomains: Set<string>
): Promise<CallToolResult> => {
  if (process.env.MCP_STDIO_MODE !== "silent") {
    console.info(`Processing fetch_open_api_spec request with params:`, params);
  }

  try {
    // Handle both input formats
    const urls = Array.isArray(params) ? params : [params.url];
    const results: TextContent[] = [];

    // Process each URL
    for (const url of urls) {
      const targetInfo = await parseFetchTarget(url);

      if (targetInfo.type === "unsupported") {
        throw new Error(`For URL ${url}: ${targetInfo.reason}`);
      }
      checkDomainAccess(targetInfo, allowedDomains);

      if (process.env.MCP_STDIO_MODE !== "silent") {
        console.info(`Fetching OpenAPI spec from ${url}`);
      }
      const fileContent = await fetchContent(targetInfo);

      results.push({
        type: "text",
        text: fileContent,
      });
    }

    return {
      content: results,
    };
  } catch (error: any) {
    console.error(`Error in fetch_docs: ${error.message}`);
    throw new Error(`Failed to process fetch request: ${error.message}`);
  }
};

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
