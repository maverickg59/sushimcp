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
  UrlFetchInputSchema,
} from "#tools/index.js";
import { parseCliArgs, getVersion, logger } from "#lib/index.js";
import { processDefaultsResources } from "#resources/index.js";

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
    title: "SushiMCP",
    description:
      "SushiMCP a dev tools model context protocol server that serves context on a roll.",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

server.registerTool(
  "list_llms_txt_sources",
  {
    title: "List llms.txt sources",
    description:
      "This tool lists all available source urls where an llms.txt can be fetched. After reading the listed sources, use fetch_llms_txt to fetch any source that matches a technology in the instructions you received. Prefer llms.txt, but if llms.txt proves inadequate, check to see if other llms-full.txt or llms-mini.txt exist. When done, ask the user if they want to use other tools to search for documentation on any sources this tool could not find.",
    annotations: {
      title: "List llms.txt sources",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    list_llms_txt_sources(extra, docSources),
);

server.registerTool(
  "list_openapi_spec_sources",
  {
    title: "List OpenAPI spec sources",
    description:
      "This tool lists all available source urls where an OpenAPI spec can be fetched.",
    annotations: {
      title: "List OpenAPI spec sources",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
    list_openapi_spec_sources(extra, openApiSpecs),
);

server.registerTool(
  "fetch_llms_txt",
  {
    title: "Fetch llms.txt content",
    description:
      "Fetches the content of one or more llms.txt URLs. Some llms.txt files compile a list of urls to other llms.txt file locations because listing their full documentation would bloat context. If the documentation you're looking for does not exist in the llms.txt, look for reference links to other llms.txt files and follow those.",
    inputSchema: {
      input: UrlFetchInputSchema.describe(
        "URL string, URL object, or array of URL/objects to fetch llms.txt from",
      ),
    },
    annotations: {
      title: "Fetch llms.txt content",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params, extra) => {
    const input = params?.input ?? params;
    if (!input) {
      throw new Error("No input provided to fetch_llms_txt");
    }
    return fetch_llms_txt(
      input,
      extra as RequestHandlerExtra<ServerRequest, ServerNotification>,
      allowedDomains,
    );
  },
);

server.registerTool(
  "fetch_openapi_spec",
  {
    title: "Fetch OpenAPI spec content",
    description: "Fetches the content of one or more OpenAPI spec URLs.",
    inputSchema: {
      input: UrlFetchInputSchema.describe(
        "URL string, URL object, or array of URL/objects to fetch OpenAPI specs from",
      ),
    },
    annotations: {
      title: "Fetch OpenAPI spec content",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params, extra) => {
    const input = params?.input ?? params;
    if (!input) {
      throw new Error("No input provided to fetch_openapi_spec");
    }
    return fetch_openapi_spec(
      input,
      extra as RequestHandlerExtra<ServerRequest, ServerNotification>,
      allowedDomains,
    );
  },
);

// Process and register default resources
const resources = processDefaultsResources();
resources.forEach(({ id, uri, title, description, mimeType, handler }) => {
  server.resource(
    id,
    uri,
    {
      title,
      description,
      mimeType,
    },
    handler,
  );
});

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
