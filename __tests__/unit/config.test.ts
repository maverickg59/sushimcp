import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  const items = fs.readdirSync(dir);

  items.forEach((item) => {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  });

  return files.sort(); // Sort for consistent ordering
}

describe("Configuration Files", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const configFiles = [
    ".gitignore",
    "package.json",
    "license.txt",
    "tsconfig.json",
    "vitest.config.mts",
  ];

  configFiles.forEach((file) => {
    it(`should match ${file} snapshot`, () => {
      const filePath = path.join(rootDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      // For package.json, we want to ignore the version numbers as they change frequently
      if (file === "package.json") {
        const pkg = JSON.parse(content);
        // Replace all version numbers with '[version]' placeholder
        const replaceVersions = (obj: Record<string, any>) => {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === "string" && /^\^?\d+\.\d+\.\d+/.test(value)) {
              obj[key] = "[version]";
            } else if (typeof value === "object" && value !== null) {
              replaceVersions(value);
            }
          }
        };
        replaceVersions(pkg.dependencies || {});
        replaceVersions(pkg.devDependencies || {});
        expect(pkg).toMatchSnapshot();
      } else {
        expect(content).toMatchSnapshot();
      }
    });
  });
});

describe("Assets Directory", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const assetsDir = path.join(rootDir, "assets");

  it("should match assets directory structure", () => {
    const files = getAllFiles(assetsDir);
    const assetsStructure = files.map((file) => {
      const relativePath = path.relative(assetsDir, file);
      const stats = fs.statSync(file);
      return {
        path: relativePath,
        size: stats.size,
        type: path.extname(file).toLowerCase() || "unknown",
      };
    });

    expect(assetsStructure).toMatchSnapshot();
  });
});

describe("Husky Configuration", () => {
  const rootDir = path.resolve(__dirname, "../..");
  const huskyDir = path.join(rootDir, ".husky");

  it("should have required husky files", () => {
    expect(fs.existsSync(huskyDir)).toBe(true);
    expect(fs.existsSync(path.join(huskyDir, "_"))).toBe(true);
    expect(fs.existsSync(path.join(huskyDir, "pre-commit"))).toBe(true);
  });

  it("should match husky files content", () => {
    const preCommitContent = fs.readFileSync(
      path.join(huskyDir, "pre-commit"),
      "utf-8",
    );
    expect(preCommitContent).toMatchSnapshot();
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
