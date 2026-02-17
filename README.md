<div align="center">

![SushiMCP Hero Icon](https://github.com/maverickg59/sushimcp/raw/prod/assets/sushimcp_icon_name_slogan_logo_pink_bg.png)

</div>

[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/7b84b486-4ccb-4fc5-8d3b-74d398fa59c0)

# SushiMCP

SushiMCP is a model context protocol server designed to assist developers with delivering context to their AI IDE's. It's simple to use and massively improves the performance of base and premium LLM models when generating code.

SushiMCP runs in two modes: **Direct Mode** for self-managed sources and **Thin Client Mode** for API-backed access to 500+ documentation sources.

<br>

## Modes

### Direct Mode

In direct mode, you provide your own llms.txt and OpenAPI spec URLs via CLI arguments. The server fetches documentation directly from those URLs. This is the default when no `API_URL` / `API_KEY` environment variables are set.

**Tools available:** `list_llms_txt_sources`, `list_openapi_spec_sources`, `fetch_llms_txt`, `fetch_openapi_spec`

**Resources:** 67 built-in llms.txt resources from popular frameworks and libraries.

Register with your MCP client:

```json
{
  "sushimcp": {
    "command": "npx",
    "args": [
      "-y",
      "@chriswhiterocks/sushimcp@latest",
      "--llms-txt-source",
      "cool_project:https://coolproject.dev/llms-full.txt",
      "--openapi-spec-source",
      "local_api:http://localhost:8787/api/v1/openapi.json"
    ]
  }
}
```

### Thin Client Mode

In thin client mode, the server proxies requests through a SushiMCP API backend. This provides access to 500+ curated llms.txt sources and OpenAPI specs, search-based discovery, and GitHub integration tools — without needing to manage source URLs yourself.

Thin client mode activates automatically when both `API_URL` and `API_KEY` environment variables are set. CLI source arguments are ignored in this mode.

**Tools available:** Everything in direct mode, plus `search_fetch_llms_txt`, `search_fetch_openapi_spec`, `github_projects`, `github_pull_requests`, `github_issues`

**Resources:** Two resource templates (`sushimcp://llms-txt/{name}` and `sushimcp://openapi/{name}`) with autocomplete support, backed by the API's full source catalog.

Register with your MCP client:

```json
{
  "sushimcp": {
    "command": "npx",
    "args": ["-y", "@chriswhiterocks/sushimcp@latest"],
    "env": {
      "API_URL": "https://your-api-url.com",
      "API_KEY": "your-api-key"
    }
  }
}
```

See `.env.example` and `inspector-config.example.json` for additional configuration options including GitHub integration.

<br>

## Advanced Configuration & Deeper Learning

Visit the [SushiMCP Docs](https://docs.sushimcp.com) for more information on advanced configuration and deeper learning about SushiMCP.

<br>

## Glama.ai Ratings

<a href="https://glama.ai/mcp/servers/@maverickg59/sushimcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@maverickg59/sushimcp/badge" />
</a>

<br>

## Author

Chris White: [Email](mailto:chris@chriswhite.rocks) | [GitHub](https://github.com/maverickg59) | [Discord](https://discord.com/users/1115027188840939560) | [Personal Site](https://chriswhite.rocks) | [X](https://x.com/chriswhiterox) | [LinkedIn](https://www.linkedin.com/in/chrisewhite) | [Five9 Cyber](https://www.fiv9cyber.com/)

<br>

## License

This project is licensed under the AGPL-3.0-or-later. See the `license.txt` file for details.
