import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { githubGraphQL, getGitHubConfig } from "#lib/github.js";
import {
  resolveProjectV2,
  updateProjectItemFields,
} from "#lib/github_utils.js";
import { logger } from "#lib/index.js";
import type { GitHubProjectsInput } from "./tool_schemas.js";

interface ProjectItem {
  id: string;
  type: string;
  fieldValues: Array<{ name: string; value: string }>;
  content: {
    title?: string;
    body?: string;
    assignees?: string[];
  };
}

interface ProjectMetadata {
  owner: string;
  ownerType: string;
  title: string;
  number: number;
}

async function listProjectItems(
  projectNodeId: string,
): Promise<{
  metadata: ProjectMetadata;
  items: ProjectItem[];
  truncated: boolean;
}> {
  const data = await githubGraphQL<{
    node: {
      title: string;
      number: number;
      owner: {
        login: string;
        __typename: string;
      };
      items: {
        pageInfo: { hasNextPage: boolean };
        nodes: Array<{
          id: string;
          type: string;
          fieldValues: {
            nodes: Array<{
              text?: string;
              name?: string;
              date?: string;
              field?: { name: string };
            }>;
          };
          content: {
            title?: string;
            body?: string;
            assignees?: { nodes: Array<{ login: string }> };
          } | null;
        }>;
      };
    };
  }>(
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          title
          number
          owner {
            ... on User {
              login
              __typename
            }
            ... on Organization {
              login
              __typename
            }
          }
          items(first: 100) {
            pageInfo { hasNextPage }
            nodes {
              id
              type
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
              content {
                ... on DraftIssue { title body }
                ... on Issue {
                  title
                  body
                  assignees(first: 10) { nodes { login } }
                }
                ... on PullRequest {
                  title
                  body
                  assignees(first: 10) { nodes { login } }
                }
              }
            }
          }
        }
      }
    }`,
    { projectId: projectNodeId },
  );

  const metadata: ProjectMetadata = {
    owner: data.node.owner.login,
    ownerType: data.node.owner.__typename,
    title: data.node.title,
    number: data.node.number,
  };

  const truncated = data.node.items.pageInfo.hasNextPage;

  const items = data.node.items.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    fieldValues: node.fieldValues.nodes
      .filter((fv) => fv.field?.name)
      .map((fv) => ({
        name: fv.field!.name,
        value: fv.text ?? fv.name ?? fv.date ?? "",
      })),
    content: {
      title: node.content?.title,
      body: node.content?.body,
      assignees: node.content?.assignees?.nodes?.map((a) => a.login),
    },
  }));

  return { metadata, items, truncated };
}

async function getProjectItem(
  projectNodeId: string,
  itemId: string,
): Promise<{ metadata: ProjectMetadata; item: ProjectItem | null }> {
  const data = await githubGraphQL<{
    project: {
      title: string;
      number: number;
      owner: {
        login: string;
        __typename: string;
      };
    };
    item: {
      id: string;
      type: string;
      fieldValues: {
        nodes: Array<{
          text?: string;
          name?: string;
          date?: string;
          field?: { name: string };
        }>;
      };
      content: {
        title?: string;
        body?: string;
        assignees?: { nodes: Array<{ login: string }> };
      } | null;
    } | null;
  }>(
    `query($projectId: ID!, $itemId: ID!) {
      project: node(id: $projectId) {
        ... on ProjectV2 {
          title
          number
          owner {
            ... on User { login __typename }
            ... on Organization { login __typename }
          }
        }
      }
      item: node(id: $itemId) {
        ... on ProjectV2Item {
          id
          type
          fieldValues(first: 20) {
            nodes {
              ... on ProjectV2ItemFieldTextValue {
                text
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldDateValue {
                date
                field { ... on ProjectV2FieldCommon { name } }
              }
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
            }
          }
          content {
            ... on DraftIssue { title body }
            ... on Issue {
              title
              body
              assignees(first: 10) { nodes { login } }
            }
            ... on PullRequest {
              title
              body
              assignees(first: 10) { nodes { login } }
            }
          }
        }
      }
    }`,
    { projectId: projectNodeId, itemId },
  );

  const metadata: ProjectMetadata = {
    owner: data.project.owner.login,
    ownerType: data.project.owner.__typename,
    title: data.project.title,
    number: data.project.number,
  };

  if (!data.item) {
    return { metadata, item: null };
  }

  const item: ProjectItem = {
    id: data.item.id,
    type: data.item.type,
    fieldValues: data.item.fieldValues.nodes
      .filter((fv) => fv.field?.name)
      .map((fv) => ({
        name: fv.field!.name,
        value: fv.text ?? fv.name ?? fv.date ?? "",
      })),
    content: {
      title: data.item.content?.title,
      body: data.item.content?.body,
      assignees: data.item.content?.assignees?.nodes?.map((a) => a.login),
    },
  };

  return { metadata, item };
}

async function createDraftIssue(
  projectNodeId: string,
  title: string,
  body?: string,
): Promise<{ id: string }> {
  const data = await githubGraphQL<{
    addProjectV2DraftIssue: { projectItem: { id: string } };
  }>(
    `mutation($projectId: ID!, $title: String!, $body: String) {
      addProjectV2DraftIssue(input: {
        projectId: $projectId
        title: $title
        body: $body
      }) {
        projectItem { id }
      }
    }`,
    { projectId: projectNodeId, title, body: body ?? "" },
  );

  return { id: data.addProjectV2DraftIssue.projectItem.id };
}

async function updateItemFieldDirect(
  projectNodeId: string,
  itemId: string,
  fieldId: string,
  value: Record<string, string>,
): Promise<{ id: string }> {
  const data = await githubGraphQL<{
    updateProjectV2ItemFieldValue: { projectV2Item: { id: string } };
  }>(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: $value
      }) {
        projectV2Item { id }
      }
    }`,
    { projectId: projectNodeId, itemId, fieldId, value },
  );

  return { id: data.updateProjectV2ItemFieldValue.projectV2Item.id };
}

