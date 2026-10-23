import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HeroTicker from '@/components/homepage/HeroTicker';

/**
 * React #418 do CI 39844750152 (main, 2026-10-22): o ticker da home é SSG e o
 * «Boias: leituras antigas · ~N h» saía de Date.now() durante o render. O HTML
 * do build (20:01 UTC) dizia «~4 h» (lastOkAt 15:38 → 4,4 h) e o cliente, oito
 * minutos depois, «~5 h» (4,5 h arredonda para cima) → texto diferente na
 * hidratação → página com erro não apanhado (map-unmount-race, home v6).
 *
 * Contrato: o texto do ticker depende só do relógio que o pai lhe passa
 * (`nowMs` = bakedAtMs até montar), nunca do relógio de quem renderiza.
 */
const LAST_OK = Date.parse('2026-10-22T15:38:00Z');
const BAKED = Date.parse('2026-10-22T20:01:44Z');
const buoyLayer = {
  status: 'stale' as const,
  streak: 5,
  lastOkAt: new Date(LAST_OK).toISOString(),
};

const render = () =>
  renderToStaticMarkup(
    createElement(HeroTicker, {
      locale: 'pt',
      updatedAtTs: BAKED - 30 * 60_000,
      buoyLayer: buoyLayer as never,
      nowMs: BAKED,
    }),
  );

describe('HeroTicker — relógio do render (paridade SSG ↔ hidratação)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('o «· ~N h» das boias sai do nowMs recebido, não do Date.now() do render', () => {
    vi.useFakeTimers();
    // «servidor»: a build às 20:01:44 UTC
    vi.setSystemTime(BAKED);
    const ssg = render();
    // «cliente»: a página aberta às 20:09:56 UTC, já do outro lado do arredondamento
    vi.setSystemTime(Date.parse('2026-10-22T20:09:56Z'));
    const hidratacao = render();

    expect(ssg).toContain('· ~4 h');
    expect(hidratacao).toBe(ssg);
  });
});
