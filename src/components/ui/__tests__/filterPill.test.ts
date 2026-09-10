import { describe, it, expect } from 'vitest';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FilterPill from '../FilterPill';

type PillProps = { onClick: () => void; compact?: boolean; active?: boolean };

// Cast com children opcional só para o helper de teste — evita passar
// children como prop (regra react/no-children-prop).
const Pill = FilterPill as unknown as ComponentType<PillProps>;

function render(props: Partial<PillProps> = {}): string {
  return renderToStaticMarkup(createElement(Pill, { onClick: () => {}, ...props }, 'Teste' as ReactNode));
}

describe('FilterPill (densidade por modalidade de input — decisão V3′ 2026-09)', () => {
  it('compact tem 44px por omissão via classe-marcador (mobile, tablets e híbridos)', () => {
    const html = render({ compact: true });
    // A altura vem do CSS (.filter-pill-compact em globals.css, 44px base) —
    // sem min-h utility para não competir com a media query do V3′.
    expect(html).toContain('filter-pill-compact');
    expect(html).not.toContain('min-h-[44px]');
  });

  it('compact só encolhe para 36px em desktop de RATO PURO (via .filter-pill-compact em globals.css)', () => {
    const html = render({ compact: true });
    // V3′: o encolhimento é um media query (min-width 1024px + any-pointer:
    // fine) em globals.css; a classe-marcador está sempre presente. Sem
    // lg:min-h-[36px] incondicional — deixaria os híbridos com 36px.
    expect(html).toContain('filter-pill-compact');
    expect(html).not.toContain('lg:min-h-[36px]');
    expect(html).not.toContain('any-pointer');
  });

  it('variante normal é 44px em todo o lado — sem compactação', () => {
    const html = render();
    expect(html).toContain('min-h-[44px]');
    expect(html).not.toContain('filter-pill-compact');
  });

  it('estado activo aplica pill-active', () => {
    const html = render({ active: true });
    expect(html).toContain('pill-active');
  });
});