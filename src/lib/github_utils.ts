import { githubGraphQL, getGitHubConfig } from "./github.js";
import { logger } from "./logger.js";

export interface ProjectResolution {
  projectNodeId: string;
  ownerLogin: string;
  ownerType: string;
}

export interface FieldUpdateResult {
  updated: string[];
  failed: Array<{ field: string; reason: string }>;
}

/**
 * Resolve a GitHub ProjectV2 node ID by trying the owner as a user first,
 * then falling back to the configured org.
 */
export async function resolveProjectV2(
  owner: string,
  projectNumber: number,
): Promise<ProjectResolution> {
  const config = getGitHubConfig();

  // Try 1: Look for project under owner (as user)
  try {
    const userResult = await githubGraphQL<{
      user: {
        projectV2: {
          id: string;
          owner: { login: string; __typename: string };
        };
      } | null;
    }>(
      `query($login: String!, $number: Int!) {
        user(login: $login) {
          projectV2(number: $number) {
            id
            owner {
              ... on User { login __typename }
              ... on Organization { login __typename }
            }
          }
        }
      }`,
      { login: owner, number: projectNumber },
    );

    if (userResult?.user?.projectV2?.id) {
      return {
        projectNodeId: userResult.user.projectV2.id,
        ownerLogin: userResult.user.projectV2.owner.login,
        ownerType: userResult.user.projectV2.owner.__typename,
      };
    }
  } catch {
    logger.debug(
      `Project #${projectNumber} not found under user "${owner}", trying org...`,
    );
  }

  // Try 2: Look for project under GITHUB_ORG (as organization)
  if (config.defaultOrg) {
    try {
      const orgResult = await githubGraphQL<{
        organization: {
          projectV2: {
            id: string;
            owner: { login: string; __typename: string };
          };
        } | null;
      }>(
        `query($login: String!, $number: Int!) {
          organization(login: $login) {
            projectV2(number: $number) {
              id
              owner {
                ... on User { login __typename }
                ... on Organization { login __typename }
              }
            }
          }
        }`,
        { login: config.defaultOrg, number: projectNumber },
      );

      if (orgResult?.organization?.projectV2?.id) {
        return {
          projectNodeId: orgResult.organization.projectV2.id,
          ownerLogin: orgResult.organization.projectV2.owner.login,
          ownerType: orgResult.organization.projectV2.owner.__typename,
        };
      }
    } catch {
      logger.debug(
        `Project #${projectNumber} not found under org "${config.defaultOrg}"`,
      );
    }
  }

  const tried = config.defaultOrg
    ? `user "${owner}" or org "${config.defaultOrg}"`
    : `user "${owner}"`;
  throw new Error(
    `Could not find project #${projectNumber} under ${tried}`,
  );
}

/**
 * Update project item fields (status, iteration, priority) with case-insensitive
 * matching. Returns which fields were updated and which failed (with reasons
 * including available options for self-correction).
 */
