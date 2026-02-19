import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { searchLinks, listLinkIndexDomains } from "#lib/link_index.js";
import { logger } from "#lib/index.js";

export async function search_website_links(input: {
  query: string;
  domain?: string;
}): Promise<CallToolResult> {
  const { query, domain } = input;
  logger.debug(`search_website_links: query="${query}", domain=${domain || "all"}`);

  const results = await searchLinks(query, domain);

  if (results.length === 0) {
    const domains = await listLinkIndexDomains();
    let message = `No links found matching "${query}".`;

    if (domain && !domains.includes(domain)) {
      message += `\n\nNo link index exists for "${domain}". Parse a page from that domain first to build the index.`;
    } else if (domains.length > 0) {
      message += `\n\nAvailable domains with link indices: ${domains.join(", ")}`;
    } else {
      message += `\n\nNo link indices exist yet. Parse a website page first to build the link index.`;
    }

    return { content: [{ type: "text", text: message }] };
  }

  const formatted = results
    .map((link) => `- [${link.text || link.url}](${link.url})`)
    .join("\n");

  const header = domain
    ? `Found ${results.length} links matching "${query}" on ${domain}:`
    : `Found ${results.length} links matching "${query}":`;

  return {
    content: [{ type: "text", text: `${header}\n\n${formatted}` }],
  };
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
