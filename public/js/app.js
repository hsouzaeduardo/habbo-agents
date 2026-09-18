/**
 * Cliente da cena.
 *
 * Fluxo: abre um EventSource em /api/events, recebe o `snapshot` inicial, monta
 * a sala (tamanho e estacoes vem de la) e depois so aplica os eventos
 * `activity` / `idle` que chegam.
 * Se o servidor cair, o proprio EventSource reconecta e o snapshot seguinte
 * ressincroniza a tela -- nao existe estado que precise ser remendado na mao.
 */

import { avatarSvg, deskSvg, chairSvg, plantSvg } from './sprites.js';
import { initPanel } from './panel.js';
import { initParallax, rowDepth, spotDepth } from './parallax.js';

const stageEl = document.getElementById('stage');
const viewportEl = document.getElementById('viewport');
const stationsEl = document.getElementById('stations');
const floorEl = document.getElementById('floor');
const signEl = document.getElementById('sign');
const propsEl = document.getElementById('props');
const statusEl = document.getElementById('status');
const tickerEl = document.getElementById('ticker-list');

const TICKER_MAX = 8;

/** @type {Map<number, HTMLElement>} */
const stations = new Map();
/** @type {Map<number, HTMLElement>} uma camada de parallax por fileira */
const rowLayers = new Map();
const lastSeq = new Map();
let clockSkew = 0; // serverTime - Date.now(), para a barrinha de tempo nao mentir
let panelReady = false;

boot();

function boot() {
  fitStage();
  startWallClock();
  initParallax(stageEl);
  window.addEventListener('resize', fitStage);
  connect();
}

// ------------------------------------------------------------------- stream

function connect() {
  const es = new EventSource('/api/events');

  es.addEventListener('open', () => setStatus('online', 'ao vivo'));
  es.addEventListener('snapshot', (e) => applySnapshot(JSON.parse(e.data)));
  es.addEventListener('activity', (e) => applyAgent(JSON.parse(e.data), { announce: true }));
  es.addEventListener('idle', (e) => applyAgent(JSON.parse(e.data), { announce: false }));
  es.addEventListener('left', (e) => applyAgent(JSON.parse(e.data), { announce: false }));
  es.addEventListener('joined', (e) => applyAgent(JSON.parse(e.data), { announce: false }));

  es.addEventListener('error', () => {
    setStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'conectando', 'reconectando…');
  });
}

function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.querySelector('.status-text').textContent = text;
}

// -------------------------------------------------------------------- cena

function applySnapshot(snap) {
  clockSkew = snap.serverTime - Date.now();
  applyRoom(snap.room);

  const ids = snap.agents.map((a) => a.id).join(',');
  if (stationsEl.dataset.ids !== ids) {
    stationsEl.dataset.ids = ids;
    stationsEl.replaceChildren();
    stations.clear();
    rowLayers.clear();
    lastSeq.clear();
    for (const agent of snap.agents) buildStation(agent, snap.room);
  }

  for (const agent of snap.agents) applyAgent(agent, { announce: false, silent: true });

  renderTicker(snap.history);

  if (!panelReady) {
    panelReady = true;
    initPanel(snap.agents);
  }
}

function buildStation(agent, room) {
  const el = document.createElement('div');
  el.className = 'station';
  el.dataset.id = String(agent.id);
  el.dataset.row = String(agent.row);
  el.style.left = `${agent.x}px`;
  el.style.top = `${agent.y}px`;
  el.innerHTML = `
    ${deskSvg()}
    ${chairSvg()}
    <div class="shadow"></div>
    ${avatarSvg(agent.palette, { hair: agent.hair })}
    <div class="plate"></div>`;
  rowLayer(agent.row, room.rows).appendChild(el);
  stations.set(agent.id, el);
}

/** Camada da fileira: carrega o z-index (frente cobre fundo) e a profundidade. */
function rowLayer(row, rows) {
  let layer = rowLayers.get(row);
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'row-layer parallax';
    layer.dataset.row = String(row);
    layer.style.zIndex = String(10 + row * 10);
    layer.style.setProperty('--depth', String(rowDepth(row, rows)));
    stationsEl.appendChild(layer);
    rowLayers.set(row, layer);
  }
  return layer;
}

/** Aplica o estado de um agente. `announce` = chegou agora (pula e entra no ticker). */
function applyAgent(agent, { announce = false, silent = false } = {}) {
  const el = stations.get(agent.id);
  if (!el) return;

  el.querySelector('.plate').textContent = agent.name;
  el.classList.toggle('is-away', agent.present === false); // saiu da sala: mesa vazia

  const isNew = lastSeq.get(agent.id) !== agent.seq;
  lastSeq.set(agent.id, agent.seq);

  if (agent.activity) {
    el.classList.add('is-busy');
    showBubble(el, agent, isNew);
    if (announce && !silent) {
      pop(el);
      pushTicker({ id: agent.id, name: agent.name, activity: agent.activity, at: agent.since });
    }
  } else {
    el.classList.remove('is-busy');
    hideBubble(el);
  }
}

