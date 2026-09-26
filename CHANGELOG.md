# Changelog

All notable changes to `typesearch-mcp` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

First release.

- Local MCP server over stdio (`npx -y typesearch-mcp`) with the same tools as the remote one at
  `https://api.typesearch.ai/mcp`: `search_news`, `get_contents` and `find_similar`, all read-only.
- Compact output for agents: readable text plus `structuredContent`, with output schemas.
- Starts and lists its tools without a key; every call then explains how to set `TYPESEARCH_API_KEY`.
- The tool definitions, instructions and output come from the remote server's contract, copied verbatim
  (`src/contrato/mcp-contrato.ts`), so `tools/list` is identical to `https://api.typesearch.ai/mcp`.
- With nothing found, `search_news` and `find_similar` still answer with `results: []`, as their output
  schema asks.
- Plugins for Claude Code (`.claude-plugin/`, with a marketplace), Cursor (`.cursor-plugin/`, `mcp.json`) and
  Gemini CLI (`gemini-extension.json`): the remote server with the key kept as a secret, and a `news-search`
  skill (`skills/`) on when and how to use each tool and mode.
- A single bundled file with no runtime dependencies; Dockerfile, `server.json` for the MCP Registry,
  `glama.json` and `smithery.yaml`.
