#!/usr/bin/env node

import { z } from "zod";
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
  api_list_llms_txt_sources,
  api_list_openapi_spec_sources,
  api_github_issues,
  api_github_pull_requests,
  api_github_projects,
  api_search_fetch_llms_txt,
  api_search_fetch_openapi_spec,
  UrlFetchInputSchema,
  GitHubProjectsInputSchema,
  GitHubPullRequestsInputSchema,
  GitHubIssuesInputSchema,
} from "#tools/index.js";
import {
  parseCliArgs,
  getVersion,
  logger,
  initApiClient,
  listLlmsTxtSources,
  listOpenapiSources,
  cleanExpiredEntries,
} from "#lib/index.js";
import {
  processDefaultsResources,
  createLlmsTxtResourceTemplate,
  createOpenapiResourceTemplate,
} from "#resources/index.js";

// --- Parse CLI Arguments --- //
const { docSources, allowedDomains: cliAllowedDomains, openApiSpecs } =
  parseCliArgs();

// --- Determine Thin Client Mode --- //
const envApiUrl = process.env.API_URL;
const envApiKey = process.env.API_KEY;
const thinClientMode = !!(envApiUrl && envApiKey);

if (thinClientMode) {
  initApiClient(envApiUrl, envApiKey);

  const hasCliSources =
    Object.keys(docSources).length > 0 || Object.keys(openApiSpecs).length > 0;
  if (hasCliSources) {
    logger.warn(
      "CLI source arguments are ignored in thin client mode (API_URL is set)",
    );
  }
}

// In thin client mode, domains are loaded from the API after server.connect().
// Use wildcard initially so the server can start without blocking on network calls.
let allowedDomains: Set<string> = thinClientMode
  ? new Set<string>(["*"])
  : cliAllowedDomains;

async function loadAllowedDomainsFromApi(): Promise<void> {
  try {
    const [llmsSources, openapiSourcesList] = await Promise.all([
      listLlmsTxtSources(),
      listOpenapiSources(),
    ]);

    const domains = new Set<string>();
    for (const source of llmsSources) {
      for (const url of [
        source.baseUrl,
        source.siteUrl,
        source.llmsTxtUrl,
        source.llmsFullTxtUrl,
        source.llmsMiniTxtUrl,
      ]) {
        if (url) {
          try {
            domains.add(new URL(url).hostname);
          } catch {
            // skip malformed URLs
          }
        }
      }
    }
    for (const source of openapiSourcesList) {
      if (source.url) {
        try {
          domains.add(new URL(source.url).hostname);
        } catch {
          // skip malformed URLs
        }
      }
    }

    allowedDomains = domains;
    logger.info(
      `Loaded ${domains.size} allowed domains from ${llmsSources.length + openapiSourcesList.length} API sources`,
    );
  } catch (err) {
    logger.error(
      `Failed to load sources from API: ${err instanceof Error ? err.message : err}`,
    );
    logger.warn("Keeping wildcard domain access as fallback");
  }
}

// --- Determine Transport Mode --- //
const args = process.argv.slice(2);
const isSseMode = args.includes("--sse");

// Set environment variable for logging behavior
process.env.MCP_STDIO_MODE = String(!isSseMode);

// Log mode information using the logger
if (isSseMode) {
  logger.info("Running in SSE mode - using console methods for logging");
  logger.debug("Debug logging is enabled");
} else {
  logger.info("Running in stdio mode - using JSON logging");
}

