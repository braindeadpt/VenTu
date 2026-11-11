import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SpotCardContent, proximaJanelaMapa } from '@/components/spots/MapSpotPreview';
import { V6_BANDAS } from '@/lib/v6Tokens';
import { contrastRatio } from '@/components/spots/mapMarkers';
import type { Spot } from '@/types';
import type { SportType } from '@/lib/sportRatings';
import type { SportScore } from '@/lib/sportScore';
import type { MapSpotPreviewData } from '@/components/spots/MapSpotPreview';

/**
 * Fase B do /mapa, PR B4 — cartão e folha do spot na pele v6.
 * (1) as regras B4 ficam todas dentro de [data-pele=v6] e cada gancho existe no componente;
 * (2) sem a pele o cartão de hoje não ganha nenhum `data-ms`;
 * (3) com a pele: nota /10 no tile da banda, noite com lua, nível por nivelDoSpot;
 * (4) próxima janela = primeiro passo com nota ≥ 7 depois da hora escolhida.
 */
const raiz = process.cwd();
const css = readFileSync(join(raiz, 'src/styles/mapa-pele-v6.css'), 'utf-8');
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const regras = [...semComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ seletor: m[1].trim(), corpo: m[2] }));
const regrasB4 = regras.filter((r) => /data-ms/.test(r.seletor));
const fontes = ['src/components/spots/MapSpotPreview.tsx', 'src/components/spots/MapSpotSheet.tsx']
  .map((f) => readFileSync(join(raiz, f), 'utf-8'))
  .join('\n');

const SPORTS: SportType[] = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup', 'foil'];
function scores(score: number): Record<SportType, SportScore> {
  const base = { score, rating: 'Bom', ratingEn: 'Good', factors: [], factorsEn: [], primaryFactor: 'Ondas' } as SportScore;
  return Object.fromEntries(SPORTS.map((s) => [s, { ...base }])) as Record<SportType, SportScore>;
}
function data(score = 72, spot: Partial<Spot> = {}): MapSpotPreviewData {
  return {
    spot: {
      id: 'guincho', slug: 'guincho', name: 'Guincho', nameEn: 'Guincho', region: 'Lisboa', regionEn: 'Lisbon',
      lat: 38.73, lon: -9.47, type: 'surf', difficulty: 'intermediate', bestWind: 'N', bestSwell: 'NW',
      coastOrientation: 270, description: 'x', descriptionEn: 'x', facilities: [], hazards: [], ...spot,
    } as Spot,
    conditions: {
      windSpeed: 6, windDirection: 0, waveHeight: 1.5, wavePeriod: 10, swellHeight: 1.8, swellPeriod: 12, waterTemp: 17,
    } as unknown as MapSpotPreviewData['conditions'],
    allScores: scores(score),
  };
}
const props = { data: data(), locale: 'pt', highlightSport: 'surf' as const, hoursFrame: 0, hourLabel: '14h' };

describe('pele v6 do /mapa — cartão e folha do spot (B4): CSS', () => {
  it('há regras B4 e todas ficam dentro de [data-pele=v6]', () => {
    expect(regrasB4.length).toBeGreaterThan(30);
    for (const r of regrasB4) for (const s of r.seletor.split(',')) expect(s.trim().startsWith("[data-pele='v6']"), s).toBe(true);
  });
  it('cada gancho data-ms do CSS existe no cartão ou na folha', () => {
    const ganchos = new Set([...semComentarios.matchAll(/data-ms='([a-z0-9-]+)'/g)].map((m) => m[1]));
    expect(ganchos.size).toBeGreaterThanOrEqual(20);
    for (const g of ganchos) {
      const ok = fontes.includes(`data-ms="${g}"`) || fontes.includes(`'${g}' : undefined}`);
      expect(ok, g).toBe(true);
    }
  });
  it('as bandas do tile têm o par fill/texto de V6_BANDAS e contraste ≥ 4,5:1', () => {
    const pares = { closed: 'nao', poor: 'fraco', fair: 'da', good: 'bom', epic: 'mb' } as const;
    for (const [tier, b] of Object.entries(pares)) {
      const r = regrasB4.find((x) => x.seletor.includes(`[data-ms='nota'][data-tier='${tier}']`));
      expect(r?.corpo, tier).toContain(`background:var(--b-${b})`);
      expect(contrastRatio(V6_BANDAS[b].c, V6_BANDAS[b].t)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('botões e fechar com alvo ≥ 44 px', () => {
    for (const g of ['b-sol', 'b-sec']) {
      const r = regrasB4.find((x) => x.seletor === `[data-pele='v6'] [data-ms='${g}']`);
      expect(Number(r?.corpo.match(/min-height:(\d+)px/)?.[1]), g).toBeGreaterThanOrEqual(44);
    }
    // o «fechar» mantém o min-h/min-w 44 px do markup de hoje
    expect(fontes).toMatch(/data-ms=\{v6 \? 'fecha' : undefined\}\s*className="absolute right-2 top-2 min-h-\[44px\] min-w-\[44px\]/);
  });
});

describe('cartão do spot — sem a pele fica igual', () => {
  it('sem pele: nenhum data-ms', () => {
    const h = renderToStaticMarkup(createElement(SpotCardContent, props));
    expect(h).not.toContain('data-ms');
    expect(h).toContain('data-card-score="72"');
  });
});

describe('cartão do spot — pele v6', () => {
  it('nota /10 no tile da banda, com o contrato data-card-score', () => {
    const h = renderToStaticMarkup(createElement(SpotCardContent, { ...props, pele: 'v6' }));
    expect(h).toContain('data-ms="nota"');
    expect(h).toContain('data-tier="good"');
    expect(h).toContain('data-card-score="72"');
    expect(h).toContain('>7</span><small aria-hidden="true">/10</small>');
    expect(h).toContain('data-score-factors');
  });
  it('nível pela modalidade (nivelDoSpot): Guincho avançado em kite', () => {
    const d = data(72, { difficultyBySport: { kitesurf: 'advanced' } } as Partial<Spot>);
    const h = renderToStaticMarkup(createElement(SpotCardContent, { ...props, data: d, highlightSport: 'kitesurf', pele: 'v6' }));
    expect(h).toMatch(/Nível: avançado/i);
  });
  it('noite: lua em vez da nota, sem banda', () => {
    const h = renderToStaticMarkup(createElement(SpotCardContent, { ...props, scoreOverride: null, pele: 'v6' }));
    expect(h).toContain('data-card-night="true"');
    expect(h).toContain('aria-label="noite, sem nota"');
    expect(h).not.toContain('data-card-score');
    expect(h).toContain('data-noite=""');
  });
});

describe('próxima janela no /mapa (B4)', () => {
  it('primeiro passo com nota ≥ 7 depois da hora escolhida', () => {
    expect(proximaJanelaMapa([null, null, 50, 64, 66, 90], 0)).toEqual({ i: 4, nota: 7 }); // 66 já é 7 na escala única;
    expect(proximaJanelaMapa([80, null, 90], 0)).toEqual({ i: 2, nota: 9 });
  });
  it('a hora escolhida não conta; sem ≥ 7 → null', () => {
    expect(proximaJanelaMapa([90, 60, null], 0)).toBeNull();
    expect(proximaJanelaMapa(undefined, 0)).toBeNull();
  });
});
