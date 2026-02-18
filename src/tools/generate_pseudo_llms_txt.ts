import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  logger,
  readCache,
  writeCache,
  formatCacheSummary,
} from "#lib/index.js";
import {
  parseRepoUrl,
  fetchRepoMetadata,
  fetchRepoTree,
  fetchFilesWithBudget,
  type TreeEntry,
  type ScoredFile,
  type RepoMetadata,
  type FetchResult,
} from "#lib/github_repo.js";

// --- Exclusions --- //

const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "vendor",
  "coverage",
  "__pycache__",
  ".next",
  ".nuxt",
]);

const EXCLUDED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp",
  ".mp3", ".mp4", ".avi", ".mov", ".wav",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".pdf", ".exe", ".dll", ".so", ".dylib",
  ".lock", ".lockb",
  ".min.js", ".min.css",
  ".map",
]);

const LICENSE_NAMES = new Set([
  "license", "license.md", "license.txt", "license.rst",
  "licence", "licence.md", "licence.txt",
  "copying", "copying.md",
]);

// --- File Scoring --- //

function isExcluded(path: string): boolean {
  const lower = path.toLowerCase();

  // Check excluded directories
  const parts = lower.split("/");
  for (const part of parts) {
    if (EXCLUDED_DIRS.has(part)) return true;
  }

  // Check license files
  const filename = parts[parts.length - 1];
  if (LICENSE_NAMES.has(filename)) return true;

  // Check excluded extensions
  for (const ext of EXCLUDED_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  return false;
}

function isDocDir(segment: string): boolean {
  return segment === "docs" || segment === "doc" || segment === "documentation";
}

export function scoreFile(entry: TreeEntry): number {
  if (isExcluded(entry.path)) return -1;

  const lower = entry.path.toLowerCase();
  const parts = lower.split("/");
  const filename = parts[parts.length - 1];
  const depth = parts.length;

  let score = 0;

  // T1: Root README
  if (depth === 1 && filename.match(/^readme\.(md|rst|txt)$/)) {
    score = 100;
  }
  // T2: docs/**/*.md
  else if (depth >= 2 && isDocDir(parts[0]) && filename.endsWith(".md")) {
    score = 80;
    // Depth penalty for deeply nested docs (>3 levels inside docs/)
    const docsDepth = depth - 1; // levels inside docs/
    if (docsDepth > 3) {
      score -= 5 * (docsDepth - 3);
    }
  }
  // T3: examples/**/* (markdown + code)
  else if (depth >= 2 && parts[0] === "examples") {
    score = 60;
  }
  // T4: Secondary READMEs (*/README.md, one level deep)
  else if (depth === 2 && filename.match(/^readme\.(md|rst|txt)$/)) {
    score = 50;
  }
  // T5: Root meta docs
  else if (
    depth === 1 &&
    (filename === "changelog.md" ||
      filename === "contributing.md" ||
      filename === "history.md" ||
      filename === "migration.md")
  ) {
    score = 40;
  }
  // T6: Root architectural docs
  else if (
    depth === 1 &&
    (filename === "api.md" ||
      filename === "architecture.md" ||
      filename === "design.md")
  ) {
    score = 35;
  }
  // T7: .github/**/*.md
  else if (parts[0] === ".github" && filename.endsWith(".md")) {
    score = 20;
  }
  // T8: Other root *.md files
  else if (depth === 1 && filename.endsWith(".md")) {
    score = 15;
  }
  // No match — skip
  else {
    return -1;
  }

  // Size penalty: files >50KB get -20
  if (entry.size && entry.size > 50_000) {
    score -= 20;
  }

  return Math.max(score, 1); // Ensure scored files always have at least 1
}

export function scoreAndRankFiles(tree: TreeEntry[]): ScoredFile[] {
  const scored: ScoredFile[] = [];

  for (const entry of tree) {
    const s = scoreFile(entry);
    if (s > 0) {
      scored.push({ path: entry.path, score: s });
    }
  }

  // Sort descending by score, then alphabetically by path for stability
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  return scored;
}

// --- Document Assembly --- //

export function assembleDocument(
  meta: RepoMetadata,
  result: FetchResult,
): string {
  const sections: string[] = [];

  // Header
  sections.push(`# ${meta.fullName}`);

  if (meta.description) {
    sections.push(`\n> ${meta.description}`);
  }

  // Metadata block
  const metaLines: string[] = [];
  metaLines.push(`- Repository: https://github.com/${meta.fullName}`);
  if (meta.language) metaLines.push(`- Primary Language: ${meta.language}`);
  if (meta.license) metaLines.push(`- License: ${meta.license}`);
  if (meta.topics.length > 0)
    metaLines.push(`- Topics: ${meta.topics.join(", ")}`);
  metaLines.push(`- Stars: ${meta.stars.toLocaleString()}`);
  if (meta.homepage) metaLines.push(`- Homepage: ${meta.homepage}`);
  sections.push("\n" + metaLines.join("\n"));

  sections.push(
    "\n*Auto-generated pseudo-llms.txt from repository documentation files.*",
  );

  // Table of Contents (if >1 file)
  if (result.fetched.length > 1) {
    const tocLines = result.fetched.map(
      (f) => `- [${f.path}](#${f.path.replace(/[^a-z0-9-]/gi, "-").toLowerCase()})`,
    );
    sections.push("\n## Table of Contents\n\n" + tocLines.join("\n"));
  }

  // File contents
  for (const file of result.fetched) {
    sections.push(`\n---\n\n## ${file.path}\n\n${file.content.trim()}`);
  }

  // Skipped files
  if (result.skipped.length > 0) {
    const skippedList = result.skipped.map((p) => `- ${p}`).join("\n");
    sections.push(
      `\n---\n\n## Additional Files\n\nThe following documentation files were identified but not included (budget exceeded):\n\n${skippedList}`,
    );
  }

  return sections.join("\n");
}

// --- Main Handler --- //

export async function generate_pseudo_llms_txt(input: {
  repo: string;
}): Promise<CallToolResult> {
  logger.debug(`generate_pseudo_llms_txt: repo=${input.repo}`);

  // 1. Parse URL
  const id = parseRepoUrl(input.repo);
  const cacheKey = `https://github.com/${id.owner}/${id.repo}`;
  const sourceName = `${id.owner}/${id.repo}`;

  // 2. Check cache
  const cached = await readCache(cacheKey, "llms-txt");
  if (cached) {
    const summary = formatCacheSummary(
      sourceName,
      "pseudo-llms.txt",
      cacheKey,
      cached,
    );
    logger.debug(`Cache hit for ${cacheKey}`);
    return { content: [{ type: "text", text: summary }] };
  }

  // 3. Fetch repo metadata
  const meta = await fetchRepoMetadata(id);

  // 4. Fetch file tree
  const tree = await fetchRepoTree(id, meta.defaultBranch);

  if (tree.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `Repository ${sourceName} appears to be empty — no files found.`,
        },
      ],
    };
  }

  // 5. Score and rank files
  const scoredFiles = scoreAndRankFiles(tree);

  if (scoredFiles.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No documentation files found in ${sourceName}. The repository may not contain README, docs/, or other recognized documentation files.`,
        },
      ],
    };
  }

  logger.debug(
    `Scored ${scoredFiles.length} documentation files in ${sourceName}`,
  );

  // 6. Fetch content within budget
  const result = await fetchFilesWithBudget(
    id,
    meta.defaultBranch,
    scoredFiles,
  );

  if (result.fetched.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to fetch any documentation files from ${sourceName}.`,
        },
      ],
    };
  }

  // 7. Assemble document
  const document = assembleDocument(meta, result);

  // 8. Write to cache
  const hit = await writeCache(cacheKey, document, "llms-txt", {
    sourceName,
    variant: "pseudo-llms.txt",
  });

  // 9. Return summary
  const summary = formatCacheSummary(
    sourceName,
    "pseudo-llms.txt",
    cacheKey,
    hit,
  );

  logger.info(
    `Generated pseudo-llms.txt for ${sourceName}: ${result.fetched.length} files, ${result.totalChars.toLocaleString()} chars`,
  );

  return { content: [{ type: "text", text: summary }] };
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
