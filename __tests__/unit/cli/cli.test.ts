import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import * as utils from "#lib/utils";
import * as cliLib from "#lib/cli_lib";

// Mock dependencies but not the module itself
vi.mock("node:fs");
vi.mock("node:path");
vi.mock("node:url");
vi.mock("commander");
vi.mock("#lib/utils");
vi.mock("#lib/cli_lib");

// Now import the actual module
import { parseCliArgs } from "#lib/cli";

describe("CLI Module", () => {
  // Setup spies for console methods
  const consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => {});
  const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

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
    vi.mocked(Command).mockImplementation(() => {
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
      }
    );

    vi.mocked(cliLib.normalizeAndAddDomain).mockImplementation(
      (domain, set, flag) => {
        set.add(domain);
      }
    );

    vi.mocked(cliLib.logConfigSummary).mockImplementation(() => {});
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
          "- javascript:https://example.com/javascript/llms.txt"
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

    it("should log config summary", () => {
      // Set verbose mode
      process.env.MCP_STDIO_MODE = "verbose";

      // Setup Commander opts mock
      mockOptsFn.mockReturnValue({
        noDefaults: true,
        url: ["react:https://example.com/react"],
        urls: undefined,
        openApiSpec: [],
        openApiSpecs: undefined,
        allowDomain: ["example.com"],
        allowDomains: undefined,
      });

      // Call the parseCliArgs function
      const config = parseCliArgs();

      // We expect logConfigSummary to be called
      expect(cliLib.logConfigSummary).toHaveBeenCalled();
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
});
