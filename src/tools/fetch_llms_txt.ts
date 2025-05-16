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
} from "#lib/index.js";
import { type UrlFetchInput } from "./tool_schemas.js";

/**
 * Fetches the content of one or more llms.txt URLs.
 * @param input - A single URL (as string or object) or an array of URLs to fetch
 * @param extra - Extra request handler data
 * @param allowedDomains - Set of allowed domains
 * @returns A promise that resolves to the fetched content or an error
 */

export const fetch_llms_txt = async (
  input: UrlFetchInput,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
  allowedDomains: Set<string>
): Promise<CallToolResult> => {
  logger.debug("Processing fetch_llms_txt request with input:", input);

  // Normalize input to always be an array of { url: string } objects
  const urlList = normalizeUrlInput(input);
  const results: TextContent[] = [];

  for (const urlItem of urlList) {
    const url = urlItem.url;

    try {
      logger.debug(`Processing URL: ${url}`);

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

      logger.debug(`Fetching content from: ${url}`);

      // Fetch the content using the library function
      const fileContent = await fetchContent(targetInfo);
      results.push({
        type: "text",
        text: fileContent,
      });

      logger.debug(
        `Successfully fetched ${fileContent.length} bytes from ${url}`
      );
    } catch (error) {
      const errorMsg = `Failed to process fetch request for ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  logger.debug(`Successfully processed ${results.length} URLs`);
  return {
    content: results,
  };
};

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
