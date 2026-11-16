import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initialSwellState } from '@/components/spots/map/hooks/useMapSwellField';

/**
 * #458 §4 — itens técnicos do /mapa:
 * (1) `?wind=1` / `?wind=0` vencem a pref gravada da «Ondulação» (sem a apagar);
 * (2) o lift do radar/legenda deixa de medir o sheet com `setInterval` de 250 ms;
 * (3) o `slowTimer` do recorte da terra é limpo no unmount e `clipSlow` volta a false;
 * (4) scrubber escondido com o sheet «open» no mobile; alvos de 44 px; sem spinner.
 */
const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8');

describe('#458 — deep link ?wind contra a pref da «Ondulação»', () => {
  it('?swell=1 liga sempre', () => {
    expect(initialSwellState(true, false, null)).toBe(true);
    expect(initialSwellState(true, true, '0')).toBe(true);
  });
  it('?wind=1|0 explícito desliga mesmo com a pref gravada a 1', () => {
    expect(initialSwellState(false, true, '1')).toBe(false);
  });
  it('sem link, vale a pref', () => {
    expect(initialSwellState(false, false, '1')).toBe(true);
    expect(initialSwellState(false, false, '0')).toBe(false);
    expect(initialSwellState(false, false, null)).toBe(false);
  });
  it('o orquestrador passa ?wind=1 e ?wind=0 ao toggle', () => {
    const src = ler('src/components/spots/SpotMapInteractive.tsx');
    expect(src).toMatch(/initialSwellDisabled:\s*initialWindEnabled \|\| initialWindDisabled/);
    const zona = ler('src/components/spots/map/zones/MapLayersZone.tsx');
    expect(zona).toMatch(/initialDisabled:\s*initialSwellDisabled/);
  });
});

describe('#458 — sem polling de layout e timers limpos', () => {
  it('o lift do radar mede por MutationObserver, não por setInterval(measure)', () => {
    const src = ler('src/components/spots/map/hooks/useMapLayers.ts');
    expect(src).not.toMatch(/setInterval\(measure/);
    expect(src).toContain('new MutationObserver(schedule)');
    expect(src).toContain("removeEventListener('resize', schedule)");
  });
  it('slowTimer limpo no unmount e clipSlow reposto', () => {
    const src = ler('src/components/spots/map/hooks/useMapSwellField.ts');
    expect(src).toMatch(/disposed = true;\s*if \(slowTimer != null\) window\.clearTimeout\(slowTimer\)/);
    expect(src).toMatch(/clipPending = false;[\s\S]{0,200}clipSlow = false;/);
  });
});

describe('#458 — mobile: scrubber, alvos e spinner', () => {
  it('o scrubber sai com o sheet «open» abaixo de 768 px', () => {
    const css = ler('src/app/globals.css');
    expect(css).toContain(
      "[data-map-fullscreen='true']:has([data-explore-sheet='open']) .map-scrub-wrap",
    );
  });
  it('range compacto e badge de confiança com área de toque de 44 px', () => {
    const css = ler('src/styles/mapa-pele-v6.css');
    expect(css).toContain(
      "[data-pele='v6'] [data-mr='regua'][data-compacto] .map-scrub-bars>input[type='range']{top:-4px;height:calc(100% + 8px)}",
    );
    expect(css).toMatch(
      /\[data-ms='meta'\] button\[data-provenance-axis\]::after\{[^}]*top:-8px;bottom:-8px\}/,
    );
  });
  it('o carregamento do /mapa não usa animate-spin', () => {
    expect(ler('src/components/spots/MapaFullscreenClient.tsx')).not.toContain('animate-spin');
  });
});
