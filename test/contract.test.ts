/*
 * El contrato del MCP (src/contrato/mcp-contrato.ts) es una copia tal cual del de typesearch-api
 * (lib/api/mcp-contrato.ts). Estas pruebas fallan si alguien lo edita a mano o si el de la API cambió y
 * no se volvió a copiar (`npm run sync-contract`). La segunda necesita el repo de la API a mano
 * (TYPESEARCH_API_DIR, por defecto ~/Documents/GitHub/typesearch-api); sin él, se saltea.
 */
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
// @ts-expect-error: un script de Node sin tipos
import { leerFuente, sha256 } from '../scripts/sync-contract.mjs';
import { herramientas } from '../src/contrato/mcp-contrato.ts';
import { createServer } from '../src/server.ts';
import { PRICING } from './fake-api.ts';

const copia = fs.readFileSync(new URL('../src/contrato/mcp-contrato.ts', import.meta.url), 'utf8');
const origen = JSON.parse(fs.readFileSync(new URL('../src/contrato/origen.json', import.meta.url), 'utf8'));
const fuente = leerFuente();

describe('the MCP contract', () => {
  test('is the copy of the API one, untouched', () => {
    expect(sha256(copia)).toBe(origen.sha256);
  });

  test.skipIf(!fuente)('matches lib/api/mcp-contrato.ts of typesearch-api (origin/main)', () => {
    expect(copia === fuente.texto, `El contrato difiere de ${fuente?.fuente}: corre npm run sync-contract`).toBe(true);
  });

  test('tools/list publishes exactly the contract tools, in its order', async () => {
    const server = createServer({ client: null, pricing: PRICING });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(b);
    const { tools } = await client.listTools();
    const h = herramientas(PRICING);
    expect(tools.map((t) => t.name)).toEqual(Object.keys(h));
    for (const t of tools) {
      const c = h[t.name as keyof typeof h];
      expect(t).toMatchObject({ title: c.title, description: c.description, annotations: c.annotations });
    }
  });
});
