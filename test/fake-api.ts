/*
 * Una API falsa mínima para probar el servidor MCP: responde como la API de typesearch (las mismas formas
 * que el OpenAPI) y guarda cada pedido. Las pruebas del contrato completo están en typesearch-js.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export const KEY = 'ts_test_mcp';

export interface Recorded {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: http.IncomingHttpHeaders;
  body: any;
}

export interface Scripted {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

export const PRICING = {
  currency: 'USD',
  per_1000_requests: { ultra: 1.11, fast: 1.11, normal: 2.22, deep: 5.55, similar: 2.22, similar_deep: 4.44, site_search: 2.33 },
  per_1000_pages: { contents: 0.11, contents_with_query: 0.22 },
};

export function result(n: number, extra: Record<string, unknown> = {}) {
  return {
    url: `https://diarioejemplo.example/economia/nota-${n}`,
    title: `El dólar cerró estable por ${n}ª rueda`,
    source: 'Diario Ejemplo',
    published_at: '2026-09-21T18:05:31.000Z',
    section: 'economia',
    snippet: 'La divisa se mantuvo sin cambios frente al cierre anterior.',
    score: 0.9612 - n / 100,
    headline_relevance: 0.91,
    read: null,
    highlights: [],
    tone: null,
    answers: null,
    duplicates: [],
    date_match: null,
    referenced_date: null,
    found_in: 'index',
    country: 'AR',
    language: 'es',
    ...extra,
  };
}

export function searchResponse(extra: Record<string, unknown> = {}) {
  return {
    id: 'req_fakemcp1',
    object: 'search',
    mode: 'fast',
    queries: ['el dólar'],
    found: true,
    total: 2,
    results: [result(1), result(2, { url: 'https://reddiaria.example/economia/nota-2', source: 'Red Diaria', found_in: 'discovery', highlights: ['El dólar mayorista terminó la jornada sin variaciones'] })],
    groups: null,
    near_misses: [],
    rejected: [],
    diffusion: null,
    tone: null,
    essential: null,
    reference: null,
    temporal: null,
    site: null,
    index: null,
    usage: { tokens: 1840, calls: 2, cost_usd: 0.00111, headlines: 160, from_memory: 0, pages_direct: 0, pages_browser: 0, duration_ms: 910 },
    budget: null,
    discovery: null,
    incomplete: false,
    cached_at: null,
    warnings: [],
    ...extra,
  };
}

export class FakeApi {
  readonly requests: Recorded[] = [];
  #queue: Scripted[] = [];
  #server = http.createServer((req, res) => void this.#handle(req, res));
  url = '';

  async start(): Promise<this> {
    await new Promise<void>((r) => this.#server.listen(0, '127.0.0.1', r));
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  async close(): Promise<void> {
    this.#server.closeAllConnections?.();
    await new Promise<void>((r) => this.#server.close(() => r()));
  }

  next(...s: Scripted[]): this {
    this.#queue.push(...s);
    return this;
  }

  reset(): void {
    this.requests.length = 0;
    this.#queue.length = 0;
  }

  get last(): Recorded {
    const r = this.requests[this.requests.length - 1];
    if (!r) throw new Error('Sin pedidos');
    return r;
  }

  async #handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    let text = '';
    for await (const c of req) text += c;
    const body = text ? JSON.parse(text) : undefined;
    const send = (status: number, data: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json', 'X-Request-Id': 'req_fakemcp1', ...headers });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === '/v1/openapi.json') return send(200, { openapi: '3.1.0', 'x-pricing': PRICING });
    this.requests.push({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers: req.headers, body });
    const s = this.#queue.shift();
    if (s) return send(s.status, s.body, s.headers);
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, problem(401, 'invalid_api_key', 'The API key is not valid.'));
    const ruta = `${req.method} ${url.pathname}`;
    if (ruta === 'POST /v1/search') return send(200, searchResponse({ mode: body.mode, queries: [body.query] }));
    if (ruta === 'POST /v1/similar') {
      return send(200, searchResponse({ object: 'similar', queries: [], reference: { url: body.url, title: 'Inflación: qué esperan los analistas' } }));
    }
    if (ruta === 'POST /v1/contents') {
      const vacio = { title: null, description: null, published_at: null, source: null, excerpt: null, highlights: [], relevance: null };
      const results = (body.urls as string[]).map((u) =>
        u.includes('unreachable')
          ? { url: u, status: 'error', error: { code: 'site_unreachable', message: 'The site did not answer.' }, ...vacio }
          : {
              url: u,
              status: 'ok',
              error: null,
              title: 'Presupuesto 2027: las claves del proyecto',
              description: 'El Gobierno envió el proyecto al Congreso.',
              published_at: '2026-09-16T01:12:00.000Z',
              source: 'Red Diaria',
              excerpt: 'El proyecto prevé un superávit primario',
              highlights: body.query ? ['El proyecto prevé un superávit primario'] : [],
              relevance: body.query ? 0.9749 : null,
            },
      );
      return send(200, { id: 'req_fakecont', object: 'contents', results, usage: { tokens: 1320, calls: 1, cost_usd: 0.00022, duration_ms: 1840 } });
    }
    if (ruta === 'GET /v1/sources') {
      const domain = url.searchParams.get('domain');
      if (domain === null) {
        return send(200, {
          object: 'sources',
          updated_at: '2026-09-22T14:05:02.000Z',
          total: 1234,
          articles: 567890,
          by_country: [{ country: 'AR', sources: 120 }, { country: null, sources: 4 }],
          by_language: [{ language: 'es', sources: 900 }],
        });
      }
      if (domain === 'diarioejemplo.example') {
        return send(200, { object: 'source', domain, covered: true, name: 'Diario Ejemplo', country: 'AR', languages: ['es'], articles: 1520, last_refreshed_at: '2026-09-22T14:05:02.000Z' });
      }
      return send(200, { object: 'source', domain, covered: false });
    }
    return send(404, problem(404, 'not_found', 'Not found.'));
  }
}

export function problem(status: number, code: string, detail: string) {
  return { type: `urn:typesearch:error:${code}`, title: code, status, detail, code, request_id: 'req_fakeerr1' };
}
