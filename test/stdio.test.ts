/*
 * De punta a punta: el paquete construido (dist/index.js, lo que corre `npx -y typesearch-mcp`) por stdio,
 * con el cliente oficial, contra la API falsa.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { FakeApi, KEY } from './fake-api.ts';

const BIN = fileURLToPath(new URL('../dist/index.js', import.meta.url));
let api: FakeApi;

beforeAll(async () => {
  api = await new FakeApi().start();
});
afterAll(() => api.close());

async function connect(env: Record<string, string>) {
  const stderr: string[] = [];
  const transport = new StdioClientTransport({ command: process.execPath, args: [BIN], env: { PATH: process.env.PATH ?? '', ...env }, stderr: 'pipe' });
  transport.stderr?.on('data', (d: Buffer) => stderr.push(d.toString()));
  const client = new Client({ name: 'e2e', version: '1.0.0' });
  await client.connect(transport);
  return { client, stderr };
}

test('npx typesearch-mcp: lists the tools and searches through the API, with its own User-Agent', async () => {
  const { client, stderr } = await connect({ TYPESEARCH_API_KEY: KEY, TYPESEARCH_BASE_URL: api.url });
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name)).toEqual(['search_news', 'get_contents', 'find_similar', 'check_coverage']);
  expect(tools[0]!.description).toContain('US$1.11 per 1,000 searches');
  const r = await client.callTool({ name: 'search_news', arguments: { query: 'el dólar', max_results: 3 } });
  expect(r.isError).toBeFalsy();
  expect(api.last.body).toEqual({ query: 'el dólar', mode: 'fast', max_results: 3 });
  expect(api.last.headers['user-agent']).toMatch(/^typesearch-mcp\/\d+\.\d+\.\d+ typesearch-js\/\d+\.\d+\.\d+$/);
  await client.close();
  expect(stderr.join('')).toBe('');
});

test('without a key it still starts and lists the tools, and warns on stderr', async () => {
  const { client, stderr } = await connect({ TYPESEARCH_BASE_URL: api.url });
  expect((await client.listTools()).tools).toHaveLength(4);
  const r = await client.callTool({ name: 'check_coverage', arguments: {} });
  expect(r.isError).toBe(true);
  await client.close();
  expect(stderr.join('')).toContain('TYPESEARCH_API_KEY is not set');
});

test('--version and --help', () => {
  const v = spawnSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' });
  expect(v.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  const h = spawnSync(process.execPath, [BIN, '--help'], { encoding: 'utf8' });
  expect(h.stdout).toContain('TYPESEARCH_API_KEY');
});
