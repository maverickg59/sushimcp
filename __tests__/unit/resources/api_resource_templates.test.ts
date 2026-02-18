import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("#lib/api_client", () => ({
  searchLlmsTxtSources: vi.fn(),
  searchOpenapiSources: vi.fn(),
}));

// Mock ResourceTemplate to capture constructor args for testing callbacks
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  class MockResourceTemplate {
    uri: string;
    [key: string]: any;
    constructor(uri: string, options: any) {
      this.uri = uri;
      Object.assign(this, options);
    }
  }
  return { ResourceTemplate: MockResourceTemplate };
});

import {
  createLlmsTxtResourceTemplate,
  createOpenapiResourceTemplate,
} from "#resources/api_resource_templates";
import { searchLlmsTxtSources, searchOpenapiSources } from "#lib/api_client";

const mockSearchLlms = vi.mocked(searchLlmsTxtSources);
const mockSearchOpenapi = vi.mocked(searchOpenapiSources);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createLlmsTxtResourceTemplate", () => {
  it("should return bundle with template, metadata, and readCallback", () => {
    const bundle = createLlmsTxtResourceTemplate();
    expect(bundle.template).toBeDefined();
    expect(bundle.metadata).toBeDefined();
    expect(bundle.readCallback).toBeTypeOf("function");
  });

  it("should set correct metadata", () => {
    const bundle = createLlmsTxtResourceTemplate();
    expect(bundle.metadata.title).toBe("llms.txt Source");
    expect(bundle.metadata.mimeType).toBe("text/plain");
  });

  describe("complete.name callback", () => {
    it("should return empty array for empty partial", async () => {
      const bundle = createLlmsTxtResourceTemplate();
      const names = await (bundle.template as any).complete.name("");
      expect(names).toEqual([]);
      expect(mockSearchLlms).not.toHaveBeenCalled();
    });

    it("should return matching source names", async () => {
      mockSearchLlms.mockResolvedValue([
        { id: 1, name: "React" } as any,
        { id: 2, name: "Remix" } as any,
      ]);
      const bundle = createLlmsTxtResourceTemplate();
      const names = await (bundle.template as any).complete.name("re");
      expect(names).toEqual(["React", "Remix"]);
      expect(mockSearchLlms).toHaveBeenCalledWith("re");
    });
  });

  describe("readCallback", () => {
    it("should return not-found message when no source matches", async () => {
      mockSearchLlms.mockResolvedValue([]);
      const bundle = createLlmsTxtResourceTemplate();
      const uri = new URL("sushimcp://llms-txt/unknown");
      const result = await bundle.readCallback(uri, { name: "unknown" });
      expect(result.contents[0].text).toContain('No llms.txt source found for "unknown"');
      expect(result.contents[0].uri).toBe("sushimcp://llms-txt/unknown");
      expect(result.contents[0].mimeType).toBe("text/plain");
    });

    it("should return not-found when search returns results but no exact match", async () => {
      mockSearchLlms.mockResolvedValue([
        { id: 1, name: "ReactNative" } as any,
      ]);
      const bundle = createLlmsTxtResourceTemplate();
      const uri = new URL("sushimcp://llms-txt/React");
      const result = await bundle.readCallback(uri, { name: "React" });
      expect(result.contents[0].text).toContain('No llms.txt source found for "React"');
    });

    it("should match case-insensitively", async () => {
      mockSearchLlms.mockResolvedValue([
        {
          id: 1, name: "React",
          category: "Frontend",
          baseUrl: "https://react.dev",
        } as any,
      ]);
      const bundle = createLlmsTxtResourceTemplate();
      const uri = new URL("sushimcp://llms-txt/react");
      const result = await bundle.readCallback(uri, { name: "react" });
      expect(result.contents[0].text).toContain("Name: React");
    });

    it("should return full source details", async () => {
      mockSearchLlms.mockResolvedValue([
        {
          id: 1,
          name: "React",
          category: "Frontend",
          description: "React documentation",
          llmsTxtUrl: "https://react.dev/llms.txt",
          llmsFullTxtUrl: "https://react.dev/llms-full.txt",
          llmsMiniTxtUrl: null,
          baseUrl: "https://react.dev",
          siteUrl: "https://react.dev",
        } as any,
      ]);
      const bundle = createLlmsTxtResourceTemplate();
      const uri = new URL("sushimcp://llms-txt/React");
      const result = await bundle.readCallback(uri, { name: "React" });
      const text = result.contents[0].text;

      expect(text).toContain("Name: React");
      expect(text).toContain("Category: Frontend");
      expect(text).toContain("Description: React documentation");
      expect(text).toContain("llms.txt: https://react.dev/llms.txt");
      expect(text).toContain("llms-full.txt: https://react.dev/llms-full.txt");
      expect(text).not.toContain("llms-mini.txt");
      expect(text).toContain("Base URL: https://react.dev");
      expect(text).toContain("Site URL: https://react.dev");
    });

    it("should show 'Other' for null category", async () => {
      mockSearchLlms.mockResolvedValue([
        { id: 1, name: "Test", category: null, baseUrl: "https://test.dev" } as any,
      ]);
      const bundle = createLlmsTxtResourceTemplate();
      const uri = new URL("sushimcp://llms-txt/Test");
      const result = await bundle.readCallback(uri, { name: "Test" });
      expect(result.contents[0].text).toContain("Category: Other");
    });

    it("should omit null fields", async () => {
      mockSearchLlms.mockResolvedValue([
        {
          id: 1, name: "Minimal",
          category: "Test",
          description: null,
          llmsTxtUrl: null,
          llmsFullTxtUrl: null,
          llmsMiniTxtUrl: null,
          baseUrl: "https://minimal.dev",
          siteUrl: null,
        } as any,
      ]);
      const bundle = createLlmsTxtResourceTemplate();
      const uri = new URL("sushimcp://llms-txt/Minimal");
      const result = await bundle.readCallback(uri, { name: "Minimal" });
      const text = result.contents[0].text;

      expect(text).toContain("Name: Minimal");
      expect(text).not.toContain("Description:");
      expect(text).not.toContain("llms.txt:");
      expect(text).not.toContain("llms-full.txt:");
      expect(text).not.toContain("llms-mini.txt:");
      expect(text).not.toContain("Site URL:");
    });
  });
});

