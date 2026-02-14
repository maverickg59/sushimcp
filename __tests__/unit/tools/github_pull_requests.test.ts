import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { github_pull_requests } from "#tools/github_pull_requests";
import * as github from "#lib/github";
import { resetAllMocks } from "../../test-utils.js";

vi.mock("#lib/github", async () => {
  const actual = await vi.importActual("#lib/github");
  return {
    ...actual,
    getGitHubConfig: vi.fn().mockReturnValue({
      defaultOwner: undefined,
      defaultOrg: undefined,
      defaultMergeMethod: "merge",
    }),
    getDefaultBranch: vi.fn().mockResolvedValue("main"),
    githubRest: vi.fn(),
  };
});

describe("github_pull_requests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("list action", () => {
    it("should list open pull requests", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce([
        {
          number: 1,
          title: "Feature A",
          state: "open",
          user: { login: "dev1" },
          head: { ref: "feature-a" },
          base: { ref: "main" },
          draft: false,
          labels: [{ name: "enhancement" }],
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-02T00:00:00Z",
        },
        {
          number: 2,
          title: "Fix B",
          state: "open",
          user: { login: "dev2" },
          head: { ref: "fix-b" },
          base: { ref: "main" },
          draft: true,
          labels: [],
          created_at: "2025-01-03T00:00:00Z",
          updated_at: "2025-01-04T00:00:00Z",
        },
      ]);

      const result = await github_pull_requests({
        action: "list",
        owner: "testowner",
        repo: "testrepo",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.count).toBe(2);
      expect(parsed.truncated).toBe(false);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].number).toBe(1);
      expect(parsed.items[0].author).toBe("dev1");
      expect(parsed.items[0].labels).toEqual(["enhancement"]);
      expect(parsed.items[1].draft).toBe(true);
    });
  });

  describe("get action", () => {
    it("should get pull request details", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 42,
        title: "Big feature",
        body: "Detailed description",
        state: "open",
        merged: false,
        mergeable: true,
        mergeable_state: "clean",
        user: { login: "author1" },
        head: { ref: "feature-branch", sha: "abc123" },
        base: { ref: "main" },
        additions: 100,
        deletions: 20,
        changed_files: 5,
        draft: false,
        labels: [{ name: "ready" }],
        requested_reviewers: [{ login: "reviewer1" }],
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-05T00:00:00Z",
      });

      const result = await github_pull_requests({
        action: "get",
        owner: "testowner",
        repo: "testrepo",
        pullNumber: 42,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.number).toBe(42);
      expect(parsed.title).toBe("Big feature");
      expect(parsed.additions).toBe(100);
      expect(parsed.requestedReviewers).toEqual(["reviewer1"]);
    });

    it("should throw when pullNumber is missing", async () => {
      await expect(
        github_pull_requests({
          action: "get",
          owner: "testowner",
          repo: "testrepo",
        }),
      ).rejects.toThrow("pullNumber is required for the get action");
    });
  });

  describe("create action", () => {
    it("should create a pull request", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 99,
        html_url: "https://github.com/testowner/testrepo/pull/99",
        title: "New feature",
        state: "open",
      });

      const result = await github_pull_requests({
        action: "create",
        owner: "testowner",
        repo: "testrepo",
        title: "New feature",
        body: "Implements the thing",
        head: "feature-branch",
        base: "main",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Pull request created successfully");
      expect(parsed.number).toBe(99);
      expect(parsed.url).toContain("/pull/99");
    });

    it("should throw when required fields are missing", async () => {
      await expect(
        github_pull_requests({
          action: "create",
          owner: "testowner",
          repo: "testrepo",
          title: "Missing branches",
        }),
      ).rejects.toThrow("title and head are required for the create action");
    });
  });

  describe("list_comments action", () => {
    it("should list both review and general comments", async () => {
      vi.mocked(github.githubRest)
        .mockResolvedValueOnce([
          {
            id: 101,
            body: "Inline comment on code",
            path: "src/index.ts",
            line: 42,
            side: "RIGHT",
            user: { login: "reviewer1" },
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 201,
            body: "General comment",
            user: { login: "commenter1" },
            created_at: "2025-01-02T00:00:00Z",
            updated_at: "2025-01-02T00:00:00Z",
          },
        ]);

      const result = await github_pull_requests({
        action: "list_comments",
        owner: "testowner",
        repo: "testrepo",
        pullNumber: 42,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.reviewComments).toHaveLength(1);
      expect(parsed.reviewComments[0].path).toBe("src/index.ts");
      expect(parsed.generalComments).toHaveLength(1);
      expect(parsed.generalComments[0].author).toBe("commenter1");
    });

    it("should throw when pullNumber is missing", async () => {
      await expect(
        github_pull_requests({
          action: "list_comments",
          owner: "testowner",
          repo: "testrepo",
        }),
      ).rejects.toThrow("pullNumber is required for the list_comments action");
    });
  });

  describe("comment action", () => {
    it("should post a general comment", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        id: 301,
        html_url: "https://github.com/testowner/testrepo/pull/42#comment-301",
      });

      const result = await github_pull_requests({
        action: "comment",
        owner: "testowner",
        repo: "testrepo",
        pullNumber: 42,
        commentBody: "Looks good to me!",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("General comment posted");
      expect(parsed.commentId).toBe(301);
    });

    it("should post an inline review comment", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        id: 302,
        html_url: "https://github.com/testowner/testrepo/pull/42#r302",
      });

      const result = await github_pull_requests({
        action: "comment",
        owner: "testowner",
        repo: "testrepo",
        pullNumber: 42,
        commentBody: "Consider renaming this variable",
        commentPath: "src/utils.ts",
        commentLine: 15,
        commitId: "abc123def",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Inline review comment posted");
      expect(parsed.commentId).toBe(302);
    });

    it("should throw when pullNumber or commentBody is missing", async () => {
      await expect(
        github_pull_requests({
          action: "comment",
          owner: "testowner",
          repo: "testrepo",
          pullNumber: 42,
        }),
      ).rejects.toThrow(
        "pullNumber and commentBody are required for the comment action",
      );
    });
  });

  describe("request_reviewers action", () => {
    it("should request reviewers on a PR", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        requested_reviewers: [{ login: "reviewer1" }, { login: "reviewer2" }],
      });

      const result = await github_pull_requests({
        action: "request_reviewers",
        owner: "testowner",
        repo: "testrepo",
        pullNumber: 42,
        reviewers: ["reviewer1", "reviewer2"],
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Reviewers requested");
      expect(parsed.requestedReviewers).toEqual(["reviewer1", "reviewer2"]);
    });

    it("should throw when pullNumber or reviewers are missing", async () => {
      await expect(
        github_pull_requests({
          action: "request_reviewers",
          owner: "testowner",
          repo: "testrepo",
          pullNumber: 42,
        }),
      ).rejects.toThrow(
        "pullNumber and reviewers are required for the request_reviewers action",
      );
    });
  });

  describe("merge action", () => {
    it("should merge a pull request", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        sha: "merged_sha_123",
        merged: true,
        message: "Pull Request successfully merged",
      });

      const result = await github_pull_requests({
        action: "merge",
        owner: "testowner",
        repo: "testrepo",
        pullNumber: 42,
        mergeMethod: "squash",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.merged).toBe(true);
      expect(parsed.sha).toBe("merged_sha_123");
    });

    it("should throw when pullNumber is missing", async () => {
      await expect(
        github_pull_requests({
          action: "merge",
          owner: "testowner",
          repo: "testrepo",
        }),
      ).rejects.toThrow("pullNumber is required for the merge action");
    });
  });

  describe("close action", () => {
    it("should close a pull request", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 42,
        state: "closed",
        title: "Old feature",
      });

      const result = await github_pull_requests({
        action: "close",
        owner: "testowner",
        repo: "testrepo",
        pullNumber: 42,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Pull request closed");
      expect(parsed.state).toBe("closed");
    });

    it("should throw when pullNumber is missing", async () => {
      await expect(
        github_pull_requests({
          action: "close",
          owner: "testowner",
          repo: "testrepo",
        }),
      ).rejects.toThrow("pullNumber is required for the close action");
    });
  });

  describe("env var defaults", () => {
    it("should use GITHUB_OWNER from config when not in input", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: "env-owner",
        defaultOrg: undefined,
        defaultMergeMethod: "squash",
      });

      vi.mocked(github.githubRest).mockResolvedValueOnce([]);

      const result = await github_pull_requests({
        action: "list",
        repo: "testrepo",
      });

      expect(github.githubRest).toHaveBeenCalledWith(
        "GET",
        "/repos/env-owner/testrepo/pulls?state=open&per_page=100",
      );
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.count).toBe(0);
      expect(parsed.truncated).toBe(false);
      expect(parsed.items).toEqual([]);
    });

    it("should throw when owner is missing from both input and env", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: undefined,
        defaultOrg: undefined,
        defaultMergeMethod: "squash",
      });

      await expect(
        github_pull_requests({ action: "list", repo: "testrepo" }),
      ).rejects.toThrow("No owner configured");
    });

    it("should throw when repo is missing", async () => {
      await expect(
        github_pull_requests({
          action: "list",
          owner: "testowner",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).rejects.toThrow("repo is required");
    });

    it("should use default merge method from config", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: undefined,
        defaultOrg: undefined,
        defaultMergeMethod: "rebase",
      });

      vi.mocked(github.githubRest).mockResolvedValueOnce({
        sha: "abc",
        merged: true,
        message: "Merged",
      });

      await github_pull_requests({
        action: "merge",
        owner: "testowner",
        repo: "testrepo",
        pullNumber: 1,
      });

      expect(github.githubRest).toHaveBeenCalledWith(
        "PUT",
        "/repos/testowner/testrepo/pulls/1/merge",
        { merge_method: "rebase" },
      );
    });

    it("should auto-detect base branch from repo when not provided", async () => {
      vi.mocked(github.getDefaultBranch).mockResolvedValueOnce("develop");

      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 1,
        html_url: "https://github.com/testowner/testrepo/pull/1",
        title: "Test",
        state: "open",
      });

      await github_pull_requests({
        action: "create",
        owner: "testowner",
        repo: "testrepo",
        title: "Test",
        head: "feature",
      });

      expect(github.getDefaultBranch).toHaveBeenCalledWith(
        "testowner",
        "testrepo",
      );
      expect(github.githubRest).toHaveBeenCalledWith(
        "POST",
        "/repos/testowner/testrepo/pulls",
        expect.objectContaining({ base: "develop" }),
      );
    });

    it("should use explicit base branch when provided", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 1,
        html_url: "https://github.com/testowner/testrepo/pull/1",
        title: "Test",
        state: "open",
      });

      await github_pull_requests({
        action: "create",
        owner: "testowner",
        repo: "testrepo",
        title: "Test",
        head: "feature",
        base: "staging",
      });

      expect(github.getDefaultBranch).not.toHaveBeenCalled();
      expect(github.githubRest).toHaveBeenCalledWith(
        "POST",
        "/repos/testowner/testrepo/pulls",
        expect.objectContaining({ base: "staging" }),
      );
    });
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
