import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { RespuestaBusqueda, RespuestaContenidos, RespuestaFuente, RespuestaFuentes } from './v1.ts';

/*
 * El contrato del MCP de typesearch, sin servidor: los parámetros y la salida
 * de las cuatro herramientas, sus títulos y descripciones, las instrucciones y
 * cómo se escribe cada respuesta (texto legible y `structuredContent` sin
 * campos vacíos). Lo usa el MCP remoto (lib/api/mcp.ts) y lo copia tal cual el
 * MCP local (`typesearch-mcp`), para que los dos digan y devuelvan lo mismo.
 *
 * Puro: sólo zod y los tipos de las respuestas de /v1 (se borran al compilar).
 * Los precios llegan por parámetro, con la forma de `x-pricing` del OpenAPI.
 * Todo lo que ve el cliente, en inglés.
 */

export const NOMBRE_MCP = 'typesearch';
export const VERSION_MCP = '1.0.0';

/** Los modos, en el orden del contrato (los mismos de /v1). */
export const MODOS = ['ultra', 'fast', 'normal', 'deep'] as const;

// --- Precios: la lista de lib/precios.ts, la misma que `x-pricing` del OpenAPI (nunca a mano) ---------

/** La forma de `x-pricing` (GET /v1/openapi.json) y de `listaPublica()` (lib/precios.ts). */
export type ListaDePrecios = {
  per_1000_requests: { ultra: number; fast: number; normal: number; deep: number; similar: number; similar_deep: number; site_search: number };
  per_1000_pages: { contents: number; contents_with_query: number };
};

const usd = (x: number) => `US$${x.toFixed(2)}`;

export function instrucciones(lista: ListaDePrecios): string {
  const { per_1000_requests: p, per_1000_pages: c } = lista;
  return [
    'typesearch is news search for AI agents: a curated index of news outlets worldwide, judged by a calibrated relevance model. Results carry title, link, source, date, country and language, and short excerpts, never full articles: cite the link.',
    `- search_news: news on a topic. mode "fast" (the default) is the cheapest and quickest (${usd(p.fast)} per 1,000 searches); "ultra" judges headlines only (same price); "normal" (${usd(p.normal)}) reads the best matches; "deep" (${usd(p.deep)}) reads more and also searches the topic in other words. Narrow it with days, published_after/before, include/exclude_domains, countries (ISO 3166-1 alpha-2) and languages (ISO 639-1).`,
    `- get_contents: title, standfirst, date and a short excerpt of up to 10 article URLs (${usd(c.contents)} per 1,000 pages; with query, the excerpt about it: ${usd(c.contents_with_query)}).`,
    `- find_similar: other coverage of the story in an article URL (${usd(p.similar)} per 1,000).`,
    '- check_coverage: whether a news domain is covered, or how many sources the index has per country and language (free).',
    'Every call is billed to the API key at these list prices, like the REST API; cached results and failed calls are free.',
  ].join('\n');
}

// --- Entradas: los parámetros del contrato, con errores en inglés -----------------------------

/*
 * Los mensajes van en cada esquema: lib/api/v1.ts pone zod en español para
 * /v1, y el mensaje del esquema manda sobre el del idioma. El SDK los devuelve
 * como error de la herramienta («Input validation error: …»), que el modelo lee.
 */
const texto = (campo: string) => ({ error: `${campo} must be text.` });
const consulta = z
  .string(texto('query'))
  .trim()
  .min(2, 'query needs at least two letters.')
  .max(200, 'query is too long: 200 characters at most.');
const maxResults = z
  .number({ error: 'max_results must be a whole number from 1 to 25.' })
  .int('max_results must be a whole number from 1 to 25.')
  .min(1, 'max_results must be a whole number from 1 to 25.')
  .max(25, 'max_results must be a whole number from 1 to 25.')
  .default(10)
  .describe('How many results, 1 to 25. Defaults to 10.');
const dias = z
  .number({ error: 'days must be a whole number from 1 to 365.' })
  .int('days must be a whole number from 1 to 365.')
  .min(1, 'days must be a whole number from 1 to 365.')
  .max(365, 'days must be a whole number from 1 to 365.')
  .optional();
