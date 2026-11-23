// @vitest-environment jsdom
/* eslint-disable react/no-children-prop -- createElement() exige `children`
 * dentro das props quando o componente a declara obrigatória (React 18
 * typings); o 3.º argumento do createElement não satisfaz o tipo. */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Drawer from '@/components/ui/Drawer';
import { isBodyScrollLocked } from '@/lib/scrollLock';

/**
 * Regressão da #455: o efeito de abertura do Drawer chegou a correr
 * `lockBodyScroll()` sem `setMounted(true)`/`setVisible(true)` — a página
 * ficava trancada com a gaveta invisível (o `if (!mounted) return null`
 * nunca deixava renderizar). Este teste tranca o contrato: abrir monta o
 * diálogo E tranca o scroll; Escape chama onClose; fechar liberta o scroll
 * e desmonta após os 320 ms do fade-out.
 *
 * O vitest corre em jsdom sem `pretendToBeVisual` — `requestAnimationFrame`
 * é stubado para uma fila manual que se esvazia dentro de `act`.
 */

const rafQ = new Map<number, FrameRequestCallback>();
let rafSeq = 0;

function flushRaf() {
  const cbs = [...rafQ.values()];
  rafQ.clear();
  for (const cb of cbs) cb(performance.now());
}

let container: HTMLDivElement;
let root: Root | null;
let onClose: ReturnType<typeof vi.fn>;

function renderDrawer(isOpen: boolean) {
  act(() => {
    root!.render(
      createElement(Drawer, {
        isOpen,
        onClose: onClose as () => void,
        side: 'right',
        title: 'Teste',
        children: createElement('div', null, 'conteúdo'),
      }),
    );
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rafQ.clear();
  rafSeq = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = ++rafSeq;
    rafQ.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQ.delete(id);
  });
  onClose = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
  });
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  container.remove();
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Drawer — montagem, scroll lock e desmontagem (#455)', () => {
  it('abrir monta o diálogo e tranca o scroll do body', () => {
    renderDrawer(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    renderDrawer(true);
    // mounted=true chega na primeira renderização do efeito — o diálogo já
    // existe no DOM antes do rAF (regressão P0: antes ficava a null com o
    // scroll trancado).
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(isBodyScrollLocked()).toBe(true);

    act(flushRaf);
    // visible=true no frame seguinte: painel do lado direito no ecrã.
    expect(dialog!.style.transform).toBe('translateX(0)');
  });

  it('Escape chama onClose', () => {
    renderDrawer(true);
    act(flushRaf);
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    act(() => {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('o botão fechar tem o alvo táctil de 44×44', () => {
    renderDrawer(true);
    const btn = document.querySelector<HTMLElement>('[data-drawer-close]');
    expect(btn).not.toBeNull();
    expect(btn!.className).toContain('min-w-[44px]');
    expect(btn!.className).toContain('min-h-[44px]');
  });

  it('fechar destranca o scroll de imediato e desmonta após 320 ms', () => {
    renderDrawer(true);
    act(flushRaf);
    vi.useFakeTimers();

    renderDrawer(false);
    // O cleanup do efeito liberta o lock sem esperar pelo fade-out.
    expect(document.body.style.overflow).toBe('');
    expect(isBodyScrollLocked()).toBe(false);
    // A gaveta continua montada durante o fade-out…
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(319);
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    // …e desmonta quando o timer de 320 ms termina.
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
