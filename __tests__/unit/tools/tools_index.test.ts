import { describe, it, expect } from "vitest";
import * as toolsExports from "#tools/index";

describe("Tools Index", () => {
  it("should export the expected functions", () => {
    expect(toolsExports).toHaveProperty("list_llms_txt_sources");
    expect(toolsExports).toHaveProperty("fetch_llms_txt");

    expect(typeof toolsExports.list_llms_txt_sources).toBe("function");
    expect(typeof toolsExports.fetch_llms_txt).toBe("function");
  });
});
