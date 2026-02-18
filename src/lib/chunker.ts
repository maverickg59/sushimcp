import { createHash } from "node:crypto";

export interface DocChunk {
  id: string;
  source: string;
  heading: string;
  content: string;
  hash: string;
}

const MAX_CHUNK_SIZE = 1500;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeChunk(
  source: string,
  heading: string,
  content: string,
  seenIds: Map<string, number>,
): DocChunk {
  const baseSlug = heading ? slugify(heading) : "intro";
  const count = seenIds.get(baseSlug) ?? 0;
  seenIds.set(baseSlug, count + 1);
  const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;
  const id = `${source}#${slug}`;
  const hash = createHash("sha256").update(content).digest("hex");
  // Prepend heading to content for embedding context
  const embeddingContent = heading ? `${heading}\n\n${content}` : content;

  return {
    id,
    source,
    heading: heading || "(intro)",
    content: embeddingContent,
    hash,
  };
}

// ---------- Markdown chunker (adapted from devspec) ----------

/**
 * Split markdown content into chunks by H2/H3 boundaries.
 *
 * Rules:
 * - Split on `## ` (H2) boundaries first
 * - If a section exceeds ~1500 chars, split further on `### ` (H3) boundaries
 * - Never split inside fenced code blocks
 * - Prepend parent heading to each chunk for embedding context
 * - Generate deterministic id from source + heading slug
 * - Hash content with sha256 for incremental update detection
 */
export function chunkMarkdown(content: string, source: string): DocChunk[] {
  const lines = content.split("\n");
  const sections: Array<{ heading: string; lines: string[] }> = [];

  let currentHeading = "";
  let currentLines: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentLines.push(line);
      continue;
    }

    if (!inCodeBlock && line.startsWith("## ") && !line.startsWith("### ")) {
      if (currentLines.length > 0) {
        sections.push({ heading: currentHeading, lines: currentLines });
      }
      currentHeading = line.replace(/^##\s+/, "").trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({ heading: currentHeading, lines: currentLines });
  }

  const chunks: DocChunk[] = [];
  const seenIds = new Map<string, number>();

  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (!sectionText) continue;

    if (sectionText.length <= MAX_CHUNK_SIZE) {
      chunks.push(makeChunk(source, section.heading, sectionText, seenIds));
    } else {
      const subSections = splitOnH3(section.lines, section.heading);
      for (const sub of subSections) {
        if (sub.content.length <= MAX_CHUNK_SIZE) {
          chunks.push(makeChunk(source, sub.heading, sub.content, seenIds));
        } else {
          const hardChunks = splitByParagraph(sub.content, MAX_CHUNK_SIZE);
          for (let i = 0; i < hardChunks.length; i++) {
            const label =
              hardChunks.length > 1
                ? `${sub.heading} (part ${i + 1})`
                : sub.heading;
            chunks.push(makeChunk(source, label, hardChunks[i], seenIds));
          }
        }
      }
    }
  }

  return chunks;
}

function splitOnH3(
  lines: string[],
  parentHeading: string,
): Array<{ heading: string; content: string }> {
  const results: Array<{ heading: string; content: string }> = [];
  let currentH3 = "";
  let currentLines: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentLines.push(line);
      continue;
    }

    if (!inCodeBlock && line.startsWith("### ")) {
      if (currentLines.length > 0) {
        const heading = currentH3
          ? `${parentHeading} > ${currentH3}`
          : parentHeading;
        results.push({ heading, content: currentLines.join("\n").trim() });
      }
      currentH3 = line.replace(/^###\s+/, "").trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    const heading = currentH3
      ? `${parentHeading} > ${currentH3}`
      : parentHeading;
    results.push({ heading, content: currentLines.join("\n").trim() });
  }

  return results;
}

function splitByParagraph(content: string, maxSize: number): string[] {
  const paragraphs = content.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > maxSize) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [content];
}

// ---------- OpenAPI chunker (new) ----------

/**
 * Split an OpenAPI spec (JSON or YAML-as-string) into chunks.
 * Each path+method operation becomes a chunk.
 * Each component schema becomes a chunk.
 */
export function chunkOpenApi(content: string, source: string): DocChunk[] {
  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(content);
  } catch {
    // Not valid JSON — try to chunk as markdown/text instead
    return chunkMarkdown(content, source);
  }

  const chunks: DocChunk[] = [];
  const seenIds = new Map<string, number>();

  // Chunk paths — one chunk per operation (path + method)
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (paths) {
    for (const [path, methods] of Object.entries(paths)) {
      if (!methods || typeof methods !== "object") continue;
      for (const [method, operation] of Object.entries(methods)) {
        if (method.startsWith("x-") || typeof operation !== "object" || !operation) continue;
        const op = operation as Record<string, unknown>;
        const heading = `${method.toUpperCase()} ${path}`;
        const text = JSON.stringify(op, null, 2);

        if (text.length <= MAX_CHUNK_SIZE) {
          chunks.push(makeChunk(source, heading, text, seenIds));
        } else {
          const parts = splitByParagraph(text, MAX_CHUNK_SIZE);
          for (let i = 0; i < parts.length; i++) {
            const label = parts.length > 1 ? `${heading} (part ${i + 1})` : heading;
            chunks.push(makeChunk(source, label, parts[i], seenIds));
          }
        }
      }
    }
  }

  // Chunk component schemas — one chunk per schema
  const components = spec.components as Record<string, Record<string, unknown>> | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  if (schemas) {
    for (const [name, schema] of Object.entries(schemas)) {
      const heading = `Schema: ${name}`;
      const text = JSON.stringify(schema, null, 2);

      if (text.length <= MAX_CHUNK_SIZE) {
        chunks.push(makeChunk(source, heading, text, seenIds));
      } else {
        const parts = splitByParagraph(text, MAX_CHUNK_SIZE);
        for (let i = 0; i < parts.length; i++) {
          const label = parts.length > 1 ? `${heading} (part ${i + 1})` : heading;
          chunks.push(makeChunk(source, label, parts[i], seenIds));
        }
      }
    }
  }

  // If no chunks were produced (unusual spec shape), fall back to text chunking
  if (chunks.length === 0) {
    return chunkMarkdown(content, source);
  }

  return chunks;
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
