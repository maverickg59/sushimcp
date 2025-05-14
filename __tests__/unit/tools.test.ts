import { describe, it, expect, vi } from "vitest";
import { list_llms_txt_sources } from "../../src/tools/list_llms_txt_sources.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerRequest,
  ServerNotification
} from "@modelcontextprotocol/sdk/types.js";

describe("list_llms_txt_sources", () => {
  it("should format and return a list of document sources", async () => {
    // Create a mock for the RequestHandlerExtra
    // Using a minimal mock as the function doesn't use any properties
    const mockExtra = {} as RequestHandlerExtra<ServerRequest, ServerNotification>;

    // Create a mock docSources object
    const mockDocSources = {
      "typescript": "https://example.com/typescript/llms.txt",
      "react": "https://example.com/react/llms.txt",
      "nodejs": "https://example.com/nodejs/llms.txt"
    };

    // Call the function with our mocks
    const result = await list_llms_txt_sources(mockExtra, mockDocSources);

    // Verify the result structure
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    
    // Verify the text content
    const content = result.content[0].text;
    expect(content).toContain("Available documentation sources:");
    expect(content).toContain("typescript: https://example.com/typescript/llms.txt");
    expect(content).toContain("react: https://example.com/react/llms.txt");
    expect(content).toContain("nodejs: https://example.com/nodejs/llms.txt");
  });

  it("should handle empty document sources", async () => {
    // Create a mock for the RequestHandlerExtra
    // Using a minimal mock as the function doesn't use any properties
    const mockExtra = {} as RequestHandlerExtra<ServerRequest, ServerNotification>;

    // Call the function with empty docSources
    const result = await list_llms_txt_sources(mockExtra, {});

    // Verify the result structure
    expect(result).toHaveProperty("content");
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    
    // Verify the text content - should just be the header with no sources
    const content = result.content[0].text;
    expect(content).toBe("Available documentation sources:");
  });

  it("should correctly format multiple document sources with special characters", async () => {
    // Create a mock for the RequestHandlerExtra
    // Using a minimal mock as the function doesn't use any properties
    const mockExtra = {} as RequestHandlerExtra<ServerRequest, ServerNotification>;

    // Create a mock docSources with special characters
    const mockDocSources = {
      "next.js": "https://example.com/next.js/llms.txt",
      "vue@3": "https://example.com/vue/llms-v3.txt",
      "angular_12": "https://example.com/angular/llms_12.txt"
    };

    // Call the function with our mocks
    const result = await list_llms_txt_sources(mockExtra, mockDocSources);

    // Verify the text content format
    const content = result.content[0].text;
    expect(content).toContain("Available documentation sources:");
    expect(content).toContain("next.js: https://example.com/next.js/llms.txt");
    expect(content).toContain("vue@3: https://example.com/vue/llms-v3.txt");
    expect(content).toContain("angular_12: https://example.com/angular/llms_12.txt");
  });
});
