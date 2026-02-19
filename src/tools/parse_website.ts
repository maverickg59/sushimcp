import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  logger,
  readCache,
  writeCache,
  formatCacheSummary,
} from "#lib/index.js";
import {
  fetchAndParse,
  parsePages,
  type ParsedPage,
  type ParseResult,
  type LinkEntry,
} from "#lib/web_parser.js";
import { writeLinkIndex } from "#lib/link_index.js";

// --- Document Assembly --- //

export function assembleSinglePageDocument(page: ParsedPage): string {
  const sections: string[] = [];

  sections.push(`# ${page.title || page.url}`);

  if (page.description) {
    sections.push(`\n> ${page.description}`);
  }

  sections.push(`\n- Source: ${page.url}`);
  sections.push(`- Word count: ${page.wordCount.toLocaleString()}`);

  sections.push(`\n${page.content.trim()}`);

  return sections.join("\n");
}

export function assembleMultiPageDocument(
  baseUrl: string,
  result: ParseResult,
): string {
  const sections: string[] = [];

  // Use first page title or domain as document title
  const siteTitle = result.pages[0]?.title || new URL(baseUrl).hostname;
  const totalWords = result.pages.reduce((sum, p) => sum + p.wordCount, 0);

  sections.push(`# ${siteTitle}`);
  sections.push(`\n- Source: ${baseUrl}`);
  sections.push(`- Pages parsed: ${result.pages.length}`);
  sections.push(`- Total words: ${totalWords.toLocaleString()}`);
  sections.push(`\n*Auto-generated from website content.*`);

  // Table of Contents
  if (result.pages.length > 1) {
    const tocLines = result.pages.map((p) => {
      const anchor = (p.title || p.url)
        .replace(/[^a-z0-9-]/gi, "-")
        .toLowerCase();
      return `- [${p.title || p.url}](#${anchor})`;
    });
    sections.push(`\n## Table of Contents\n\n${tocLines.join("\n")}`);
  }

  // Page contents
  for (const page of result.pages) {
    sections.push(
      `\n---\n\n## ${page.title || page.url}\n\nSource: ${page.url}\n\n${page.content.trim()}`,
    );
  }

  // Skipped pages
  if (result.skipped.length > 0) {
    const skippedList = result.skipped.map((u) => `- ${u}`).join("\n");
    sections.push(
      `\n---\n\n## Skipped Pages\n\nThe following pages were identified but not included (budget or limit exceeded):\n\n${skippedList}`,
    );
  }

  return sections.join("\n");
}

// --- Main Handler --- //

export async function parse_website(input: {
  url: string | string[];
}): Promise<CallToolResult> {
  // Normalize input to array
  const urls = Array.isArray(input.url) ? input.url : [input.url];
  logger.debug(`parse_website: ${urls.length} URL(s)`);

  if (urls.length === 1) {
    return handleSingleUrl(urls[0]);
  }

  return handleMultipleUrls(urls);
}

async function handleSingleUrl(url: string): Promise<CallToolResult> {
  const domain = getDomain(url);

  // Check cache
  const cached = await readCache(url, "llms-txt");
  if (cached) {
    const summary = formatCacheSummary(domain, "website", url, cached);
    logger.debug(`Cache hit for ${url}`);
    return { content: [{ type: "text", text: summary }] };
  }

  const page = await fetchAndParse(url);

  if (!page.content || page.content.trim().length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No content could be extracted from ${url}. The page may require JavaScript rendering or be behind authentication.`,
        },
      ],
    };
  }

  const document = assembleSinglePageDocument(page);

  // Write to cache
  const hit = await writeCache(url, document, "llms-txt", {
    sourceName: domain,
    variant: "website",
  });

  // Store link index (fire-and-forget)
  if (page.links.length > 0) {
    writeLinkIndex(domain, [url], page.links).catch((err) => {
      logger.error(`Failed to write link index: ${err instanceof Error ? err.message : err}`);
    });
  }

  const summary = formatCacheSummary(domain, "website", url, hit);
  return { content: [{ type: "text", text: summary }] };
}

async function handleMultipleUrls(urls: string[]): Promise<CallToolResult> {
  const domain = getDomain(urls[0]);

  // Check which URLs are already cached
  const cacheChecks = await Promise.all(
    urls.map(async (url) => ({
      url,
      cached: await readCache(url, "llms-txt"),
    })),
  );

  const uncachedUrls = cacheChecks
    .filter((c) => !c.cached)
    .map((c) => c.url);

  let allPages: ParsedPage[] = [];
  let allLinks: LinkEntry[] = [];

  if (uncachedUrls.length > 0) {
    const result = await parsePages(uncachedUrls);

    if (result.pages.length === 0 && cacheChecks.every((c) => !c.cached)) {
      return {
        content: [
          {
            type: "text",
            text: `Failed to parse any pages from the provided URLs. None returned parseable HTML content.`,
          },
        ],
      };
    }

    allPages = result.pages;
    allLinks = result.links;

    // Cache each parsed page individually
    for (const page of result.pages) {
      const pageDomain = getDomain(page.url);
      const doc = assembleSinglePageDocument(page);
      writeCache(page.url, doc, "llms-txt", {
        sourceName: pageDomain,
        variant: "website",
      }).catch((err) => {
        logger.error(`Failed to cache ${page.url}: ${err instanceof Error ? err.message : err}`);
      });
    }
  }

  // Assemble multi-page document from all pages (cached pages not re-fetched, just uncached)
  const parseResult: ParseResult = {
    pages: allPages,
    skipped: [],
    totalChars: allPages.reduce((sum, p) => sum + p.size, 0),
    links: allLinks,
  };

  const document = assembleMultiPageDocument(urls[0], parseResult);

  // Write the combined document to cache under the first URL
  const hit = await writeCache(urls[0], document, "llms-txt", {
    sourceName: domain,
    variant: "website",
  });

  // Store link index (fire-and-forget)
  if (allLinks.length > 0) {
    writeLinkIndex(domain, urls, allLinks).catch((err) => {
      logger.error(`Failed to write link index: ${err instanceof Error ? err.message : err}`);
    });
  }

  const summary = formatCacheSummary(domain, "website", urls[0], hit);
  return { content: [{ type: "text", text: summary }] };
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
