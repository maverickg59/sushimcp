# SushiMCP

SushiMCP is a Model Context Protocol (MCP) server that allows MCP clients to discover and fetch missing llms.txt files with ease.

## Registering SushiMCP with an MCP Client

**Config with custom sources combined using `--urls`:**

```json
{
  "SushiMCP": {
    "command": "npx",
    "args": [
      "@chriswhiterocks/sushimcp",
      "--urls",
      "hono:https://hono.dev/llms-full.txt drizzle:https://orm.drizzle.team/llms.txt"
    ]
  }
}
```

**Minimal Config with default sources only:**

```json
{
  "SushiMCP": {
    "command": "npx",
    "args": ["@chriswhiterocks/sushimcp"]
  }
}
```

**Config with custom sources one by one**

```json
{
  "SushiMCP": {
    "command": "npx",
    "args": [
      "@chriswhiterocks/sushimcp",
      "--url",
      "hono:https://hono.dev/llms-full.txt",
      "--url",
      "drizzle:https://orm.drizzle.team/llms.txt"
    ]
  }
}
```

## Registration Args

- `--url <name:url_or_path>` (Repeatable)
  - Registers a documentation source.
  - `<name>`: A short identifier (e.g., `HonoDocs`).
  - `<url_or_path>`
    - URL (e.g., `https://hono.dev/llms.txt`) or _absolute_ local file path (e.g., `/path/to/project/llms.txt`).
    - **Note:** Relative paths might not work reliably when run via `npx` depending on the execution context; prefer absolute paths for local files.
- `--urls <string>`
  - Specify multiple sources as a single space-separated string (e.g., `"drizzle:URL1 hono:URL2"`).
- `--allow-domain <domain>`
  - Allows fetching from a specific domain (repeatable).
  - Defaults to domains in remote `--url`/`--urls` sources if omitted.
  - Use `*` to allow all. (NOT RECOMMENDED)
- `--no-defaults`
  - (Flag) Disables loading a sensible set of Node/TypeScript ecosystem default sources from.

**Command Line Equivalents (for reference):**

```bash
# Run with default sources
npx @chriswhiterocks/sushimcp

# Run with only specific URLs, disabling defaults, allowing specific domains
npx @chriswhiterocks/sushimcp --no-defaults --url drizzle:https://orm.drizzle.team/llms.txt --url local:/Users/me/docs.md --allow-domain orm.drizzle.team

# Run using the --urls argument
npx @chriswhiterocks/sushimcp --urls "drizzle:https://orm.drizzle.team/llms.txt hono:https://hono.dev/llms-full.txt"
```

## Available Tools (for MCP Client)

SushiMCP provides the following tools callable by a registered MCP client:

1.  **`list_llms_txt_sources`**:

    - **Description:** Lists the names of all configured documentation sources.
    - **Input:** None.
    - **Output:** JSON array of source names (strings).
      ```json
      ["drizzle", "hono", "mylocal"]
      ```

2.  **`fetch_llms_txt`**:
    - **Description:** Fetches the content of a specific documentation source by its configured name.
    - **Input:** JSON object with a `url` key specifying the source _name_ (e.g., `{"url": "drizzle"}`).
    - **Output:** Text content of the fetched file.
    - **Security:** The server will enforce the `--allow-domain` rules for remote URLs.

## Source Precedence

The server loads and potentially overrides sources in the following order:

1.  **Defaults:** If `--no-defaults` is **not** specified, internal default sources are loaded first.
2.  **`--url` arguments:** Sources specified individually via `--url` are loaded next. If a name matches one from the defaults, the `--url` source **overrides** the default.
3.  **`--urls` argument:** Sources specified via the `--urls` string are loaded last. If a name matches one from the defaults or a previous `--url` argument, the `--urls` source **overrides** it.

## Development

This project is not open for contibutions at the moment, but feel free to fork and extend the project under the terms of the AGPL-3.0-or-later license.

## Inspiration

SushiMCP is inspired by `mcpdoc` ([https://github.com/langchain-ai/mcpdoc](https://github.com/langchain-ai/mcpdoc)) from LangChain AI. SushiMCP was an idea that came to me, but the core architecture is based on `mcpdoc`. Thanks, LangChain!

## Author

Christopher White ([https://github.com/maverickg59](https://github.com/maverickg59))

## License

This project is licensed under the AGPL-3.0-or-later. See the `license.txt` file for details.
