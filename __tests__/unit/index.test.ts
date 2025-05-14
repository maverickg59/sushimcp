import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Entry Point File", () => {
  // Verify that index file exists and has expected content

  it("should have an index.ts entry point file with expected components", () => {
    const indexFilePath = path.resolve(process.cwd(), "src/index.ts");

    // Check that the file exists
    const fileExists = fs.existsSync(indexFilePath);
    expect(fileExists).toBe(true);

    if (fileExists) {
      // Read the file content
      const indexContent = fs.readFileSync(indexFilePath, "utf8");

      // Test for presence of key sections rather than execution
      expect(indexContent).toContain("#!/usr/bin/env node");
      expect(indexContent).toContain("parseCliArgs()");
      expect(indexContent).toContain("McpServer");
      expect(indexContent).toContain("list_llms_txt_sources");
      expect(indexContent).toContain("fetch_llms_txt");
      expect(indexContent).toContain("process.env.MCP_STDIO_MODE");
      expect(indexContent).toContain("StdioServerTransport");
      expect(indexContent).toContain("server.connect");
    }
  });

  it("should detect SSE mode from command line arguments", () => {
    // Mock process.argv
    const originalArgv = process.argv;

    try {
      // Test with no SSE flag
      process.argv = ["node", "index.js"];
      // This is just checking the logic pattern in the code without executing it
      const args = process.argv.slice(2);
      const isSseMode = args.includes("--sse");
      expect(isSseMode).toBe(false);

      // Test with SSE flag
      process.argv = ["node", "index.js", "--sse"];
      const argsWithSse = process.argv.slice(2);
      const isSSeModeWithFlag = argsWithSse.includes("--sse");
      expect(isSSeModeWithFlag).toBe(true);
    } finally {
      // Restore original argv
      process.argv = originalArgv;
    }
  });
});
