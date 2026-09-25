import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import Typesearch from 'typesearch-js';
import pkg from '../package.json' with { type: 'json' };
import { fetchPricing } from '../src/pricing.ts';
import { createServer, instructions, toolError } from '../src/server.ts';
import { VERSION } from '../src/version.ts';
import { FakeApi, KEY, PRICING, problem, searchResponse } from './fake-api.ts';

let api: FakeApi;

beforeAll(async () => {
  api = await new FakeApi().start();
});
afterAll(() => api.close());
afterEach(() => api.reset());

async function connect({ key = KEY as string | null, pricing = PRICING as typeof PRICING | null } = {}) {
  const ts = key === null ? null : new Typesearch({ apiKey: key, baseURL: api.url, maxRetries: 0 });
  const server = createServer({ client: ts, pricing });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(b);
  return client;
}

type Text = { type: 'text'; text: string };
const textOf = (r: { content?: unknown }) => ((r.content as Text[])[0] ?? { text: '' }).text;

describe('the contract', () => {
  test('four tools, read-only and open-world, with the contract parameters', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['search_news', 'get_contents', 'find_similar', 'check_coverage']);
    for (const t of tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
      expect(t.title).toBeTruthy();
      expect(t.description!.length).toBeGreaterThan(80);
      expect(t.outputSchema).toBeDefined();
    }
    const props = (name: string) => Object.keys((tools.find((t) => t.name === name)!.inputSchema as { properties: object }).properties);
    const required = (name: string) => (tools.find((t) => t.name === name)!.inputSchema as { required?: string[] }).required ?? [];
    expect(props('search_news')).toEqual(['query', 'mode', 'max_results', 'days', 'published_after', 'published_before', 'include_domains', 'exclude_domains', 'countries', 'languages']);
    expect(required('search_news')).toEqual(['query']);
    expect(props('get_contents')).toEqual(['urls', 'query']);
    expect(required('get_contents')).toEqual(['urls']);
    expect(props('find_similar')).toEqual(['url', 'max_results', 'days']);
    expect(required('find_similar')).toEqual(['url']);
    expect(props('check_coverage')).toEqual(['domain']);
    const search = tools[0]!.inputSchema as { properties: Record<string, { default?: unknown; maximum?: number; enum?: string[] }> };
    expect(search.properties.mode).toMatchObject({ default: 'fast', enum: ['ultra', 'fast', 'normal', 'deep'] });
    expect(search.properties.max_results).toMatchObject({ default: 10, maximum: 25 });
  });

  test('server name, version and instructions', async () => {
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: 'typesearch', version: VERSION });
    expect(VERSION).toBe(pkg.version);
    expect(client.getInstructions()).toContain('search_news');
    expect(client.getInstructions()).toContain('US$1.11 per 1,000 searches');
  });

  test('prices come from the API, never written by hand; without them, a link', async () => {
    expect(await fetchPricing(api.url)).toEqual(PRICING);
    expect(await fetchPricing('http://127.0.0.1:9', { timeout: 300 })).toBeNull();
    const client = await connect({ pricing: null });
    const { tools } = await client.listTools();
    const all = [client.getInstructions() ?? '', ...tools.map((t) => t.description ?? '')].join('\n');
    // Si el contrato cambia sus frases de precio, withoutFigures tiene que seguirlo: ninguna cifra ni marcador.
    expect(all).not.toMatch(/US\$|NaN/);
    expect(instructions(null)).toContain('like the REST API (prices: https://typesearch.ai/pricing)');
    expect(tools[0]!.description).toContain('Defaults: mode "fast" and the last 7 days.');
    expect(tools[1]!.description).toContain('Never returns the full text. Billed per page read; pages that fail are free.');
    expect(tools[2]!.description).toMatch(/Useful to see how other outlets covered a story\.$/);
  });
});

