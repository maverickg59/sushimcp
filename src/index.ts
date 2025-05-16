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
  fetch_openapi_spec,
  list_openapi_spec_sources,
  FetchLlmsTxtInputSchema,
  FetchOpenApiSpecInputSchema,
} from "#tools/index.js";
import { parseCliArgs, getVersion } from "#lib/index.js";
import { logger } from "#lib/logger.js";
import { z } from "zod";

// --- Parse CLI Arguments --- //
const { docSources, allowedDomains, openApiSpecs } = parseCliArgs();

// --- Determine Mode --- //
const args = process.argv.slice(2);
const isSseMode = args.includes("--sse");

// Set environment variable for logging behavior
process.env.MCP_STDIO_MODE = String(!isSseMode);

// Log mode information using the logger
if (isSseMode) {
  logger.info("Running in SSE mode - using console methods for logging");
  logger.debug("Debug logging is enabled");
} else {
  // In stdio mode, we still log but it will be in JSON format
  logger.info("Running in stdio mode - using JSON logging");
}

// --- MCP Server Setup --- //
const VERSION = getVersion();

const server = new McpServer(
  {
    name: "sushimcp",
    version: VERSION,
    displayName: "SushiMCP",
    description:
      "SushiMCP a dev tools model context protocol server that serves context on a roll.",
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
        list_openapi_spec_sources: {
          name: "list_openapi_spec_sources",
          description:
            "List the source urls where an OpenAPI spec can be fetched.",
          annotations: {
            title: "List OpenAPI spec sources",
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
        fetch_openapi_spec: {
          name: "fetch_openapi_spec",
          description: "Fetches the content of a OpenAPI spec url.",
          inputSchema: FetchOpenApiSpecInputSchema,
          annotations: {
            title: "Fetch OpenAPI spec content",
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
  "This tool lists all available source urls where an llms.txt can be fetched. After reading the listed sources, use fetch_llms_txt to fetch any source that matches a technology in the instructions you received. Prefer llms.txt, but if llms.txt proves inadequate, check to see if other llms-full.txt or llms-mini.txt exist. When done, ask the user if they want to use other tools to search for documentation on any sources this tool could not find.",
  (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    list_llms_txt_sources(extra, docSources)
);

server.tool(
  "list_openapi_spec_sources",
  "This tool lists all available source urls where an OpenAPI spec can be fetched.",
  (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    list_openapi_spec_sources(extra, openApiSpecs)
);

server.tool(
  "fetch_llms_txt",
  "Fetches the content of one or more llms.txt URLs. Some llms.txt files compile a list of urls to other llms.txt file locations because listing their full documentation would bloat context. If the documentation you're looking for does not exist in the llms.txt, look for reference links to other llms.txt files and follow those.",
  {
    input: FetchLlmsTxtInputSchema.describe(
      "URL string, URL object, or array of URL/objects to fetch llms.txt from"
    ),
  },
  async (params, extra) => {
    const input = params?.input ?? params;
    if (!input) {
      throw new Error("No input provided to fetch_llms_txt");
    }
    return fetch_llms_txt(
      input,
      extra as RequestHandlerExtra<ServerRequest, ServerNotification>,
      allowedDomains
    );
  }
);

server.tool(
  "fetch_openapi_spec",
  "Fetches the content of one or more OpenAPI spec URLs.",
  {
    input: FetchOpenApiSpecInputSchema.describe(
      "URL string, URL object, or array of URL/objects to fetch OpenAPI specs from"
    ),
  },
  async (params, extra) => {
    const input = params?.input ?? params;
    if (!input) {
      throw new Error("No input provided to fetch_openapi_spec");
    }
    return fetch_openapi_spec(
      input,
      extra as RequestHandlerExtra<ServerRequest, ServerNotification>,
      allowedDomains
    );
  }
);

// --- Start Server --- //
try {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup information using the logger
  logger.info(`SushiMCP server v${VERSION} started successfully`);
  if (allowedDomains.size > 0) {
    logger.debug(`Allowed domains: ${Array.from(allowedDomains).join(", ")}`);
  }
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? error.stack : "";

  logger.error(`Failed to start MCP server: ${errorMessage}`);
  if (stack) {
    logger.debug(stack);
  }
  process.exit(1);
}

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
