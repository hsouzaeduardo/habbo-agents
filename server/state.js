/**
 * Estado dos agentes em memoria.
 *
 * Os slots sao criados a partir de agents.config.js (a quantidade vem de
 * AGENT_COUNT). Nao ha banco de dados de proposito: e um painel ao vivo,
 * reiniciar o servidor deve limpar os baloes.
 */

import { buildRoom, DEFAULT_AGENT_COUNT } from './agents.config.js';

const HISTORY_SIZE = 20;

export function createStore({ ttlMs = 20_000, agentCount = DEFAULT_AGENT_COUNT, onChange = () => {} } = {}) {
  const { room, agents: base } = buildRoom(agentCount);
  const agents = new Map(
    base.map((a) => [
      a.id,
      { ...a, defaultName: a.name, present: true, activity: null, since: null, expiresAt: null, seq: 0 },
    ]),
  );
  const validIds = base.map((a) => a.id);

  /** @type {{ id: number, name: string, activity: string, at: number }[]} */
  const history = [];
  let sweeper = null;

  const publicAgent = (a) => ({
    id: a.id,
    name: a.name,
    x: a.x,
    y: a.y,
    row: a.row,
    hair: a.hair,
    palette: a.palette,
    present: a.present,
    activity: a.activity,
    since: a.since,
    expiresAt: a.expiresAt,
    seq: a.seq,
  });

  function setActivity({ agentId, activity, agentName, ttlMs: overrideTtl }) {
    const agent = agents.get(agentId);
    if (!agent) return null;

    const effectiveTtl = overrideTtl === undefined ? ttlMs : overrideTtl;
    const now = Date.now();

    if (agentName) agent.name = agentName;
    agent.present = true; // atividade nova traz de volta quem tinha saido
    agent.activity = activity;
    agent.since = now;
    // ttl 0 (ou negativo) = balao permanente, some so quando chegar outro POST
    agent.expiresAt = effectiveTtl > 0 ? now + effectiveTtl : null;
    agent.seq += 1;

    history.unshift({ id: agent.id, name: agent.name, activity, at: now });
    if (history.length > HISTORY_SIZE) history.length = HISTORY_SIZE;

    const payload = publicAgent(agent);
    onChange('activity', payload);
    return payload;
  }

  function clear(agentId, reason = 'manual') {
    const agent = agents.get(agentId);
    if (!agent || agent.activity === null) return agent ? publicAgent(agent) : null;

    agent.activity = null;
    agent.since = null;
    agent.expiresAt = null;
    agent.seq += 1;

    const payload = publicAgent(agent);
    onChange('idle', { ...payload, reason });
    return payload;
  }

  /** Tira o agente da sala: some da cena e a mesa fica vazia. */
  function leave(agentId) {
    const agent = agents.get(agentId);
    if (!agent) return null;

    agent.activity = null;
    agent.since = null;
    agent.expiresAt = null;
    agent.present = false;
    agent.seq += 1;

    const payload = publicAgent(agent);
    onChange('left', payload);
    return payload;
  }

  /** Devolve o agente para a mesa, sem atividade. */
  function enter(agentId) {
    const agent = agents.get(agentId);
    if (!agent) return null;

    agent.present = true;
    agent.seq += 1;

    const payload = publicAgent(agent);
    onChange('joined', payload);
    return payload;
  }

  /** Apaga os baloes vencidos. Chamado pelo intervalo, mas exposto para os testes. */
  function sweep(now = Date.now()) {
    let cleared = 0;
    for (const agent of agents.values()) {
      if (agent.expiresAt !== null && agent.expiresAt <= now) {
        clear(agent.id, 'expirado');
        cleared += 1;
      }
    }
    return cleared;
  }

  function snapshot() {
    return {
      room,
      ttlMs,
      serverTime: Date.now(),
      agents: [...agents.values()].map(publicAgent),
      history: [...history],
    };
  }

  function start() {
    if (sweeper) return;
    sweeper = setInterval(() => sweep(), 1000);
    sweeper.unref?.();
  }

  function stop() {
    if (sweeper) clearInterval(sweeper);
    sweeper = null;
  }

  return { setActivity, clear, leave, enter, sweep, snapshot, start, stop, validIds, room, ttlMs };
}
