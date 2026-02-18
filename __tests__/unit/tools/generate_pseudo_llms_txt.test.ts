import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("#lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("#lib/cache.js", () => ({
  readCache: vi.fn(),
  writeCache: vi.fn(),
  formatCacheSummary: vi.fn(),
}));

vi.mock("#lib/github_repo.js", () => ({
  parseRepoUrl: vi.fn(),
  fetchRepoMetadata: vi.fn(),
  fetchRepoTree: vi.fn(),
  fetchFilesWithBudget: vi.fn(),
}));

import {
  scoreFile,
  scoreAndRankFiles,
  assembleDocument,
  generate_pseudo_llms_txt,
} from "#tools/generate_pseudo_llms_txt.js";

import { readCache, writeCache, formatCacheSummary } from "#lib/cache.js";
import {
  parseRepoUrl,
  fetchRepoMetadata,
  fetchRepoTree,
  fetchFilesWithBudget,
  type TreeEntry,
  type RepoMetadata,
  type FetchResult,
} from "#lib/github_repo.js";

// --- scoreFile --- //

describe("scoreFile", () => {
  it("scores root README.md at 100", () => {
    const entry: TreeEntry = {
      path: "README.md",
      type: "blob",
      size: 5000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(100);
  });

  it("scores root readme.rst at 100 (case-insensitive)", () => {
    const entry: TreeEntry = {
      path: "readme.rst",
      type: "blob",
      size: 5000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(100);
  });

  it("scores docs/*.md at 80", () => {
    const entry: TreeEntry = {
      path: "docs/guide.md",
      type: "blob",
      size: 1000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(80);
  });

  it("scores doc/*.md at 80", () => {
    const entry: TreeEntry = {
      path: "doc/intro.md",
      type: "blob",
      size: 1000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(80);
  });

  it("scores deeply nested docs with penalty", () => {
    const entry: TreeEntry = {
      path: "docs/a/b/c/d/deep.md",
      type: "blob",
      size: 1000,
      sha: "abc",
    };
    // depth = 6, docsDepth = 5, penalty = 5 * (5-3) = -10 => 80-10 = 70
    expect(scoreFile(entry)).toBe(70);
  });

  it("scores examples/ at 60", () => {
    const entry: TreeEntry = {
      path: "examples/basic.ts",
      type: "blob",
      size: 500,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(60);
  });

  it("scores secondary READMEs at 50", () => {
    const entry: TreeEntry = {
      path: "packages/README.md",
      type: "blob",
      size: 1000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(50);
  });

  it("scores CHANGELOG.md at 40", () => {
    const entry: TreeEntry = {
      path: "CHANGELOG.md",
      type: "blob",
      size: 2000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(40);
  });

  it("scores CONTRIBUTING.md at 40", () => {
    const entry: TreeEntry = {
      path: "CONTRIBUTING.md",
      type: "blob",
      size: 2000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(40);
  });

  it("scores API.md at 35", () => {
    const entry: TreeEntry = {
      path: "API.md",
      type: "blob",
      size: 1000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(35);
  });

  it("scores .github/*.md at 20", () => {
    const entry: TreeEntry = {
      path: ".github/PULL_REQUEST_TEMPLATE.md",
      type: "blob",
      size: 500,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(20);
  });

  it("scores other root *.md at 15", () => {
    const entry: TreeEntry = {
      path: "SECURITY.md",
      type: "blob",
      size: 500,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(15);
  });

  it("applies -20 penalty for files >50KB", () => {
    const entry: TreeEntry = {
      path: "README.md",
      type: "blob",
      size: 60000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(80); // 100 - 20
  });

  it("excludes node_modules files", () => {
    const entry: TreeEntry = {
      path: "node_modules/pkg/README.md",
      type: "blob",
      size: 500,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(-1);
  });

  it("excludes dist files", () => {
    const entry: TreeEntry = {
      path: "dist/bundle.js",
      type: "blob",
      size: 100,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(-1);
  });

  it("excludes LICENSE files", () => {
    const entry: TreeEntry = {
      path: "LICENSE.md",
      type: "blob",
      size: 1000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(-1);
  });

  it("excludes lock files", () => {
    const entry: TreeEntry = {
      path: "package-lock.json",
      type: "blob",
      size: 100000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(-1);
  });

  it("excludes binary files", () => {
    const entry: TreeEntry = {
      path: "image.png",
      type: "blob",
      size: 50000,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(-1);
  });

  it("excludes non-documentation source files", () => {
    const entry: TreeEntry = {
      path: "src/index.ts",
      type: "blob",
      size: 500,
      sha: "abc",
    };
    expect(scoreFile(entry)).toBe(-1);
  });
});

// --- scoreAndRankFiles --- //

describe("scoreAndRankFiles", () => {
  it("sorts files by score descending", () => {
    const tree: TreeEntry[] = [
      { path: "docs/guide.md", type: "blob", size: 100, sha: "a" },
      { path: "README.md", type: "blob", size: 100, sha: "b" },
      { path: "CHANGELOG.md", type: "blob", size: 100, sha: "c" },
    ];

    const ranked = scoreAndRankFiles(tree);

    expect(ranked[0].path).toBe("README.md");
    expect(ranked[0].score).toBe(100);
    expect(ranked[1].path).toBe("docs/guide.md");
    expect(ranked[1].score).toBe(80);
    expect(ranked[2].path).toBe("CHANGELOG.md");
    expect(ranked[2].score).toBe(40);
  });

  it("excludes files that score -1", () => {
    const tree: TreeEntry[] = [
      { path: "README.md", type: "blob", size: 100, sha: "a" },
      { path: "node_modules/pkg/index.js", type: "blob", size: 100, sha: "b" },
      { path: "src/app.ts", type: "blob", size: 100, sha: "c" },
    ];

    const ranked = scoreAndRankFiles(tree);

    expect(ranked).toHaveLength(1);
    expect(ranked[0].path).toBe("README.md");
  });

  it("handles empty tree", () => {
    expect(scoreAndRankFiles([])).toEqual([]);
  });
});

// --- assembleDocument --- //

describe("assembleDocument", () => {
  const baseMeta: RepoMetadata = {
    owner: "dotenvx",
    repo: "llmstxt",
    fullName: "dotenvx/llmstxt",
    description: "A tool for generating llms.txt",
    defaultBranch: "main",
    language: "TypeScript",
    topics: ["llms", "documentation"],
    stars: 42,
    license: "MIT",
    homepage: "https://example.com",
  };

  it("generates header with metadata", () => {
    const result: FetchResult = {
      fetched: [{ path: "README.md", content: "# Hello\nWorld", size: 13 }],
      skipped: [],
      totalChars: 13,
    };

    const doc = assembleDocument(baseMeta, result);

    expect(doc).toContain("# dotenvx/llmstxt");
    expect(doc).toContain("> A tool for generating llms.txt");
    expect(doc).toContain(
      "- Repository: https://github.com/dotenvx/llmstxt",
    );
    expect(doc).toContain("- Primary Language: TypeScript");
    expect(doc).toContain("- License: MIT");
    expect(doc).toContain("- Topics: llms, documentation");
    expect(doc).toContain("- Stars: 42");
    expect(doc).toContain("- Homepage: https://example.com");
    expect(doc).toContain("*Auto-generated pseudo-llms.txt");
  });

  it("includes TOC when >1 file", () => {
    const result: FetchResult = {
      fetched: [
        { path: "README.md", content: "# Hello", size: 7 },
        { path: "docs/guide.md", content: "# Guide", size: 7 },
      ],
      skipped: [],
      totalChars: 14,
    };

    const doc = assembleDocument(baseMeta, result);

    expect(doc).toContain("## Table of Contents");
    expect(doc).toContain("- [README.md]");
    expect(doc).toContain("- [docs/guide.md]");
  });

  it("omits TOC when only 1 file", () => {
    const result: FetchResult = {
      fetched: [{ path: "README.md", content: "# Hello", size: 7 }],
      skipped: [],
      totalChars: 7,
    };

    const doc = assembleDocument(baseMeta, result);

    expect(doc).not.toContain("## Table of Contents");
  });

  it("includes file contents with separators", () => {
    const result: FetchResult = {
      fetched: [
        { path: "README.md", content: "# Hello\nWorld", size: 13 },
        { path: "docs/api.md", content: "# API\nDocs", size: 10 },
      ],
      skipped: [],
      totalChars: 23,
    };

    const doc = assembleDocument(baseMeta, result);

    expect(doc).toContain("## README.md");
    expect(doc).toContain("# Hello\nWorld");
    expect(doc).toContain("## docs/api.md");
    expect(doc).toContain("# API\nDocs");
    expect(doc).toContain("---");
  });

  it("includes skipped files section", () => {
    const result: FetchResult = {
      fetched: [{ path: "README.md", content: "# Hello", size: 7 }],
      skipped: ["docs/big-file.md", "docs/another.md"],
      totalChars: 7,
    };

    const doc = assembleDocument(baseMeta, result);

    expect(doc).toContain("## Additional Files");
    expect(doc).toContain("- docs/big-file.md");
    expect(doc).toContain("- docs/another.md");
  });

  it("omits description line when null", () => {
    const metaNoDesc = { ...baseMeta, description: null };
    const result: FetchResult = {
      fetched: [{ path: "README.md", content: "# Hello", size: 7 }],
      skipped: [],
      totalChars: 7,
    };

    const doc = assembleDocument(metaNoDesc, result);
    expect(doc).not.toContain("> ");
  });
});

// --- generate_pseudo_llms_txt handler --- //

describe("generate_pseudo_llms_txt", () => {
  beforeEach(() => {
    vi.mocked(readCache).mockReset();
    vi.mocked(writeCache).mockReset();
    vi.mocked(formatCacheSummary).mockReset();
    vi.mocked(parseRepoUrl).mockReset();
    vi.mocked(fetchRepoMetadata).mockReset();
    vi.mocked(fetchRepoTree).mockReset();
    vi.mocked(fetchFilesWithBudget).mockReset();
  });

  it("returns cached result on cache hit", async () => {
    vi.mocked(parseRepoUrl).mockReturnValue({
      owner: "dotenvx",
      repo: "llmstxt",
    });
    vi.mocked(readCache).mockResolvedValue({
      filePath: "/cache/abc.txt",
      meta: {
        url: "https://github.com/dotenvx/llmstxt",
        fetchedAt: Date.now(),
      },
      size: 5000,
    });
    vi.mocked(formatCacheSummary).mockReturnValue("Cached summary text");

    const result = await generate_pseudo_llms_txt({
      repo: "https://github.com/dotenvx/llmstxt",
    });

    expect(result.content[0].text).toBe("Cached summary text");
    expect(fetchRepoMetadata).not.toHaveBeenCalled();
  });

  it("fetches, assembles, and caches on cache miss", async () => {
    vi.mocked(parseRepoUrl).mockReturnValue({
      owner: "dotenvx",
      repo: "llmstxt",
    });
    vi.mocked(readCache).mockResolvedValue(null);
    vi.mocked(fetchRepoMetadata).mockResolvedValue({
      owner: "dotenvx",
      repo: "llmstxt",
      fullName: "dotenvx/llmstxt",
      description: "A test repo",
      defaultBranch: "main",
      language: "TypeScript",
      topics: [],
      stars: 10,
      license: "MIT",
      homepage: null,
    });
    vi.mocked(fetchRepoTree).mockResolvedValue([
      { path: "README.md", type: "blob", size: 1000, sha: "abc" },
      { path: "src/index.ts", type: "blob", size: 500, sha: "def" },
    ]);
    vi.mocked(fetchFilesWithBudget).mockResolvedValue({
      fetched: [
        { path: "README.md", content: "# Hello World", size: 13 },
      ],
      skipped: [],
      totalChars: 13,
    });
    vi.mocked(writeCache).mockResolvedValue({
      filePath: "/cache/abc.txt",
      meta: {
        url: "https://github.com/dotenvx/llmstxt",
        fetchedAt: Date.now(),
      },
      size: 200,
    });
    vi.mocked(formatCacheSummary).mockReturnValue("Generated summary text");

    const result = await generate_pseudo_llms_txt({
      repo: "https://github.com/dotenvx/llmstxt",
    });

    expect(result.content[0].text).toBe("Generated summary text");
    expect(fetchRepoMetadata).toHaveBeenCalled();
    expect(fetchRepoTree).toHaveBeenCalled();
    expect(fetchFilesWithBudget).toHaveBeenCalled();
    expect(writeCache).toHaveBeenCalledWith(
      "https://github.com/dotenvx/llmstxt",
      expect.any(String),
      "llms-txt",
      { sourceName: "dotenvx/llmstxt", variant: "pseudo-llms.txt" },
    );
  });

  it("returns message for empty repo", async () => {
    vi.mocked(parseRepoUrl).mockReturnValue({
      owner: "owner",
      repo: "empty",
    });
    vi.mocked(readCache).mockResolvedValue(null);
    vi.mocked(fetchRepoMetadata).mockResolvedValue({
      owner: "owner",
      repo: "empty",
      fullName: "owner/empty",
      description: null,
      defaultBranch: "main",
      language: null,
      topics: [],
      stars: 0,
      license: null,
      homepage: null,
    });
    vi.mocked(fetchRepoTree).mockResolvedValue([]);

    const result = await generate_pseudo_llms_txt({
      repo: "https://github.com/owner/empty",
    });

    expect(result.content[0].text).toContain("appears to be empty");
  });

  it("returns message when no doc files found", async () => {
    vi.mocked(parseRepoUrl).mockReturnValue({
      owner: "owner",
      repo: "nodocs",
    });
    vi.mocked(readCache).mockResolvedValue(null);
    vi.mocked(fetchRepoMetadata).mockResolvedValue({
      owner: "owner",
      repo: "nodocs",
      fullName: "owner/nodocs",
      description: null,
      defaultBranch: "main",
      language: null,
      topics: [],
      stars: 0,
      license: null,
      homepage: null,
    });
    vi.mocked(fetchRepoTree).mockResolvedValue([
      { path: "src/index.ts", type: "blob", size: 500, sha: "abc" },
      { path: "package.json", type: "blob", size: 200, sha: "def" },
    ]);

    const result = await generate_pseudo_llms_txt({
      repo: "https://github.com/owner/nodocs",
    });

    expect(result.content[0].text).toContain("No documentation files found");
  });
});
