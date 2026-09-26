/*
 * Los tipos que el contrato (mcp-contrato.ts, copiado tal cual de typesearch-api) importa de
 * lib/api/v1.ts de la API. Acá salen de typesearch-js, que se genera del OpenAPI de esos mismos esquemas:
 * son las mismas formas. Sólo tipos: se borran al compilar.
 *
 * El país y el idioma de cada resultado llegan con la API que filtra por país e idioma; el OpenAPI que
 * copió el SDK todavía no los tiene, así que se suman acá.
 */
import type { ContentsResponse, Result, SearchResponse } from 'typesearch-js';

type ConLugar = Result & { country?: string | null; language?: string | null };

export type RespuestaBusqueda = Omit<SearchResponse, 'results' | 'near_misses'> & { results: ConLugar[]; near_misses: ConLugar[] };
export type RespuestaContenidos = ContentsResponse;
