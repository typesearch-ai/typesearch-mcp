/*
 * Los precios que dicen las descripciones de las herramientas, como el MCP remoto. No se copian a mano:
 * salen de `x-pricing` del OpenAPI público de la API (el mismo precio que cobra), que se lee al arrancar
 * sin clave. Si no se puede leer a tiempo, las descripciones van sin cifras y remiten a la página.
 */
import type { ListaDePrecios } from './contrato/mcp-contrato.ts';

export type Pricing = ListaDePrecios;

export const PRICING_URL = 'https://typesearch.ai/pricing';

export async function fetchPricing(baseURL: string, { timeout = 2500, fetch: f = globalThis.fetch }: { timeout?: number; fetch?: typeof fetch } = {}): Promise<Pricing | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const r = await f(`${baseURL.replace(/\/+$/, '')}/v1/openapi.json`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const spec = (await r.json()) as { 'x-pricing'?: unknown };
    return valid(spec['x-pricing']) ? spec['x-pricing'] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function valid(p: unknown): p is Pricing {
  const x = p as Pricing | undefined;
  const numbers = (o: unknown, keys: string[]) => !!o && typeof o === 'object' && keys.every((k) => typeof (o as Record<string, unknown>)[k] === 'number');
  return numbers(x?.per_1000_requests, ['ultra', 'fast', 'normal', 'deep', 'similar']) && numbers(x?.per_1000_pages, ['contents', 'contents_with_query']);
}
