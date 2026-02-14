import { describe, it, expect } from "vitest";
import { list_llms_txt_sources } from "#tools/list_llms_txt_sources";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerRequest,
  ServerNotification,
} from "@modelcontextprotocol/sdk/types.js";

describe("list_llms_txt_sources", () => {
  it("should format and return a list of llms.txt sources", async () => {
    const mockExtra = {} as RequestHandlerExtra<
      ServerRequest,
      ServerNotification
    >;
    const mockDocSources = {
      hono: "https://hono.dev/llms.txt",
      hono_full: "https://hono.dev/llms.txt",
      hono_mini: "https://hono.dev/llms.txt",
    };

    const result = await list_llms_txt_sources(mockExtra, mockDocSources);

    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    const content = result.content[0].text;
    expect(content).toContain("Available llms.txt sources:");
    expect(content).toContain("hono: https://hono.dev/llms.txt");
    expect(content).toContain("hono_full: https://hono.dev/llms.txt");
    expect(content).toContain("hono_mini: https://hono.dev/llms.txt");
  });

  it("should return No llms.txt sources configured", async () => {
    const mockExtra = {} as RequestHandlerExtra<
      ServerRequest,
      ServerNotification
    >;
    const result = await list_llms_txt_sources(mockExtra, {});
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0].text).toBe("No llms.txt sources configured.");
  });

  it("should correctly format llms.txt sources with special characters in names", async () => {
    const mockExtra = {} as RequestHandlerExtra<
      ServerRequest,
      ServerNotification
    >;
    const mockDocSources = {
      "h@no": "https://hono.dev/llms.txt",
      "hono-full": "https://hono.dev/llms.txt",
      "hono-mini": "https://hono.dev/llms.txt",
    };

    const result = await list_llms_txt_sources(mockExtra, mockDocSources);
    const content = result.content[0].text;
    expect(content).toContain("Available llms.txt sources:");
    expect(content).toContain("h@no: https://hono.dev/llms.txt");
    expect(content).toContain("hono-full: https://hono.dev/llms.txt");
    expect(content).toContain("hono-mini: https://hono.dev/llms.txt");
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
