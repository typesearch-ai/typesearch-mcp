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
  per_1000_urls_per_month: { custom_index: 2.22 },
  per_1000_charts: { query_addon: 0.55, from_data: 0.33 },
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

export function chartResponse(extra: Record<string, unknown> = {}) {
  return {
    id: 'chart_fakemcp1',
    object: 'chart',
    type: 'line',
    theme: 'light',
    locale: 'en',
    chart: {
      type: 'line',
      title: 'The blue dollar rose 4.1% this week',
      subtitle: 'Selling rate, in pesos · Sep 19–25',
      series: [{ name: 'Selling', points: [{ x: '2026-09-19', y: 1215, sources: [1] }, { x: '2026-09-25', y: 1265, sources: [0] }] }],
      kpis: [{ label: 'Latest', value: 1265, change: { value: 4.1, percent: true } }, { label: 'Low', value: 1215 }],
    },
    compatible_types: ['line', 'area', 'bar', 'kpi', 'table'],
    plan: null,
    interpretation: { label: 'The blue dollar over time', confidence: 0.7, alternatives: [{ label: 'Coverage of the blue dollar', probability: 0.3 }] },
    rung: 'exact',
    improving: false,
    sources: [
      { url: 'https://diarioejemplo.example/economia/dolar-blue-hoy', title: 'El dólar blue cerró a 1.265 pesos', source: 'Diario Ejemplo', published_at: '2026-09-25T18:10:00Z' },
      { url: 'https://reddiaria.example/economia/blue', title: 'El blue arranca la semana en 1.215 pesos', source: 'Red Diaria', published_at: '2026-09-19T15:40:00Z' },
    ],
    embed_url: 'https://api.typesearch.ai/embed/chart_fakemcp1',
    image_url: 'https://api.typesearch.ai/embed/chart_fakemcp1.png',
    svg_url: 'https://api.typesearch.ai/embed/chart_fakemcp1.svg',
    svg: null,
    created_at: '2026-09-26T14:02:11.482Z',
    expires_at: '2026-12-25T14:02:11.482Z',
    cached: false,
    usage: { cost_usd: 0.0019, mode: 'fast', queries: 1, duration_ms: 2840 },
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
    if (ruta === 'POST /v1/charts') return send(201, chartResponse());
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
    return send(404, problem(404, 'not_found', 'Not found.'));
  }
}

export function problem(status: number, code: string, detail: string) {
  return { type: `urn:typesearch:error:${code}`, title: code, status, detail, code, request_id: 'req_fakeerr1' };
}
