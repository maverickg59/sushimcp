## Development (Local Usage)

While the primary use case is via an MCP client, you can run the server directly from the command line for development or testing purposes. You must provide at least one documentation source using the `--url` flag.

```bash
node dist/index.js --url <name1>:<url_or_path1> [--url <name2>:<url_or_path2> ...] [--allow-domain <domain1> ...]
```

**Arguments:**

- `--url <name>:<url_or_path>`: (Required, Repeatable) Registers a documentation source.
  - `<name>`: A short identifier for the source (e.g., `HonoDocs`, `MyLocalNotes`).
  - `<url_or_path>`: The URL (e.g., `https://hono.dev/llms.txt`) or absolute/relative local file path (e.g., `./docs/my_notes.md`, `/path/to/project/llms.txt`) for the documentation source.
- `--allow-domain <domain>`: (Optional, Repeatable) Explicitly allows the server to fetch content from the specified remote `<domain>`.
  - If omitted, the server defaults to only allowing fetches from the hostnames explicitly mentioned in any remote `--url` arguments.
  - Use `--allow-domain "*"` to allow fetching from _any_ remote domain (use with caution).
  - This flag does not affect fetching from local file paths.

**Examples:**

1.  **Single remote source (Hono), default domain allowance:**

    ```bash
    node dist/index.js --url Hono:https://hono.dev/llms.txt
    # Server will only allow fetches from hono.dev
    ```

2.  **Multiple sources (remote + local), explicit domain allowance:**

    ```bash
    node dist/index.js --url LangGraphJS:https://langchain-ai.github.io/langgraphjs/llms.txt --url LocalNotes:/Users/chris/notes.md --allow-domain langchain-ai.github.io --allow-domain example.com
    # Server will allow fetches from langchain-ai.github.io and example.com, plus the local file.
    # It will NOT allow fetches from hono.dev unless explicitly added.
    ```

3.  **Remote source, allow all domains:**
    ```bash
    node dist/index.js --url Hono:https://hono.dev/llms.txt --allow-domain "*"
    # Server will allow fetches from any domain.
    ```

- **Run (Example):** `npm start` (uses the example command defined in `package.json`) or use `node dist/index.js ...` with desired flags for local testing.
