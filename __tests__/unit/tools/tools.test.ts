import { describe, it, expect, vi } from "vitest";
import { list_llms_txt_sources } from "#tools/list_llms_txt_sources";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";

describe("list_llms_txt_sources", () => {
  it("should format and return a list of document sources", async () => {
    const mockExtra = {} as RequestHandlerExtra<
      ServerRequest,
      ServerNotification
    >;
    const mockDocSources = {
      typescript: "https://example.com/typescript/llms.txt",
      react: "https://example.com/react/llms.txt",
      nodejs: "https://example.com/nodejs/llms.txt",
    };

    const result = await list_llms_txt_sources(mockExtra, mockDocSources);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    const content = result.content[0].text;
    expect(content).toContain("Available llms.txt sources:");
    expect(content).toContain(
      "typescript: https://example.com/typescript/llms.txt"
    );
    expect(content).toContain("react: https://example.com/react/llms.txt");
    expect(content).toContain("nodejs: https://example.com/nodejs/llms.txt");
  });

  it("should handle empty document sources", async () => {
    const mockExtra = {} as RequestHandlerExtra<
      ServerRequest,
      ServerNotification
    >;
    const result = await list_llms_txt_sources(mockExtra, {});
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    const content = result.content[0].text;
    expect(content).toBe("No llms.txt sources configured.");
  });

  it("should correctly format multiple document sources with special characters", async () => {
    const mockExtra = {} as RequestHandlerExtra<
      ServerRequest,
      ServerNotification
    >;
    const mockDocSources = {
      "next.js": "https://example.com/next.js/llms.txt",
      "vue@3": "https://example.com/vue/llms-v3.txt",
      angular_12: "https://example.com/angular/llms_12.txt",
    };

    const result = await list_llms_txt_sources(mockExtra, mockDocSources);
    const content = result.content[0].text;
    expect(content).toContain("Available llms.txt sources:");
    expect(content).toContain("next.js: https://example.com/next.js/llms.txt");
    expect(content).toContain("vue@3: https://example.com/vue/llms-v3.txt");
    expect(content).toContain(
      "angular_12: https://example.com/angular/llms_12.txt"
    );
  });
});

// Copyright (C) 2025 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
