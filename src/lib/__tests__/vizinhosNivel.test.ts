/**
 * #nivel-ui — «Do teu nível, perto daqui»: vizinhos ≤ 80 km da modalidade,
 * dentro do nível (tecto, nível por desporto), ordenados pela nota na hora
 * (map-hours, a mesma do «Perto daqui»); empate → o mais perto.
 */
import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import { nivelDoSpot, spotDentroDoNivel } from '@/lib/mapDifficulty';
import { PERTO_NIVEL_KM, vizinhosDoNivel } from '@/lib/vizinhosNivel';
import { nearestSpots } from '@/lib/context/nearbySpots';
import type { MapHoursFile } from '@/lib/mapHours';

const guincho = spots.find((s) => s.id === 'guincho')!;

/** map-hours mínimo: score por spot (kitesurf), dois passos. */
function ficheiro(scores: Record<string, Array<number | null>>): MapHoursFile {
  return {
    generatedAt: '2026-10-14T13:00:00Z',
    stepHours: 3,
    times: ['2026-10-14T12:00', '2026-10-14T15:00'],
    sports: ['kitesurf'],
    spots: Object.fromEntries(Object.entries(scores).map(([id, s]) => [id, { kitesurf: s }])),
  };
}

describe('vizinhosDoNivel', () => {
  it('Guincho em kite, iniciante: só vizinhos de iniciante (ou «todos»), ≤ 80 km, praticam kite', () => {
    const r = vizinhosDoNivel(guincho, spots, 'kitesurf', 'beginner', null, 0, 99);
    expect(r.length).toBeGreaterThan(0);
    for (const v of r) {
      expect(v.spot.id).not.toBe('guincho');
      expect(v.distanceKm).toBeLessThanOrEqual(PERTO_NIVEL_KM);
      expect(spotDentroDoNivel(nivelDoSpot(v.spot, 'kitesurf'), 'beginner')).toBe(true);
      expect(!v.spot.compatibleSports?.length || v.spot.compatibleSports.includes('kitesurf')).toBe(true);
      expect(v.nota).toBeNull();
    }
    // sem ficheiro: ordem por distância
    const d = r.map((v) => v.distanceKm);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });

  it('ordena pela nota na hora escolhida; empate → o mais perto; noite e sem série no fim', () => {
    const base = vizinhosDoNivel(guincho, spots, 'kitesurf', 'beginner', null, 0, 99);
    expect(base.length).toBeGreaterThanOrEqual(3);
    const [a, b, c] = base; // por distância
    const f = ficheiro({ [a.spot.id]: [40, 90], [b.spot.id]: [80, 10], [c.spot.id]: [80, null] });
    const p0 = vizinhosDoNivel(guincho, spots, 'kitesurf', 'beginner', f, 0);
    expect(p0.map((v) => v.spot.id)).toEqual([b.spot.id, c.spot.id, a.spot.id]);
    expect(p0.map((v) => v.nota)).toEqual([8, 8, 4]);
    const p1 = vizinhosDoNivel(guincho, spots, 'kitesurf', 'beginner', f, 1);
    expect(p1[0].spot.id).toBe(a.spot.id);
    expect(p1[0].nota).toBe(9);
    expect(p1.find((v) => v.spot.id === c.spot.id)?.nota ?? 'fora do top').not.toBe(0);
  });

  it('o próprio nível por desporto conta: o Guincho é intermédio em surf, cabe para um intermédio', () => {
    const perto = nearestSpots(guincho, spots, { limit: 999, maxKm: 80 }).map((e) => e.spot);
    const vizinhoDoGuincho = perto.find((s) => s.id !== 'guincho')!;
    const r = vizinhosDoNivel(vizinhoDoGuincho, spots, 'surf', 'intermediate', null, 0, 999);
    expect(r.some((v) => v.spot.id === 'guincho')).toBe(true);
    const k = vizinhosDoNivel(vizinhoDoGuincho, spots, 'kitesurf', 'intermediate', null, 0, 999);
    expect(k.some((v) => v.spot.id === 'guincho')).toBe(false);
  });

  it('o mesmo sítio só conta uma vez (mesma célula de previsão ou < 3 km)', () => {
    const obidos = spots.find((s) => s.id === 'obidos-lagoon')!;
    const perto = vizinhosDoNivel(obidos, spots, 'kitesurf', 'advanced', null, 0, 99);
    for (const [k, v] of perto.entries())
      for (const o of perto.slice(0, k)) {
        expect((o.spot.conditionsSource ?? o.spot.id) === (v.spot.conditionsSource ?? v.spot.id)).toBe(false);
      }
    const r = vizinhosDoNivel(guincho, spots, 'kitesurf', 'beginner', null, 0, 99);
    const variantesObidos = r.filter((v) => (v.spot.conditionsSource ?? v.spot.id) === 'obidos-lagoon');
    expect(variantesObidos.length).toBeLessThanOrEqual(1);
  });

  it('limite de 3 por omissão', () => {
    expect(vizinhosDoNivel(guincho, spots, 'kitesurf', 'advanced', null, 0).length).toBeLessThanOrEqual(3);
  });
});
