# Extending SushiMCP

This document provides instructions for setting up a local development environment for SushiMCP. For user-facing instructions on running SushiMCP via `npx`, please see [`README.md`](./README.md).

## Installation

1.  **Clone the repository (if you haven't already):**
    ```bash
    git clone https://github.com/maverickg59/sushimcp
    cd sushimcp
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Build the project:**
    ```bash
    npm run build
    ```
    This compiles the TypeScript code into JavaScript in the `dist/` directory.

## Running Locally

While the primary use case is via an MCP client using `npx`, you can run the server directly from your local build for development or testing purposes using `node`.

**Basic Command:**

```bash
node dist/index.js [arguments...]
```

**Arguments:**

- `--url <name:url_or_path>` (Repeatable)
  - Registers a documentation source.
  - `<name>`: A short identifier (e.g., `HonoDocs`).
  - `<url_or_path>`: URL (e.g., `https://hono.dev/llms.txt`) or absolute/relative local file path (e.g., `./docs/my_notes.md`, `/path/to/project/llms.txt`). Relative paths are resolved from the current working directory where you run the `node` command.
- `--urls <string>`
  - Specify multiple sources as a single space-separated string (e.g., `"drizzle:URL1 hono:URL2"`).
- `--allow-domain <domain>` (Repeatable)
  - Allows fetching from a specific remote domain.
  - Defaults to domains inferred from remote `--url`/`--urls` sources if omitted.
  - Use `*` to allow all domains (use with caution).
- `--no-defaults` (Flag)
  - Disables loading the default sources defined internally in `src/defaults.md`.

**Local Execution Examples:**

```bash
# 1. Run with only default sources (assuming src/defaults.md exists)
node dist/index.js

# 2. Run combining defaults and a specific --url source
node dist/index.js --url mylocal:./local-docs.md

# 3. Run using --urls, disabling defaults, and allowing necessary domains
# (Domains must be explicitly allowed if not inferred from --urls sources)
node dist/index.js --no-defaults --urls "drizzle:https://orm.drizzle.team/llms.txt hono:https://hono.dev/llms-full.txt" --allow-domain orm.drizzle.team --allow-domain hono.dev

# 4. Run with defaults and allow all remote domains (not recommended)
node dist/index.js --allow-domain "*"
```

**Source Precedence:**

Sources are loaded and potentially overridden in this order:

1.  **Defaults:** Loaded first (unless `--no-defaults` is used).
2.  **`--url` arguments:** Loaded next, overriding defaults with the same name.
3.  **`--urls` argument:** Loaded last, overriding defaults or `--url` sources with the same name.

**NPM Script:**

You can modify the `scripts.start` command in `package.json` for convenient repetitive testing during development, then run `npm start`.
