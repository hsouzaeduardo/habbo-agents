/**
 * Normalizacao e validacao do payload de atividade.
 *
 * Proposital: aceita `agentID`, `agentId` e `id` para a mesma coisa, porque
 * quem integra (n8n, Make, script proprio) escreve de um jeito diferente cada
 * vez e um 400 por causa de maiuscula e frustrante.
 */

export const MAX_ACTIVITY = 140;
export const MAX_NAME = 24;
export const MAX_TTL = 10 * 60 * 1000;

function pickId(body) {
  for (const key of ['agentID', 'agentId', 'agentid', 'id']) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') return body[key];
  }
  return undefined;
}

function pickName(body) {
  for (const key of ['agentName', 'agentname', 'name', 'nome']) {
    if (typeof body[key] === 'string') return body[key];
  }
  return undefined;
}

function pickActivity(body) {
  for (const key of ['activity', 'atividade', 'message', 'text']) {
    if (typeof body[key] === 'string') return body[key];
  }
  return undefined;
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

/**
 * @param {unknown} body corpo bruto da requisicao
 * @param {{ validIds: number[] }} opts
 * @returns {{ ok: true, value: { agentId: number, activity: string, agentName?: string, ttlMs?: number } }
 *          | { ok: false, error: string, field?: string, validIds?: number[] }}
 */
export function normalizeActivity(body, { validIds }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('Corpo da requisicao deve ser um objeto JSON', { field: 'body' });
  }

  const rawId = pickId(body);
  if (rawId === undefined) {
    return fail('Campo obrigatorio ausente: agentID', { field: 'agentID', validIds });
  }
  const agentId = Number(rawId);
  if (!Number.isInteger(agentId) || !validIds.includes(agentId)) {
    return fail(`agentID invalido: ${JSON.stringify(rawId)}`, { field: 'agentID', validIds });
  }

  const rawActivity = pickActivity(body);
  if (rawActivity === undefined) {
    return fail('Campo obrigatorio ausente: activity', { field: 'activity' });
  }
  const activity = rawActivity.trim().replace(/\s+/g, ' ');
  if (activity.length === 0) {
    return fail('activity nao pode ser vazia (use DELETE /api/activity/:id para limpar o balao)', {
      field: 'activity',
    });
  }
  if (activity.length > MAX_ACTIVITY) {
    return fail(`activity excede ${MAX_ACTIVITY} caracteres (recebido: ${activity.length})`, {
      field: 'activity',
    });
  }

  const value = { agentId, activity };

  const rawName = pickName(body);
  if (rawName !== undefined) {
    const agentName = rawName.trim().replace(/\s+/g, ' ');
    if (agentName.length > MAX_NAME) {
      return fail(`agentName excede ${MAX_NAME} caracteres`, { field: 'agentName' });
    }
    if (agentName.length > 0) value.agentName = agentName;
  }

  if (body.ttlMs !== undefined && body.ttlMs !== null && body.ttlMs !== '') {
    const ttlMs = Number(body.ttlMs);
    if (!Number.isFinite(ttlMs) || ttlMs < 0 || ttlMs > MAX_TTL) {
      return fail(`ttlMs deve ser um numero entre 0 e ${MAX_TTL}`, { field: 'ttlMs' });
    }
    value.ttlMs = Math.round(ttlMs);
  }

  return { ok: true, value };
}

/** Valida o :agentId da rota DELETE. */
export function normalizeAgentId(raw, { validIds }) {
  const agentId = Number(raw);
  if (!Number.isInteger(agentId) || !validIds.includes(agentId)) {
    return fail(`agentID invalido: ${JSON.stringify(raw)}`, { field: 'agentID', validIds });
  }
  return { ok: true, value: agentId };
}
