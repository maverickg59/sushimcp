import { Defuddle } from "defuddle/node";
import { logger } from "./logger.js";

// --- Types --- //

export interface LinkEntry {
  text: string;
  url: string;
}

export interface ParsedPage {
  url: string;
  title: string | null;
  description: string | null;
  content: string;
  wordCount: number;
  size: number;
  links: LinkEntry[];
}

export interface ParseResult {
  pages: ParsedPage[];
  skipped: string[];
  totalChars: number;
  links: LinkEntry[];
}

// --- Link Extraction --- //

/**
 * Extract links from raw HTML before defuddle processes it.
 * Captures nav, sidebar, footer, and content links — not just what survives content extraction.
 * Filters to same hostname only, deduplicates by URL.
 */
export function extractLinks(html: string, baseUrl: string): LinkEntry[] {
  let baseHostname: string;
  try {
    baseHostname = new URL(baseUrl).hostname;
  } catch {
    return [];
  }

  const anchorRegex = /<a\s[^>]*href\s*=\s*["']([^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const links: LinkEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    const rawText = match[2];

    if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("mailto:") || rawHref.startsWith("javascript:")) {
      continue;
    }

    let resolved: URL;
    try {
      resolved = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }

    if (resolved.hostname !== baseHostname) {
      continue;
    }

    // Normalize: drop hash, use full URL string
    resolved.hash = "";
    const normalizedUrl = resolved.href;

    if (seen.has(normalizedUrl)) {
      continue;
    }
    seen.add(normalizedUrl);

    // Strip inner HTML tags from anchor text
    const text = rawText.replace(/<[^>]*>/g, "").trim();

    links.push({ text, url: normalizedUrl });
  }

  return links;
}

// --- Single Page --- //

/**
 * Fetch a URL and extract its main content as markdown using defuddle.
 */
export async function fetchAndParse(url: string): Promise<ParsedPage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let html: string;
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching ${url}`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/xml") && !contentType.includes("application/xhtml")) {
      throw new Error(`Non-HTML content type: ${contentType}`);
    }
    html = await response.text();
  } finally {
    clearTimeout(timeout);
  }

  // Extract links from raw HTML before defuddle strips navigation
  const links = extractLinks(html, url);

  const result = await Defuddle(html, url, { markdown: true });

  const content = result.content || "";
  return {
    url,
    title: result.title || null,
    description: result.description || null,
    content,
    wordCount: result.wordCount || 0,
    size: content.length,
    links,
  };
}

// --- Multi-page --- //

const DEFAULT_BUDGET = 300_000;
const DEFAULT_MAX_PAGES = 50;
const DEFAULT_CONCURRENCY = 5;

/**
 * Parse multiple pages in parallel with budget constraints.
 */
export async function parsePages(
  urls: string[],
  budget: number = DEFAULT_BUDGET,
  maxPages: number = DEFAULT_MAX_PAGES,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<ParseResult> {
  const capped = urls.slice(0, maxPages);
  const pages: ParsedPage[] = [];
  const skipped: string[] = [];
  let totalChars = 0;

  for (let i = 0; i < capped.length; i += concurrency) {
    if (totalChars >= budget) {
      for (let j = i; j < capped.length; j++) {
        skipped.push(capped[j]);
      }
      break;
    }

    const batch = capped.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((url) => fetchAndParse(url)),
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const pageUrl = batch[j];

      if (result.status === "fulfilled") {
        const page = result.value;
        if (!page.content || page.content.trim().length === 0) {
          logger.debug(`Skipping ${pageUrl} — empty content after parsing`);
          skipped.push(pageUrl);
          continue;
        }
        if (totalChars + page.size > budget) {
          logger.debug(`Skipping ${pageUrl} — would exceed budget`);
          skipped.push(pageUrl);
          continue;
        }
        pages.push(page);
        totalChars += page.size;
      } else {
        logger.warn(`Failed to parse ${pageUrl}: ${result.reason}`);
        skipped.push(pageUrl);
      }
    }
  }

  // Any URLs beyond maxPages
  if (urls.length > maxPages) {
    for (let i = maxPages; i < urls.length; i++) {
      skipped.push(urls[i]);
    }
  }

  // Aggregate and deduplicate links from all pages
  const seenUrls = new Set<string>();
  const allLinks: LinkEntry[] = [];
  for (const page of pages) {
    for (const link of page.links) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        allLinks.push(link);
      }
    }
  }

  return { pages, skipped, totalChars, links: allLinks };
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
