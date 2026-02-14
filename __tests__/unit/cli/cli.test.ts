import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import * as utils from "#lib/utils";
import * as cliLib from "#lib/cli_lib";
import { consoleErrorSpy, mockPathResolution } from "../../test-utils.js";

// Mock dependencies but not the module itself
vi.mock("node:fs");
vi.mock("node:path");
vi.mock("node:url");
vi.mock("commander");
vi.mock("#lib/utils");
vi.mock("#lib/cli_lib");

// Now import the actual module
import { parseCliArgs } from "#lib/cli";

// Setup mocks
mockPathResolution(path);

describe("CLI Module", () => {
  // Commander mocks
  const mockOptionFn = vi.fn().mockReturnThis();
  const mockNameFn = vi.fn().mockReturnThis();
  const mockDescriptionFn = vi.fn().mockReturnThis();
  const mockVersionFn = vi.fn().mockReturnThis();
  const mockParseFn = vi.fn().mockReturnThis();
  const mockOptsFn = vi.fn();

  // Store original environment
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks();
    process.env = { ...originalEnv };

    // Setup common Commander mocks with method chaining
    vi.mocked(Command).mockImplementation(function () {
      const mockCommand = {
        name: mockNameFn,
        description: mockDescriptionFn,
        version: mockVersionFn,
        option: mockOptionFn,
        parse: mockParseFn,
        opts: mockOptsFn,
      };

      // Ensure all these methods return the same object to allow chaining
      mockNameFn.mockReturnValue(mockCommand);
      mockDescriptionFn.mockReturnValue(mockCommand);
      mockVersionFn.mockReturnValue(mockCommand);
      mockOptionFn.mockReturnValue(mockCommand);
      mockParseFn.mockReturnValue(mockCommand);

      return mockCommand as unknown as Command;
    });

    // Mock path and file URLs
    vi.mocked(path.resolve).mockImplementation((...parts) => parts.join("/"));
    vi.mocked(path.dirname).mockReturnValue("/mock/dir");
    vi.mocked(fileURLToPath).mockReturnValue("/mock/file");

    // Mock utils.getVersion
    vi.mocked(utils.getVersion).mockReturnValue("1.0.0");

    // Mock CLI lib functions
    vi.mocked(cliLib.parseNameValuePair).mockImplementation((input) => {
      if (input.includes(":")) {
        const [name, value] = input.split(":", 2);
        return { name, urlValue: value };
      }
      return null;
    });

    vi.mocked(cliLib.addParsedSourceToTarget).mockImplementation(
      (parsed, target, flag) => {
        target[parsed.name] = parsed.urlValue;
      },
    );

    vi.mocked(cliLib.normalizeAndAddDomain).mockImplementation(
      (domain, set, flag) => {
        set.add(domain);
      },
    );

    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe("parseCliArgs", () => {
    it("should parse CLI arguments correctly with defaults", () => {
      // Setup Commander opts mock to return empty options
      mockOptsFn.mockReturnValue({
        defaults: true,
        url: [],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: [],
        allowDomains: undefined,
      });

      // Mock fs.readFileSync to simulate defaults file
      vi.mocked(fs.readFileSync).mockReturnValue(
        "- typescript:https://example.com/typescript/llms.txt\n" +
          "- javascript:https://example.com/javascript/llms.txt",
      );

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // Verify command setup
      expect(mockNameFn).toHaveBeenCalledWith("SushiMCP");
      // Version is called but parameter might vary, so just check it was called
      expect(mockVersionFn).toHaveBeenCalled();
      expect(mockParseFn).toHaveBeenCalledWith(process.argv);

      // Assert that the function returns a CliConfig object
      expect(config).toBeDefined();
      expect(config).toHaveProperty("docSources");
      expect(config).toHaveProperty("allowedDomains");
      expect(config).toHaveProperty("openApiSpecs");

      // Verify that fs.readFileSync was called to load defaults
      expect(fs.readFileSync).toHaveBeenCalled();
    });

    it("should parse CLI arguments with no defaults", () => {
      // Setup Commander opts mock to return no-defaults option
      mockOptsFn.mockReturnValue({
        defaults: false,
        url: ["react:https://example.com/react"],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: ["example.com"],
        allowDomains: undefined,
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // Assert that the function returns a CliConfig object
      expect(config).toBeDefined();
      expect(config).toHaveProperty("docSources");
      expect(config).toHaveProperty("allowedDomains");
      expect(config).toHaveProperty("openApiSpecs");

      // Verify that defaults file was not loaded when noDefaults is true
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it("should handle URL options correctly", () => {
      // Setup Commander opts mock with multiple URL options
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: ["react:https://example.com/react", "vue:https://example.com/vue"],
        urls: "angular:https://example.com/angular node:https://example.com/node",
        openApiSpec: ["petstore:https://example.com/petstore.json"],
        openApiSpecs: undefined,
        allowDomain: [],
        allowDomains: undefined,
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // We expect parseNameValuePair to be called for each URL option
      expect(cliLib.parseNameValuePair).toHaveBeenCalled();
    });

    it("should infer domains from sources when no domains specified", () => {
      // Setup Commander opts mock with no domain options
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: ["react:https://example.com/react"],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: [],
        allowDomains: undefined,
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // We expect domains to be inferred from sources
      expect(config.allowedDomains).toBeDefined();
    });

    it("should process domain options correctly", () => {
      // Setup Commander opts mock with domain options
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: [],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: ["example.com", "api.example.org"],
        allowDomains: "docs.example.net cdn.example.com",
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // We expect normalizeAndAddDomain to be called for each domain
      expect(cliLib.normalizeAndAddDomain).toHaveBeenCalled();
    });

    it("should handle allow-domain options correctly", () => {
      // Setup Commander opts mock with allow-domain options
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: ["react:https://react.dev"],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: ["example.com"],
        allowDomains: "docs.example.net cdn.example.com",
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // We expect logConfigSummary to be called
      expect(cliLib.logConfigSummary).toHaveBeenCalled();
    });

    it("should handle deny-domain options correctly", () => {
      // Setup Commander opts mock with deny-domain options
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: ["react:https://react.dev"],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: [],
        allowDomains: undefined,
        denyDomain: ["example.com", "test.org"],
        denyDomains: undefined,
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // Verify deny domains were processed
      expect(config.allowedDomains).toBeDefined();
      expect(Array.from(config.allowedDomains)).not.toContain("example.com");
      expect(Array.from(config.allowedDomains)).not.toContain("test.org");
    });

    it("should handle deny-domains option with space-separated values", () => {
      // Setup Commander opts mock with deny-domains option
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: ["vue:https://vuejs.org"],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: [],
        allowDomains: undefined,
        denyDomain: [],
        denyDomains: "example.com test.org",
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // Verify deny domains were processed
      expect(config.allowedDomains).toBeDefined();
      expect(Array.from(config.allowedDomains)).not.toContain("example.com");
      expect(Array.from(config.allowedDomains)).not.toContain("test.org");
    });

    it("should handle deny-domain=* to deny all domains", () => {
      // Setup Commander opts mock with deny-domain=*
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: ["react:https://react.dev"],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: [],
        allowDomains: undefined,
        denyDomain: ["*"],
        denyDomains: undefined,
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // Verify all domains are denied
      expect(config.allowedDomains).toBeDefined();
      expect(config.allowedDomains.size).toBe(0);
    });

    it("should handle both allow and deny domain options together", () => {
      // Setup Commander opts mock with both allow and deny domain options
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: ["react:https://react.dev"],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: ["react.dev"],
        allowDomains: undefined,
        denyDomain: ["example.com"],
        denyDomains: undefined,
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // Verify domains were processed correctly
      expect(Array.from(config.allowedDomains)).toContain("react.dev");
      expect(Array.from(config.allowedDomains)).not.toContain("example.com");
    });

    it("should return a config object with expected properties", () => {
      // Setup Commander opts mock with sources
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: ["typescript:https://example.com/typescript/llms.txt"],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: ["example.com"],
        allowDomains: undefined,
      });

      // Call the function
      const config = parseCliArgs();

      // Verify the config has the expected structure
      expect(config).toHaveProperty("docSources");
      expect(config).toHaveProperty("allowedDomains");
      expect(config).toHaveProperty("openApiSpecs");
    });

    it("should handle multiple sources from CLI arguments", () => {
      // Setup Commander opts mock with multiple sources
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: [
          "node:https://example.com/node/llms.txt",
          "vue:https://example.com/vue/llms.txt",
        ],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: ["example.com"],
        allowDomains: undefined,
      });

      // Call the function
      const config = parseCliArgs();

      // Verify the config structure
      expect(config).toHaveProperty("docSources");
      expect(config).toHaveProperty("allowedDomains");
    });

    it("should handle OpenAPI specs", () => {
      // Setup Commander opts mock with OpenAPI specs
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: [],
        urls: undefined,
        openApiSpec: [
          "petstore:https://example.com/swagger/petstore.json",
          "users:https://example.com/swagger/users.json",
        ],
        openApiSpecs: undefined,
        allowDomain: ["example.com"],
        allowDomains: undefined,
      });

      // Call the function
      const config = parseCliArgs();

      // Verify the config contains OpenAPI specs property
      expect(config).toHaveProperty("openApiSpecs");
      expect(typeof config.openApiSpecs).toBe("object");
    });
  });

  describe("Source Loading", () => {
    it("should load only default sources when no arguments provided", () => {
      mockOptsFn.mockReturnValue({
        defaults: true,
        url: [],
        urls: undefined,
        llmsTxtSource: [],
        llmsTxtSources: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: [],
        allowDomains: undefined,
      });

      // Mock defaults file
      vi.mocked(fs.readFileSync).mockReturnValue(
        "- typescript:https://example.com/typescript/llms.txt\n" +
          "- javascript:https://example.com/javascript/llms.txt",
      );

      const config = parseCliArgs();

      expect(config.docSources).toHaveProperty("typescript");
      expect(config.docSources).toHaveProperty("javascript");
      expect(Object.keys(config.docSources)).toHaveLength(2);
    });

    it("should load no sources with --no-defaults and no sources specified", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        url: [],
        urls: undefined,
        llmsTxtSource: [],
        llmsTxtSources: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: [],
        allowDomains: undefined,
      });

      const config = parseCliArgs();
      expect(Object.keys(config.docSources)).toHaveLength(0);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });

  describe("LLMS Text Sources", () => {
    it("should handle --llms-txt-source with single source", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        llmsTxtSource: ["react:https://react.dev/docs/llms.txt"],
        llmsTxtSources: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
      });

      const config = parseCliArgs();
      expect(config.docSources).toHaveProperty("react");
      // The mock parseNameValuePair returns the first part after splitting by ':' as the URL
      expect(config.docSources.react).toBe("https");
    });

    it("should handle multiple --llms-txt-source flags", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        llmsTxtSource: [
          "react:https://react.dev/docs/llms.txt",
          "vue:https://vuejs.org/docs/llms.txt",
        ],
        llmsTxtSources: undefined,
      });

      const config = parseCliArgs();
      expect(config.docSources).toHaveProperty("react");
      expect(config.docSources).toHaveProperty("vue");
      expect(Object.keys(config.docSources)).toHaveLength(2);
    });

    it("should handle --llms-txt-sources with multiple sources", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        llmsTxtSource: [],
        llmsTxtSources:
          "react:https://react.dev/docs/llms.txt vue:https://vuejs.org/docs/llms.txt",
      });

      const config = parseCliArgs();
      expect(config.docSources).toHaveProperty("react");
      expect(config.docSources).toHaveProperty("vue");
      expect(Object.keys(config.docSources)).toHaveLength(2);
    });
  });

  describe("OpenAPI Spec Sources", () => {
    it("should handle --openapi-spec-source with single source", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        openapiSpecSource: ["petstore:https://example.com/petstore.json"],
        openapiSpecSources: undefined,
      });

      // Mock the parseNameValuePair to return the expected format
      vi.mocked(cliLib.parseNameValuePair).mockImplementation((input) => {
        const [name, ...rest] = input.split(":");
        return { name, urlValue: rest.join(":") };
      });

      const config = parseCliArgs();
      expect(config.openApiSpecs).toHaveProperty("petstore");
      expect(config.openApiSpecs.petstore).toBe(
        "https://example.com/petstore.json",
      );
    });

    it("should handle multiple --openapi-spec-source flags", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        openapiSpecSource: [
          "petstore:https://example.com/petstore.json",
          "users:https://example.com/users.json",
        ],
        openapiSpecSources: undefined,
      });

      // Mock the parseNameValuePair to return the expected format
      vi.mocked(cliLib.parseNameValuePair).mockImplementation((input) => {
        const [name, ...rest] = input.split(":");
        return { name, urlValue: rest.join(":") };
      });

      const config = parseCliArgs();
      expect(config.openApiSpecs).toHaveProperty("petstore");
      expect(config.openApiSpecs).toHaveProperty("users");
      expect(Object.keys(config.openApiSpecs)).toHaveLength(2);
    });
  });

  describe("Mixed Source Types", () => {
    it("should handle mixed LLMS and OpenAPI sources", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        llmsTxtSource: ["react:https://react.dev/docs/llms.txt"],
        openapiSpecSource: ["petstore:https://example.com/petstore.json"],
      });

      // Mock the parseNameValuePair to return the expected format
      vi.mocked(cliLib.parseNameValuePair).mockImplementation((input) => {
        const [name, ...rest] = input.split(":");
        return { name, urlValue: rest.join(":") };
      });

      const config = parseCliArgs();
      expect(config.docSources).toHaveProperty("react");
      expect(config.openApiSpecs).toHaveProperty("petstore");
    });
  });

  describe("Deprecated Options", () => {
    it("should handle --url as LLMS source", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        url: ["react:https://react.dev/docs/llms.txt"],
        urls: undefined,
        llmsTxtSource: [],
        llmsTxtSources: undefined,
      });

      const config = parseCliArgs();
      expect(config.docSources).toHaveProperty("react");
    });

    it("should handle --urls as LLMS sources", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        url: [],
        urls: "react:https://react.dev/docs/llms.txt",
        llmsTxtSource: [],
        llmsTxtSources: undefined,
      });

      const config = parseCliArgs();
      expect(config.docSources).toHaveProperty("react");
    });
  });

  describe("Domain Filtering", () => {
    it("should allow specific domains with --allow-domain", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        llmsTxtSource: [
          "react:https://react.dev/docs/llms.txt",
          "vue:https://vuejs.org/docs/llms.txt",
        ],
        allowDomain: ["react.dev"],
        allowDomains: undefined,
      });

      const config = parseCliArgs();
      // Should only allow react.dev domain
      expect(Array.from(config.allowedDomains)).toContain("react.dev");
      expect(Array.from(config.allowedDomains)).not.toContain("vuejs.org");
    });

    it("should deny specific domains with --deny-domain", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        llmsTxtSource: [
          "react:https://react.dev/docs/llms.txt",
          "vue:https://vuejs.org/docs/llms.txt",
        ],
        denyDomain: ["vuejs.org"],
        denyDomains: undefined,
        allowDomain: ["react.dev", "vuejs.org"],
        allowDomains: undefined,
      });

      // Mock the parseNameValuePair to return the expected format
      vi.mocked(cliLib.parseNameValuePair).mockImplementation((input) => {
        const [name, ...rest] = input.split(":");
        return { name, urlValue: rest.join(":") };
      });

      const config = parseCliArgs();
      // Should deny vuejs.org domain
      expect(Array.from(config.allowedDomains)).toContain("react.dev");
      expect(Array.from(config.allowedDomains)).not.toContain("vuejs.org");
    });

    it("should handle allow and deny domain rules together", () => {
      mockOptsFn.mockReturnValue({
        defaults: false,
        llmsTxtSource: [
          "react:https://react.dev/docs/llms.txt",
          "vue:https://vuejs.org/docs/llms.txt",
          "angular:https://angular.io/docs/llms.txt",
        ],
        allowDomain: ["react.dev", "vuejs.org"],
        denyDomain: ["vuejs.org"],
      });

      const config = parseCliArgs();
      // Should allow react.dev but not vuejs.org (deny takes precedence)
      expect(Array.from(config.allowedDomains)).toContain("react.dev");
      expect(Array.from(config.allowedDomains)).not.toContain("vuejs.org");
      expect(Array.from(config.allowedDomains)).not.toContain("angular.io");
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid URL format gracefully", () => {
      // Reset any previous calls to the spy
      consoleErrorSpy.mockClear();

      // Mock the parseNameValuePair to log the error and return null for invalid format
      const originalParseNameValuePair = cliLib.parseNameValuePair;
      vi.spyOn(cliLib, "parseNameValuePair").mockImplementation((input) => {
        if (input === "invalid-format") {
          console.error(
            "Invalid format: 'invalid-format'. Expected 'name:value'. Skipping.",
          );
          return null;
        }
        return originalParseNameValuePair(input);
      });

      mockOptsFn.mockReturnValue({
        defaults: false,
        llmsTxtSource: ["invalid-format"],
        openapiSpecSource: [],
        llmsTxtSources: "",
        openapiSpecSources: "",
        allowDomain: [],
        denyDomain: [],
      });

      const result = parseCliArgs();

      // Verify the error was logged with the correct format
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Invalid format: 'invalid-format'. Expected 'name:value'. Skipping.",
      );

      // Verify the result is not undefined since we're just testing error logging
      // and the function should still return a valid config object
      expect(result).toBeDefined();

      // Clean up the mock
      vi.mocked(cliLib.parseNameValuePair).mockRestore();
    });
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
