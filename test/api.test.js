import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import { createApp } from '../server/app.js';

/** Sobe o app em porta aleatoria e devolve helpers de request. */
async function startServer(opts = {}) {
  // agentCount fixo em 6 nos testes para as assercoes de faixa nao dependerem do padrao
  const app = createApp({ ttlMs: 20_000, agentCount: 6, ...opts });
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  return {
    base,
    store: app.locals.store,
    async post(path, body, headers = {}) {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    },
    async del(path) {
      const res = await fetch(base + path, { method: 'DELETE' });
      return { status: res.status, body: await res.json() };
    },
    async get(path) {
      const res = await fetch(base + path);
      return { status: res.status, body: await res.json() };
    },
    async close() {
      app.locals.close();
      server.closeAllConnections?.();
      server.close();
      await once(server, 'close');
    },
  };
}

test('POST /api/activity coloca a atividade no agente', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const res = await srv.post('/api/activity', {
    agentID: 2,
    agentName: 'Felipe',
    activity: 'Realizando leitura',
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.agent.id, 2);
  assert.equal(res.body.agent.name, 'Felipe');
  assert.equal(res.body.agent.activity, 'Realizando leitura');
  assert.ok(res.body.agent.expiresAt > Date.now());

  const state = await srv.get('/api/state');
  const agent = state.body.agents.find((a) => a.id === 2);
  assert.equal(agent.activity, 'Realizando leitura');
  assert.equal(state.body.history[0].activity, 'Realizando leitura');
});

test('aceita agentId e id como sinonimos de agentID', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  assert.equal((await srv.post('/api/activity', { agentId: 3, activity: 'a' })).status, 200);
  assert.equal((await srv.post('/api/activity', { id: '4', activity: 'b' })).status, 200);

  const state = await srv.get('/api/state');
  assert.equal(state.body.agents.find((a) => a.id === 3).activity, 'a');
  assert.equal(state.body.agents.find((a) => a.id === 4).activity, 'b');
});

test('rejeita agentID fora de 1..6 e atividade vazia', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const fora = await srv.post('/api/activity', { agentID: 7, activity: 'x' });
  assert.equal(fora.status, 400);
  assert.equal(fora.body.ok, false);
  assert.deepEqual(fora.body.validIds, [1, 2, 3, 4, 5, 6]);

  const vazia = await srv.post('/api/activity', { agentID: 1, activity: '   ' });
  assert.equal(vazia.status, 400);
  assert.equal(vazia.body.field, 'activity');

  const semId = await srv.post('/api/activity', { activity: 'x' });
  assert.equal(semId.status, 400);
  assert.equal(semId.body.field, 'agentID');

  const longa = await srv.post('/api/activity', { agentID: 1, activity: 'x'.repeat(141) });
  assert.equal(longa.status, 400);

  const jsonRuim = await srv.post('/api/activity', '{ nao sou json }');
  assert.equal(jsonRuim.status, 400);
  assert.match(jsonRuim.body.error, /JSON invalido/);
});

test('o balao expira depois do TTL', async (t) => {
  const srv = await startServer({ ttlMs: 30 });
  t.after(() => srv.close());

  await srv.post('/api/activity', { agentID: 5, activity: 'Vai sumir' });
  await new Promise((r) => setTimeout(r, 60));

  assert.equal(srv.store.sweep(), 1);
  const state = await srv.get('/api/state');
  assert.equal(state.body.agents.find((a) => a.id === 5).activity, null);
});

test('ttlMs 0 deixa o balao permanente', async (t) => {
  const srv = await startServer({ ttlMs: 0 });
  t.after(() => srv.close());

  const res = await srv.post('/api/activity', { agentID: 1, activity: 'Fico aqui' });
  assert.equal(res.body.agent.expiresAt, null);
  assert.equal(srv.store.sweep(Date.now() + 10 ** 9), 0);
});

test('DELETE limpa o balao', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  await srv.post('/api/activity', { agentID: 6, activity: 'Some com isso' });
  const res = await srv.del('/api/activity/6');
  assert.equal(res.status, 200);
  assert.equal(res.body.agent.activity, null);
  assert.equal((await srv.del('/api/activity/9')).status, 400);
});

test('DELETE /api/agent/:id tira o agente da sala e ele volta com atividade nova', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  await srv.post('/api/activity', { agentID: 4, activity: 'Terminando o relatorio' });

  const saiu = await srv.del('/api/agent/4');
  assert.equal(saiu.status, 200);
  assert.equal(saiu.body.agent.present, false);
  assert.equal(saiu.body.agent.activity, null, 'sair tambem apaga o balao');

  let state = await srv.get('/api/state');
  assert.equal(state.body.agents.find((a) => a.id === 4).present, false);
  // os outros continuam na sala
  assert.equal(state.body.agents.filter((a) => a.present).length, 5);

  // atividade nova traz de volta sem precisar de outra chamada
  const voltou = await srv.post('/api/activity', { agentID: 4, activity: 'Comecando outra' });
  assert.equal(voltou.body.agent.present, true);

  // e da para devolver sem atividade tambem
  await srv.del('/api/agent/4');
  const posto = await srv.post('/api/agent/4');
  assert.equal(posto.status, 200);
  assert.equal(posto.body.agent.present, true);
  assert.equal(posto.body.agent.activity, null);

  assert.equal((await srv.del('/api/agent/99')).status, 400);
});

