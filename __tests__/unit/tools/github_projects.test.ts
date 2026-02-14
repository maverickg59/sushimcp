import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { github_projects } from "#tools/github_projects";
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
    githubGraphQL: vi.fn(),
  };
});

describe("github_projects", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetAllMocks();
    // mockReset clears the mockResolvedValueOnce queue (clearAllMocks does not)
    vi.mocked(github.githubGraphQL).mockReset();
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

  const mockProjectNodeId = "PVT_kwHOABC123";

  /** Mock the user project resolution query */
  function mockResolveProject(login = "testuser", typename = "User") {
    vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
      user: {
        projectV2: {
          id: mockProjectNodeId,
          owner: { login, __typename: typename },
        },
      },
    });
  }

  /** Mock the listProjectItems query with metadata */
  function mockListItems(
    items: unknown[] = [],
    meta: {
      title?: string;
      number?: number;
      login?: string;
      typename?: string;
      hasNextPage?: boolean;
    } = {},
  ) {
    vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
      node: {
        title: meta.title ?? "Test Project",
        number: meta.number ?? 1,
        owner: {
          login: meta.login ?? "testuser",
          __typename: meta.typename ?? "User",
        },
        items: {
          pageInfo: { hasNextPage: meta.hasNextPage ?? false },
          nodes: items,
        },
      },
    });
  }

  /** Mock the getProjectItem direct query */
  function mockGetItem(
    item: unknown | null,
    meta: {
      title?: string;
      number?: number;
      login?: string;
      typename?: string;
    } = {},
  ) {
    vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
      project: {
        title: meta.title ?? "Test Project",
        number: meta.number ?? 1,
        owner: {
          login: meta.login ?? "testuser",
          __typename: meta.typename ?? "User",
        },
      },
      item,
    });
  }

  describe("list action", () => {
    it("should list project items", async () => {
      mockResolveProject();
      mockListItems([
        {
          id: "PVTI_item1",
          type: "DRAFT_ISSUE",
          fieldValues: {
            nodes: [
              {
                text: "In Progress",
                field: { name: "Status" },
              },
            ],
          },
          content: {
            title: "Task one",
            body: "First task",
          },
        },
        {
          id: "PVTI_item2",
          type: "ISSUE",
          fieldValues: {
            nodes: [
              {
                name: "Done",
                field: { name: "Status" },
              },
            ],
          },
          content: {
            title: "Task two",
            body: "Second task",
            assignees: { nodes: [{ login: "testuser" }] },
          },
        },
      ]);

      const result = await github_projects({
        action: "list",
        owner: "testuser",
        projectNumber: 1,
      });

      expect(result.content).toHaveLength(1);
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.items).toHaveLength(2);
      expect(parsed.items[0].id).toBe("PVTI_item1");
      expect(parsed.items[0].content.title).toBe("Task one");
      expect(parsed.items[1].content.assignees).toEqual(["testuser"]);
      expect(parsed.metadata.owner).toBe("testuser");
      expect(parsed.metadata.title).toBe("Test Project");
    });
  });

  describe("get action", () => {
    it("should get a single project item", async () => {
      mockResolveProject();
      mockGetItem({
        id: "PVTI_target",
        type: "DRAFT_ISSUE",
        fieldValues: { nodes: [] },
        content: { title: "Target item", body: "Details here" },
      });

      const result = await github_projects({
        action: "get",
        owner: "testuser",
        projectNumber: 1,
        itemId: "PVTI_target",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.item.id).toBe("PVTI_target");
      expect(parsed.item.content.title).toBe("Target item");
      expect(parsed.metadata.owner).toBe("testuser");
    });

    it("should throw when itemId is missing", async () => {
      await expect(
        github_projects({
          action: "get",
          owner: "testuser",
          projectNumber: 1,
        }),
      ).rejects.toThrow("itemId is required for the get action");
    });

    it("should throw when item is not found", async () => {
      mockResolveProject();
      mockGetItem(null);

      await expect(
        github_projects({
          action: "get",
          owner: "testuser",
          projectNumber: 1,
          itemId: "PVTI_nonexistent",
        }),
      ).rejects.toThrow("Project item not found: PVTI_nonexistent");
    });
  });

  describe("create action", () => {
    it("should create a draft issue", async () => {
      mockResolveProject();

      vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
        addProjectV2DraftIssue: {
          projectItem: { id: "PVTI_new_item" },
        },
      });

      const result = await github_projects({
        action: "create",
        owner: "testuser",
        projectNumber: 1,
        title: "New task",
        body: "Task description",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Draft issue created successfully");
      expect(parsed.itemId).toBe("PVTI_new_item");
    });

    it("should throw when title is missing", async () => {
      await expect(
        github_projects({
          action: "create",
          owner: "testuser",
          projectNumber: 1,
        }),
      ).rejects.toThrow("title is required for the create action");
    });
  });

  describe("update action", () => {
    it("should update a text field with explicit fieldId", async () => {
      mockResolveProject();

      vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
        updateProjectV2ItemFieldValue: {
          projectV2Item: { id: "PVTI_updated" },
        },
      });

      const result = await github_projects({
        action: "update",
        owner: "testuser",
        projectNumber: 1,
        itemId: "PVTI_item1",
        fieldId: "PVTF_field1",
        fieldValue: "Updated value",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Item field updated successfully");
      expect(parsed.updatedFields).toBe(1);
    });

    it("should update a single select field with explicit fieldId and statusOptionId", async () => {
      mockResolveProject();

      vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
        updateProjectV2ItemFieldValue: {
          projectV2Item: { id: "PVTI_updated" },
        },
      });

      const result = await github_projects({
        action: "update",
        owner: "testuser",
        projectNumber: 1,
        itemId: "PVTI_item1",
        fieldId: "PVTF_status",
        statusOptionId: "OPT_done",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Item field updated successfully");
    });

    it("should update status with human-readable value", async () => {
      mockResolveProject();

      // Query project fields
      vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
        node: {
          fields: {
            nodes: [
              {
                id: "PVTSSF_status",
                name: "Status",
                options: [
                  { id: "opt1", name: "Backlog" },
                  { id: "opt2", name: "In Progress" },
                  { id: "opt3", name: "Done" },
                ],
              },
            ],
          },
        },
      });

      // Update status mutation
      vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
        updateProjectV2ItemFieldValue: {
          projectV2Item: { id: "PVTI_item1" },
        },
      });

      const result = await github_projects({
        action: "update",
        owner: "testuser",
        projectNumber: 1,
        itemId: "PVTI_item1",
        status: "In Progress",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Item field updated successfully");
      expect(parsed.updatedFields).toBe(1);

      // Verify the mutation was called with correct option ID
      const updateCall = vi.mocked(github.githubGraphQL).mock.calls[2];
      expect(updateCall[1]).toMatchObject({
        fieldId: "PVTSSF_status",
        value: { singleSelectOptionId: "opt2" },
      });
    });

    it("should update multiple human-readable fields at once", async () => {
      mockResolveProject();

      // Query project fields
      vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
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
      });

      // Two update mutations
      vi.mocked(github.githubGraphQL)
        .mockResolvedValueOnce({
          updateProjectV2ItemFieldValue: {
            projectV2Item: { id: "PVTI_item1" },
          },
        })
        .mockResolvedValueOnce({
          updateProjectV2ItemFieldValue: {
            projectV2Item: { id: "PVTI_item1" },
          },
        });

      const result = await github_projects({
        action: "update",
        owner: "testuser",
        projectNumber: 1,
        itemId: "PVTI_item1",
        status: "In Progress",
        priority: "P1",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.updatedFields).toBe(2);
      expect(github.githubGraphQL).toHaveBeenCalledTimes(4); // resolve + fields + 2 updates
    });

    it("should throw when itemId is missing", async () => {
      await expect(
        github_projects({
          action: "update",
          owner: "testuser",
          projectNumber: 1,
          fieldId: "PVTF_field1",
          fieldValue: "value",
        }),
      ).rejects.toThrow("itemId is required");
    });

    it("should throw when no value is provided with explicit fieldId", async () => {
      mockResolveProject();

      await expect(
        github_projects({
          action: "update",
          owner: "testuser",
          projectNumber: 1,
          itemId: "PVTI_item1",
          fieldId: "PVTF_field1",
        }),
      ).rejects.toThrow(
        "When fieldId is provided, either fieldValue, statusOptionId, or iterationId is required",
      );
    });
  });

  describe("delete action", () => {
    it("should delete a project item", async () => {
      mockResolveProject();

      vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
        deleteProjectV2Item: { deletedItemId: "PVTI_deleted" },
      });

      const result = await github_projects({
        action: "delete",
        owner: "testuser",
        projectNumber: 1,
        itemId: "PVTI_deleted",
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.message).toBe("Item deleted successfully");
      expect(parsed.deletedItemId).toBe("PVTI_deleted");
    });

    it("should throw when itemId is missing", async () => {
      await expect(
        github_projects({
          action: "delete",
          owner: "testuser",
          projectNumber: 1,
        }),
      ).rejects.toThrow("itemId is required for the delete action");
    });
  });

  describe("project resolution", () => {
    it("should fall back to organization lookup when user lookup fails", async () => {
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
              id: "PVT_org_project",
              owner: { login: "myorg", __typename: "Organization" },
            },
          },
        });

      mockListItems([], { login: "myorg", typename: "Organization" });

      const result = await github_projects({
        action: "list",
        owner: "myorg",
        projectNumber: 5,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.items).toEqual([]);
      expect(github.githubGraphQL).toHaveBeenCalledTimes(3);
    });

    it("should throw when project is not found in user or org", async () => {
      vi.mocked(github.githubGraphQL).mockRejectedValueOnce(
        new Error("User not found"),
      );

      await expect(
        github_projects({
          action: "list",
          owner: "nobody",
          projectNumber: 999,
        }),
      ).rejects.toThrow('Could not find project #999 under user "nobody"');
    });
  });

  describe("env var defaults", () => {
    it("should use GITHUB_OWNER from config when not in input", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: "env-owner",
        defaultOrg: undefined,
        defaultMergeMethod: "squash",
      });

      vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
        user: {
          projectV2: {
            id: "PVT_env_project",
            owner: { login: "env-owner", __typename: "User" },
          },
        },
      });

      mockListItems([], { login: "env-owner" });

      const result = await github_projects({
        action: "list",
        projectNumber: 1,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.items).toEqual([]);
    });

    it("should throw when owner is missing from both input and env", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: undefined,
        defaultOrg: undefined,
        defaultMergeMethod: "squash",
      });

      await expect(
        github_projects({ action: "list", projectNumber: 1 }),
      ).rejects.toThrow("No owner configured");
    });

    it("should try GITHUB_OWNER first, then fall back to GITHUB_ORG", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: "personal-user",
        defaultOrg: "my-org",
        defaultMergeMethod: "squash",
      });

      vi.mocked(github.githubGraphQL)
        // User lookup fails
        .mockRejectedValueOnce(new Error("User not found"))
        // Org lookup succeeds
        .mockResolvedValueOnce({
          organization: {
            projectV2: {
              id: "PVT_org_project",
              owner: { login: "my-org", __typename: "Organization" },
            },
          },
        });

      mockListItems([], { login: "my-org", typename: "Organization" });

      const result = await github_projects({
        action: "list",
        projectNumber: 1,
      });

      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.items).toEqual([]);

      // First call tries user (personal-user)
      expect(vi.mocked(github.githubGraphQL).mock.calls[0][1]).toEqual(
        expect.objectContaining({ login: "personal-user" }),
      );
      // Second call falls back to org (my-org)
      expect(vi.mocked(github.githubGraphQL).mock.calls[1][1]).toEqual(
        expect.objectContaining({ login: "my-org" }),
      );
    });

    it("should use GITHUB_OWNER when GITHUB_ORG is not set", async () => {
      vi.mocked(github.getGitHubConfig).mockReturnValue({
        defaultOwner: "personal-user",
        defaultOrg: undefined,
        defaultMergeMethod: "squash",
      });

      vi.mocked(github.githubGraphQL).mockResolvedValueOnce({
        user: {
          projectV2: {
            id: "PVT_personal_project",
            owner: { login: "personal-user", __typename: "User" },
          },
        },
      });

      mockListItems([], { login: "personal-user" });

      await github_projects({
        action: "list",
        projectNumber: 1,
      });

      expect(vi.mocked(github.githubGraphQL).mock.calls[0][1]).toEqual(
        expect.objectContaining({ login: "personal-user" }),
      );
    });
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
