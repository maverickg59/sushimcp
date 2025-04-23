# SushiMCP

SushiMCP is a Model Context Protocol (MCP) server designed to provide access to documentation content. It allows AI agents, coding assistants, or other MCP clients to discover and fetch documentation specified by URLs pointing to `llms.txt` manifest files or directly to content files (local or remote).

## Inspiration and Attribution

The concept for this server was inspired by the `mcpdoc` project ([https://github.com/langchain-ai/mcpdoc](https://github.com/langchain-ai/mcpdoc)) from LangChain AI. While SushiMCP is a fresh implementation built entirely in TypeScript for the Node.js ecosystem, the core idea of using MCP to serve documentation sources originates from `mcpdoc`. We thank the `mcpdoc` authors for the initial concept.

## Features

- Implements the Model Context Protocol for interoperability.
- Registers documentation sources via command-line arguments (`--url name:source`).
- Supports both remote URLs (http/https) and local file paths as documentation sources.
- Provides tools for MCP clients to:
  - `list_llms_txt_sources`: Discover configured documentation sources.
  - `fetch_llms_txt`: Fetch the content of a specific source URL or path.
- Includes security controls to restrict fetching from remote domains (`--allow-domain`). Defaults to allowing only domains explicitly listed in remote `--url` sources if no `--allow-domain` flags are provided.

## Installation

1.  **Clone the repository (if you haven't already):**
    ```bash
    git clone <your-repository-url>
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

## Usage (MCP Client Registration)

SushiMCP is primarily designed to be used as a server registered with a Model Context Protocol (MCP) client (like an AI assistant or IDE extension). The client will connect to the server and use its tools (`list_llms_txt_sources`, `fetch_llms_txt`) to access documentation.

To register SushiMCP with your MCP client, you typically need to provide the command and arguments required to start the server. The specifics depend on your client, but the configuration usually involves specifying the executable (`node`), the path to the built server script (`dist/index.js`), and the necessary `--url` and `--allow-domain` arguments.

Refer to your specific MCP client's documentation for instructions on how to register an external MCP server. You can use the `example-config.json` file in this repository as a template or reference for the command structure:

```json
{
  "SushiMCP": {
    "command": "node",
    "args": [
      "/path/to/your/sushimcp/dist/index.js", // <-- Update this path
      "--url",
      "hono:https://hono.dev/llms-full.txt",
      "--url",
      "drizzle:https://orm.drizzle.team/llms.txt"
      // Add more --url and --allow-domain flags as needed
    ]
  }
}
```

For more details on the Model Context Protocol itself, visit [https://modelcontextprotocol.io](https://modelcontextprotocol.io).

## Tool Usage (for MCP Clients)

Once the server is running, MCP clients can connect and use the following tools:

- **`list_llms_txt_sources`**

  - **Description:** Lists the `name: url_or_path` pairs configured when the server started.
  - **Input:** None (Client should send empty params `{}`).
  - **Output:** Text content listing the available sources.

- **`fetch_llms_txt`**
  - **Description:** Fetches the content from the specified documentation source URL or path.
  - **Input:** An object containing the URL/path: `{ "url": "source_url_or_path_from_list_output" }`. The `url` value should match one of the URLs or paths provided by `list_llms_txt_sources`.
  - **Output:** Text content of the fetched file.
  - **Security:** The server will enforce the `--allow-domain` rules for remote URLs.

## Contributing

This project is not currently accepting external contributions. However, you are welcome to fork the repository and modify it for your own purposes under the terms of the license.

## License

This project is licensed under the AGPL-3.0-or-later. See the `license.txt` file for details.