describe('search_news', () => {
  test('calls /v1/search with mode fast and 10 results by default, and answers compactly', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'search_news', arguments: { query: 'el dólar' } });
    expect(api.last.path).toBe('/v1/search');
    expect(api.last.body).toEqual({ query: 'el dólar', mode: 'fast', max_results: 10 });
    expect(api.last.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(r.isError).toBeFalsy();
    const text = textOf(r);
    expect(text.split('\n')[0]).toBe('2 results for "el dólar" · fast · US$0.0011');
    expect(text).toContain('1. El dólar cerró estable por 1ª rueda\nDiario Ejemplo · 2026-09-21 18:05 UTC · AR/es\nhttps://diarioejemplo.example/economia/nota-1');
    expect(text).toContain('found beyond the index');
    expect(text).toContain('> El dólar mayorista terminó la jornada sin variaciones');
    const s = r.structuredContent as { results: Record<string, unknown>[] };
    expect(s).toMatchObject({ query: 'el dólar', mode: 'fast', cost_usd: 0.00111, request_id: 'req_fakemcp1' });
    expect(s.results[0]).toEqual({
      title: 'El dólar cerró estable por 1ª rueda',
      url: 'https://diarioejemplo.example/economia/nota-1',
      source: 'Diario Ejemplo',
      published_at: '2026-09-21T18:05Z',
      country: 'AR',
      language: 'es',
      snippet: 'La divisa se mantuvo sin cambios frente al cierre anterior.',
      score: 0.95,
    });
    expect(s.results[1]).toMatchObject({ found_in: 'discovery', highlights: ['El dólar mayorista terminó la jornada sin variaciones'] });
  });

  test('passes every filter as the API names it', async () => {
    const client = await connect();
    await client.callTool({
      name: 'search_news',
      arguments: {
        query: 'inflation',
        mode: 'normal',
        max_results: 25,
        days: 3,
        published_after: '2026-09-20',
        published_before: '2026-09-22T12:00:00Z',
        include_domains: ['diarioejemplo.example'],
        exclude_domains: ['reddiaria.example'],
        countries: ['AR'],
        languages: ['es'],
      },
    });
    expect(api.last.body).toEqual({
      query: 'inflation',
      mode: 'normal',
      max_results: 25,
      days: 3,
      published_after: '2026-09-20',
      published_before: '2026-09-22T12:00:00Z',
      include_domains: ['diarioejemplo.example'],
      exclude_domains: ['reddiaria.example'],
      countries: ['AR'],
      languages: ['es'],
    });
  });

  test('invalid arguments are explained to the model, without calling the API', async () => {
    const client = await connect();
    for (const [args, message] of [
      [{ query: 'x' }, 'query needs at least two letters.'],
      [{ query: 'el dólar', max_results: 30 }, 'max_results must be a whole number from 1 to 25.'],
      [{ query: 'el dólar', mode: 'turbo' }, 'mode must be ultra, fast, normal or deep.'],
      [{ query: 'el dólar', published_after: 'yesterday' }, 'published_after must be a date'],
    ] as const) {
      const r = await client.callTool({ name: 'search_news', arguments: args });
      expect(r.isError).toBe(true);
      expect(textOf(r)).toContain(message);
    }
    expect(api.requests).toHaveLength(0);
  });

  test('nothing found: the closest articles, and incomplete and cached flags', async () => {
    api.next({ status: 200, body: searchResponse({ found: false, total: 0, results: [], near_misses: [searchResponse().results[0]], incomplete: true, cached_at: '2026-09-22T14:00:00Z', warnings: [{ code: 'domain_not_indexed', message: 'x.example is not in the index.' }] }) });
    const client = await connect();
    const r = await client.callTool({ name: 'search_news', arguments: { query: 'el dólar' } });
    const text = textOf(r);
    expect(text).toMatch(/^No results for "el dólar" · fast · cached, free/);
    expect(text).toContain('Closest articles, which may not be about it:');
    expect(text).toContain('Incomplete:');
    expect(text).toContain('Note (domain_not_indexed): x.example is not in the index.');
    expect(r.structuredContent).toMatchObject({ results: [], incomplete: true, cached: true });
  });

  test('nothing at all: results stays, empty (as the output schema asks), and it is not an error', async () => {
    api.next({ status: 200, body: searchResponse({ found: false, total: 0, results: [] }) });
    const client = await connect();
    const r = await client.callTool({ name: 'search_news', arguments: { query: 'el dólar' } });
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toBe('No results for "el dólar" · fast · US$0.0011');
    expect(r.structuredContent).toEqual({ query: 'el dólar', mode: 'fast', results: [], cost_usd: 0.00111, request_id: 'req_fakemcp1' });
  });
});