function pop(el) {
  el.classList.remove('is-pop');
  void el.offsetWidth; // reinicia a animacao
  el.classList.add('is-pop');
  setTimeout(() => el.classList.remove('is-pop'), 500);
}

function showBubble(station, agent, restart) {
  let bubble = station.querySelector('.bubble');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    station.appendChild(bubble);
    restart = true;
  }
  bubble.classList.remove('is-leaving');
  clearTimeout(bubble._removeTimer);

  // textContent em tudo: o texto vem de fora, nunca vira HTML
  const who = document.createElement('b');
  who.className = 'who';
  who.textContent = agent.name;

  const what = document.createElement('span');
  what.className = 'what';
  what.textContent = agent.activity;

  const life = document.createElement('i');
  life.className = 'life';

  bubble.replaceChildren(who, what, life);

  if (restart) {
    bubble.style.animation = 'none';
    void bubble.offsetWidth;
    bubble.style.animation = '';
  }

  const remaining = agent.expiresAt ? agent.expiresAt - (Date.now() + clockSkew) : 0;
  if (remaining > 0) {
    life.style.width = '100%';
    requestAnimationFrame(() => {
      life.style.transition = `width ${remaining}ms linear`;
      life.style.width = '0%';
    });
  } else {
    life.style.display = 'none';
  }
}

function hideBubble(station) {
  const bubble = station.querySelector('.bubble');
  if (!bubble || bubble.classList.contains('is-leaving')) return;
  bubble.classList.add('is-leaving');
  bubble._removeTimer = setTimeout(() => bubble.remove(), 260);
}

// ------------------------------------------------------------------ ticker

function renderTicker(history = []) {
  tickerEl.replaceChildren();
  if (!history.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'aguardando o primeiro POST…';
    tickerEl.appendChild(li);
    return;
  }
  for (const item of history.slice(0, TICKER_MAX)) tickerEl.appendChild(tickerItem(item));
}

function pushTicker(item) {
  const empty = tickerEl.querySelector('.empty');
  if (empty) empty.remove();
  tickerEl.prepend(tickerItem(item));
  while (tickerEl.children.length > TICKER_MAX) tickerEl.lastElementChild.remove();
}

function tickerItem({ name, activity, at }) {
  const li = document.createElement('li');
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = `${name}: `;
  const what = document.createElement('span');
  what.textContent = activity;
  const when = document.createElement('span');
  when.className = 'when';
  when.textContent = new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  li.append(who, what, when);
  return li;
}

// ------------------------------------------------------------------ cenario

/** O palco nao tem tamanho fixo: cresce com a grade de agentes que o servidor montou. */
function applyRoom(room) {
  const style = document.documentElement.style;
  style.setProperty('--stage-w', `${room.width}px`);
  style.setProperty('--stage-h', `${room.height}px`);
  style.setProperty('--floor-top', `${room.floorTop}px`);

  // viewBox igual ao tamanho renderizado (ja com a folga do parallax): os
  // ladrilhos continuam 64x32 e quadrados
  floorEl.setAttribute('viewBox', `0 0 ${room.width + 120} ${room.height - room.floorTop + 40}`);
  signEl.textContent = `ESCRITÓRIO · ${room.total} AGENTES`;

  renderProps(room);
  fitStage();
}

function renderProps(room) {
  const spots = [
    { x: 56, y: room.floorTop + 110, w: 60 },
    { x: room.width - 54, y: room.floorTop + 90, w: 52 },
    { x: room.width - 80, y: room.height - 40, w: 72 },
  ];
  propsEl.replaceChildren();
  for (const spot of spots) {
    const el = document.createElement('div');
    el.className = 'prop parallax';
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y}px`;
    el.style.width = `${spot.w}px`;
    el.style.setProperty('--depth', String(spotDepth(spot.y, room)));
    el.innerHTML = plantSvg();
    propsEl.appendChild(el);
  }
}

/** O palco tem tamanho fixo (960x600) e e escalado para caber na tela/TV. */
function fitStage() {
  const pad = 28;
  const scale = Math.min(
    1.6,
    (viewportEl.clientWidth - pad) / stageEl.offsetWidth,
    (viewportEl.clientHeight - pad) / stageEl.offsetHeight,
  );
  document.documentElement.style.setProperty('--scale', String(Math.max(0.3, scale)));
}

function startWallClock() {
  const hand = { h: document.getElementById('clock-h'), m: document.getElementById('clock-m') };
  const tick = () => {
    const now = new Date();
    const minutes = now.getMinutes();
    hand.m.setAttribute('transform', `rotate(${minutes * 6} 20 20)`);
    hand.h.setAttribute('transform', `rotate(${(now.getHours() % 12) * 30 + minutes * 0.5} 20 20)`);
  };
  tick();
  setInterval(tick, 20_000);
}
