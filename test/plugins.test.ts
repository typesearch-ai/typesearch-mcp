/*
 * Los plugins que viven en este repo (Claude Code, Cursor, Gemini CLI) y la skill que comparten: la misma
 * versión que el paquete, el mismo MCP remoto con la clave, y la skill nombra exactamente las herramientas
 * del contrato.
 */
import fs from 'node:fs';
import { expect, test } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { herramientas } from '../src/contrato/mcp-contrato.ts';
import { PRICING } from './fake-api.ts';

const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const json = (path: string) => JSON.parse(read(path));
const URL_MCP = 'https://api.typesearch.ai/mcp';

test('Claude Code: the remote server with the key from userConfig, and a marketplace at the root', () => {
  const plugin = json('.claude-plugin/plugin.json');
  expect(plugin).toMatchObject({ name: 'typesearch', version: pkg.version, license: 'MIT' });
  expect(plugin.userConfig.typesearch_api_key).toMatchObject({ type: 'string', sensitive: true, required: true });
  expect(plugin.mcpServers.typesearch).toEqual({ type: 'http', url: URL_MCP, headers: { Authorization: 'Bearer ${user_config.typesearch_api_key}' } });
  const market = json('.claude-plugin/marketplace.json');
  expect(market.name).toBe('typesearch');
  expect(market.plugins).toEqual([expect.objectContaining({ name: 'typesearch', source: './' })]);
});

test('Cursor: the remote server with the key from a declared variable', () => {
  const plugin = json('.cursor-plugin/plugin.json');
  expect(plugin).toMatchObject({ name: 'typesearch', version: pkg.version, mcpServers: './mcp.json', skills: './skills/', logo: 'assets/logo.svg' });
  expect(plugin.variables.required).toEqual(['TYPESEARCH_API_KEY']);
  expect(fs.existsSync(new URL('../assets/logo.svg', import.meta.url))).toBe(true);
  expect(json('mcp.json').mcpServers.typesearch).toEqual({ url: URL_MCP, headers: { Authorization: 'Bearer ${TYPESEARCH_API_KEY}' } });
});

test('Gemini CLI: the remote server with the key from a sensitive setting', () => {
  const ext = json('gemini-extension.json');
  expect(ext).toMatchObject({ name: 'typesearch', version: pkg.version });
  expect(ext.mcpServers.typesearch).toMatchObject({ httpUrl: URL_MCP, headers: { Authorization: 'Bearer $TYPESEARCH_API_KEY' } });
  expect(ext.settings).toEqual([expect.objectContaining({ envVar: 'TYPESEARCH_API_KEY', sensitive: true })]);
});

test('the news-search skill: frontmatter, the contract tools and the modes, no prices', () => {
  const skill = read('skills/news-search/SKILL.md');
  const front = skill.match(/^---\nname: (.+)\ndescription: "(.+)"\n---\n/);
  expect(front?.[1]).toBe('news-search');
  expect(front![2]!.length).toBeLessThan(1024);
  const tools = Object.keys(herramientas(PRICING));
  for (const t of tools) expect(skill).toContain(`\`${t}\``);
  const named = new Set(skill.match(/`[a-z]+_[a-z_]+`/g)?.map((x) => x.slice(1, -1)).filter((x) => /^(search|get|find|check)_/.test(x)));
  expect([...named].sort()).toEqual([...tools].sort());
  for (const mode of ['ultra', 'fast', 'normal', 'deep']) expect(skill).toContain(`\`${mode}\``);
  expect(skill).not.toMatch(/US\$\d|\$\d/);
});
