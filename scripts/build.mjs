// Empaqueta el servidor en un solo archivo, sin dependencias en runtime: `npx -y typesearch-mcp` baja un
// paquete y arranca. typesearch-js, el SDK de MCP y zod van adentro.
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
// zod trae los mensajes de error en 40 idiomas (~200 KB); el servidor escribe los suyos en inglés.
const soloIngles = {
  name: 'zod-solo-ingles',
  setup(b) {
    b.onResolve({ filter: /^\.\/[a-zA-Z-]+\.js$/ }, (a) =>
      /zod[\\/](v4[\\/])?locales[\\/]index\.js$/.test(a.importer) && a.path !== './en.js' ? { path: a.path, namespace: 'zod-locale' } : undefined,
    );
    b.onLoad({ filter: /.*/, namespace: 'zod-locale' }, () => ({ contents: 'export default function () { return {}; }', loader: 'js' }));
  },
};

const result = await build({
  entryPoints: [new URL('../src/index.ts', import.meta.url).pathname],
  outfile: new URL('../dist/index.js', import.meta.url).pathname,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  minify: true,
  legalComments: 'external',
  metafile: true,
  plugins: [soloIngles],
  banner: {
    // Algunas dependencias usan require(): en un módulo ESM hace falta crearlo.
    js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
});
fs.chmodSync(new URL('../dist/index.js', import.meta.url), 0o755);
const bytes = fs.statSync(new URL('../dist/index.js', import.meta.url)).size;
console.log(`dist/index.js: ${(bytes / 1024).toFixed(0)} KB`);
if (process.argv.includes('--analyze')) console.log(await (await import('esbuild')).analyzeMetafile(result.metafile));