describe("createOpenapiResourceTemplate", () => {
  it("should return bundle with correct metadata", () => {
    const bundle = createOpenapiResourceTemplate();
    expect(bundle.metadata.title).toBe("OpenAPI Spec Source");
    expect(bundle.metadata.mimeType).toBe("text/plain");
  });

  describe("complete.name callback", () => {
    it("should return empty array for empty partial", async () => {
      const bundle = createOpenapiResourceTemplate();
      const names = await (bundle.template as any).complete.name("");
      expect(names).toEqual([]);
      expect(mockSearchOpenapi).not.toHaveBeenCalled();
    });

    it("should return matching source names", async () => {
      mockSearchOpenapi.mockResolvedValue([
        { id: 1, name: "Stripe" } as any,
      ]);
      const bundle = createOpenapiResourceTemplate();
      const names = await (bundle.template as any).complete.name("str");
      expect(names).toEqual(["Stripe"]);
    });
  });

  describe("readCallback", () => {
    it("should return not-found message when no source matches", async () => {
      mockSearchOpenapi.mockResolvedValue([]);
      const bundle = createOpenapiResourceTemplate();
      const uri = new URL("sushimcp://openapi/unknown");
      const result = await bundle.readCallback(uri, { name: "unknown" });
      expect(result.contents[0].text).toContain('No OpenAPI spec source found for "unknown"');
    });

    it("should return source details when found", async () => {
      mockSearchOpenapi.mockResolvedValue([
        {
          id: 1,
          name: "Stripe",
          url: "https://api.stripe.com/spec",
          description: "Stripe payment API",
        } as any,
      ]);
      const bundle = createOpenapiResourceTemplate();
      const uri = new URL("sushimcp://openapi/Stripe");
      const result = await bundle.readCallback(uri, { name: "Stripe" });
      const text = result.contents[0].text;

      expect(text).toContain("Name: Stripe");
      expect(text).toContain("URL: https://api.stripe.com/spec");
      expect(text).toContain("Description: Stripe payment API");
    });

    it("should omit description when null", async () => {
      mockSearchOpenapi.mockResolvedValue([
        { id: 1, name: "Test", url: "https://test.com/spec", description: null } as any,
      ]);
      const bundle = createOpenapiResourceTemplate();
      const uri = new URL("sushimcp://openapi/Test");
      const result = await bundle.readCallback(uri, { name: "Test" });
      expect(result.contents[0].text).not.toContain("Description:");
    });

    it("should match case-insensitively", async () => {
      mockSearchOpenapi.mockResolvedValue([
        { id: 1, name: "Stripe", url: "https://api.stripe.com/spec" } as any,
      ]);
      const bundle = createOpenapiResourceTemplate();
      const uri = new URL("sushimcp://openapi/stripe");
      const result = await bundle.readCallback(uri, { name: "stripe" });
      expect(result.contents[0].text).toContain("Name: Stripe");
    });
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