const fecha = (campo: string) =>
  z.union([z.iso.date(), z.iso.datetime({ offset: true })], { error: `${campo} must be a date (2026-09-25) or a date-time with its offset (2026-09-25T14:00:00Z).` });
const dominios = (campo: string) =>
  z
    .array(z.string(texto(`Each item of ${campo}`)).max(200, `${campo}: 200 characters at most per item.`), { error: `${campo} must be a list of domains.` })
    .max(20, `${campo}: 20 domains at most.`)
    .optional();

export const entradaBusqueda = z.object({
  query: consulta.describe('What to look for, in any language: a topic, event, person, company or place, such as "inflation in Argentina" or "OpenAI funding".'),
  mode: z
    .enum(MODOS, { error: 'mode must be ultra, fast, normal or deep.' })
    .default('fast')
    .describe('fast (default, cheapest): headlines and standfirsts · ultra: headlines only · normal: also reads the best matches · deep: reads more, finds the topic in other words too.'),
  max_results: maxResults,
  days: dias.describe('Only the last N days, 1 to 365. Defaults to 7 unless published_after or published_before are given.'),
  published_after: fecha('published_after').optional().describe('Published on or after this date: 2026-09-25, or a date-time with offset.'),
  published_before: fecha('published_before').optional().describe('Published on or before this date; a bare date includes that whole day.'),
  include_domains: dominios('include_domains').describe('Only these domains or paths, such as example.com or example.com/sports.'),
  exclude_domains: dominios('exclude_domains').describe('Never these domains or paths.'),
  countries: z
    .array(z.string(texto('Each country')).max(20), { error: 'countries must be a list of ISO 3166-1 alpha-2 codes.' })
    .min(1, 'countries needs at least one code.')
    .max(50, 'countries: 50 codes at most.')
    .optional()
    .describe('Only sources from these countries: ISO 3166-1 alpha-2 codes, such as ["AR"] or ["US", "GB"].'),
  languages: z
    .array(z.string(texto('Each language')).max(35), { error: 'languages must be a list of ISO 639-1 codes.' })
    .min(1, 'languages needs at least one code.')
    .max(20, 'languages: 20 codes at most.')
    .optional()
    .describe('Only sources that publish in these languages: ISO 639-1 codes, such as ["es"] or ["en", "pt"].'),
});

export const entradaContenidos = z.object({
  urls: z
    .array(z.string(texto('Each URL')).max(2000, 'Each URL: 2000 characters at most.'), { error: 'urls must be a list of article URLs.' })
    .min(1, 'urls needs at least one URL.')
    .max(10, 'urls: 10 at most.')
    .describe('Up to 10 article URLs, such as https://example.com/news/article.'),
  query: consulta.optional().describe('Optional: the excerpt is then the one about this query, with a relevance score.'),
});

export const entradaParecidas = z.object({
  url: z.string(texto('url')).max(2000, 'url: 2000 characters at most.').describe('The article URL whose story to find elsewhere.'),
  max_results: maxResults,
  days: dias.describe('Only the last N days, 1 to 365. Defaults to 7.'),
});

export const entradaCobertura = z.object({
  domain: z
    .string(texto('domain'))
    .trim()
    .min(3, 'domain looks too short.')
    .max(300, 'domain: 300 characters at most.')
    .optional()
    .describe('A news domain, such as example.com. Without it: the coverage by country and language.'),
});

// --- Salidas: compactas, sin campos vacíos -------------------------------------------------

const resultadoMcp = z.object({
  title: z.string(),
  url: z.string(),
  source: z.string().optional(),
  published_at: z.string().optional().describe('ISO 8601, UTC, to the minute.'),
  country: z.string().optional(),
  language: z.string().optional(),
  snippet: z.string().optional().describe('The standfirst, as the outlet published it (shortened).'),
  highlights: z.array(z.string()).optional().describe('Short verbatim excerpts from reading the article.'),
  score: z.number().describe('Probability that the article is about the query.'),
  found_in: z.enum(['homepage', 'section', 'site_search', 'discovery']).optional().describe('Only when it was not found in the index: where it came from.'),
});
type ResultadoMcp = z.infer<typeof resultadoMcp>;
const aviso = z.object({ code: z.string(), message: z.string() });

