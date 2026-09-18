/**
 * Painel de testes (tecla D, botao no rodape ou ?panel=1).
 *
 * Nao e um atalho interno: os botoes disparam o mesmo POST /api/activity que a
 * automacao externa usa, entao o que funciona aqui funciona no n8n.
 * Se o servidor exigir chave, passe ?key=SUA_CHAVE na URL uma vez (fica salva).
 */

const SUGESTOES = [
  'Realizando leitura',
  'Analisando planilha',
  'Em reunião com o cliente',
  'Respondendo e-mails',
  'Revisando contrato',
  'Tomando um café',
  'Escrevendo relatório',
  'Organizando arquivos',
  'Estudando documentação',
  'Conferindo notas fiscais',
  'Atualizando o CRM',
  'Fazendo uma pausa',
];

const KEY_STORAGE = 'habbo-office:key';

export function initPanel(agents) {
  const panel = document.getElementById('panel');
  const els = {
    toggle: document.getElementById('panel-toggle'),
    close: document.getElementById('panel-close'),
    activity: document.getElementById('panel-activity'),
    name: document.getElementById('panel-name'),
    grid: document.getElementById('panel-agents'),
    random: document.getElementById('panel-random'),
    clear: document.getElementById('panel-clear'),
    curl: document.getElementById('panel-curl'),
    log: document.getElementById('panel-log'),
  };

  const params = new URLSearchParams(location.search);
  if (params.has('key')) {
    try {
      localStorage.setItem(KEY_STORAGE, params.get('key'));
    } catch {
      /* modo privado: segue sem salvar */
    }
  }
  const apiKey = params.get('key') || safeRead(KEY_STORAGE);

  // --- botoes dos agentes
  els.grid.replaceChildren(
    ...agents.map((agent) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.id = String(agent.id);
      const id = document.createElement('span');
      id.className = 'id';
      id.textContent = `#${agent.id}`;
      btn.append(document.createTextNode(agent.name), id);
      btn.title = `clique: manda atividade · shift+clique: tira ${agent.name} da sala`;
      btn.addEventListener('click', (e) => (e.shiftKey ? remove(agent.id, agent.name) : send(agent.id)));
      return btn;
    }),
  );

  // --- acoes
  els.random.addEventListener('click', async () => {
    for (const agent of agents) {
      await send(agent.id, sorteio(), '');
      await wait(140);
    }
  });

  els.clear.addEventListener('click', async () => {
    for (const agent of agents) await request('DELETE', `/api/activity/${agent.id}`);
    log(`${agents.length} balões limpos`);
  });

  async function remove(agentId, nome) {
    const res = await request('DELETE', `/api/agent/${agentId}`);
    if (res.ok) log(`${nome} saiu da sala (#${agentId})`);
    else log(res.error || 'falhou', true);
  }

  // --- abrir/fechar
  const setOpen = (open) => {
    panel.hidden = !open;
    if (open) els.activity.focus();
  };
  els.toggle.addEventListener('click', () => setOpen(panel.hidden));
  els.close.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
    if (!typing && (e.key === 'd' || e.key === 'D')) setOpen(panel.hidden);
    if (e.key === 'Escape') setOpen(false);
  });
  if (params.get('panel') === '1') setOpen(true);

  // --- espelho do curl
  const refreshCurl = () => {
    const body = {
      agentID: 2,
      ...(els.name.value.trim() ? { agentName: els.name.value.trim() } : {}),
      activity: els.activity.value.trim() || 'Realizando leitura',
    };
    els.curl.textContent =
      `curl -X POST ${location.origin}/api/activity \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      (apiKey ? `  -H "x-api-key: ${apiKey}" \\\n` : '') +
      `  -d '${JSON.stringify(body)}'\n\n` +
      `# terminou? tira o agente da sala:\n` +
      `curl -X DELETE ${location.origin}/api/agent/2`;
  };
  els.activity.addEventListener('input', refreshCurl);
  els.name.addEventListener('input', refreshCurl);
  refreshCurl();

  // --- envio
  async function send(agentId, activityOverride, nameOverride) {
    const activity = (activityOverride ?? els.activity.value).trim();
    const agentName = (nameOverride ?? els.name.value).trim();
    if (!activity) return log('preencha a atividade', true);

    const payload = { agentID: agentId, activity, ...(agentName ? { agentName } : {}) };
    const res = await request('POST', '/api/activity', payload);
    if (res.ok) log(`#${agentId} → "${activity}"`);
    else log(res.error || 'falhou', true);
  }

  async function request(method, url, body) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { 'x-api-key': apiKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return { ok: false, error: 'API_KEY exigida — abra a página com ?key=SUA_CHAVE' };
      return { ok: res.ok, ...data };
    } catch (err) {
      return { ok: false, error: `sem conexão com o servidor (${err.message})` };
    }
  }

  function log(message, isError = false) {
    els.log.textContent = message;
    els.log.classList.toggle('err', isError);
  }
}

const sorteio = () => SUGESTOES[Math.floor(Math.random() * SUGESTOES.length)];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeRead(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
