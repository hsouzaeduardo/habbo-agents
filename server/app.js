/**
 * Monta o app Express. Separado do index.js para que os testes possam subir uma
 * instancia em porta aleatoria sem efeito colateral nenhum.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { createHub } from './sse.js';
import { createStore } from './state.js';
import { normalizeActivity, normalizeAgentId } from './validate.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const startedAt = Date.now();

export function createApp({ ttlMs = 20_000, agentCount, apiKey = '', corsOrigin = '*' } = {}) {
  const app = express();
  const hub = createHub();
  const store = createStore({ ttlMs, agentCount, onChange: (event, data) => hub.broadcast(event, data) });
  store.start();

  // --- CORS: a ingestao vem de automacao externa (n8n/Make), entao precisa ser aberta.
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', corsOrigin);
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.set('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '32kb' }));

  // JSON malformado: devolver JSON, e nao a pagina de erro HTML do Express.
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ ok: false, error: 'JSON invalido no corpo da requisicao' });
    }
    return next(err);
  });

  // --- API key: protege so a escrita. A pagina precisa ler /api/state e /api/events
  //     sem chave, senao a chave teria que ir parar no JavaScript do navegador.
  const requireKey = (req, res, next) => {
    if (!apiKey) return next();
    if (req.get('x-api-key') === apiKey) return next();
    return res.status(401).json({ ok: false, error: 'x-api-key ausente ou invalida' });
  };

  // ------------------------------------------------------------------ rotas

  app.get('/api/state', (req, res) => {
    res.json({ ok: true, ...store.snapshot() });
  });

  app.get('/api/events', (req, res) => {
    req.socket.setTimeout(0);
    req.socket.setNoDelay?.(true);
    req.socket.setKeepAlive?.(true);
    hub.add(req, res, { event: 'snapshot', data: store.snapshot() });
  });

  app.post('/api/activity', requireKey, (req, res) => {
    const parsed = normalizeActivity(req.body, { validIds: store.validIds });
    if (!parsed.ok) return res.status(400).json(parsed);

    const agent = store.setActivity(parsed.value);
    res.json({ ok: true, agent });
  });

  app.post('/api/activity/batch', requireKey, (req, res) => {
    const list = Array.isArray(req.body) ? req.body : req.body?.items;
    if (!Array.isArray(list)) {
      return res.status(400).json({ ok: false, error: 'Envie um array de payloads (ou { items: [...] })' });
    }
    if (list.length > 50) {
      return res.status(400).json({ ok: false, error: 'Maximo de 50 itens por lote' });
    }

    const results = list.map((item, index) => {
      const parsed = normalizeActivity(item, { validIds: store.validIds });
      if (!parsed.ok) return { index, ...parsed };
      return { index, ok: true, agent: store.setActivity(parsed.value) };
    });

    const failed = results.filter((r) => !r.ok).length;
    res.status(failed === results.length && failed > 0 ? 400 : 200).json({
      ok: failed === 0,
      applied: results.length - failed,
      failed,
      results,
    });
  });

  // limpa so o balao -- o agente continua na mesa
  app.delete('/api/activity/:agentId', requireKey, (req, res) => {
    const parsed = normalizeAgentId(req.params.agentId, { validIds: store.validIds });
    if (!parsed.ok) return res.status(400).json(parsed);
    res.json({ ok: true, agent: store.clear(parsed.value) });
  });

  // tira o agente da sala (terminou o trabalho e foi embora). Qualquer POST de
  // atividade depois disso traz ele de volta sozinho.
  app.delete('/api/agent/:agentId', requireKey, (req, res) => {
    const parsed = normalizeAgentId(req.params.agentId, { validIds: store.validIds });
    if (!parsed.ok) return res.status(400).json(parsed);
    res.json({ ok: true, agent: store.leave(parsed.value) });
  });

  // devolve o agente para a mesa sem atividade nenhuma
  app.post('/api/agent/:agentId', requireKey, (req, res) => {
    const parsed = normalizeAgentId(req.params.agentId, { validIds: store.validIds });
    if (!parsed.ok) return res.status(400).json(parsed);
    res.json({ ok: true, agent: store.enter(parsed.value) });
  });

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      viewers: hub.size,
      agents: store.validIds.length,
      ttlMs,
      authRequired: Boolean(apiKey),
    });
  });

  // ------------------------------------------------------------ estaticos

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: 0 }));

  app.use('/api', (req, res) => {
    res.status(404).json({ ok: false, error: `Rota nao encontrada: ${req.method} /api${req.url}` });
  });

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('[erro]', err);
    res.status(500).json({ ok: false, error: 'Erro interno' });
  });

  app.locals.store = store;
  app.locals.hub = hub;
  app.locals.close = () => {
    store.stop();
    hub.close();
  };

  return app;
}
