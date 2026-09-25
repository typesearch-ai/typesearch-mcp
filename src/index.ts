/*
 * typesearch-mcp: el servidor MCP local, por stdio. `npx -y typesearch-mcp`, con TYPESEARCH_API_KEY en
 * el entorno (y TYPESEARCH_BASE_URL para otra API). Por stdout sólo va el protocolo; los avisos, por stderr.
 */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { DEFAULT_BASE_URL, Typesearch, VERSION as SDK_VERSION } from 'typesearch-js';
import { fetchPricing } from './pricing.ts';
import { createServer } from './server.ts';
import { VERSION } from './version.ts';

const HELP = `typesearch-mcp ${VERSION} — MCP server for typesearch news search (stdio).

Usage: npx -y typesearch-mcp

Environment:
  TYPESEARCH_API_KEY   Your API key (required for tool calls). Get one at https://app.typesearch.ai
  TYPESEARCH_BASE_URL  Another API base URL (default ${DEFAULT_BASE_URL})

Tools: search_news, get_contents, find_similar, check_coverage.
Remote alternative, no install: https://api.typesearch.ai/mcp
`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(HELP);
  process.exit(0);
}
if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}

const apiKey = process.env.TYPESEARCH_API_KEY?.trim();
const baseURL = (process.env.TYPESEARCH_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');

const client = apiKey
  ? new Typesearch({ apiKey, baseURL, defaultHeaders: { 'User-Agent': `typesearch-mcp/${VERSION} typesearch-js/${SDK_VERSION}` } })
  : null;
if (!client) process.stderr.write('typesearch-mcp: TYPESEARCH_API_KEY is not set; the tools will answer with an error until it is.\n');

const pricing = await fetchPricing(baseURL);

serveStdio(() => createServer({ client, pricing }), {
  onerror: (e) => process.stderr.write(`typesearch-mcp: ${e.message}\n`),
});