const comunSalida = {
  mode: z.enum(MODOS),
  results: z.array(resultadoMcp),
  near_misses: z.array(resultadoMcp).optional().describe('Only when nothing matched: the closest articles, which may not be about it.'),
  incomplete: z.literal(true).optional().describe('The time or token budget ran out: there may be more.'),
  cached: z.literal(true).optional(),
  cost_usd: z.number(),
  warnings: z.array(aviso).optional(),
  request_id: z.string(),
};
type Comun = z.infer<z.ZodObject<typeof comunSalida>>;
export const salidaBusqueda = z.object({ query: z.string(), ...comunSalida });
export const salidaParecidas = z.object({ reference: z.object({ title: z.string(), url: z.string() }).optional(), ...comunSalida });
export const salidaContenidos = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      status: z.enum(['ok', 'error']),
      title: z.string().optional(),
      description: z.string().optional(),
      published_at: z.string().optional(),
      source: z.string().optional(),
      excerpt: z.string().optional(),
      highlights: z.array(z.string()).optional(),
      relevance: z.number().optional(),
      error: aviso.optional(),
    }),
  ),
  cost_usd: z.number(),
  request_id: z.string(),
});
export const salidaCobertura = z.object({
  domain: z.string().optional(),
  covered: z.boolean().optional(),
  name: z.string().optional(),
  country: z.string().optional(),
  languages: z.array(z.string()).optional(),
  articles: z.number().int().optional(),
  last_refreshed_at: z.string().optional(),
  sources: z.number().int().optional(),
  updated_at: z.string().optional(),
  by_country: z.array(z.object({ country: z.string().describe('ISO 3166-1 alpha-2, or "international".'), sources: z.number().int() })).optional(),
  by_language: z.array(z.object({ language: z.string(), sources: z.number().int() })).optional(),
});

/** Sin null, sin cadenas vacías y sin listas vacías: lo que no dice nada no gasta tokens. */
function sinVacios<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))) as T;
}

function recortar(texto: string, tope: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= tope) return limpio;
  const corte = limpio.lastIndexOf(' ', tope - 1);
  return `${limpio.slice(0, corte > tope * 0.6 ? corte : tope - 1)}…`;
}

/** ISO al minuto, en UTC: `2026-09-25T14:05Z`. */
function alMinuto(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? `${new Date(t).toISOString().slice(0, 16)}Z` : iso;
}

const redondo = (x: number) => Math.round(x * 100) / 100;

function aResultadoMcp(r: RespuestaBusqueda['results'][number]): ResultadoMcp {
  return sinVacios({
    title: r.title,
    url: r.url,
    source: r.source,
    published_at: alMinuto(r.published_at),
    country: r.country,
    language: r.language,
    snippet: r.snippet ? recortar(r.snippet, 300) : null,
    highlights: r.highlights,
    score: redondo(r.score),
    found_in: r.found_in === 'index' ? null : r.found_in,
  }) as ResultadoMcp;
}

const DONDE: Record<NonNullable<ResultadoMcp['found_in']>, string> = {
  homepage: 'from the homepage',
  section: 'from a section page',
  site_search: "from the site's search",
  discovery: 'found beyond the index',
};

function lineasDeResultado(r: ResultadoMcp, i: number): string[] {
  const fecha = r.published_at ? r.published_at.replace('T', ' ').replace('Z', ' UTC') : null;
  const lugar = [r.country, r.language].filter(Boolean).join('/');
  const meta = [r.source, fecha, lugar || null, r.found_in ? DONDE[r.found_in] : null].filter(Boolean).join(' · ');
  return [`${i + 1}. ${r.title}`, ...(meta ? [meta] : []), r.url, ...(r.snippet ? [r.snippet] : []), ...(r.highlights ?? []).map((h) => `> ${h}`)];
}

function comun(r: RespuestaBusqueda): Comun {
  const results = r.results.map(aResultadoMcp);
  // `results` va siempre, también vacío: es lo que dice que no hubo nada.
  const resto = sinVacios({
    near_misses: results.length === 0 ? r.near_misses.slice(0, 5).map(aResultadoMcp) : [],
    incomplete: r.incomplete ? (true as const) : null,
    cached: r.cached_at ? (true as const) : null,
    cost_usd: r.usage.cost_usd ?? 0,
    warnings: r.warnings,
    request_id: r.id,
  }) as Omit<Comun, 'mode' | 'results'>;
  return { mode: r.mode, results, ...resto };
}

