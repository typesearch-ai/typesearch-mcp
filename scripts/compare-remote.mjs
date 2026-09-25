// Compara el `tools/list` y las instrucciones del MCP local (dist/index.js por stdio, con los precios del
// OpenAPI vivo) con los del remoto. No hace falta clave: los dos listan sin ella. Sale con 1 si difieren.
//
//   npm run compare-remote                       # contra https://api.typesearch.ai/mcp
//   MCP_URL=http://localhost:8080/mcp TYPESEARCH_BASE_URL=http://localhost:8080 npm run compare-remote
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';

const remoteUrl = process.env.MCP_URL || 'https://api.typesearch.ai/mcp';
const baseURL = process.env.TYPESEARCH_BASE_URL || 'https://api.typesearch.ai';

async function list(transport) {
  const client = new Client({ name: 'compare-remote', version: '1.0.0' });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const out = { instructions: client.getInstructions(), tools };
  await client.close();
  return out;
}

const remote = await list(new StreamableHTTPClientTransport(new URL(remoteUrl)));
const local = await list(
  new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../dist/index.js', import.meta.url))],
    env: { PATH: process.env.PATH ?? '', TYPESEARCH_BASE_URL: baseURL },
    stderr: 'ignore',
  }),
);

let same = true;
const say = (ok, what) => {
  console.log(`${ok ? 'igual  ' : 'DIFIERE'} ${what}`);
  same &&= ok;
};
say(remote.instructions === local.instructions, 'instrucciones');
say(JSON.stringify(remote.tools.map((t) => t.name)) === JSON.stringify(local.tools.map((t) => t.name)), `herramientas (${remote.tools.map((t) => t.name).join(', ')})`);
for (const r of remote.tools) {
  const l = local.tools.find((t) => t.name === r.name);
  for (const key of new Set([...Object.keys(r), ...Object.keys(l ?? {})])) {
    const ok = JSON.stringify(r[key]) === JSON.stringify(l?.[key]);
    if (!ok) say(false, `${r.name}.${key}\n  remoto: ${JSON.stringify(r[key])}\n  local:  ${JSON.stringify(l?.[key])}`);
  }
}
console.log(same ? `El local lista lo mismo que ${remoteUrl}.` : `El local no lista lo mismo que ${remoteUrl}.`);
process.exit(same ? 0 : 1);
