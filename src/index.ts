#!/usr/bin/env node

import { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";
import {
  list_llms_txt_sources,
  fetch_llms_txt,
  FetchLlmsTxtInputSchema,
} from "#tools/index.js";
import { parseCliArgs, getVersion } from "#lib/index.js";
import { z } from "zod";

// --- Parse CLI Arguments --- //
const { docSources, allowedDomains } = parseCliArgs();

// --- Determine Mode --- //
const args = process.argv.slice(2);
const isSseMode = args.includes("--sse");

// --- Set Environment Variable --- //
if (isSseMode) {
  console.info("Detected --sse flag. Configuring for SSE mode.");
} else {
  process.env.MCP_STDIO_MODE = "silent";
}

// --- MCP Server Setup --- //
const VERSION = getVersion();

const server = new McpServer(
  {
    name: "sushimcp",
    version: VERSION,
    displayName: "sushimcp",
    description:
      "SushiMCP is an MCP Server designed to serve context on a roll.",
    publisher: "Chris White <chris@chriswhite.rocks> https://chriswhite.rocks",
  },
  {
    capabilities: {
      tools: {
        list_llms_txt_sources: {
          name: "list_llms_txt_sources",
          description: "List the source urls where an llms.txt can be fetched.",
          annotations: {
            title: "List llms.txt sources",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        fetch_llms_txt: {
          name: "fetch_llms_txt",
          description: "Fetches the content of a llms.txt url.",
          inputSchema: FetchLlmsTxtInputSchema,
          annotations: {
            title: "Fetch llms.txt content",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
          },
        },
      },
    },
  }
);

server.tool(
  "list_llms_txt_sources",
  "List all available source urls where an llms.txt can be fetched. Multiple forms of llms.txt exist. Prefer to use llms.txt, but llms-full.txt and llms-mini.txt may also be available. If one form is suboptimal, check for others.",
  (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    list_llms_txt_sources(extra, docSources)
);

server.tool(
  "fetch_llms_txt",
  "Fetches the content of one or more llms.txt urls.",
  { input: FetchLlmsTxtInputSchema },
  (
    { input }: { input: z.infer<typeof FetchLlmsTxtInputSchema> },
    extra: RequestHandlerExtra<ServerRequest, ServerNotification>
  ) => fetch_llms_txt(input, extra, allowedDomains)
);

// --- Start Server --- //
if (process.env.MCP_STDIO_MODE !== "silent") {
  console.info("Starting SushiMCP...");
}
try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (process.env.MCP_STDIO_MODE !== "silent") {
    console.info(
      "SushiMCP started (stdio transport). Listening for MCP requests."
    );
  }
} catch (error: any) {
  console.error(`Failed to start MCP server: ${error.message}`);
  process.exit(1);
}

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
