// Copia tal cual el contrato del MCP de la API (lib/api/mcp-contrato.ts de typesearch-api: parámetros,
// títulos, descripciones, instrucciones y formato de salida) a src/contrato/, y anota de dónde salió en
// src/contrato/origen.json. El MCP local y el remoto quedan diciendo y devolviendo lo mismo.
//
//   node scripts/sync-contract.mjs                  # desde origin/main de ~/Documents/GitHub/typesearch-api
//   node scripts/sync-contract.mjs --ref <ref>      # otra rama o commit
//   node scripts/sync-contract.mjs --from <archivo> # un archivo cualquiera (p. ej. el del árbol de trabajo)
//   node scripts/sync-contract.mjs --check          # sólo compara: sale con 1 si difieren
//
// TYPESEARCH_API_DIR cambia la carpeta del repo de la API. Después de copiar: `npm run lint && npm test`.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RUTA = 'lib/api/mcp-contrato.ts';
const destino = new URL('../src/contrato/mcp-contrato.ts', import.meta.url);
const origen = new URL('../src/contrato/origen.json', import.meta.url);

export const sha256 = (texto) => crypto.createHash('sha256').update(texto).digest('hex');

/** El contrato de la API: `{ texto, fuente, commit }`, o `null` si no hay repo de la API a mano. */
export function leerFuente({ from, ref = 'origin/main', dir = process.env.TYPESEARCH_API_DIR || path.join(os.homedir(), 'Documents/GitHub/typesearch-api') } = {}) {
  if (from) return { texto: fs.readFileSync(from, 'utf8'), fuente: path.resolve(from), commit: null };
  if (!fs.existsSync(path.join(dir, '.git'))) return null;
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    return { texto: git('show', `${ref}:${RUTA}`), fuente: `typesearch-api@${ref}:${RUTA}`, commit: git('log', '-1', '--format=%H', ref, '--', RUTA).trim() || null };
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const valor = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const fuente = leerFuente({ from: valor('--from'), ref: valor('--ref') });
  if (!fuente) {
    console.error('No encuentro el repo de typesearch-api (TYPESEARCH_API_DIR) ni el contrato en esa referencia.');
    process.exit(2);
  }
  const actual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : '';
  if (args.includes('--check')) {
    if (actual === fuente.texto) {
      console.log(`El contrato está al día con ${fuente.fuente}.`);
      process.exit(0);
    }
    console.error(`El contrato difiere de ${fuente.fuente}: corre \`npm run sync-contract\` y revisa el diff.`);
    process.exit(1);
  }
  fs.writeFileSync(destino, fuente.texto);
  fs.writeFileSync(origen, `${JSON.stringify({ fuente: fuente.fuente, commit: fuente.commit, sha256: sha256(fuente.texto) }, null, 2)}\n`);
  console.log(actual === fuente.texto ? 'Sin cambios.' : `Copiado de ${fuente.fuente}${fuente.commit ? ` (${fuente.commit.slice(0, 7)})` : ''}.`);
}
