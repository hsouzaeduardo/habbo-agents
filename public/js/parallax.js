/**
 * Parallax da cena.
 *
 * A sala nao tem scroll nem camera, entao o movimento vem do ponteiro: mexer o
 * mouse "olha" a sala de um angulo levemente diferente. Como o uso previsto e
 * uma TV em que ninguem mexe no mouse, depois de alguns segundos parado a
 * camera passa a derivar sozinha num oito bem lento.
 *
 * O JS escreve apenas duas variaveis (`--px` e `--py`) no palco -- uma escrita
 * de estilo por frame. Cada camada se desloca sozinha no CSS multiplicando
 * essas duas pelo seu proprio `--depth`, entao a quantidade de camadas nao
 * muda o custo do loop.
 */

const AMPLITUDE = 26; // px de deslocamento da camada mais proxima
const IDLE_AFTER = 4000; // ms parado ate a camera comecar a derivar sozinha
const EASE = 0.06; // quao rapido a camera persegue o alvo (0..1)

export function initParallax(stage) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let targetX = 0;
  let targetY = 0;
  let curX = 0;
  let curY = 0;
  let lastMove = -Infinity;

  window.addEventListener(
    'pointermove',
    (e) => {
      // -1 a 1 em relacao a janela; o sinal e invertido porque a cena se move
      // para o lado contrario de quem olha
      targetX = -((e.clientX / window.innerWidth) * 2 - 1) * AMPLITUDE;
      targetY = -((e.clientY / window.innerHeight) * 2 - 1) * AMPLITUDE;
      lastMove = performance.now();
    },
    { passive: true },
  );

  const frame = (now) => {
    if (now - lastMove > IDLE_AFTER) {
      // periodos primos entre si: o trajeto nunca repete exatamente
      const t = now / 1000;
      targetX = Math.sin(t * 0.21) * AMPLITUDE * 0.7;
      targetY = Math.sin(t * 0.13) * AMPLITUDE * 0.55;
    }

    curX += (targetX - curX) * EASE;
    curY += (targetY - curY) * EASE;

    stage.style.setProperty('--px', curX.toFixed(2));
    stage.style.setProperty('--py', curY.toFixed(2));

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

/** Profundidade de uma fileira: a do fundo se mexe menos que a da frente. */
export function rowDepth(row, rows) {
  const t = rows > 1 ? row / (rows - 1) : 0;
  return Number((0.6 + t * 0.38).toFixed(3));
}

/** Profundidade de um objeto solto no piso, a partir de onde ele esta. */
export function spotDepth(y, room) {
  const t = (y - room.floorTop) / Math.max(1, room.height - room.floorTop);
  return Number((0.5 + Math.min(1, Math.max(0, t)) * 0.4).toFixed(3));
}
