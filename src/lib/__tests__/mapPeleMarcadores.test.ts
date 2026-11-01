import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildV3MarkerIcon,
  contrastRatio,
  markerScoreInkHex,
  v3WindRel,
} from '@/components/spots/mapMarkers';
import type { MapSpotData } from '@/components/spots/mapSpotData';
import { V6_BANDAS } from '@/lib/v6Tokens';
import { MAP_NIGHT_FILL, MAP_NIGHT_INK } from '@/lib/mapNight';

/**
 * Fase B do /mapa, PR B1 — marcadores, grupos e noite nas bandas v6.
 *
 * A pele v6 (`[data-pele=v6]`, src/styles/mapa-pele-v6.css) passa os escalões
 * `--score-*` às bandas v6; a tinta do número continua a de markerScoreInkCss
 * (`rgb(var(--bg-base))` = abismo na pele, branco fixo no «Não dá»). Estes
 * testes prendem o CSS às bandas de V6_BANDAS e o contraste a ≥ 4,5:1.
 */
const css = readFileSync(join(process.cwd(), 'src/styles/mapa-pele-v6.css'), 'utf-8');

const ABISMO = '#030E18'; // --bg-base na pele v6

function triplet(name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)`));
  if (!m) throw new Error(`${name} em falta no CSS da pele`);
  return '#' + m.slice(1, 4).map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// escalão (scoreThresholds) → banda v6, com um score representativo de cada um
const ESCALOES = [
  { var: '--score-closed', banda: 'nao', score: 20 },
  { var: '--score-poor', banda: 'fraco', score: 40 },
  { var: '--score-fair', banda: 'da', score: 60 },
  { var: '--score-good', banda: 'bom', score: 80 },
  { var: '--score-epic', banda: 'mb', score: 95 },
] as const;

describe('pele v6 do /mapa — bandas dos marcadores (B1)', () => {
  it.each(ESCALOES)('$var = banda $banda de V6_BANDAS', ({ var: v, banda }) => {
    expect(triplet(v)).toBe(V6_BANDAS[banda].c.toUpperCase());
  });

  it.each(ESCALOES)('número sobre $banda com contraste ≥ 4,5:1', ({ banda, score }) => {
    // markerScoreInkHex devolve branco no «Não dá»; nos outros a tinta é bg-base,
    // que a pele v6 põe em abismo.
    const inkTemaEscuro = markerScoreInkHex(score, 'dark');
    const ink = inkTemaEscuro === '#FFFFFF' ? inkTemaEscuro : ABISMO;
    expect(contrastRatio(V6_BANDAS[banda].c, ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('noite: lua branca sobre #56677B ≥ 4,5:1', () => {
    expect(MAP_NIGHT_FILL.toUpperCase()).toBe('#56677B');
    expect(contrastRatio(MAP_NIGHT_FILL, MAP_NIGHT_INK)).toBeGreaterThanOrEqual(4.5);
  });

  it('as regras da pele ficam todas dentro de [data-pele=v6]', () => {
    const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const seletores = [...semComentarios.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
    expect(seletores.length).toBeGreaterThan(5);
    for (const s of seletores) {
      for (const parte of s.split(',')) expect(parte.trim().startsWith("[data-pele='v6']")).toBe(true);
    }
  });
});

describe('arco do vento por ventoRel nos marcadores (B1)', () => {
  const L = { divIcon: (o: { html: string }) => o } as unknown as typeof import('leaflet');
  const data = (windDirection: number, spot: Record<string, unknown>) =>
    ({ spot: { id: 'x', lat: 0, lon: 0, ...spot }, conditions: { windDirection } }) as unknown as MapSpotData;

  it('marca o tique com data-vento-rel; sem relação não marca', () => {
    const on = buildV3MarkerIcon(L, { spotId: 'x', score: 60, windBlowsToDeg: 90, windRel: 'offshore' }) as unknown as { html: string };
    expect(on.html).toContain('data-vento-rel="offshore"');
    const sem = buildV3MarkerIcon(L, { spotId: 'x', score: 60, windBlowsToDeg: 90 }) as unknown as { html: string };
    expect(sem.html).toContain('data-wind-tick="true"');
    expect(sem.html).not.toContain('data-vento-rel');
  });

  it('v3WindRel usa a classificação do motor (praia virada a W)', () => {
    expect(v3WindRel(data(270, { coastOrientation: 270 }), true)).toBe('onshore'); // vem do mar
    expect(v3WindRel(data(180, { coastOrientation: 270 }), true)).toBe('cross'); // 90°
    expect(v3WindRel(data(90, { coastOrientation: 270 }), true)).toBe('offshore'); // vem de terra
    expect(v3WindRel(data(90, { coastOrientation: 270, aguaInterior: true }), true)).toBeNull();
    expect(v3WindRel(data(90, { coastOrientation: 270 }), false)).toBeNull();
  });
});
