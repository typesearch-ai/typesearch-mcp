# typesearch MCP server

News search for AI agents, as an [MCP](https://modelcontextprotocol.io) server: recent news on any topic
from outlets worldwide, each result with a calibrated relevance score, by country and language.

This package is the **local** server (`npx -y typesearch-mcp`, stdio). The same tools are also served
**remotely** at `https://api.typesearch.ai/mcp`, with nothing to install. Both need a
[typesearch API key](https://app.typesearch.ai/api-keys) and bill like the API.

| | Cursor | VS Code |
| --- | --- | --- |
| Remote | [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=typesearch&config=eyJ1cmwiOiJodHRwczovL2FwaS50eXBlc2VhcmNoLmFpL21jcCIsImhlYWRlcnMiOnsiQXV0aG9yaXphdGlvbiI6IkJlYXJlciBZT1VSX1RZUEVTRUFSQ0hfQVBJX0tFWSJ9fQ%3D%3D) | [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=typesearch&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22typesearch_api_key%22%2C%22description%22%3A%22typesearch%20API%20key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fapi.typesearch.ai%2Fmcp%22%2C%22headers%22%3A%7B%22Authorization%22%3A%22Bearer%20%24%7Binput%3Atypesearch_api_key%7D%22%7D%7D) |
| Local | [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=typesearch&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsInR5cGVzZWFyY2gtbWNwIl0sImVudiI6eyJUWVBFU0VBUkNIX0FQSV9LRVkiOiJZT1VSX1RZUEVTRUFSQ0hfQVBJX0tFWSJ9fQ%3D%3D) | [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=typesearch&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22typesearch_api_key%22%2C%22description%22%3A%22typesearch%20API%20key%22%2C%22password%22%3Atrue%7D%5D&config=%7B%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22typesearch-mcp%22%5D%2C%22env%22%3A%7B%22TYPESEARCH_API_KEY%22%3A%22%24%7Binput%3Atypesearch_api_key%7D%22%7D%7D) |

In Cursor, replace `YOUR_TYPESEARCH_API_KEY` in the configuration it adds; VS Code asks for the key.

## Tools

| Tool | What it does |
| --- | --- |
| `search_news` | News on a topic: title, link, source, date, country and language, standfirst and short excerpts, each with a relevance score. `query` (required), `mode` (`ultra`, `fast`, `normal` or `deep`; `fast` by default), `max_results` (1–25, 10 by default), `days`, `published_after`, `published_before`, `include_domains`, `exclude_domains`, `countries`, `languages`. |
| `get_contents` | Title, standfirst, date, source and a short verbatim excerpt of up to 10 article URLs — never the full text. `urls` (required), `query` (optional: the excerpt about it, with a relevance score). |
| `find_similar` | Other coverage of the story in an article URL. `url` (required), `max_results`, `days`. |
| `check_coverage` | Whether a news domain is covered (`domain`), or the index coverage by country and language. Free. |

Every tool is read-only. Results are compact to save your agent's tokens: readable text for the model plus
the same data as `structuredContent`. Calls are billed to your key at the [API's prices](https://typesearch.ai/pricing);
the tool descriptions state them.

## Plugins

This repository is also a plugin for Claude Code, Cursor and Gemini CLI: the remote server plus a
[`news-search` skill](skills/news-search/SKILL.md) that tells the agent when to use each tool and how to
pick a mode, a time window, countries and languages. Each one asks for your API key once and keeps it as a
secret.

```bash
# Claude Code
claude plugin marketplace add typesearch/typesearch-mcp
claude plugin install typesearch@typesearch

# Gemini CLI
gemini extensions install https://github.com/typesearch-ai/typesearch-mcp
```

In Cursor, install **typesearch** from the [Cursor Marketplace](https://cursor.com/marketplace).

| | Files |
| --- | --- |
| Claude Code | [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json), [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) |
| Cursor | [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json), [`mcp.json`](mcp.json) |
| Gemini CLI | [`gemini-extension.json`](gemini-extension.json) |
| Shared skill | [`skills/news-search/SKILL.md`](skills/news-search/SKILL.md) |

## Set it up

### Claude Code

```bash
# Remote
claude mcp add --transport http typesearch https://api.typesearch.ai/mcp --header "Authorization: Bearer $TYPESEARCH_API_KEY"

# Local
claude mcp add typesearch --env TYPESEARCH_API_KEY=$TYPESEARCH_API_KEY -- npx -y typesearch-mcp
```

### Codex

```bash
# Local
codex mcp add typesearch --env TYPESEARCH_API_KEY=$TYPESEARCH_API_KEY -- npx -y typesearch-mcp
```

Or, for the remote server, in `~/.codex/config.toml`:

```toml
[mcp_servers.typesearch]
url = "https://api.typesearch.ai/mcp"
bearer_token_env_var = "TYPESEARCH_API_KEY"
```

### Claude Desktop, Cursor, Windsurf and other clients

Add the server to the client's MCP configuration (`claude_desktop_config.json`, `~/.cursor/mcp.json`,
`~/.codeium/windsurf/mcp_config.json`…):

```json
{
  "mcpServers": {
    "typesearch": {
      "command": "npx",
      "args": ["-y", "typesearch-mcp"],
      "env": { "TYPESEARCH_API_KEY": "YOUR_TYPESEARCH_API_KEY" }
    }
  }
}
```

Clients that take a remote URL with headers can use `https://api.typesearch.ai/mcp` with
`Authorization: Bearer YOUR_TYPESEARCH_API_KEY` (Windsurf: `"serverUrl"` and `"headers"`). Clients that only
accept a URL can pass the key in it: `https://api.typesearch.ai/mcp?typesearchApiKey=YOUR_TYPESEARCH_API_KEY`
— treat that URL as a secret.

### Docker

```bash
docker build -t typesearch-mcp .
docker run -i --rm -e TYPESEARCH_API_KEY typesearch-mcp
```

## Configuration

| Variable | |
| --- | --- |
| `TYPESEARCH_API_KEY` | Your API key. Without it the server starts and lists its tools, and every call explains how to set it. |
| `TYPESEARCH_BASE_URL` | Another API base URL. Defaults to `https://api.typesearch.ai`. |

Node 20 or later. The package is a single file with no dependencies, so `npx -y typesearch-mcp` starts
quickly.

## Development

```bash
npm ci
npm test                # builds dist/index.js and runs the tools against a fake API, in memory and over stdio
npm run inspect         # opens the MCP Inspector on the built server
npm run compare-remote  # checks that tools/list and the instructions match https://api.typesearch.ai/mcp
```

The tool parameters, titles, descriptions, annotations, server instructions and output format live in
[`src/contrato/mcp-contrato.ts`](src/contrato/mcp-contrato.ts): a verbatim copy of the contract of the remote
server, so both list and answer exactly the same. `npm run sync-contract` refreshes it from the API
repository (`TYPESEARCH_API_DIR`); the tests fail if the copy is edited by hand.

Built with the official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and
[`typesearch-js`](https://www.npmjs.com/package/typesearch-js), bundled into `dist/index.js`.

## License

[MIT](LICENSE)
