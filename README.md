<div align="center">

![SushiMCP Name Slogan Icon](assets/sushimcp_icon_name_slogan_logo.png)

</div>

# SushiMCP

The SushiMCP dev tools MCP Server is designed to help your IDE agent find up-to-date docs for the right project.

## Registering SushiMCP with an MCP Client

**Minimal Config with default sources only:**

```json
{
  "sushimcp": {
    "command": "npx",
    "args": ["@chriswhiterocks/sushimcp@latest"]
  }
}
```

[More in-depth examples config examples](assets/config_examples.md)

## Using SushiMCP

Prompt your IDE agent to use SushiMCP:

```text
Ask SushiMCP to read the documentation for Hono and Drizzle.
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
    - **Input:**

      1. JSON object with a `url` key specifying the source _url_:

      - `{"url": "drizzle"}`

      2. Array of source _urls_:

      - `["drizzle", "hono"]`

    - **Output:** Text content of the fetched file.
    - **Security:** The server will enforce the `--allow-domain` rules for remote URLs.

## Default Source List

- hono: https://hono.dev/llms.txt
- hono_full: https://hono.dev/llms-full.txt
- drizzle: https://orm.drizzle.team/llms.txt
- better-auth: https://better-auth.com/llms.txt
- cloudflare: https://developers.cloudflare.com/llms.txt
- cloudflare_full: https://developers.cloudflare.com/llms-full.txt
- supabase: https://supabase.com/llms.txt
- chakraui: https://chakra-ui.com/llms.txt
- chakraui_full: https://chakra-ui.com/llms-full.txt
- bun: https://bun.sh/llms.txt
- bun_full: https://bun.sh/llms-full.txt
- netlify: https://docs.netlify.com/llms.txt
- prisma: https://www.prisma.io/docs/llms.txt
- prisma_full: https://prisma.io/docs/llms-full.txt
- ux-patterns: https://uxpatterns.dev/en/llms.txt
- ux-patterns-full: https://uxpatterns.dev/en/llms-full.txt
- vercel-ai-sdk: https://sdk.vercel.ai/llms.txt
- dotenvx: https://dotenvx.com/llms.txt
- dotenvx_full: https://dotenvx.com/llms-full.txt
- elevenlabs: https://elevenlabs.io/docs/llms.txt
- elevenlabs_full: https://elevenlabs.io/docs/llms-full.txt
- svelte: https://svelte.dev/llms.txt
- svelte_full: https://svelte.dev/llms-full.txt
- turborepo: https://turborepo.com/llms.txt
- anthropic: https://docs.anthropic.com/llms.txt
- anthropic_full: https://docs.anthropic.com/llms-full.txt
- windsurf: https://docs.windsurf.com/llms.txt
- windsurf_full: https://docs.windsurf.com/llms-full.txt
- cursor: https://docs.cursor.com/llms.txt
- cursor_full: https://docs.cursor.com/llms-full.txt
- tinybird: https://www.tinybird.co/docs/llms.txt
- tinybird_full: https://www.tinybird.co/docs/llms-full.txt
- turso: https://docs.turso.tech/llms.txt
- turso_full: https://docs.turso.tech/llms-full.txt
- wxt: https://wxt.dev/knowledge/docs.txt
- cog: https://cog.run/llms.txt
- fireproof: https://use-fireproof.com/llms.txt
- fireproof_full: https://use-fireproof.com/llms-full.txt
- fireproof_mini: https://use-fireproof.com/llms-mini.txt
- likec4: https://likec4.dev/llms.txt
- likec4_full: https://likec4.dev/llms-full.txt
- navi: https://navi-lang.org/llms.txt
- navi_full: https://navi-lang.org/llms-full.txt
- openphone: https://www.openphone.com/docs/llms.txt
- openphone_full: https://www.openphone.com/docs/llms-full.txt
- openpipe: https://docs.openpipe.ai/llms.txt
- openpipe_full: https://docs.openpipe.ai/llms-full.txt
- roc-lang: https://roc-lang.org/llms.txt
- sankey: https://sankeydiagram.net/llms.txt
- daisyui: https://daisyui.com/llms.txt
- open-alternative: https://openalternative.co/llms.txt
- stripe: https://docs.stripe.com/llms.txt
- ai-engineers-handbook: https://handbook.exemplar.dev/llms-full.txt
- model-context-protocol: https://modelcontextprotocol.io/llms.txt
- model-context-protocol_full: https://modelcontextprotocol.io/llms-full.txt

## Source Precedence

The server loads and potentially overrides sources in the following order:

1.  **Defaults:** If `--no-defaults` is **not** specified, internal default sources are loaded first.
2.  **`--url` arguments:** Sources specified individually via `--url` are loaded next. If a name matches one from the defaults, the `--url` source **overrides** the default.
3.  **`--urls` argument:** Sources specified via the `--urls` string are loaded last. If a name matches one from the defaults or a previous `--url` argument, the `--urls` source **overrides** it.

## Development

This project is not open for contibutions at the moment, but feel free to fork and extend the project under the terms of the AGPL-3.0-or-later license.

## Inspiration

SushiMCP was born out of frustration with AI assistants generating outdated code. While searching for an MCP that could retrieve llms.txt, I found mcpdoc by LangChain AI. I built a devtools-focused MCP server using their structure, with list_llms_txt_sources and fetch_llms_text tools inspired by it. Thanks, LangChain.

## Author

Chris White

[GitHub](https://github.com/maverickg59) | [Email](mailto:chris@chriswhite.rocks) | [Discord](https://discord.com/users/1115027188840939560) | [Website](https://chriswhite.rocks) | [X](https://x.com/chriswhiterox) | [LinkedIn](https://www.linkedin.com/in/chrisewhite) | [Five9Cyber](https://www.fiv9cyber.com/)

## License

This project is licensed under the AGPL-3.0-or-later. See the `license.txt` file for details.
