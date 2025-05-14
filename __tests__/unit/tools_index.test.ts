import { describe, it, expect } from "vitest";
import * as toolsExports from "../../src/tools/index.js";

describe("Tools Index", () => {
  it("should export the expected functions", () => {
    // Check that the index exports the functions from the individual modules
    expect(toolsExports).toHaveProperty("list_llms_txt_sources");
    expect(toolsExports).toHaveProperty("fetch_llms_txt");
    
    // Verify the exports are functions
    expect(typeof toolsExports.list_llms_txt_sources).toBe("function");
    expect(typeof toolsExports.fetch_llms_txt).toBe("function");
  });
});
