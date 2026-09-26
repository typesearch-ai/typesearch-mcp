/*
 * El servidor MCP local de typesearch: las mismas herramientas que el remoto (https://api.typesearch.ai/mcp),
 * sobre la API REST con typesearch-js. Cobran lo mismo que la API, con la clave de TYPESEARCH_API_KEY.
 *
 * Los parámetros, títulos, descripciones, anotaciones, instrucciones y el formato de la salida son los del
 * contrato del remoto, copiado tal cual en src/contrato/mcp-contrato.ts (`npm run sync-contract`). Acá sólo
 * queda lo propio del local: el cliente de la API, la clave del entorno y los errores.
 *
 * Sin clave, el servidor igual arranca y lista las herramientas (los directorios y los clientes las
 * inspeccionan así); cada llamada devuelve un error que dice cómo configurarla.
 */
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import { APIConnectionError, APIError, APITimeoutError, RateLimitError, type SearchOptions, type Typesearch } from 'typesearch-js';
import {
  herramientas,
  instrucciones,
  NOMBRE_MCP,
  salidaDeBusqueda,
  salidaDeContenidos,
  salidaDeParecidas,
  type ListaDePrecios,
} from './contrato/mcp-contrato.ts';
import { PRICING_URL } from './pricing.ts';
import { VERSION } from './version.ts';

export const SERVER_NAME = NOMBRE_MCP;

export const MISSING_KEY =
  'Missing API key. Set TYPESEARCH_API_KEY in the environment of this MCP server (the "env" block of its configuration in your MCP client) and restart it. Get a key at https://app.typesearch.ai/api-keys.';

export interface ServerOptions {
  /** The API client; `null` when there is no key: the tools then explain how to set it. */
  client: Typesearch | null;
  /** List prices (`x-pricing` of the OpenAPI), for the descriptions; `null` to leave the figures out. */
  pricing: ListaDePrecios | null;
}

// --- Sin precios: el contrato sin las cifras, con el enlace -------------------------------------

/*
 * Si no se pudo leer `x-pricing` al arrancar, las descripciones van sin cifras: nunca un precio escrito a
 * mano. Se arman con el contrato y un marcador (NaN), y se sacan las frases con el marcador; las pruebas
 * fallan si el contrato cambia y queda alguno.
 */
const nan = Number.NaN;
const MARCADOR: ListaDePrecios = {
  per_1000_requests: { ultra: nan, fast: nan, normal: nan, deep: nan, similar: nan, similar_deep: nan, site_search: nan },
  per_1000_pages: { contents: nan, contents_with_query: nan },
};

export function withoutFigures(text: string): string {
  return text
    .replace(/ \(US\$NaN[^)]*\)/g, '')
    .replace(/, US\$NaN\)/g, ')')
    .replace(/, for US\$NaN/g, '')
    .replace(/US\$NaN per 1,000 pages read;/g, 'Billed per page read;')
    .replace(/ US\$NaN per 1,000 \w+\./g, '')
    .replace('at these list prices, like the REST API', `like the REST API (prices: ${PRICING_URL})`);
}

export function instructions(pricing: ListaDePrecios | null): string {
  return pricing ? instrucciones(pricing) : withoutFigures(instrucciones(MARCADOR));
}

export function tools(pricing: ListaDePrecios | null): ReturnType<typeof herramientas> {
  const h = herramientas(pricing ?? MARCADOR);
  if (pricing) return h;
  for (const t of Object.values(h)) t.description = withoutFigures(t.description);
  return h;
}

// --- Errores: claros para el modelo, en inglés, sin la clave -----------------------------------

const failure = (text: string): CallToolResult => ({ content: [{ type: 'text', text }], isError: true });

export function toolError(e: unknown): CallToolResult {
  if (e instanceof APIError) {
    const retry = e instanceof RateLimitError && e.retryAfter ? ` Retry after ${e.retryAfter} s.` : '';
    return failure(`Error (${e.code}): ${e.message}${retry}${e.requestId ? ` [request ${e.requestId}]` : ''}`);
  }
  if (e instanceof APITimeoutError) return failure('Error (timeout): typesearch took too long to answer. Try again, or use a lighter mode.');
  if (e instanceof APIConnectionError) return failure('Error (connection): could not reach the typesearch API. Check the network connection and try again.');
  if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) return failure('Error (cancelled): the call was cancelled.');
  return failure(`Error: ${e instanceof Error ? e.message : String(e)}`);
}

// --- El servidor -------------------------------------------------------------------------------

export function createServer({ client, pricing }: ServerOptions): McpServer {
  const server = new McpServer(
    { name: NOMBRE_MCP, title: 'typesearch', version: VERSION, websiteUrl: 'https://typesearch.ai' },
    { instructions: instructions(pricing), capabilities: { tools: {} } },
  );
  const h = tools(pricing);

  /** Llama a la API con la clave del entorno y convierte la respuesta (o el error) en la salida. */
  async function call<T>(run: (c: Typesearch) => Promise<T>, output: (v: T) => CallToolResult): Promise<CallToolResult> {
    if (!client) return failure(`Error (missing_api_key): ${MISSING_KEY}`);
    try {
      return output(await run(client));
    } catch (e) {
      return toolError(e);
    }
  }

  server.registerTool('search_news', h.search_news, async (args, ctx) =>
    call(
      (c) => {
        const options: SearchOptions = {
          mode: args.mode,
          max_results: args.max_results,
          ...(args.days !== undefined ? { days: args.days } : {}),
          ...(args.published_after ? { published_after: args.published_after } : {}),
          ...(args.published_before ? { published_before: args.published_before } : {}),
          ...(args.include_domains?.length ? { include_domains: args.include_domains } : {}),
          ...(args.exclude_domains?.length ? { exclude_domains: args.exclude_domains } : {}),
          ...(args.countries?.length ? { countries: args.countries } : {}),
          ...(args.languages?.length ? { languages: args.languages } : {}),
        };
        return c.search(args.query, options, { signal: ctx.mcpReq.signal });
      },
      (r) => salidaDeBusqueda(r, args.query),
    ),
  );

  server.registerTool('get_contents', h.get_contents, async (args, ctx) =>
    call((c) => c.contents(args.urls, args.query ? { query: args.query } : {}, { signal: ctx.mcpReq.signal }), salidaDeContenidos),
  );

  server.registerTool('find_similar', h.find_similar, async (args, ctx) =>
    call(
      // `fast`: similar cuesta lo mismo en ultra, fast y normal, y fast no lee más que la nota de referencia.
      (c) => c.similar(args.url, { mode: 'fast', max_results: args.max_results, ...(args.days !== undefined ? { days: args.days } : {}) }, { signal: ctx.mcpReq.signal }),
      (r) => salidaDeParecidas(r),
    ),
  );

  return server;
}
