import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contrastRatio } from '@/components/spots/mapMarkers';
import { countActiveExploreFilters } from '@/components/spots/map/components/MapExploreFilters';
import { MAP_DIFFICULTY_CEILING_KEY, MAP_DIFFICULTY_OPTIONS } from '@/lib/mapDifficulty';
import { mapUiExplore } from '@/lib/translations/mapUi/explore';
import { V6_BANDAS, V6_UI } from '@/lib/v6Tokens';

/**
 * Fase B do /mapa, PR B2 — Explorar e filtros na pele v6 (`[data-pele=v6]`).
 * Prende: (1) o âmbito das regras novas, (2) alvos ≥ 44 px, (3) contraste ≥ 4,5:1
 * das combinações que a pele pinta, (4) os rótulos de tecto do «Nível» e (5) que
 * a contagem de filtros não mudou.
 */
const raiz = process.cwd();
const css = readFileSync(join(raiz, 'src/styles/mapa-pele-v6.css'), 'utf-8');
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const regras = [...semComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  seletor: m[1].trim(),
  corpo: m[2],
}));
const regrasB2 = regras.filter((r) =>
  /data-mx|data-map-jump|role='option'|role='listbox'|data-explore-sheet|data-sheet-|data-map-panel|data-map-exit-fullscreen|data-row-night/.test(
    r.seletor,
  ),
);
const px = (corpo: string, prop: string) => {
  const m = corpo.match(new RegExp(`(?:^|;|\\s)${prop}:(\\d+(?:\\.\\d+)?)px`));
  return m ? Number(m[1]) : null;
};

/** Mistura `fg` com alfa sobre `bg` (ambos #RRGGBB) — a cor que o olho vê. */
function sobre(fg: string, alfa: number, bg: string): string {
  const c = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [c(fg), c(bg)];
  return '#' + a.map((v, i) => Math.round(v * alfa + b[i] * (1 - alfa)).toString(16).padStart(2, '0')).join('');
}

describe('pele v6 do /mapa — Explorar e filtros (B2): CSS', () => {
  it('há regras B2 e todas ficam dentro de [data-pele=v6]', () => {
    expect(regrasB2.length).toBeGreaterThan(30);
    for (const r of regrasB2) {
      for (const s of r.seletor.split(',')) expect(s.trim().startsWith("[data-pele='v6']"), s).toBe(true);
    }
    expect(semComentarios).not.toMatch(/:root|@media/);
  });

  it('alvos ≥ 44 px: nenhuma altura mínima abaixo de 44 nas regras B2', () => {
    let vistas = 0;
    for (const r of regrasB2) {
      const mh = px(r.corpo, 'min-height');
      if (mh !== null) {
        vistas++;
        expect(mh, r.seletor).toBeGreaterThanOrEqual(44);
      }
    }
    expect(vistas).toBeGreaterThan(6);
  });

  it.each([
    "[data-mx='modalidades'] .pill",
    "[data-mx='sel'] select",
    "[data-mx='switch']",
    "[data-mx='chip']",
    "[data-mx='limpar']",
    '[data-map-jump]',
    "[data-mx='filtros-bt']",
  ])('%s tem min-height ≥ 44 px', (alvo) => {
    const r = regrasB2.find((x) => x.seletor === `[data-pele='v6'] ${alvo}`);
    expect(r, alvo).toBeDefined();
    expect(px(r!.corpo, 'min-height')).toBeGreaterThanOrEqual(44);
  });

  it('botões só-ícone (recolher, sair do ecrã inteiro, ocultar) com 44×44', () => {
    for (const alvo of ["[data-mx='recolher']", '[data-map-exit-fullscreen]']) {
      const r = regrasB2.find((x) => x.seletor.split(',').some((s) => s.trim() === `[data-pele='v6'] ${alvo}`));
      expect(r, alvo).toBeDefined();
      expect(px(r!.corpo, 'width')).toBeGreaterThanOrEqual(44);
      expect(px(r!.corpo, 'height')).toBeGreaterThanOrEqual(44);
    }
  });

  it('cada gancho data-mx do CSS existe nos componentes do Explorar', () => {
    const fontes = [
      'MapExploreFilters.tsx',
      'MapSpotList.tsx',
      'MapSpotPanel.tsx',
      'MapExploreSheet.tsx',
    ]
      .map((f) => readFileSync(join(raiz, 'src/components/spots/map/components', f), 'utf-8'))
      .join('\n');
    const ganchos = new Set([...semComentarios.matchAll(/data-mx='([a-z-]+)'/g)].map((m) => m[1]));
    expect(ganchos.size).toBeGreaterThan(15);
    for (const g of ganchos) expect(fontes, g).toContain(`data-mx="${g}"`);
  });

  it('o mosaico da nota usa as bandas v6 por escalão (o mesmo mapa da B1)', () => {
    const mapa = { closed: 'nao', poor: 'fraco', fair: 'da', good: 'bom', epic: 'mb' } as const;
    for (const [tier, banda] of Object.entries(mapa)) {
      const r = regrasB2.find((x) => x.seletor === `[data-pele='v6'] [data-mx='nota'][data-tier='${tier}']`);
      expect(r, tier).toBeDefined();
      expect(r!.corpo).toContain(`background:var(--b-${banda})`);
      expect(r!.corpo).toContain(`color:var(--b-${banda}-t)`);
    }
  });
});