export async function updateProjectItemFields(
  projectNodeId: string,
  itemId: string,
  fields: { status?: string; iteration?: string; priority?: string },
): Promise<FieldUpdateResult> {
  const updated: string[] = [];
  const failed: Array<{ field: string; reason: string }> = [];

  if (!fields.status && !fields.iteration && !fields.priority) {
    return { updated, failed };
  }

  // Query project fields to get field IDs and options
  const fieldsData = await githubGraphQL<{
    node: {
      fields: {
        nodes: Array<
          | {
              id: string;
              name: string;
              options?: Array<{ id: string; name: string }>;
            }
          | {
              id: string;
              name: string;
              configuration?: {
                iterations: Array<{
                  id: string;
                  title: string;
                  startDate: string;
                }>;
              };
            }
        >;
      };
    };
  }>(
    `query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          fields(first: 20) {
            nodes {
              ... on ProjectV2Field { id name }
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
              ... on ProjectV2IterationField {
                id
                name
                configuration {
                  iterations { id title startDate }
                }
              }
            }
          }
        }
      }
    }`,
    { projectId: projectNodeId },
  );

  // Handle status
  if (fields.status) {
    const statusField = fieldsData.node.fields.nodes.find(
      (f) =>
        f.name.toLowerCase() === "status" &&
        "options" in f &&
        f.options !== undefined,
    ) as
      | {
          id: string;
          name: string;
          options: Array<{ id: string; name: string }>;
        }
      | undefined;

    if (!statusField) {
      failed.push({ field: "status", reason: "No Status field found on this project" });
    } else {
      const statusOption = statusField.options.find(
        (opt) => opt.name.toLowerCase() === fields.status!.toLowerCase(),
      );
      if (!statusOption) {
        const available = statusField.options.map((o) => o.name).join(", ");
        failed.push({
          field: "status",
          reason: `Value "${fields.status}" not found. Available options: ${available}`,
        });
      } else {
        await githubGraphQL(
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
          {
            projectId: projectNodeId,
            itemId,
            fieldId: statusField.id,
            value: { singleSelectOptionId: statusOption.id },
          },
        );
        updated.push("status");
      }
    }
  }

  // Handle iteration
  if (fields.iteration) {
    const iterationField = fieldsData.node.fields.nodes.find(
      (f) =>
        f.name.toLowerCase() === "iteration" &&
        "configuration" in f &&
        f.configuration !== undefined,
    ) as
      | {
          id: string;
          name: string;
          configuration: {
            iterations: Array<{
              id: string;
              title: string;
              startDate: string;
            }>;
          };
        }
      | undefined;

    if (!iterationField) {
      failed.push({
        field: "iteration",
        reason: "No Iteration field found on this project",
      });
    } else {
      let iteration;
      if (fields.iteration.toLowerCase() === "current") {
        const today = new Date().toISOString().split("T")[0];
        const sortedIterations = iterationField.configuration.iterations
          .slice()
          .sort((a, b) => b.startDate.localeCompare(a.startDate));
        iteration = sortedIterations.find((i) => i.startDate <= today);
        if (!iteration) {
          const available = iterationField.configuration.iterations
            .map((i) => i.title)
            .join(", ");
          failed.push({
            field: "iteration",
            reason: `No current iteration found. Available iterations: ${available}`,
          });
        }
      } else {
        iteration = iterationField.configuration.iterations.find(
          (i) => i.title.toLowerCase() === fields.iteration!.toLowerCase(),
        );
        if (!iteration) {
          const available = iterationField.configuration.iterations
            .map((i) => i.title)
            .join(", ");
          failed.push({
            field: "iteration",
            reason: `Value "${fields.iteration}" not found. Available iterations: ${available}`,
          });
        }
      }

      if (iteration) {
        await githubGraphQL(
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
          {
            projectId: projectNodeId,
            itemId,
            fieldId: iterationField.id,
            value: { iterationId: iteration.id },
          },
        );
        updated.push("iteration");
      }
    }
  }

  // Handle priority
  if (fields.priority) {
    const priorityField = fieldsData.node.fields.nodes.find(
      (f) =>
        f.name.toLowerCase() === "priority" &&
        "options" in f &&
        f.options !== undefined,
    ) as
      | {
          id: string;
          name: string;
          options: Array<{ id: string; name: string }>;
        }
      | undefined;

    if (!priorityField) {
      failed.push({
        field: "priority",
        reason: "No Priority field found on this project",
      });
    } else {
      const priorityOption = priorityField.options.find(
        (opt) => opt.name.toLowerCase() === fields.priority!.toLowerCase(),
      );
      if (!priorityOption) {
        const available = priorityField.options.map((o) => o.name).join(", ");
        failed.push({
          field: "priority",
          reason: `Value "${fields.priority}" not found. Available options: ${available}`,
        });
      } else {
        await githubGraphQL(
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
          {
            projectId: projectNodeId,
            itemId,
            fieldId: priorityField.id,
            value: { singleSelectOptionId: priorityOption.id },
          },
        );
        updated.push("priority");
      }
    }
  }

  return { updated, failed };
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