test('limpar o balao nao tira o agente da sala', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  await srv.post('/api/activity', { agentID: 2, activity: 'x' });
  const res = await srv.del('/api/activity/2');
  assert.equal(res.body.agent.activity, null);
  assert.equal(res.body.agent.present, true, 'DELETE /api/activity mexe so no balao');
});

test('SSE avisa quando o agente sai e quando volta', async (t) => {
  const srv = await startServer();
  const controller = new AbortController();
  t.after(async () => {
    controller.abort();
    await srv.close();
  });

  const res = await fetch(`${srv.base}/api/events`, { signal: controller.signal });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const readUntil = async (marker, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (!buffer.includes(marker)) {
      if (Date.now() > deadline) throw new Error(`timeout esperando "${marker}"`);
      const { value, done } = await reader.read();
      if (done) throw new Error('stream fechado antes da hora');
      buffer += value;
    }
  };

  await readUntil('event: snapshot');
  await srv.del('/api/agent/3');
  await readUntil('event: left');
  await srv.post('/api/agent/3');
  await readUntil('event: joined');

  assert.match(buffer, /"present":false/);
  reader.cancel().catch(() => {});
});

test('POST /api/activity/batch aplica varios de uma vez', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const res = await srv.post('/api/activity/batch', [
    { agentID: 1, activity: 'Um' },
    { agentID: 2, activity: 'Dois' },
    { agentID: 99, activity: 'Invalido' },
  ]);

  assert.equal(res.status, 200);
  assert.equal(res.body.applied, 2);
  assert.equal(res.body.failed, 1);
  assert.equal(res.body.ok, false);
});

test('API_KEY protege a escrita mas nao a leitura', async (t) => {
  const srv = await startServer({ apiKey: 'segredo' });
  t.after(() => srv.close());

  assert.equal((await srv.post('/api/activity', { agentID: 1, activity: 'x' })).status, 401);
  assert.equal((await srv.post('/api/activity', { agentID: 1, activity: 'x' }, { 'x-api-key': 'segredo' })).status, 200);
  assert.equal((await srv.get('/api/state')).status, 200);
});

test('SSE entrega snapshot na conexao e activity depois do POST', async (t) => {
  const srv = await startServer();
  const controller = new AbortController();
  t.after(async () => {
    controller.abort();
    await srv.close();
  });

  const res = await fetch(`${srv.base}/api/events`, { signal: controller.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  const readUntil = async (marker, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs;
    while (!buffer.includes(marker)) {
      if (Date.now() > deadline) throw new Error(`timeout esperando "${marker}" — recebido: ${buffer}`);
      const { value, done } = await reader.read();
      if (done) throw new Error('stream fechado antes da hora');
      buffer += value;
    }
  };

  await readUntil('event: snapshot');
  await srv.post('/api/activity', { agentID: 2, agentName: 'Felipe', activity: 'Realizando leitura' });
  await readUntil('event: activity');

  assert.match(buffer, /"activity":"Realizando leitura"/);
  assert.match(buffer, /"name":"Felipe"/);
  reader.cancel().catch(() => {});
});

test('a quantidade de agentes e configuravel e a sala cresce junto', async (t) => {
  const srv = await startServer({ agentCount: 15 });
  t.after(() => srv.close());

  const { body } = await srv.get('/api/state');
  assert.equal(body.agents.length, 15);
  assert.equal(body.room.total, 15);
  assert.equal(body.room.cols * body.room.rows >= 15, true);
  assert.ok(body.room.width > 960, 'a sala precisa ficar mais larga que a de 6');

  // todo agente tem posicao dentro do palco e cores proprias
  for (const agent of body.agents) {
    assert.ok(agent.x > 0 && agent.x < body.room.width, `x fora do palco: ${agent.x}`);
    assert.ok(agent.y > body.room.floorTop && agent.y <= body.room.height, `y fora do piso: ${agent.y}`);
    assert.ok(agent.name.length > 0);
    assert.ok(agent.palette.shirt);
  }

  assert.equal((await srv.post('/api/activity', { agentID: 15, activity: 'Agente novo' })).status, 200);
  const fora = await srv.post('/api/activity', { agentID: 16, activity: 'nao existe' });
  assert.equal(fora.status, 400);
  assert.equal(fora.body.validIds.length, 15);
});

test('o limite de agentes e respeitado', async (t) => {
  const srv = await startServer({ agentCount: 999 });
  t.after(() => srv.close());
  const { body } = await srv.get('/api/state');
  assert.equal(body.agents.length, 50); // MAX_AGENTS
});

test('GET /health responde com o numero de espectadores', async (t) => {
  const srv = await startServer();
  t.after(() => srv.close());

  const res = await srv.get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.viewers, 0);
  assert.equal(res.body.authRequired, false);
});