if (thinClientMode) {
  logger.info("Thin client mode enabled — tools will proxy through API");
} else {
  logger.info("Direct mode — using CLI-configured sources");
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

// --- List Tools (mode-dependent) --- //

server.registerTool(
  "list_llms_txt_sources",
  {
    title: "List llms.txt sources",
    description: thinClientMode
      ? "Lists all available llms.txt sources by name, grouped by category. Use search_fetch_llms_txt to fetch documentation for any source by name."
      : "Lists all available llms.txt source URLs. Use fetch_llms_txt to fetch any listed URL. Prefer llms-full.txt when available, fall back to llms.txt, then llms-mini.txt.",
    annotations: {
      title: "List llms.txt sources",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  thinClientMode
    ? () => api_list_llms_txt_sources()
    : (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
        list_llms_txt_sources(extra, docSources),
);

server.registerTool(
  "list_openapi_spec_sources",
  {
    title: "List OpenAPI spec sources",
    description: thinClientMode
      ? "Lists all available OpenAPI spec sources by name. Use search_fetch_openapi_spec to fetch a spec by name."
      : "Lists all available OpenAPI spec source URLs. Use fetch_openapi_spec to fetch any listed URL.",
    annotations: {
      title: "List OpenAPI spec sources",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  thinClientMode
    ? () => api_list_openapi_spec_sources()
    : (extra: RequestHandlerExtra<ServerRequest, ServerNotification>) =>
        list_openapi_spec_sources(extra, openApiSpecs),
);

// --- Fetch Tools (same in both modes, allowedDomains differs) --- //

server.registerTool(
  "fetch_llms_txt",
  {
    title: "Fetch llms.txt content",
    description:
      "Fetches the content of one or more llms.txt URLs. Some llms.txt files contain reference links to other llms.txt files instead of full documentation. If the content you need is not in the result, follow those reference links.",
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

// --- Search + Fetch Tool (thin client mode only) --- //

if (thinClientMode) {
  server.registerTool(
    "search_fetch_llms_txt",
    {
      title: "Search and fetch llms.txt documentation",
      description:
        "Searches for a technology by name and fetches its llms.txt documentation in a single step. Prefers llms-full.txt when available, falls back to llms.txt, then llms-mini.txt. Returns the documentation content directly. Use this instead of listing all sources and fetching separately.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Technology or library name to search for (e.g., 'hono', 'drizzle', 'ably')",
          ),
      },
      annotations: {
        title: "Search and fetch llms.txt documentation",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      if (!params?.query) {
        throw new Error("No query provided to search_fetch_llms_txt");
      }
      return api_search_fetch_llms_txt(params.query);
    },
  );

  server.registerTool(
    "search_fetch_openapi_spec",
    {
      title: "Search and fetch OpenAPI spec",
      description:
        "Searches for a technology by name and fetches its OpenAPI spec in a single step. Returns the spec content directly. Use this instead of listing all sources and fetching separately.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Technology or API name to search for (e.g., 'stripe', 'twilio', 'github')",
          ),
      },
      annotations: {
        title: "Search and fetch OpenAPI spec",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      if (!params?.query) {
        throw new Error("No query provided to search_fetch_openapi_spec");
      }
      return api_search_fetch_openapi_spec(params.query);
    },
  );
}

// --- GitHub Tools (thin client mode only) --- //

if (thinClientMode) {
  server.registerTool(
    "github_projects",
    {
      title: "Manage GitHub Project items",
      description:
        "Manages GitHub ProjectV2 board items. Supports listing, getting, creating, updating, and deleting project items. Set status, iteration, and priority fields by human-readable value.",
      inputSchema: GitHubProjectsInputSchema,
      annotations: {
        title: "Manage GitHub Project items",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      if (!params) {
        throw new Error("No input provided to github_projects");
      }
      return api_github_projects(params);
    },
  );

  server.registerTool(
    "github_pull_requests",
    {
      title: "Manage GitHub Pull Requests",
      description:
        "Manages GitHub Pull Requests. Supports creating PRs, listing open PRs, getting PR details, listing and posting comments (general and inline), requesting reviewers, merging, and closing PRs.",
      inputSchema: GitHubPullRequestsInputSchema,
      annotations: {
        title: "Manage GitHub Pull Requests",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      if (!params) {
        throw new Error("No input provided to github_pull_requests");
      }
      return api_github_pull_requests(params);
    },
  );

  server.registerTool(
    "github_issues",
    {
      title: "Manage GitHub Issues",
      description:
        "Manages GitHub Issues. Supports listing issues with filters, getting issue details, creating new issues, updating existing issues, closing issues, and adding issues to GitHub Projects.",
      inputSchema: GitHubIssuesInputSchema,
      annotations: {
        title: "Manage GitHub Issues",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params) => {
      if (!params) {
        throw new Error("No input provided to github_issues");
      }
      return api_github_issues(params);
    },
  );
}

// Process and register resources (mode-dependent)
if (thinClientMode) {
  const llms = createLlmsTxtResourceTemplate();
  server.resource("llms-txt-source", llms.template, llms.metadata, llms.readCallback);

  const openapi = createOpenapiResourceTemplate();
  server.resource("openapi-source", openapi.template, openapi.metadata, openapi.readCallback);
} else {
  const resources = processDefaultsResources();
  resources.forEach(({ id, uri, title, description, mimeType, handler }) => {
    server.resource(id, uri, { title, description, mimeType }, handler);
  });
}

// --- Start Server --- //
try {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup information using the logger
  logger.info(`SushiMCP server v${VERSION} started successfully`);

  // Clean expired cache entries in the background (non-blocking)
  cleanExpiredEntries().catch((err) => {
    logger.error(`Cache cleanup failed: ${err instanceof Error ? err.message : err}`);
  });

  // Load allowed domains from API in the background (non-blocking)
  if (thinClientMode) {
    loadAllowedDomainsFromApi();
  } else if (allowedDomains.size > 0) {
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

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
