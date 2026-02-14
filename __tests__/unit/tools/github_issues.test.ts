import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { github_issues } from "#tools/github_issues";
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
    githubRest: vi.fn(),
    githubGraphQL: vi.fn(),
  };
});

describe("github_issues", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetAllMocks();
    // mockReset clears the mockResolvedValueOnce queue (clearAllMocks does not)
    vi.mocked(github.githubGraphQL).mockReset();
    vi.mocked(github.githubRest).mockReset();
    vi.mocked(github.getGitHubConfig).mockReset().mockReturnValue({
      defaultOwner: undefined,
      defaultOrg: undefined,
      defaultMergeMethod: "merge",
    });
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("list action", () => {
    it("should list open issues excluding pull requests", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce([
        {
          number: 1,
          title: "Bug report",
          state: "open",
          user: { login: "reporter1" },
          labels: [{ name: "bug" }],
          assignees: [{ login: "dev1" }],
          milestone: { title: "v1.0", number: 1 },
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-02T00:00:00Z",
        },
        {
          number: 2,
          title: "Feature request",
          state: "open",
          user: { login: "user2" },
          labels: [{ name: "enhancement" }],
          assignees: [],
          milestone: null,
          created_at: "2025-01-03T00:00:00Z",
          updated_at: "2025-01-04T00:00:00Z",
        },
        {
          number: 3,
          title: "A pull request",
          state: "open",
          user: { login: "dev3" },
          labels: [],
          assignees: [],
          milestone: null,
          created_at: "2025-01-05T00:00:00Z",
          updated_at: "2025-01-06T00:00:00Z",
          pull_request: { url: "https://api.github.com/repos/o/r/pulls/3" },
        },
      ]);

      const result = await github_issues({
        action: "list",
        owner: "testowner",
        repo: "testrepo",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.count).toBe(2);
      expect(parsed.truncated).toBe(false);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].number).toBe(1);
      expect(parsed.items[0].author).toBe("reporter1");
      expect(parsed.items[0].labels).toEqual(["bug"]);
      expect(parsed.items[0].assignees).toEqual(["dev1"]);
      expect(parsed.items[0].milestone).toBe("v1.0");
      expect(parsed.items[1].number).toBe(2);
      expect(parsed.items[1].milestone).toBeNull();
    });

    it("should pass filter parameters to the API", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce([]);

      await github_issues({
        action: "list",
        owner: "testowner",
        repo: "testrepo",
        state: "closed",
        labels: ["bug", "critical"],
        assignee: "dev1",
      });

      const callArgs = vi.mocked(github.githubRest).mock.calls[0];
      const url = callArgs[1] as string;
      expect(url).toContain("state=closed");
      expect(url).toContain("labels=bug%2Ccritical");
      expect(url).toContain("assignee=dev1");
    });
  });

  describe("get action", () => {
    it("should get issue details", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 42,
        title: "Important bug",
        body: "Steps to reproduce...",
        state: "open",
        user: { login: "reporter1" },
        labels: [{ name: "bug" }, { name: "priority" }],
        assignees: [{ login: "dev1" }],
        milestone: { title: "v2.0", number: 2 },
        comments: 5,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-05T00:00:00Z",
        closed_at: null,
        html_url: "https://github.com/testowner/testrepo/issues/42",
      });

      const result = await github_issues({
        action: "get",
        owner: "testowner",
        repo: "testrepo",
        issueNumber: 42,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.number).toBe(42);
      expect(parsed.title).toBe("Important bug");
      expect(parsed.body).toBe("Steps to reproduce...");
      expect(parsed.labels).toEqual(["bug", "priority"]);
      expect(parsed.assignees).toEqual(["dev1"]);
      expect(parsed.commentCount).toBe(5);
      expect(parsed.closedAt).toBeNull();
    });

    it("should throw when issueNumber is missing", async () => {
      await expect(
        github_issues({
          action: "get",
          owner: "testowner",
          repo: "testrepo",
        }),
      ).rejects.toThrow("issueNumber is required for the get action");
    });
  });

  describe("create action", () => {
    it("should create an issue with all fields", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 99,
        html_url: "https://github.com/testowner/testrepo/issues/99",
        title: "New feature request",
        state: "open",
      });

      const result = await github_issues({
        action: "create",
        owner: "testowner",
        repo: "testrepo",
        title: "New feature request",
        body: "Please add this feature",
        labels: ["enhancement"],
        assignee: "dev1",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Issue created successfully");
      expect(parsed.number).toBe(99);
      expect(parsed.url).toContain("/issues/99");

      const callArgs = vi.mocked(github.githubRest).mock.calls[0];
      const payload = callArgs[2] as Record<string, unknown>;
      expect(payload.labels).toEqual(["enhancement"]);
      expect(payload.assignees).toEqual(["dev1"]);
    });

    it("should create an issue with minimal fields", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 100,
        html_url: "https://github.com/testowner/testrepo/issues/100",
        title: "Simple issue",
        state: "open",
      });

      const result = await github_issues({
        action: "create",
        owner: "testowner",
        repo: "testrepo",
        title: "Simple issue",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.number).toBe(100);

      const callArgs = vi.mocked(github.githubRest).mock.calls[0];
      const payload = callArgs[2] as Record<string, unknown>;
      expect(payload.labels).toBeUndefined();
      expect(payload.assignees).toBeUndefined();
    });

    it("should throw when title is missing", async () => {
      await expect(
        github_issues({
          action: "create",
          owner: "testowner",
          repo: "testrepo",
        }),
      ).rejects.toThrow("title is required for the create action");
    });
  });

  describe("update action", () => {
    it("should update issue fields", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 42,
        title: "Updated title",
        state: "open",
        html_url: "https://github.com/testowner/testrepo/issues/42",
      });

      const result = await github_issues({
        action: "update",
        owner: "testowner",
        repo: "testrepo",
        issueNumber: 42,
        title: "Updated title",
        labels: ["bug", "confirmed"],
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Issue updated successfully");
      expect(parsed.title).toBe("Updated title");

      const callArgs = vi.mocked(github.githubRest).mock.calls[0];
      const payload = callArgs[2] as Record<string, unknown>;
      expect(payload.title).toBe("Updated title");
      expect(payload.labels).toEqual(["bug", "confirmed"]);
    });

    it("should throw when issueNumber is missing", async () => {
      await expect(
        github_issues({
          action: "update",
          owner: "testowner",
          repo: "testrepo",
          title: "New title",
        }),
      ).rejects.toThrow("issueNumber is required for the update action");
    });
  });

  describe("close action", () => {
    it("should close an issue", async () => {
      vi.mocked(github.githubRest).mockResolvedValueOnce({
        number: 42,
        state: "closed",
        title: "Resolved bug",
      });

      const result = await github_issues({
        action: "close",
        owner: "testowner",
        repo: "testrepo",
        issueNumber: 42,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Issue closed");
      expect(parsed.state).toBe("closed");
      expect(parsed.number).toBe(42);
    });

    it("should throw when issueNumber is missing", async () => {
      await expect(
        github_issues({
          action: "close",
          owner: "testowner",
          repo: "testrepo",
        }),
      ).rejects.toThrow("issueNumber is required for the close action");
    });
  });

  describe("add_to_project action", () => {
    it("should add an issue to a project", async () => {
      vi.mocked(github.githubGraphQL)
        .mockResolvedValueOnce({
          user: {
            projectV2: {
              id: "PVT_project123",
              owner: { login: "testowner", __typename: "User" },
            },
          },
        })
        .mockResolvedValueOnce({
          repository: { issue: { id: "I_issue456" } },
        })
        .mockResolvedValueOnce({
          addProjectV2ItemById: { item: { id: "PVTI_newitem789" } },
        });

      const result = await github_issues({
        action: "add_to_project",
        owner: "testowner",
        repo: "testrepo",
        issueNumber: 42,
        projectNumber: 1,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Issue added to project");
      expect(parsed.projectItemId).toBe("PVTI_newitem789");
      expect(parsed.issueNumber).toBe(42);
      expect(parsed.projectNumber).toBe(1);
      expect(parsed.projectOwner).toBe("testowner");
      expect(parsed.projectOwnerType).toBe("User");
    });

    it("should use org for project resolution when GITHUB_ORG is set", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: "personal-user",
        defaultOrg: "my-org",
        defaultMergeMethod: "squash",
      });

      vi.mocked(github.githubGraphQL)
        .mockResolvedValueOnce({
          user: {
            projectV2: {
              id: "PVT_org_project",
              owner: { login: "personal-user", __typename: "User" },
            },
          },
        })
        .mockResolvedValueOnce({
          repository: { issue: { id: "I_issue123" } },
        })
        .mockResolvedValueOnce({
          addProjectV2ItemById: { item: { id: "PVTI_item456" } },
        });

      await github_issues({
        action: "add_to_project",
        repo: "testrepo",
        issueNumber: 1,
        projectNumber: 5,
      });

      const resolveCall = vi.mocked(github.githubGraphQL).mock.calls[0];
      expect(resolveCall[1]).toEqual(
        expect.objectContaining({ login: "personal-user" }),
      );
    });

    it("should fall back to org project resolution when user lookup fails", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: "myorg",
        defaultOrg: "myorg",
        defaultMergeMethod: "merge",
      });

      vi.mocked(github.githubGraphQL)
        .mockRejectedValueOnce(new Error("User not found"))
        .mockResolvedValueOnce({
          organization: {
            projectV2: {
              id: "PVT_org_fallback",
              owner: { login: "myorg", __typename: "Organization" },
            },
          },
        })
        .mockResolvedValueOnce({
          repository: { issue: { id: "I_issue789" } },
        })
        .mockResolvedValueOnce({
          addProjectV2ItemById: { item: { id: "PVTI_orgitem" } },
        });

      const result = await github_issues({
        action: "add_to_project",
        owner: "myorg",
        repo: "testrepo",
        issueNumber: 10,
        projectNumber: 3,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.projectItemId).toBe("PVTI_orgitem");
      expect(parsed.projectOwner).toBe("myorg");
      expect(parsed.projectOwnerType).toBe("Organization");
      expect(github.githubGraphQL).toHaveBeenCalledTimes(4);
    });

    it("should throw when project is not found in user or org", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: undefined,
        defaultOrg: undefined,
        defaultMergeMethod: "squash",
      });

      vi.mocked(github.githubGraphQL).mockRejectedValueOnce(
        new Error("User not found"),
      );

      await expect(
        github_issues({
          action: "add_to_project",
          owner: "nobody",
          repo: "testrepo",
          issueNumber: 1,
          projectNumber: 999,
        }),
      ).rejects.toThrow('Could not find project #999 under user "nobody"');
    });

    it("should throw when issueNumber is missing", async () => {
      await expect(
        github_issues({
          action: "add_to_project",
          owner: "testowner",
          repo: "testrepo",
          projectNumber: 1,
        }),
      ).rejects.toThrow(
        "issueNumber is required for the add_to_project action",
      );
    });

    it("should throw when projectNumber is missing", async () => {
      await expect(
        github_issues({
          action: "add_to_project",
          owner: "testowner",
          repo: "testrepo",
          issueNumber: 42,
        }),
      ).rejects.toThrow(
        "projectNumber is required for the add_to_project action",
      );
    });

    it("should throw when issue is not found", async () => {
      vi.mocked(github.githubGraphQL)
        .mockResolvedValueOnce({
          user: {
            projectV2: {
              id: "PVT_project123",
              owner: { login: "testowner", __typename: "User" },
            },
          },
        })
        .mockResolvedValueOnce({
          repository: { issue: null },
        });

      await expect(
        github_issues({
          action: "add_to_project",
          owner: "testowner",
          repo: "testrepo",
          issueNumber: 999,
          projectNumber: 1,
        }),
      ).rejects.toThrow("Could not find issue #999");
    });

    it("should update status when provided", async () => {
      vi.mocked(github.githubGraphQL)
        // Project resolution
        .mockResolvedValueOnce({
          user: {
            projectV2: {
              id: "PVT_project123",
              owner: { login: "testowner", __typename: "User" },
            },
          },
        })
        // Issue resolution
        .mockResolvedValueOnce({
          repository: { issue: { id: "I_issue456" } },
        })
        // Add to project
        .mockResolvedValueOnce({
          addProjectV2ItemById: { item: { id: "PVTI_newitem789" } },
        })
        // Query project fields
        .mockResolvedValueOnce({
          node: {
            fields: {
              nodes: [
                {
                  id: "PVTSSF_status",
                  name: "Status",
                  options: [
                    { id: "opt1", name: "Backlog" },
                    { id: "opt2", name: "In Progress" },
                  ],
                },
              ],
            },
          },
        })
        // Update status field
        .mockResolvedValueOnce({
          updateProjectV2ItemFieldValue: {
            projectV2Item: { id: "PVTI_newitem789" },
          },
        });

      const result = await github_issues({
        action: "add_to_project",
        owner: "testowner",
        repo: "testrepo",
        issueNumber: 42,
        projectNumber: 1,
        status: "In Progress",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Issue added to project");
      expect(parsed.projectItemId).toBe("PVTI_newitem789");
      expect(github.githubGraphQL).toHaveBeenCalledTimes(5);
    });

    it("should update iteration to current when provided", async () => {
      const today = new Date().toISOString().split("T")[0];
      vi.mocked(github.githubGraphQL)
        .mockResolvedValueOnce({
          user: {
            projectV2: {
              id: "PVT_project123",
              owner: { login: "testowner", __typename: "User" },
            },
          },
        })
        .mockResolvedValueOnce({
          repository: { issue: { id: "I_issue456" } },
        })
        .mockResolvedValueOnce({
          addProjectV2ItemById: { item: { id: "PVTI_newitem789" } },
        })
        .mockResolvedValueOnce({
          node: {
            fields: {
              nodes: [
                {
                  id: "PVTIF_iteration",
                  name: "Iteration",
                  configuration: {
                    iterations: [
                      {
                        id: "iter1",
                        title: "Sprint 1",
                        startDate: "2025-01-01",
                      },
                      { id: "iter2", title: "Sprint 2", startDate: today },
                    ],
                  },
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          updateProjectV2ItemFieldValue: {
            projectV2Item: { id: "PVTI_newitem789" },
          },
        });

      await github_issues({
        action: "add_to_project",
        owner: "testowner",
        repo: "testrepo",
        issueNumber: 42,
        projectNumber: 1,
        iteration: "current",
      });

      expect(github.githubGraphQL).toHaveBeenCalledTimes(5);
      const updateCall = vi.mocked(github.githubGraphQL).mock.calls[4];
      expect(updateCall[1]).toMatchObject({
        value: { iterationId: "iter2" },
      });
    });

    it("should update multiple fields when provided", async () => {
      vi.mocked(github.githubGraphQL)
        .mockResolvedValueOnce({
          user: {
            projectV2: {
              id: "PVT_project123",
              owner: { login: "testowner", __typename: "User" },
            },
          },
        })
        .mockResolvedValueOnce({
          repository: { issue: { id: "I_issue456" } },
        })
        .mockResolvedValueOnce({
          addProjectV2ItemById: { item: { id: "PVTI_newitem789" } },
        })
        .mockResolvedValueOnce({
          node: {
            fields: {
              nodes: [
                {
                  id: "PVTSSF_status",
                  name: "Status",
                  options: [{ id: "opt1", name: "In Progress" }],
                },
                {
                  id: "PVTSSF_priority",
                  name: "Priority",
                  options: [
                    { id: "prio1", name: "P0" },
                    { id: "prio2", name: "P1" },
                  ],
                },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          updateProjectV2ItemFieldValue: {
            projectV2Item: { id: "PVTI_newitem789" },
          },
        })
        .mockResolvedValueOnce({
          updateProjectV2ItemFieldValue: {
            projectV2Item: { id: "PVTI_newitem789" },
          },
        });

      await github_issues({
        action: "add_to_project",
        owner: "testowner",
        repo: "testrepo",
        issueNumber: 42,
        projectNumber: 1,
        status: "In Progress",
        priority: "P1",
      });

      expect(github.githubGraphQL).toHaveBeenCalledTimes(6);
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

      const result = await github_issues({
        action: "list",
        repo: "testrepo",
      });

      expect(github.githubRest).toHaveBeenCalledWith(
        "GET",
        expect.stringContaining("/repos/env-owner/testrepo/issues"),
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
        github_issues({ action: "list", repo: "testrepo" }),
      ).rejects.toThrow("No owner configured");
    });

    it("should throw when repo is missing", async () => {
      await expect(
        github_issues({
          action: "list",
          owner: "testowner",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).rejects.toThrow("repo is required");
    });
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