function textoDeBusqueda(encabezado: string, s: Comun): string {
  const partes = [encabezado];
  if (s.results.length) partes.push(...s.results.map((r, i) => lineasDeResultado(r, i).join('\n')));
  else if (s.near_misses?.length) partes.push('Closest articles, which may not be about it:', ...s.near_misses.map((r, i) => lineasDeResultado(r, i).join('\n')));
  if (s.incomplete) partes.push('Incomplete: the time or token budget ran out; repeating the search in a minute may bring more.');
  for (const w of s.warnings ?? []) partes.push(`Note (${w.code}): ${w.message}`);
  return partes.join('\n\n');
}

const costo = (s: { cost_usd: number; cached?: true }) => (s.cached ? 'cached, free' : `US$${s.cost_usd.toFixed(4)}`);
const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function salidaDeBusqueda(r: RespuestaBusqueda, query: string): CallToolResult {
  const s = { query, ...comun(r) };
  const encabezado = `${s.results.length ? cuantos(s.results.length, 'result', 'results') : 'No results'} for "${query}" · ${s.mode} · ${costo(s)}`;
  return { content: [{ type: 'text', text: textoDeBusqueda(encabezado, s) }], structuredContent: s };
}

export function salidaDeParecidas(r: RespuestaBusqueda): CallToolResult {
  // `results` va siempre (comun): sinVacios sólo para la referencia, que puede faltar.
  const s = { ...(r.reference ? { reference: { title: r.reference.title, url: r.reference.url } } : {}), ...comun(r) };
  const de = r.reference ? ` to "${r.reference.title}"` : '';
  const encabezado = `${s.results.length ? cuantos(s.results.length, 'similar article', 'similar articles') : 'No similar articles'}${de} · ${costo(s)}`;
  return { content: [{ type: 'text', text: textoDeBusqueda(encabezado, s) }], structuredContent: s };
}

export function salidaDeContenidos(r: RespuestaContenidos): CallToolResult {
  const results = r.results.map((x) =>
    sinVacios({
      url: x.url,
      status: x.status,
      title: x.title,
      description: x.description ? recortar(x.description, 300) : null,
      published_at: alMinuto(x.published_at),
      source: x.source,
      excerpt: x.excerpt,
      // El fragmento de la consulta ya es `excerpt`: los destacados sólo si dicen algo más.
      highlights: x.highlights.filter((h) => h !== x.excerpt),
      relevance: x.relevance === null ? null : redondo(x.relevance),
      error: x.error,
    }),
  );
  const s = { results, cost_usd: r.usage.cost_usd ?? 0, request_id: r.id };
  const bien = results.filter((x) => x.status === 'ok').length;
  const bloques = results.map((x, i) => {
    if (x.status === 'error') return `${i + 1}. ${x.url}\nError (${x.error?.code}): ${x.error?.message}`;
    const meta = [x.source, x.published_at?.replace('T', ' ').replace('Z', ' UTC')].filter(Boolean).join(' · ');
    return [
      `${i + 1}. ${x.title ?? x.url}`,
      ...(meta ? [meta] : []),
      x.url,
      ...(x.description ? [x.description] : []),
      ...(x.excerpt ? [`> ${x.excerpt}`] : []),
      ...(x.highlights ?? []).map((h) => `> ${h}`),
      ...(x.relevance !== undefined ? [`Relevance to the query: ${x.relevance}`] : []),
    ].join('\n');
  });
  return {
    content: [{ type: 'text', text: [`${bien} of ${cuantos(results.length, 'URL', 'URLs')} read · US$${s.cost_usd.toFixed(4)}`, ...bloques].join('\n\n') }],
    structuredContent: s,
  };
}

