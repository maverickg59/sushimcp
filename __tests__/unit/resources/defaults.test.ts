import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import { processDefaultsResources } from "../../../src/resources/defaults";

// Mock modules
vi.mock("fs");
vi.mock("path");
vi.mock("url");

describe("Defaults Resources Module", () => {
  // Setup mocks
  beforeEach(() => {
    // Mock url.fileURLToPath
    vi.mocked(url.fileURLToPath).mockReturnValue("/mock/path/resources");
    
    // Mock path.dirname
    vi.mocked(path.dirname).mockReturnValue("/mock/path");
    
    // Mock path.join
    vi.mocked(path.join).mockImplementation((...paths) => paths.join("/"));
    
    // Mock fs.readFileSync
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      "typescript_docs": "https://example.com/typescript/llms.txt",
      "react_docs": "https://example.com/react/llms.txt",
      "nodejs_docs": "https://example.com/nodejs/llms.txt"
    }));
    
    // Mock fetch
    global.fetch = vi.fn().mockImplementation(async (url) => {
      return {
        text: async () => `Mock content for ${url}`
      };
    });
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  it("should process defaults resources correctly", () => {
    const resources = processDefaultsResources();
    
    // Should have the expected number of resources
    expect(resources).toHaveLength(3);
    
    // Verify the first resource has expected properties
    const typescriptResource = resources.find(r => r.id === "typescript_docs");
    expect(typescriptResource).toBeDefined();
    expect(typescriptResource?.name).toBe("Typescript  Docs");
    expect(typescriptResource?.description).toBe("Typescript docs llms.txt");
    expect(typescriptResource?.mimetype).toBe("text/plain");
    expect(typescriptResource?.uri).toBe("https://example.com/typescript/llms.txt");
    
    // Verify that handler function exists
    expect(typescriptResource?.handler).toBeInstanceOf(Function);
  });
  
  it("should transform resource name correctly", () => {
    const resources = processDefaultsResources();
    
    // Check that names are correctly transformed
    const reactResource = resources.find(r => r.id === "react_docs");
    expect(reactResource?.name).toBe("React  Docs");
    
    const nodejsResource = resources.find(r => r.id === "nodejs_docs");
    expect(nodejsResource?.name).toBe("Nodejs  Docs");
  });
  
  it("should handle resource handler calls correctly", async () => {
    const resources = processDefaultsResources();
    const typescriptResource = resources.find(r => r.id === "typescript_docs");
    
    // Call the handler with a mock URL
    const mockUrl = new URL("https://example.com/typescript/llms.txt");
    const result = await typescriptResource?.handler(mockUrl);
    
    // Verify handler result structure
    expect(result).toBeDefined();
    if (result) {
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("https://example.com/typescript/llms.txt");
      expect(result.contents[0].text).toBe("Mock content for https://example.com/typescript/llms.txt");
    }
  });
  
  it("should handle fetch errors in handler", async () => {
    // Modify fetch mock to throw an error
    global.fetch = vi.fn().mockImplementation(async () => {
      throw new Error("Network error");
    });
    
    const resources = processDefaultsResources();
    const typescriptResource = resources.find(r => r.id === "typescript_docs");
    
    // Call the handler with a mock URL
    const mockUrl = new URL("https://example.com/typescript/llms.txt");
    
    // Should catch and propagate the error
    await expect(typescriptResource?.handler(mockUrl)).rejects.toThrow("Network error");
  });
  
  it("should handle file system errors", () => {
    // Modify fs.readFileSync to throw an error
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error("File not found");
    });
    
    // Should throw an error when the defaults file is not found
    expect(() => processDefaultsResources()).toThrow("File not found");
  });
  
  it("should handle JSON parsing errors", () => {
    // Modify fs.readFileSync to return invalid JSON
    vi.mocked(fs.readFileSync).mockReturnValue("{ invalid json");
    
    // Should throw an error when the JSON is invalid
    expect(() => processDefaultsResources()).toThrow();
  });
  
  it("should handle empty resources", () => {
    // Modify fs.readFileSync to return empty object
    vi.mocked(fs.readFileSync).mockReturnValue("{}");
    
    const resources = processDefaultsResources();
    
    // Should return empty array
    expect(resources).toHaveLength(0);
  });
  
  it("should handle complex resource names with multiple words", () => {
    // Setup more complex resource names
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      "complex_resource_name_with_multiple_words": "https://example.com/complex/llms.txt",
      "hyphenated_resource_name": "https://example.com/hyphenated/llms.txt"
    }));
    
    const resources = processDefaultsResources();
    
    // Check the complex resource name transformation
    const complexResource = resources.find(r => r.id === "complex_resource_name_with_multiple_words");
    expect(complexResource?.name).toBe("Complex Resource Name With Multiple Words");
    expect(complexResource?.description).toBe("Complex resource name with multiple words llms.txt");
    
    const hyphenatedResource = resources.find(r => r.id === "hyphenated_resource_name");
    expect(hyphenatedResource?.name).toBe("Hyphenated Resource Name");
    expect(hyphenatedResource?.description).toBe("Hyphenated resource name llms.txt");
  });
});
