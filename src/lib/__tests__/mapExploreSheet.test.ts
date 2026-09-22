import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Contrato do bottom sheet explorar (MapExploreSheet) — substituiu o HUD
 * «Modo Explorar» no fullscreen mobile (mockup aprovado, variante A).
 * Sucede ao antigo mapHudCollapse: em vez de colapsado/expandido, o
 * invariante são os TRÊS estados com snap.
 *
 * Pinos:
 *  1. Três estados nomeados (peek/half/open) expostos em data-explore-sheet.
 *  2. Arrasto 1:1 no grabber com projeção de momentum e snap — movimento só
 *     por transform (translateY), nunca top/height (jank garantido).
 *  3. prefers-reduced-motion: sem slide — cross-fade (sheet-fade-in/out).
 *  4. Atribuição sempre visível — a linha de créditos renderiza dentro do
 *     sheet em todos os estados (o controlo Leaflet fica tapado).
 *  5. Compat: data-map-hud-collapsed continua a existir — o useMapLayers
 *     mede a porção visível do sheet (vh − rect.top) para levantar o
 *     carrossel do radar.
 */
const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const sheet = read('src/components/spots/map/components/MapExploreSheet.tsx');
const list = read('src/components/spots/map/components/MapSpotList.tsx');
const interactive = read('src/components/spots/SpotMapInteractive.tsx');
const attributionHook = read('src/components/spots/map/hooks/useMapAttribution.ts');

describe('mapExploreSheet (contrato do bottom sheet de 3 estados)', () => {
  it('expõe os três estados nomeados', () => {
    expect(sheet).toContain("'peek'");
    expect(sheet).toContain("'half'");
    expect(sheet).toContain("'open'");
    expect(sheet).toContain('data-explore-sheet={state}');
  });

  it('movimento só por transform (translateY), com grabber dedicado', () => {
    expect(sheet).toContain('translateY(');
    expect(sheet).toContain('data-sheet-grabber');
    // Não pode haver animação de top/bottom/height — só transform.
    expect(sheet).not.toMatch(/transition[^}]*top/);
    expect(sheet).not.toMatch(/transition[^}]*height/);
  });

  it('prefers-reduced-motion troca o slide por cross-fade', () => {
    expect(sheet).toContain('prefers-reduced-motion');
    expect(sheet).toContain('!reduced');
    expect(sheet).toContain('sheet-fade-out');
    expect(sheet).toContain('sheet-fade-in');
  });

  it('a linha de atribuição existe dentro do sheet (créditos sempre visíveis)', () => {
    expect(sheet).toContain('data-sheet-attribution');
    expect(attributionHook).toContain('MutationObserver');
    expect(attributionHook).toContain('attributionControl');
  });

  it('mantém data-map-hud-collapsed para a medida do radarLift', () => {
    expect(sheet).toContain('data-map-hud-collapsed');
  });

  it('o «Melhor agora» do peek é a 1ª linha da lista partilhada', () => {
    expect(sheet).toContain('rows[0]');
    expect(sheet).toContain('data-sheet-best');
  });

  it('a lista é a mesma fonte dos marcadores (getBestScore + bounds)', () => {
    // O parent constrói viewRows com getBestScore (a fonte do score do
    // marcador) filtrada pelos bounds do viewport.
    expect(interactive).toContain('getBestScore(d, selectedSport, hourScores?.get(d.spot.id))');
    expect(interactive).toContain('bounds.contains');
  });

  it('a lista partilhada é acessível por teclado (roving tabindex + setas)', () => {
    expect(list).toContain('ArrowDown');
    expect(list).toContain('ArrowUp');
    expect(list).toContain('tabIndex={i === activeIdx ? 0 : -1}');
  });
});