describe('pele v6 do /mapa — Explorar (B2): contraste ≥ 4,5:1', () => {
  const PAINEL = sobre(V6_UI.abismo, 0.92, V6_UI.fundo); // vidro sobre o mapa (pior caso: fundo)
  it.each(Object.entries(V6_BANDAS))('número no mosaico da banda %s', (_b, { c, t }) => {
    expect(contrastRatio(c, t)).toBeGreaterThanOrEqual(4.5);
  });
  it.each([
    ['espuma no painel', V6_UI.espuma, PAINEL],
    ['névoa no painel (rótulos, região, métricas)', V6_UI.nevoa, PAINEL],
    ['gelo no painel («Limpar»)', V6_UI.gelo, PAINEL],
    ['tinta na pílula activa (sol)', V6_UI.ink, V6_UI.sol],
    ['tinta no distintivo «Filtros 2» (sol)', V6_UI.ink, V6_UI.sol],
    ['espuma no chip (sol 14 % sobre o painel)', V6_UI.espuma, sobre(V6_UI.sol, 0.14, PAINEL)],
    ['espuma na pílula inactiva (espuma 6 %)', V6_UI.espuma, sobre(V6_UI.espuma, 0.06, PAINEL)],
    ['névoa na pílula «Saltar para»', V6_UI.nevoa, PAINEL],
    ['tinta na pílula «Saltar para» activa (espuma)', V6_UI.ink, V6_UI.espuma],
    ['espuma no select activo (sol 10 %)', V6_UI.espuma, sobre(V6_UI.sol, 0.1, sobre(V6_UI.fundo, 0.7, PAINEL))],
    ['branco na noite', '#FFFFFF', V6_BANDAS.noite.c],
  ])('%s', (_n, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('«Nível» com semântica de tecto (B2)', () => {
  it('um rótulo de tecto por opção do filtro, em todas as línguas', () => {
    for (const o of MAP_DIFFICULTY_OPTIONS) {
      const chave = MAP_DIFFICULTY_CEILING_KEY[o.id];
      for (const [loc, dict] of Object.entries(mapUiExplore)) {
        expect((dict as Record<string, string>)[chave], `${loc}.${chave}`).toBeTruthy();
      }
    }
  });
  it('PT-PT: Sem filtro / Só iniciante / Até intermédio / Todos (avançado)', () => {
    const pt = mapUiExplore.pt;
    expect(MAP_DIFFICULTY_OPTIONS.map((o) => pt[MAP_DIFFICULTY_CEILING_KEY[o.id]])).toEqual([
      'Sem filtro',
      'Só iniciante',
      'Até intermédio',
      'Todos (avançado)',
    ]);
  });
  it('countActiveExploreFilters não mudou (modalidade + região + nível)', () => {
    expect(countActiveExploreFilters({ sport: 'all', region: 'Todos', difficulty: 'all' })).toBe(0);
    expect(countActiveExploreFilters({ sport: 'surf', region: 'Todos', difficulty: 'all' })).toBe(1);
    expect(countActiveExploreFilters({ sport: 'surf', region: 'Todos', difficulty: 'intermediate' })).toBe(2);
    expect(countActiveExploreFilters({ sport: 'kitesurf', region: 'Algarve', difficulty: 'advanced' })).toBe(3);
  });
});
