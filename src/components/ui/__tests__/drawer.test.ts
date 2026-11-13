// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Drawer from '../Drawer';

/**
 * Regressão P0 da #455. O efeito de `isOpen` passou a devolver apenas
 * `lockBodyScroll()` e perdeu o `setMounted(true)` e o
 * `requestAnimationFrame(() => setVisible(true))`: como `mounted` nasce a
 * `false` e o componente faz `if (!mounted) return null`, a gaveta NUNCA
 * aparecia — e o scroll do body ficava trancado na mesma. Atingia o
 * `SpotDrawer` em /spots, /modalidades e /explorar.
 *
 * Hermético: jsdom só neste ficheiro (o resto da suite corre em `node`) e
 * relógio falso para o rAF de abertura e para os 320 ms de desmonte.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FRAME_MS = 32; // > 1 frame: deixa o rAF de abertura correr
const CLOSE_MS = 320; // timeout de desmonte do Drawer

let container: HTMLDivElement;
let root: Root;

type DrawerTestProps = {
  isOpen: boolean;
  onClose: () => void;
  side: 'left' | 'right';
  title?: string;
  locale?: string;
};

// Cast sem `children` nas props (passa-se como 3.º argumento do createElement) —
// mesmo padrão do filterPill.test.ts.
const TestDrawer = Drawer as unknown as ComponentType<DrawerTestProps>;

function renderDrawer(isOpen: boolean, onClose: () => void = () => {}): void {
  const children = createElement('p', null, 'Condições de hoje') as ReactNode;
  act(() => {
    root.render(createElement(TestDrawer, { isOpen, onClose, side: 'left', title: 'Guincho', locale: 'pt' }, children));
  });
}

function dialog(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[role="dialog"]');
}

function closeButton(): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-drawer-close]');
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  document.body.style.overflow = '';
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  document.body.style.overflow = '';
});

describe('Drawer — abrir/fechar (regressão #455)', () => {
  it('isOpen=true monta o diálogo, pede a animação e tranca o scroll', () => {
    renderDrawer(true);

    expect(dialog(), 'a gaveta tem de montar com isOpen').not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    // Antes do frame o painel está fora do ecrã; o rAF é que o traz para dentro.
    expect(dialog()!.style.transform).toBe('translateX(-100%)');
    act(() => {
      vi.advanceTimersByTime(FRAME_MS);
    });
    expect(dialog()!.style.transform).toBe('translateX(0)');
  });

  it('o botão fechar mantém o alvo de toque de 44x44 px (ícone nos 20 px)', () => {
    renderDrawer(true);
    act(() => {
      vi.advanceTimersByTime(FRAME_MS);
    });

    const btn = closeButton();
    expect(btn, 'botão fechar montado').not.toBeNull();
    // O jsdom não aplica Tailwind: o contrato mede-se nas utilitárias, o mesmo
    // padrão do filterPill.test.ts. `min-w/min-h` vencem o `p-1.5` + ícone de
    // 20 px em qualquer viewport — a área de toque real é ≥44×44 (medida no
    // e2e drawer-spots), sem mexer no tamanho do ícone.
    const classes = btn!.className.split(/\s+/);
    expect(classes).toContain('min-w-[44px]');
    expect(classes).toContain('min-h-[44px]');
    expect(btn!.querySelector('svg')?.getAttribute('class')).toBe('w-5 h-5');

    // -6 px em cima e em baixo devolvem os 12 px que o alvo (44) acrescenta
    // aos 32 px desenhados: o cabeçalho fica com a altura de antes (e2e mede-a).
    expect(classes).toContain('-my-1.5');
  });

  it('Escape chama onClose', () => {
    const onClose = vi.fn();
    renderDrawer(true, onClose);
    act(() => {
      vi.advanceTimersByTime(FRAME_MS);
    });

    act(() => {
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isOpen=false destranca o scroll e desmonta após 320 ms', () => {
    renderDrawer(true);
    act(() => {
      vi.advanceTimersByTime(FRAME_MS);
    });

    renderDrawer(false);

    // O lock é libertado no cleanup do ramo aberto, sem esperar pela animação.
    expect(document.body.style.overflow).toBe('');
    expect(dialog(), 'o painel fica montado durante a animação de fecho').not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(CLOSE_MS);
    });
    expect(dialog()).toBeNull();
  });
});
