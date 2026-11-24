import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarVento } from '@/lib/ventoParticulas';
import { criarLoopFrentes } from '@/components/spots/v6/praiaFrentesLoop';

function fakeCanvas() {
  const ctx = {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    lineCap: 'round',
    lineJoin: 'round',
    strokeStyle: '',
    lineWidth: 1,
  };
  return {
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ width: 320, height: 240 }),
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

describe('ventoParticulas rAF stop (#459)', () => {
  let nextId = 1;
  let queued = new Map<number, FrameRequestCallback>();
  let rafCalls = 0;
  let hidden = false;
  const origRaf = globalThis.requestAnimationFrame;
  const origCancel = globalThis.cancelAnimationFrame;
  const origDoc = globalThis.document;
  const origWin = globalThis.window;
  const listeners = new Map<string, Set<() => void>>();

  beforeEach(() => {
    nextId = 1;
    queued = new Map();
    rafCalls = 0;
    hidden = false;
    listeners.clear();
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCalls++;
      const id = nextId++;
      queued.set(id, cb);
      return id;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      queued.delete(id);
    }) as typeof cancelAnimationFrame;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { devicePixelRatio: 1 },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        get hidden() {
          return hidden;
        },
        addEventListener: (ev: string, fn: () => void) => {
          if (!listeners.has(ev)) listeners.set(ev, new Set());
          listeners.get(ev)!.add(fn);
        },
        removeEventListener: (ev: string, fn: () => void) => {
          listeners.get(ev)?.delete(fn);
        },
      },
    });
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCancel;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: origDoc });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: origWin });
  });

  const flushFrame = (t: number) => {
    const entries = [...queued.entries()];
    queued.clear();
    for (const [, cb] of entries) cb(t);
  };

  it('pausar(true) cancela rAF imediatamente e produz 0 chamadas enquanto pausado', () => {
    const m = criarVento(fakeCanvas(), { n: 10 }).campo(() => [20, 0]).iniciar();
    expect(queued.size).toBe(1);
    flushFrame(100);
    expect(queued.size).toBe(1);

    m.pausar(true);
    expect(queued.size).toBe(0);
    const antes = rafCalls;
    flushFrame(200);
    flushFrame(300);
    expect(rafCalls).toBe(antes);
    expect(queued.size).toBe(0);

    // Retomar volta a agendar
    m.pausar(false);
    expect(queued.size).toBe(1);
    expect(rafCalls).toBe(antes + 1);
    m.parar();
    expect(queued.size).toBe(0);
  });

  it('document.hidden pára o loop e visibilitychange retoma ao voltar visível', () => {
    const m = criarVento(fakeCanvas(), { n: 10 }).campo(() => [20, 0]).iniciar();
    expect(queued.size).toBe(1);

    hidden = true;
    listeners.get('visibilitychange')?.forEach((fn) => fn());
    expect(queued.size).toBe(0);
    const antes = rafCalls;
    flushFrame(150);
    expect(rafCalls).toBe(antes);

    hidden = false;
    listeners.get('visibilitychange')?.forEach((fn) => fn());
    expect(queued.size).toBe(1);
    m.parar();
    expect(listeners.get('visibilitychange')?.size ?? 0).toBe(0);
  });

  it('PraiaCena3D loop de frentes: 0 rAF fora do viewport, em document.hidden e após perda WebGL', () => {
    const tick = vi.fn();
    const loop = criarLoopFrentes(tick);
    loop.setAtivo3D(true);
    // Ainda fora do viewport: 0 rAF
    expect(queued.size).toBe(0);

    loop.setVisivel(true);
    expect(queued.size).toBe(1);
    flushFrame(200);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(queued.size).toBe(1);

    // Sai do viewport: cancela imediatamente, 0 chamadas seguintes
    loop.setVisivel(false);
    expect(queued.size).toBe(0);
    const antes = rafCalls;
    flushFrame(300);
    expect(rafCalls).toBe(antes);

    // Volta ao viewport, oculta o separador (document.hidden) → 0 rAF; volta visível → retoma
    loop.setVisivel(true);
    expect(queued.size).toBe(1);
    hidden = true;
    loop.onVisibilityChange();
    expect(queued.size).toBe(0);
    const antesHidden = rafCalls;
    flushFrame(350);
    expect(rafCalls).toBe(antesHidden);
    hidden = false;
    loop.onVisibilityChange();
    expect(queued.size).toBe(1);

    // Perde contexto WebGL (setAtivo3D(false)) → 0 rAF
    loop.setAtivo3D(false);
    expect(queued.size).toBe(0);
    const aposPerda = rafCalls;
    flushFrame(400);
    expect(rafCalls).toBe(aposPerda);

    loop.destruir();
  });
});