async function deleteItem(
  projectNodeId: string,
  itemId: string,
): Promise<{ deletedItemId: string }> {
  const data = await githubGraphQL<{
    deleteProjectV2Item: { deletedItemId: string };
  }>(
    `mutation($projectId: ID!, $itemId: ID!) {
      deleteProjectV2Item(input: {
        projectId: $projectId
        itemId: $itemId
      }) {
        deletedItemId
      }
    }`,
    { projectId: projectNodeId, itemId },
  );

  return { deletedItemId: data.deleteProjectV2Item.deletedItemId };
}

export const github_projects = async (
  input: GitHubProjectsInput,
): Promise<CallToolResult> => {
  const { action, projectNumber } = input;
  const config = getGitHubConfig();
  const owner = input.owner || config.defaultOwner;
  if (!owner) {
    throw new Error(
      "No owner configured. Set the GITHUB_OWNER environment variable.",
    );
  }
  logger.debug(
    `github_projects: action=${action} owner=${owner} project=#${projectNumber}`,
  );

  if ((action === "get" || action === "delete") && !input.itemId) {
    throw new Error(`itemId is required for the ${action} action`);
  }
  if (action === "create" && !input.title) {
    throw new Error("title is required for the create action");
  }
  if (
    action === "update" &&
    (!input.itemId ||
      (!input.fieldId &&
        !input.statusOptionId &&
        !input.iterationId &&
        !input.fieldValue &&
        !input.status &&
        !input.iteration &&
        !input.priority))
  ) {
    throw new Error(
      "itemId is required, and either fieldId (for explicit updates) or status/iteration/priority/statusOptionId/iterationId/fieldValue (for auto-discovery) is required for the update action",
    );
  }

  const { projectNodeId } = await resolveProjectV2(owner, projectNumber);

  switch (action) {
    case "list": {
      const { metadata, items, truncated } =
        await listProjectItems(projectNodeId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                metadata,
                count: items.length,
                truncated,
                ...(truncated
                  ? {
                      note: "Results truncated. Not all project items are shown.",
                    }
                  : {}),
                items,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "get": {
      const { metadata, item } = await getProjectItem(
        projectNodeId,
        input.itemId!,
      );
      if (!item) {
        throw new Error(`Project item not found: ${input.itemId}`);
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ metadata, item }, null, 2),
          },
        ],
      };
    }

    case "create": {
      const created = await createDraftIssue(
        projectNodeId,
        input.title!,
        input.body,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: "Draft issue created successfully",
              itemId: created.id,
            }),
          },
        ],
      };
    }

    case "update": {
      if (!input.itemId) {
        throw new Error("itemId is required for the update action");
      }

      // Collect explicit fieldId updates
      const explicitUpdates: Array<{
        fieldId: string;
        value: Record<string, string>;
      }> = [];

      if (input.fieldId) {
        if (!input.statusOptionId && !input.iterationId && !input.fieldValue) {
          throw new Error(
            "When fieldId is provided, either fieldValue, statusOptionId, or iterationId is required",
          );
        }

        const value: Record<string, string> = {};
        if (input.statusOptionId) {
          value.singleSelectOptionId = input.statusOptionId;
        } else if (input.iterationId) {
          value.iterationId = input.iterationId;
        } else if (input.fieldValue) {
          value.text = input.fieldValue;
        }

        explicitUpdates.push({
          fieldId: input.fieldId,
          value,
        });
      }

      // Apply explicit updates
      for (const update of explicitUpdates) {
        await updateItemFieldDirect(
          projectNodeId,
          input.itemId,
          update.fieldId,
          update.value,
        );
      }

      // Delegate auto-discovery fields to shared util
      const fieldResult = await updateProjectItemFields(
        projectNodeId,
        input.itemId,
        {
          status: input.status,
          iteration: input.iteration,
          priority: input.priority,
        },
      );

      const totalUpdated =
        explicitUpdates.length + fieldResult.updated.length;

      if (totalUpdated === 0 && fieldResult.failed.length === 0) {
        throw new Error(
          "No updates provided. Supply status, iteration, priority, or fieldId with a value",
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message:
                fieldResult.failed.length > 0
                  ? "Item field update completed with some failures"
                  : "Item field updated successfully",
              itemId: input.itemId,
              updatedFields: totalUpdated,
              ...(fieldResult.updated.length > 0
                ? { fieldsUpdated: fieldResult.updated }
                : {}),
              ...(fieldResult.failed.length > 0
                ? { fieldsFailed: fieldResult.failed }
                : {}),
            }),
          },
        ],
      };
    }

    case "delete": {
      const deleted = await deleteItem(projectNodeId, input.itemId!);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              message: "Item deleted successfully",
              deletedItemId: deleted.deletedItemId,
            }),
          },
        ],
      };
    }

    default: {
      const exhaustiveCheck: never = action;
      throw new Error(`Unknown action: ${exhaustiveCheck}`);
    }
  }
};

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