describe('get_contents, find_similar and check_coverage', () => {
  test('get_contents: each URL with its status; the excerpt is not repeated in highlights', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'get_contents', arguments: { urls: ['https://reddiaria.example/a', 'https://unreachable.example/b'], query: 'el Presupuesto 2027' } });
    expect(api.last.body).toEqual({ urls: ['https://reddiaria.example/a', 'https://unreachable.example/b'], query: 'el Presupuesto 2027' });
    const text = textOf(r);
    expect(text.split('\n')[0]).toBe('1 of 2 URLs read · US$0.0002');
    expect(text).toContain('> El proyecto prevé un superávit primario\nRelevance to the query: 0.97');
    expect(text).toContain('Error (site_unreachable): The site did not answer.');
    const s = r.structuredContent as { results: Record<string, unknown>[] };
    expect(s.results[0]).not.toHaveProperty('highlights');
    expect(s.results[1]).toEqual({ url: 'https://unreachable.example/b', status: 'error', error: { code: 'site_unreachable', message: 'The site did not answer.' } });
  });

  test('find_similar: nothing found still answers with results, empty (as the output schema asks)', async () => {
    api.next({ status: 200, body: searchResponse({ object: 'similar', found: false, total: 0, results: [], queries: [], reference: null }) });
    const client = await connect();
    const r = await client.callTool({ name: 'find_similar', arguments: { url: 'https://diarioejemplo.example/a' } });
    expect(r.isError).toBeFalsy();
    expect(textOf(r)).toMatch(/^No similar articles · US\$0\.0011/);
    expect(r.structuredContent).toEqual({ mode: 'fast', results: [], cost_usd: 0.00111, request_id: 'req_fakemcp1' });
  });

  test('find_similar: mode fast, with the reference', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'find_similar', arguments: { url: 'https://diarioejemplo.example/a', days: 30 } });
    expect(api.last.body).toEqual({ url: 'https://diarioejemplo.example/a', mode: 'fast', max_results: 10, days: 30 });
    expect(textOf(r)).toMatch(/^2 similar articles to "Inflación: qué esperan los analistas" · US\$0\.0011/);
    expect(r.structuredContent).toMatchObject({ reference: { url: 'https://diarioejemplo.example/a' } });
  });

  test('check_coverage: one domain, or the aggregate', async () => {
    const client = await connect();
    const yes = await client.callTool({ name: 'check_coverage', arguments: { domain: 'diarioejemplo.example' } });
    expect(api.last.query.get('domain')).toBe('diarioejemplo.example');
    expect(textOf(yes)).toBe('diarioejemplo.example is covered (Diario Ejemplo): AR · es · 1,520 articles · last refreshed 2026-09-22T14:05Z.');
    const no = await client.callTool({ name: 'check_coverage', arguments: { domain: 'otro.example' } });
    expect(textOf(no)).toBe('otro.example is not covered by the index.');
    expect(no.structuredContent).toEqual({ domain: 'otro.example', covered: false });
    const all = await client.callTool({ name: 'check_coverage', arguments: {} });
    expect(textOf(all)).toContain('The index has 1,234 sources and 567,890 articles.');
    expect(textOf(all)).toContain('Sources by country: AR 120, international 4.');
    expect(all.structuredContent).toMatchObject({ sources: 1234, by_language: [{ language: 'es', sources: 900 }] });
  });
});

describe('errors', () => {
  test('without a key, every call says how to set it, and nothing is sent', async () => {
    const client = await connect({ key: null });
    const r = await client.callTool({ name: 'search_news', arguments: { query: 'el dólar' } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/^Error \(missing_api_key\): Missing API key\. Set TYPESEARCH_API_KEY/);
    expect(api.requests).toHaveLength(0);
  });

  test('API errors reach the model with their code, the wait and the request id, never the key', async () => {
    const client = await connect({ key: 'ts_live_wrong' });
    const r = await client.callTool({ name: 'search_news', arguments: { query: 'el dólar' } });
    expect(textOf(r)).toBe('Error (invalid_api_key): The API key is not valid. [request req_fakeerr1]');
    expect(textOf(r)).not.toContain('ts_live_wrong');

    const ok = await connect();
    api.next({ status: 429, body: problem(429, 'rate_limited', 'More than 600 requests per minute.'), headers: { 'retry-after': '12' } });
    expect(textOf(await ok.callTool({ name: 'search_news', arguments: { query: 'el dólar' } }))).toBe(
      'Error (rate_limited): More than 600 requests per minute. Retry after 12 s. [request req_fakeerr1]',
    );
    api.next({ status: 402, body: problem(402, 'insufficient_credits', 'No credit left. Top up at https://app.typesearch.ai/billing.') });
    expect(textOf(await ok.callTool({ name: 'get_contents', arguments: { urls: ['https://reddiaria.example/a'] } }))).toContain('Error (insufficient_credits): No credit left.');
  });

  test('network failures and cancellations are plain sentences', () => {
    const client = new Typesearch({ apiKey: KEY });
    void client;
    expect(toolError(new (class extends Error {})('boom'))).toMatchObject({ isError: true, content: [{ text: 'Error: boom' }] });
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect((toolError(abort).content[0] as Text).text).toBe('Error (cancelled): the call was cancelled.');
  });

  test('an API that cannot be reached', async () => {
    const ts = new Typesearch({ apiKey: KEY, baseURL: 'http://127.0.0.1:9', maxRetries: 0 });
    const server = createServer({ client: ts, pricing: null });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(b);
    const r = await client.callTool({ name: 'check_coverage', arguments: {} });
    expect(textOf(r)).toBe('Error (connection): could not reach the typesearch API. Check the network connection and try again.');
  });
});
