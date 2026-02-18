import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock logger before imports
vi.mock("#lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  parseRepoUrl,
  githubApiFetch,
  fetchRepoMetadata,
  fetchRepoTree,
  fetchRawFile,
  fetchFilesWithBudget,
  type ScoredFile,
} from "#lib/github_repo.js";

// --- parseRepoUrl --- //

describe("parseRepoUrl", () => {
  it("parses a standard GitHub URL", () => {
    const result = parseRepoUrl("https://github.com/dotenvx/llmstxt");
    expect(result).toEqual({ owner: "dotenvx", repo: "llmstxt" });
  });

  it("handles trailing slash", () => {
    const result = parseRepoUrl("https://github.com/dotenvx/llmstxt/");
    expect(result).toEqual({ owner: "dotenvx", repo: "llmstxt" });
  });

  it("strips .git suffix", () => {
    const result = parseRepoUrl("https://github.com/dotenvx/llmstxt.git");
    expect(result).toEqual({ owner: "dotenvx", repo: "llmstxt" });
  });

  it("strips subpaths beyond owner/repo", () => {
    const result = parseRepoUrl(
      "https://github.com/kepano/defuddle/tree/main/src",
    );
    expect(result).toEqual({ owner: "kepano", repo: "defuddle" });
  });

  it("handles www.github.com", () => {
    const result = parseRepoUrl("https://www.github.com/owner/repo");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("handles whitespace around URL", () => {
    const result = parseRepoUrl("  https://github.com/owner/repo  ");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("rejects non-URL input", () => {
    expect(() => parseRepoUrl("owner/repo")).toThrow("Invalid URL");
  });

  it("rejects non-GitHub URLs", () => {
    expect(() => parseRepoUrl("https://gitlab.com/owner/repo")).toThrow(
      "Not a GitHub URL",
    );
  });

  it("rejects GitHub URL without repo", () => {
    expect(() => parseRepoUrl("https://github.com/owner")).toThrow(
      "Could not parse owner/repo",
    );
  });

  it("rejects GitHub URL with only domain", () => {
    expect(() => parseRepoUrl("https://github.com/")).toThrow(
      "Could not parse owner/repo",
    );
  });
});

// --- githubApiFetch --- //

describe("githubApiFetch", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.GITHUB_TOKEN;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns response on success without auth", async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    const response = await githubApiFetch("https://api.github.com/repos/test");
    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries with token on 403 when GITHUB_TOKEN is set", async () => {
    process.env.GITHUB_TOKEN = "test-token-123";

    const failResponse = new Response("rate limited", { status: 403 });
    const successResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(successResponse);

    const response = await githubApiFetch("https://api.github.com/repos/test");
    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    // Second call should include Bearer token
    const secondCall = vi.mocked(globalThis.fetch).mock.calls[1];
    const headers = secondCall[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token-123");
  });

  it("retries with token on 401 when GITHUB_TOKEN is set", async () => {
    process.env.GITHUB_TOKEN = "test-token-123";

    const failResponse = new Response("unauthorized", { status: 401 });
    const successResponse = new Response(JSON.stringify({ ok: true }), {
      status: 200,
    });

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(failResponse)
      .mockResolvedValueOnce(successResponse);

    const response = await githubApiFetch("https://api.github.com/repos/test");
    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("returns 403 without retry when no GITHUB_TOKEN", async () => {
    const failResponse = new Response("forbidden", { status: 403 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(failResponse);

    const response = await githubApiFetch("https://api.github.com/repos/test");
    expect(response.status).toBe(403);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("returns non-auth error responses directly", async () => {
    const notFound = new Response("not found", { status: 404 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(notFound);

    const response = await githubApiFetch("https://api.github.com/repos/test");
    expect(response.status).toBe(404);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

// --- fetchRepoMetadata --- //

describe("fetchRepoMetadata", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses metadata from GitHub API response", async () => {
    const apiResponse = {
      full_name: "dotenvx/llmstxt",
      description: "A test repo",
      default_branch: "main",
      language: "TypeScript",
      topics: ["llms", "docs"],
      stargazers_count: 42,
      license: { spdx_id: "MIT", name: "MIT License" },
      homepage: "https://example.com",
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(apiResponse), { status: 200 }),
    );

    const meta = await fetchRepoMetadata({ owner: "dotenvx", repo: "llmstxt" });

    expect(meta).toEqual({
      owner: "dotenvx",
      repo: "llmstxt",
      fullName: "dotenvx/llmstxt",
      description: "A test repo",
      defaultBranch: "main",
      language: "TypeScript",
      topics: ["llms", "docs"],
      stars: 42,
      license: "MIT",
      homepage: "https://example.com",
    });
  });

  it("handles missing optional fields", async () => {
    const apiResponse = {
      full_name: "owner/repo",
      default_branch: "main",
      stargazers_count: 0,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(apiResponse), { status: 200 }),
    );

    const meta = await fetchRepoMetadata({ owner: "owner", repo: "repo" });

    expect(meta.description).toBeNull();
    expect(meta.language).toBeNull();
    expect(meta.topics).toEqual([]);
    expect(meta.license).toBeNull();
    expect(meta.homepage).toBeNull();
  });

  it("throws on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    await expect(
      fetchRepoMetadata({ owner: "nonexistent", repo: "repo" }),
    ).rejects.toThrow("GitHub API error 404");
  });
});

// --- fetchRepoTree --- //

describe("fetchRepoTree", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("filters to blob entries only", async () => {
    const apiResponse = {
      sha: "abc123",
      truncated: false,
      tree: [
        { path: "README.md", type: "blob", size: 100, sha: "sha1" },
        { path: "src", type: "tree", sha: "sha2" },
        { path: "src/index.ts", type: "blob", size: 200, sha: "sha3" },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(apiResponse), { status: 200 }),
    );

    const tree = await fetchRepoTree(
      { owner: "owner", repo: "repo" },
      "main",
    );

    expect(tree).toHaveLength(2);
    expect(tree[0].path).toBe("README.md");
    expect(tree[1].path).toBe("src/index.ts");
    expect(tree.every((e) => e.type === "blob")).toBe(true);
  });

  it("throws on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("error", { status: 500 }),
    );

    await expect(
      fetchRepoTree({ owner: "owner", repo: "repo" }, "main"),
    ).rejects.toThrow("GitHub API error 500");
  });
});

// --- fetchFilesWithBudget --- //

describe("fetchFilesWithBudget", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches files in order until budget is exhausted", async () => {
    const scoredFiles: ScoredFile[] = [
      { path: "README.md", score: 100 },
      { path: "docs/guide.md", score: 80 },
      { path: "docs/api.md", score: 80 },
    ];

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("# README\nHello", { status: 200 }))
      .mockResolvedValueOnce(
        new Response("# Guide\nContent", { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("# API\nDocs", { status: 200 }));

    const result = await fetchFilesWithBudget(
      { owner: "owner", repo: "repo" },
      "main",
      scoredFiles,
      100, // small budget
      5,
    );

    expect(result.fetched.length).toBeGreaterThanOrEqual(1);
    expect(result.totalChars).toBeLessThanOrEqual(100);
  });

  it("skips files that fail to fetch", async () => {
    const scoredFiles: ScoredFile[] = [
      { path: "README.md", score: 100 },
      { path: "missing.md", score: 80 },
    ];

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("# README", { status: 200 }))
      .mockResolvedValueOnce(new Response("Not found", { status: 404 }));

    const result = await fetchFilesWithBudget(
      { owner: "owner", repo: "repo" },
      "main",
      scoredFiles,
      150_000,
      5,
    );

    expect(result.fetched).toHaveLength(1);
    expect(result.fetched[0].path).toBe("README.md");
    expect(result.skipped).toContain("missing.md");
  });
});
