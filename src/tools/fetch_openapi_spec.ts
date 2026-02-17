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
  normalizeUrlInput,
  logger,
  readCache,
  writeCache,
  formatCacheSummary,
} from "#lib/index.js";
import { type UrlFetchInput } from "./tool_schemas.js";

/**
 * Fetches the content of one or more OpenAPI spec URLs.
 * @param input - A single URL (as string or object) or an array of URLs to fetch
 * @param extra - Extra request handler data
 * @param allowedDomains - Set of allowed domains
 * @returns A promise that resolves to the fetched content or an error
 */

export const fetch_openapi_spec = async (
  input: UrlFetchInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  allowedDomains: Set<string>,
): Promise<CallToolResult> => {
  logger.debug("Processing fetch_openapi_spec request with input:", input);

  // Normalize input to always be an array of { url: string } objects
  const urlList = normalizeUrlInput(input);
  const results: TextContent[] = [];

  for (const urlItem of urlList) {
    const url = urlItem.url;

    try {
      logger.debug(`Processing OpenAPI spec URL: ${url}`);

      // Check cache first
      const cached = await readCache(url, "openapi");
      if (cached) {
        const summary = formatCacheSummary(
          cached.meta.sourceName || "OpenAPI spec",
          cached.meta.variant || "OpenAPI spec",
          url,
          cached,
        );
        results.push({ type: "text", text: summary });
        logger.debug(`Cache hit for ${url}`);
        continue;
      }

      // Validate the URL and get target info using the library function
      const targetInfo = await parseFetchTarget(url);
      if (targetInfo.type === "unsupported") {
        const errorMsg = `Unsupported URL format: ${targetInfo.reason}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      logger.debug(`Target info:`, targetInfo);

      // Check domain access using the library function
      checkDomainAccess(targetInfo, allowedDomains);

      logger.debug(`Fetching OpenAPI spec from: ${url}`);

      // Fetch the content using the library function
      const fileContent = await fetchContent(targetInfo);

      // Write to cache
      const hit = await writeCache(url, fileContent, "openapi");
      const summary = formatCacheSummary(
        "OpenAPI spec",
        "OpenAPI spec",
        url,
        hit,
      );
      results.push({ type: "text", text: summary });

      logger.debug(
        `Successfully fetched ${fileContent.length} chars from ${url}`,
      );
    } catch (error) {
      const errorMsg = `Failed to process OpenAPI spec request for ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  logger.debug(`Successfully processed ${results.length} OpenAPI specs`);
  return {
    content: results,
  };
};

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
