/**
 * Sprites em pixel art gerados como SVG inline.
 *
 * Nada de imagem externa: cada desenho e um mapa de caracteres onde cada letra
 * e uma cor da paleta do agente. Isso deixa a cena inteira offline, leve, e
 * permite trocar as cores dos 6 agentes so mexendo em agents.config.js.
 *
 * O avatar e montado em partes (`corpo`, `braco esquerdo`, `braco direito`,
 * `cabelo longo`) para que os bracos possam se mexer sozinhos quando o agente
 * esta em atividade -- animacao de "digitando".
 */

const OUTLINE = '#2f2f3f';

// 16 colunas x 26 linhas. Bracos ficam de fora (sao partes separadas).
const BODY = [
  '................',
  '...KKKKKKKKKK...',
  '..KHHHHHHHHHHK..',
  '..KHHHHHHHHHHK..',
  '..KHHHHHHHHHHK..',
  '..KHHSSSSSSHHK..',
  '..KHSSSSSSSSHK..',
  '..KHSSSSSSSSHK..',
  '..KHSEESSEESHK..',
  '..KHSEESSEESHK..',
  '..KHSSSSSSSSHK..',
  '..KHSSSMMSSSHK..',
  '..KHSSSSSSSSHK..',
  '...KKSSSSSSKK...',
  '.....KSSSSK.....',
  '...KBBBBBBBBK...',
  '...KBBBWWBBBK...',
  '...KBBBWWBBBK...',
  '...KBBBBBBBBK...',
  '...KBBBBBBBBK...',
  '...KbbbbbbbbK...',
  '...KPPPPPPPPK...',
  '...KPPPKKPPPK...',
  '...KPPPKKPPPK...',
  '...KOOOKKOOOK...',
  '...KKKKKKKKKK...',
];

const ARM_L = ['.KB', 'KBB', 'KSS', 'KSS', '.KK'];
const ARM_R = ['BK.', 'BBK', 'SSK', 'SSK', 'KK.'];

// Cai por cima dos ombros -- usado so por quem tem `hair: 'longo'`.
const HAIR_LONG = [
  '..KHH......HHK..',
  '..KHH......HHK..',
  '..KHH......HHK..',
  '..KHH......HHK..',
  '...KK......KK...',
];

function colorsFor(palette) {
  return {
    K: OUTLINE,
    E: OUTLINE,
    O: '#23232f',
    M: '#9c5a56',
    W: '#f2f2f7',
    H: palette.hair,
    S: palette.skin,
    B: palette.shirt,
    b: palette.shirtDark,
    P: palette.pants,
  };
}

/** Converte o mapa em <rect>s, juntando pixels iguais da mesma linha (menos nos no DOM). */
function mapToRects(map, colors) {
  const out = [];
  map.forEach((line, y) => {
    let x = 0;
    while (x < line.length) {
      const ch = line[x];
      let run = 1;
      while (x + run < line.length && line[x + run] === ch) run += 1;
      if (ch !== '.') {
        const fill = colors[ch] || OUTLINE;
        out.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`);
      }
      x += run;
    }
  });
  return out.join('');
}

/**
 * @param {{hair:string,skin:string,shirt:string,shirtDark:string,pants:string}} palette
 * @param {{ hair?: 'curto'|'longo' }} opts
 */
export function avatarSvg(palette, { hair = 'curto' } = {}) {
  const colors = colorsFor(palette);
  const longHair = hair === 'longo' ? `<g transform="translate(0 12)">${mapToRects(HAIR_LONG, colors)}</g>` : '';

  return `<svg class="avatar" viewBox="0 0 16 26" shape-rendering="crispEdges" aria-hidden="true">
  <g class="av-bob">
    <g class="av-arm av-arm-l" transform="translate(0 16)">${mapToRects(ARM_L, colors)}</g>
    <g class="av-arm av-arm-r" transform="translate(13 16)">${mapToRects(ARM_R, colors)}</g>
    <g class="av-body">${mapToRects(BODY, colors)}</g>
    ${longHair}
  </g>
</svg>`;
}

/** Mesa isometrica com monitor. O monitor acende quando o agente esta em atividade. */
export function deskSvg() {
  return `<svg class="desk" viewBox="0 0 76 60" shape-rendering="crispEdges" aria-hidden="true">
  <!-- monitor -->
  <rect x="24" y="0" width="28" height="20" fill="#3a3a4a"/>
  <rect x="26" y="2" width="24" height="16" fill="#1d2430" class="screen-bg"/>
  <rect x="27" y="4" width="10" height="2" fill="#4f7fae" class="screen-line l1"/>
  <rect x="27" y="8" width="18" height="2" fill="#4f7fae" class="screen-line l2"/>
  <rect x="27" y="12" width="14" height="2" fill="#4f7fae" class="screen-line l3"/>
  <rect x="36" y="20" width="4" height="4" fill="#2f2f3f"/>
  <polygon points="30,26 38,22 46,26 38,30" fill="#2f2f3f"/>
  <!-- tampo -->
  <polygon points="2,38 38,22 74,38 38,54" fill="#c98a52"/>
  <polygon points="2,38 38,54 38,60 2,44" fill="#8f5d35"/>
  <polygon points="74,38 38,54 38,60 74,44" fill="#7a4d2c"/>
  <!-- teclado -->
  <polygon points="26,42 38,36 50,42 38,48" fill="#dcdce6"/>
  <polygon points="29,42 38,37.5 47,42 38,46.5" fill="#b9b9c9"/>
</svg>`;
}

/** Cadeira de escritorio, fica atras do agente. */
export function chairSvg() {
  return `<svg class="chair" viewBox="0 0 36 44" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="11" y="2" width="14" height="18" rx="1" fill="#46465c"/>
  <rect x="13" y="4" width="10" height="14" fill="#5a5a75"/>
  <polygon points="2,26 18,18 34,26 18,34" fill="#5a5a75"/>
  <polygon points="2,26 18,34 18,37 2,29" fill="#3b3b4e"/>
  <polygon points="34,26 18,34 18,37 34,29" fill="#32323f"/>
  <rect x="16" y="34" width="4" height="5" fill="#2f2f3f"/>
  <polygon points="8,42 18,37 28,42 18,44" fill="#2f2f3f"/>
</svg>`;
}

/** Planta decorativa dos cantos. */
export function plantSvg() {
  return `<svg class="plant" viewBox="0 0 40 64" shape-rendering="crispEdges" aria-hidden="true">
  <polygon points="20,4 30,16 24,16 28,26 12,26 16,16 10,16" fill="#3f8f5a"/>
  <polygon points="20,10 26,20 14,20" fill="#56ab72"/>
  <rect x="18" y="26" width="4" height="10" fill="#6d4a2f"/>
  <polygon points="8,36 32,36 29,58 11,58" fill="#c1663f"/>
  <polygon points="8,36 32,36 31,41 9,41" fill="#e07a4d"/>
</svg>`;
}
