/**
 * Monta a sala para uma quantidade qualquer de agentes.
 *
 * O numero vem de AGENT_COUNT (.env). A sala nao tem tamanho fixo: a grade e
 * calculada a partir da quantidade e o palco cresce junto -- a pagina escala o
 * palco inteiro para caber na tela, entao 8 ou 24 agentes "cabem" do mesmo jeito.
 *
 * Para customizar nome/cabelo/cores de um agente especifico, edite o ROSTER
 * abaixo: o indice 0 e o agente 1, o indice 1 e o agente 2, e assim por diante.
 * Quem passar do fim do ROSTER ganha nome e paleta gerados.
 */

export const MAX_AGENTS = 50;
export const DEFAULT_AGENT_COUNT = 12;

/** Medidas de uma estacao (mesa + agente + cadeira). Mexer aqui reflete em tudo. */
const LAYOUT = {
  colPitch: 240, // distancia horizontal entre dois agentes
  rowPitch: 228, // distancia vertical entre fileiras -- o suficiente para o
                 // balao de quem esta na frente nao tapar a placa de quem esta atras
  sideMargin: 240,
  bottomMargin: 72,
  firstRowY: 300, // onde ficam os pes da primeira fileira
  floorTop: 210, // onde a parede termina
  stagger: 20, // fileiras alternadas deslocam um pouco, para dar profundidade
};

/** Os primeiros agentes tem nome e paleta escolhidos a mao. */
const ROSTER = [
  { name: 'Ana', hair: 'longo', palette: { hair: '#6b3410', skin: '#f0c8a0', shirt: '#e05a72', shirtDark: '#b8455c', pants: '#34495e' } },
  { name: 'Felipe', hair: 'curto', palette: { hair: '#2b1a0e', skin: '#d9a066', shirt: '#3a86ff', shirtDark: '#2f6ccc', pants: '#2b3a55' } },
  { name: 'Bruno', hair: 'curto', palette: { hair: '#1a1008', skin: '#8d5524', shirt: '#2a9d8f', shirtDark: '#1f7a70', pants: '#3d3d4e' } },
  { name: 'Carla', hair: 'longo', palette: { hair: '#d98a2b', skin: '#ffdbac', shirt: '#b07cc6', shirtDark: '#8d5fa3', pants: '#40405a' } },
  { name: 'Diego', hair: 'curto', palette: { hair: '#4a2c12', skin: '#c68642', shirt: '#f4a261', shirtDark: '#d1803f', pants: '#2f4858' } },
  { name: 'Elisa', hair: 'longo', palette: { hair: '#8b1e3f', skin: '#f5cba7', shirt: '#52b788', shirtDark: '#3f9670', pants: '#34435e' } },
];

/** Nomes usados a partir do 7o agente. Depois disso vira "Agente 25", etc. */
const NOMES = [
  'Fábio', 'Gabi', 'Heitor', 'Íris', 'João', 'Kelly', 'Lucas', 'Marina', 'Nina',
  'Otávio', 'Paula', 'Rafa', 'Sofia', 'Tiago', 'Ugo', 'Vera', 'Will', 'Yasmin',
];

const SKINS = ['#f0c8a0', '#d9a066', '#8d5524', '#ffdbac', '#c68642', '#f5cba7', '#a9714b', '#e8b98a'];
const HAIRS = ['#6b3410', '#2b1a0e', '#1a1008', '#d98a2b', '#4a2c12', '#8b1e3f', '#3d2b1f', '#b5651d'];
const PANTS = ['#34495e', '#2b3a55', '#3d3d4e', '#40405a', '#2f4858', '#34435e'];

/** Camisas geradas pelo angulo aureo: cores bem distintas mesmo com 30 agentes. */
function geraPaleta(i) {
  const hue = Math.round((i * 137.508 + 20) % 360);
  return {
    hair: HAIRS[(i * 3) % HAIRS.length],
    skin: SKINS[i % SKINS.length],
    shirt: `hsl(${hue}, 62%, 58%)`,
    shirtDark: `hsl(${hue}, 55%, 44%)`,
    pants: PANTS[(i * 2) % PANTS.length],
  };
}

function perfil(i) {
  if (i < ROSTER.length) return ROSTER[i];
  return {
    name: NOMES[i - ROSTER.length] || `Agente ${i + 1}`,
    hair: i % 2 === 0 ? 'longo' : 'curto',
    palette: geraPaleta(i),
  };
}

export function normalizeCount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_AGENT_COUNT;
  return Math.min(MAX_AGENTS, Math.max(1, Math.round(n)));
}

/**
 * Calcula a grade e devolve `{ room, agents }`.
 *
 * A grade mira uma sala mais larga que alta (~1.7), que e o formato de tela de
 * quem vai deixar isso aberto, e rebalanceia para as fileiras ficarem parelhas:
 * 9 agentes viram 3x3, e nao 4+4+1.
 */
export function buildRoom(count = DEFAULT_AGENT_COUNT) {
  const total = normalizeCount(count);
  const { colPitch, rowPitch, sideMargin, bottomMargin, firstRowY, floorTop, stagger } = LAYOUT;

  let cols = Math.ceil(Math.sqrt(total * 1.7));
  let rows = Math.ceil(total / cols);
  cols = Math.ceil(total / rows); // rebalanceia

  const width = 2 * sideMargin + (cols - 1) * colPitch;
  const height = firstRowY + (rows - 1) * rowPitch + bottomMargin;

  const agents = [];
  for (let i = 0; i < total; i += 1) {
    const row = Math.floor(i / cols);
    const col = i - row * cols;
    const naFileira = Math.min(cols, total - row * cols); // ultima fileira pode ser menor
    const marginX = (width - (naFileira - 1) * colPitch) / 2;

    agents.push({
      id: i + 1,
      ...perfil(i),
      x: Math.round(marginX + col * colPitch + (row % 2 ? stagger : -stagger)),
      y: firstRowY + row * rowPitch,
      row,
    });
  }

  return {
    room: { width, height, floorTop, cols, rows, total },
    agents,
  };
}
