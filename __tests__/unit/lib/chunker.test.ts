import { describe, it, expect } from "vitest";
import { chunkMarkdown, chunkOpenApi } from "#lib/chunker";

describe("chunkMarkdown", () => {
  it("should split on H2 boundaries", () => {
    const md = `# Title
Some intro text.

## Section One
Content for section one.

## Section Two
Content for section two.
`;
    const chunks = chunkMarkdown(md, "test://doc");
    expect(chunks.length).toBe(3); // intro + two sections
    expect(chunks[0].heading).toBe("(intro)");
    expect(chunks[1].heading).toBe("Section One");
    expect(chunks[2].heading).toBe("Section Two");
  });

  it("should not split on H3 when section is small", () => {
    const md = `## Parent
Some text.

### Child
Child text.
`;
    const chunks = chunkMarkdown(md, "test://doc");
    expect(chunks.length).toBe(1);
    expect(chunks[0].heading).toBe("Parent");
  });

  it("should sub-split on H3 when section exceeds 1500 chars", () => {
    const longText = "x".repeat(800);
    const md = `## Parent
${longText}

### Child One
${longText}

### Child Two
More content here.
`;
    const chunks = chunkMarkdown(md, "test://doc");
    const headings = chunks.map((c) => c.heading);
    expect(headings).toContain("Parent > Child One");
    expect(headings).toContain("Parent > Child Two");
  });

  it("should hard-split by paragraph when H3 section still too large", () => {
    const para = "a".repeat(400) + "\n\n";
    const bigSection = para.repeat(6); // ~2400 chars
    const md = `## Big
${bigSection}`;
    const chunks = chunkMarkdown(md, "test://doc");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].heading).toMatch(/Big/);
  });

  it("should never split inside fenced code blocks", () => {
    const md = `## Code Section
\`\`\`
## This is not a heading
It's inside a code block
\`\`\`
After code.
`;
    const chunks = chunkMarkdown(md, "test://doc");
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toContain("## This is not a heading");
  });

  it("should generate deterministic IDs from source and heading", () => {
    const md = `## Routing
Some content.
`;
    const chunks = chunkMarkdown(md, "https://example.com/docs");
    expect(chunks[0].id).toBe("https://example.com/docs#routing");
  });

  it("should deduplicate IDs for repeated headings", () => {
    const md = `## Example
First example.

## Example
Second example.
`;
    const chunks = chunkMarkdown(md, "test://doc");
    expect(chunks[0].id).toBe("test://doc#example");
    expect(chunks[1].id).toBe("test://doc#example-1");
  });

  it("should hash content with SHA-256", () => {
    const md = `## Test
Content here.
`;
    const chunks = chunkMarkdown(md, "test://doc");
    expect(chunks[0].hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("should prepend heading to content for embedding context", () => {
    const md = `## Routing
Route definitions.
`;
    const chunks = chunkMarkdown(md, "test://doc");
    expect(chunks[0].content).toMatch(/^Routing\n\n/);
  });

  it("should handle empty content", () => {
    const chunks = chunkMarkdown("", "test://doc");
    expect(chunks.length).toBe(0);
  });

  it("should handle content with no headings", () => {
    const chunks = chunkMarkdown(
      "Just plain text.\n\nAnother paragraph.",
      "test://doc",
    );
    expect(chunks.length).toBe(1);
    expect(chunks[0].heading).toBe("(intro)");
  });

  it("should set source field on all chunks", () => {
    const md = `## A
Text.

## B
Text.
`;
    const chunks = chunkMarkdown(md, "https://hono.dev/llms.txt");
    for (const chunk of chunks) {
      expect(chunk.source).toBe("https://hono.dev/llms.txt");
    }
  });
});

describe("chunkOpenApi", () => {
  it("should chunk by path and method", () => {
    const spec = JSON.stringify({
      paths: {
        "/users": {
          get: { summary: "List users", responses: {} },
          post: { summary: "Create user", responses: {} },
        },
        "/users/{id}": {
          get: { summary: "Get user", responses: {} },
        },
      },
    });
    const chunks = chunkOpenApi(spec, "test://api");
    expect(chunks.length).toBe(3);
    const headings = chunks.map((c) => c.heading);
    expect(headings).toContain("GET /users");
    expect(headings).toContain("POST /users");
    expect(headings).toContain("GET /users/{id}");
  });

  it("should chunk component schemas", () => {
    const spec = JSON.stringify({
      paths: {},
      components: {
        schemas: {
          User: { type: "object", properties: { name: { type: "string" } } },
          Post: { type: "object", properties: { title: { type: "string" } } },
        },
      },
    });
    const chunks = chunkOpenApi(spec, "test://api");
    const headings = chunks.map((c) => c.heading);
    expect(headings).toContain("Schema: User");
    expect(headings).toContain("Schema: Post");
  });

  it("should skip x- extension keys in paths", () => {
    const spec = JSON.stringify({
      paths: {
        "/users": {
          get: { summary: "List users" },
          "x-custom": { some: "extension" },
        },
      },
    });
    const chunks = chunkOpenApi(spec, "test://api");
    expect(chunks.length).toBe(1);
    expect(chunks[0].heading).toBe("GET /users");
  });

  it("should fall back to markdown chunking for non-JSON content", () => {
    const yamlLike = `## API Reference
Some API docs in markdown format.
`;
    const chunks = chunkOpenApi(yamlLike, "test://api");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].heading).toBe("API Reference");
  });

  it("should fall back to markdown for empty spec", () => {
    const spec = JSON.stringify({});
    const chunks = chunkOpenApi(spec, "test://api");
    // No paths or schemas → falls back to markdown chunking
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("should generate deterministic IDs for operations", () => {
    const spec = JSON.stringify({
      paths: {
        "/users": { get: { summary: "List" } },
      },
    });
    const chunks = chunkOpenApi(spec, "test://api");
    expect(chunks[0].id).toBe("test://api#get-users");
  });

  it("should handle large operations that exceed chunk size", () => {
    // JSON.stringify output lacks paragraph boundaries (\n\n), so large
    // operations stay as single chunks — this is expected behavior
    const bigParams = Array.from({ length: 30 }, (_, i) => ({
      name: `param_${i}`,
      in: "query",
      description: "A".repeat(40),
      schema: { type: "string" },
    }));
    const spec = JSON.stringify({
      paths: {
        "/big": { get: { summary: "Big endpoint", parameters: bigParams } },
      },
    });
    const chunks = chunkOpenApi(spec, "test://api");
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].heading).toMatch(/GET \/big/);
    expect(chunks[0].content.length).toBeGreaterThan(1500);
  });
});

// Copyright (C) 2026 Christopher White
// SPDX-License-Identifier: AGPL-3.0-or-later
