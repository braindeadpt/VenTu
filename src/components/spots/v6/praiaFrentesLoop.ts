/**
 * Controlador de loop rAF para as frentes de onda da `PraiaCena3D` (#459).
 * Garante 0 chamadas `requestAnimationFrame` quando fora do viewport, com o
 * separador escondido (`document.hidden`) ou após perda de contexto WebGL.
 */
export interface LoopFrentes {
  setVisivel(v: boolean): void;
  setAtivo3D(a: boolean): void;
  onVisibilityChange(): void;
  destruir(): void;
}

export function criarLoopFrentes(
  tick: (segundos: number) => void,
  opcoes: { reduz?: boolean; semOndas?: boolean; intervaloMs?: number } = {},
): LoopFrentes {
  const reduz = Boolean(opcoes.reduz);
  const semOndas = Boolean(opcoes.semOndas);
  const intervaloMs = opcoes.intervaloMs ?? 80;
  let destruido = false;
  let visivel = false;
  let ativo3D = false;
  let raf = 0;
  let ultimo = 0;
  const t0 = performance.now();

  function parar() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function podeCorrer() {
    return !destruido && !reduz && !semOndas && ativo3D && visivel && !document.hidden;
  }

  function anima(now: number) {
    raf = 0;
    if (!podeCorrer()) return;
    if (now - ultimo > intervaloMs) {
      ultimo = now;
      tick((now - t0) / 1000);
    }
    raf = requestAnimationFrame(anima);
  }

  function sincronizar() {
    if (podeCorrer()) {
      if (!raf) raf = requestAnimationFrame(anima);
    } else {
      parar();
    }
  }

  return {
    setVisivel(v) {
      visivel = v;
      sincronizar();
    },
    setAtivo3D(a) {
      ativo3D = a;
      sincronizar();
    },
    onVisibilityChange() {
      sincronizar();
    },
    destruir() {
      destruido = true;
      parar();
    },
  };
}
