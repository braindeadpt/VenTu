import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { notaReguaV6 } from '@/components/spots/map/MapTimeChrome';
import { getScoreTier } from '@/lib/scoreThresholds';
import { mapUiMarkers } from '@/lib/translations/mapUi/markers';

/**
 * Fase B do /mapa, PR B3 — régua de 48 h na pele v6 (`[data-pele=v6]`).
 * Prende: (1) o âmbito das regras novas, (2) as bandas v6 por escalão nas células,
 * (3) a noite «–» em #56677B pelos `null` do motor, (4) a nota /10 sem decimais e
 * (5) que cada gancho `data-mr` do CSS existe no MapTimeChrome só atrás da pele.
 */
const raiz = process.cwd();
const css = readFileSync(join(raiz, 'src/styles/mapa-pele-v6.css'), 'utf-8');
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const regras = [...semComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  seletor: m[1].trim(),
  corpo: m[2],
}));
const regrasB3 = regras.filter((r) => /data-mr/.test(r.seletor));
const fonte = readFileSync(join(raiz, 'src/components/spots/map/MapTimeChrome.tsx'), 'utf-8');

describe('pele v6 do /mapa — régua de 48 h (B3): CSS', () => {
  it('há regras B3 e todas ficam dentro de [data-pele=v6]', () => {
    expect(regrasB3.length).toBeGreaterThan(15);
    for (const r of regrasB3) {
      for (const s of r.seletor.split(',')) expect(s.trim().startsWith("[data-pele='v6']"), s).toBe(true);
    }
    expect(semComentarios).not.toMatch(/:root|@media/);
  });

  it('as células usam as bandas v6 por escalão (o mesmo mapa da B1/B2)', () => {
    const mapa = { closed: 'nao', poor: 'fraco', fair: 'da', good: 'bom', epic: 'mb' } as const;
    for (const [tier, banda] of Object.entries(mapa)) {
      const r = regrasB3.find((x) => x.seletor === `[data-pele='v6'] [data-mr='r-bar'][data-tier='${tier}']`);
      expect(r, tier).toBeDefined();
      expect(r!.corpo).toContain(`background:var(--b-${banda})`);
      expect(r!.corpo).toContain(`color:var(--b-${banda}-t)`);
    }
  });

  it('a noite é o fill #56677B com texto branco (célula e pill)', () => {
    for (const alvo of ["[data-mr='r-bar'][data-noite]", "[data-mr='pl-noite']"]) {
      const r = regrasB3.find((x) => x.seletor === `[data-pele='v6'] ${alvo}`);
      expect(r, alvo).toBeDefined();
      expect(r!.corpo).toContain('background:var(--b-noite)');
      expect(r!.corpo).toContain('color:var(--b-noite-t)');
    }
  });

  it('alvos da régua ≥ 44 px (play e «Agora»)', () => {
    const play = regrasB3.find((x) => x.seletor === "[data-pele='v6'] [data-mr='regua'] [data-map-hours-play]");
    expect(play?.corpo).toMatch(/width:44px;height:44px/);
    const agora = regrasB3.find((x) => x.seletor === "[data-pele='v6'] [data-mr='regua'] [data-map-hours-now]");
    expect(agora?.corpo).toMatch(/min-height:44px/);
  });

  it('cada gancho data-mr do CSS existe no MapTimeChrome, sempre atrás da pele', () => {
    const ganchos = new Set([...semComentarios.matchAll(/data-mr='([a-z-]+)'/g)].map((m) => m[1]));
    expect(ganchos.size).toBeGreaterThanOrEqual(8);
    for (const g of ganchos) {
      const literal = fonte.includes(`data-mr="${g}"`);
      const condicional = fonte.includes(`data-mr={v6 ? '${g}' : undefined}`);
      // O único gancho literal é a pílula da noite, que só se monta com a pele (frameNight).
      expect(literal || condicional, g).toBe(true);
      if (literal) expect(g).toBe('pl-noite');
    }
    expect(fonte).toMatch(/const frameNight = v6 &&/);
  });

  it('o range invisível e os seletores data-map-hours-* ficam intactos', () => {
    for (const s of ['data-map-hours-scrubber', 'data-map-hours-play', 'data-map-hours-now', 'data-map-time-pill', 'type="range"']) {
      expect(fonte, s).toContain(s);
    }
    expect(fonte).toContain('absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0');
  });
});

describe('nota /10 da régua (B3)', () => {
  it('map-hours ×10 → inteiro /10 pela escala única; null → «–»', () => {
    expect(notaReguaV6(60)).toBe('6');
    expect(notaReguaV6(0)).toBe('0');
    expect(notaReguaV6(100)).toBe('10');
    expect(notaReguaV6(74)).toBe('7'); // SUP/wake (motor antigo, contínuo)
    expect(notaReguaV6(85)).toBe('9'); // escala única: 85 já é 9 · Muito bom
    expect(notaReguaV6(null)).toBe('–');
  });
  it('o escalão da célula é o mesmo da nota mostrada, também nos contínuos', () => {
    for (let v = 0; v <= 100; v++) {
      expect(getScoreTier(Number(notaReguaV6(v)) * 10), String(v)).toBe(getScoreTier(v));
    }
  });
  it('a pill da noite diz «Noite» em PT e tem aria em todas as línguas', () => {
    const n = mapUiMarkers.pt.night;
    expect(n.charAt(0).toUpperCase() + n.slice(1)).toBe('Noite');
    for (const [loc, d] of Object.entries(mapUiMarkers)) expect(d.nightAria, loc).toBeTruthy();
  });
});
