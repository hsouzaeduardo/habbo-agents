/** Bootstrap: le o .env (se existir), sobe o servidor e desliga com educacao. */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { normalizeCount, DEFAULT_AGENT_COUNT, MAX_AGENTS } from './agents.config.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // sem .env: segue com os padroes
}

const PORT = Number(process.env.PORT || 3000);
const TTL = process.env.BUBBLE_TTL_MS === undefined ? 20_000 : Number(process.env.BUBBLE_TTL_MS);
const AGENT_COUNT = normalizeCount(process.env.AGENT_COUNT ?? DEFAULT_AGENT_COUNT);
const API_KEY = process.env.API_KEY || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = createApp({
  ttlMs: Number.isFinite(TTL) ? TTL : 20_000,
  agentCount: AGENT_COUNT,
  apiKey: API_KEY,
  corsOrigin: CORS_ORIGIN,
});

const server = app.listen(PORT, () => {
  console.log('');
  console.log('  \x1b[1m\x1b[36mHabbo Office\x1b[0m  ->  \x1b[4mhttp://localhost:' + PORT + '\x1b[0m');
  console.log('  POST http://localhost:' + PORT + '/api/activity');
  console.log('       { "agentID": 2, "agentName": "Felipe", "activity": "Realizando leitura" }');
  console.log('  Agentes: ' + AGENT_COUNT + ' (agentID de 1 a ' + AGENT_COUNT + ') - mude AGENT_COUNT no .env, ate ' + MAX_AGENTS);
  console.log('  Balao: ' + (TTL > 0 ? TTL + 'ms' : 'permanente ate o proximo POST'));
  console.log('  Auth : ' + (API_KEY ? 'x-api-key exigida nas rotas de escrita' : 'aberta (defina API_KEY no .env para exigir chave)'));
  console.log('  Painel de testes: tecla D na pagina, ou ?panel=1');
  console.log('');
});

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\nEncerrando...');
    app.locals.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