export function salidaDeCobertura(r: RespuestaFuentes | RespuestaFuente): CallToolResult {
  if (r.object === 'source') {
    const s = sinVacios({
      domain: r.domain,
      covered: r.covered,
      name: r.name ?? null,
      country: r.country ?? null,
      languages: r.languages ?? [],
      articles: r.articles ?? null,
      last_refreshed_at: alMinuto(r.last_refreshed_at ?? null),
    });
    const texto = r.covered
      ? `${r.domain} is covered${r.name ? ` (${r.name})` : ''}: ${[r.country, r.languages?.join('/')].filter(Boolean).join(' · ')}${r.articles !== undefined ? ` · ${r.articles.toLocaleString('en-US')} articles` : ''}${s.last_refreshed_at ? ` · last refreshed ${s.last_refreshed_at}` : ''}.`
      : `${r.domain} is not covered by the index.`;
    return { content: [{ type: 'text', text: texto }], structuredContent: s };
  }
  const porPais = r.by_country.map((x) => ({ country: x.country ?? 'international', sources: x.sources }));
  const s = sinVacios({
    sources: r.total,
    articles: r.articles,
    updated_at: alMinuto(r.updated_at),
    by_country: porPais,
    by_language: r.by_language,
  });
  const lista = (xs: { nombre: string; n: number }[]) => xs.map((x) => `${x.nombre} ${x.n}`).join(', ');
  const texto = [
    `The index has ${r.total.toLocaleString('en-US')} sources and ${r.articles.toLocaleString('en-US')} articles.`,
    `Sources by country: ${lista(porPais.map((x) => ({ nombre: x.country, n: x.sources })))}.`,
    `Sources by language: ${lista(r.by_language.map((x) => ({ nombre: x.language, n: x.sources })))}.`,
  ].join('\n');
  return { content: [{ type: 'text', text: texto }], structuredContent: s };
}

// --- Las herramientas: nombre, título, descripción, esquemas y anotaciones ---------------------------

const ANOTACIONES = { readOnlyHint: true, openWorldHint: true } as const;

/**
 * Lo que publica `tools/list`, con los precios de `lista`: el remoto le pasa
 * `listaPublica()`; el local, `x-pricing` del OpenAPI. Así los dos dicen lo mismo.
 */
export function herramientas(lista: ListaDePrecios) {
  const { per_1000_requests: p, per_1000_pages: c } = lista;
  return {
    search_news: {
      title: 'Search news',
      description:
        'Search recent news on any topic across a curated index of news outlets worldwide, judged by a relevance model. ' +
        'Returns the matching articles: title, link, source, date, country and language, standfirst, and short excerpts in the modes that read. ' +
        `Use it for current events and for what outlets reported about a company, person, place or topic. Defaults: mode "fast" (${usd(p.fast)} per 1,000 searches) and the last 7 days.`,
      inputSchema: entradaBusqueda,
      outputSchema: salidaBusqueda,
      annotations: { title: 'Search news', ...ANOTACIONES },
    },
    get_contents: {
      title: 'Get article contents',
      description:
        'Get the title, standfirst, date, source and a short verbatim excerpt (up to 25 words) of up to 10 news article URLs. ' +
        'With a query, the excerpt is the one about it and relevance says how much the article covers it. Never returns the full text. ' +
        `${usd(c.contents)} per 1,000 pages read (${usd(c.contents_with_query)} with a query); pages that fail are free.`,
      inputSchema: entradaContenidos,
      outputSchema: salidaContenidos,
      annotations: { title: 'Get article contents', ...ANOTACIONES },
    },
    find_similar: {
      title: 'Find similar news',
      description:
        'Find other news articles about the same story as a given article URL, across the index (the last 7 days by default). ' +
        `Useful to see how other outlets covered a story. ${usd(p.similar)} per 1,000 calls.`,
      inputSchema: entradaParecidas,
      outputSchema: salidaParecidas,
      annotations: { title: 'Find similar news', ...ANOTACIONES },
    },
    check_coverage: {
      title: 'Check index coverage',
      description:
        'Check whether a news domain is in the typesearch index (pass domain), or get the index coverage: how many sources and articles, by country and by language. Free.',
      inputSchema: entradaCobertura,
      outputSchema: salidaCobertura,
      annotations: { title: 'Check index coverage', ...ANOTACIONES },
    },
  };
}
