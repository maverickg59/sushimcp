import { ResourceTemplate, ReadResourceTemplateCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchLlmsTxtSources, searchOpenapiSources } from "#lib/api_client.js";

interface ResourceTemplateBundle {
  template: ResourceTemplate;
  metadata: ResourceMetadata;
  readCallback: ReadResourceTemplateCallback;
}

export function createLlmsTxtResourceTemplate(): ResourceTemplateBundle {
  const template = new ResourceTemplate("sushimcp://llms-txt/{name}", {
    list: undefined,
    complete: {
      name: async (partial) => {
        if (!partial) return [];
        const results = await searchLlmsTxtSources(partial);
        return results.map((s) => s.name);
      },
    },
  });

  const metadata: ResourceMetadata = {
    title: "llms.txt Source",
    description:
      "Metadata for an llms.txt documentation source including available URLs, description, and category.",
    mimeType: "text/plain",
  };

  const readCallback: ReadResourceTemplateCallback = async (_uri, variables) => {
    const name = variables.name as string;
    const results = await searchLlmsTxtSources(name);
    const source = results.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );

    if (!source) {
      return {
        contents: [
          {
            uri: _uri.href,
            text: `No llms.txt source found for "${name}".`,
            mimeType: "text/plain",
          },
        ],
      };
    }

    const lines: string[] = [
      `Name: ${source.name}`,
      `Category: ${source.category ?? "Other"}`,
    ];
    if (source.description) lines.push(`Description: ${source.description}`);
    if (source.llmsTxtUrl) lines.push(`llms.txt: ${source.llmsTxtUrl}`);
    if (source.llmsFullTxtUrl) lines.push(`llms-full.txt: ${source.llmsFullTxtUrl}`);
    if (source.llmsMiniTxtUrl) lines.push(`llms-mini.txt: ${source.llmsMiniTxtUrl}`);
    if (source.baseUrl) lines.push(`Base URL: ${source.baseUrl}`);
    if (source.siteUrl) lines.push(`Site URL: ${source.siteUrl}`);

    return {
      contents: [
        {
          uri: _uri.href,
          text: lines.join("\n"),
          mimeType: "text/plain",
        },
      ],
    };
  };

  return { template, metadata, readCallback };
}

export function createOpenapiResourceTemplate(): ResourceTemplateBundle {
  const template = new ResourceTemplate("sushimcp://openapi/{name}", {
    list: undefined,
    complete: {
      name: async (partial) => {
        if (!partial) return [];
        const results = await searchOpenapiSources(partial);
        return results.map((s) => s.name);
      },
    },
  });

  const metadata: ResourceMetadata = {
    title: "OpenAPI Spec Source",
    description:
      "Metadata for an OpenAPI specification source including the spec URL and description.",
    mimeType: "text/plain",
  };

  const readCallback: ReadResourceTemplateCallback = async (_uri, variables) => {
    const name = variables.name as string;
    const results = await searchOpenapiSources(name);
    const source = results.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );

    if (!source) {
      return {
        contents: [
          {
            uri: _uri.href,
            text: `No OpenAPI spec source found for "${name}".`,
            mimeType: "text/plain",
          },
        ],
      };
    }

    const lines: string[] = [
      `Name: ${source.name}`,
      `URL: ${source.url}`,
    ];
    if (source.description) lines.push(`Description: ${source.description}`);

    return {
      contents: [
        {
          uri: _uri.href,
          text: lines.join("\n"),
          mimeType: "text/plain",
        },
      ],
    };
  };

  return { template, metadata, readCallback };
}

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
