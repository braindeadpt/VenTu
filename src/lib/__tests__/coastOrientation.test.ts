/**
 * #178 — orientação da costa (`coastOrientation`): o cálculo a partir da linha
 * de costa OSM (`scripts/lib/coastOrientation.mjs`), os valores aplicados em
 * `src/lib/spots.ts` e o ficheiro de revisão `data/coast-orientation-review.json`.
 */
import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import { classifyWind, windSportDirectionSafety } from '@/lib/sportScore';
import editorial from '@/lib/spotEditorial.json';
import review from '../../../data/coast-orientation-review.json';
import { orientacaoCosta, difAng } from '../../../scripts/lib/coastOrientation.mjs';

type Linha = { id: string; atual: number; calculado: number | null; curado: number | null; final: number; origem: string; revisao: boolean; motivos: string[] };
const linhas = (review as unknown as { spots: Linha[] }).spots;
const porId = new Map(linhas.map((l) => [l.id, l]));
const CURADOS = (editorial as unknown as { spots: Record<string, { praiaVirada: number }> }).spots;
/** Água interior (`aguaInterior: true`): o vento não se classifica em onshore/offshore. */
const AGUA_INTERIOR = ['cabedelo-wakepark', 'ilha-do-ermal', 'lagos-wakepark', 'castelo-bode', 'alqueva', 'praia-da-lomba', 'murtosa', 'foil-lagoa-albufeira', 'lagoa-sancha', 'foil-alvor'];
/** Revisão v2 da orientação (25/10, aprovada pelo Pedro): [id, valor]. */
const REVISAO_V2: Array<[string, number]> = [
    ['vila-praia-ancora', 240],
    ['foil-cabedelo', 210],
    ['canide-sul', 265],
    ['bairro-piscatorio', 275],
    ['marina-afurada-foil', 330],
    ['barrinha-esmoriz', 290],
    ['ria-torreira', 90],
    ['trafaria', 295],
    ['ponta-dos-corvos', 10],
    ['pescadores-ericeira', 245],
    ['seixal-bay', 40],
    ['cova-do-vapor', 290],
    ['troia', 25],
    ['lagoa-santo-andre', 285],
    ['vila-nova-milfontes', 175],
    ['comporta', 250],
    ['carvalhal', 300],
    ['cacela-velha', 165],
    ['cabanas-tavira', 150],
    ['vila-real-santo-antonio', 195],
    ['alvor', 185],
    ['ferragudo', 235],
    ['barrinha-faro', 215],
    ['fuseta', 325],
    ['praia-vitoria', 110],
    ['santa-catarina-terceira', 105],
    ['porto-martins', 150],
    ['mosteiros', 310],
    ['ponta-pargo', 300],
    ['ponta-sao-lourenco', 190],
    ['machico', 135],
    ['seixal-madeira', 45],
    ['ribeira-brava', 220],
];

/** Linha recta de (lat0, lon0) com um rumo, em `n` passos de ~50 m (coords [lat, lon]). */
function recta(lat0: number, lon0: number, rumoGraus: number, n = 80, passoM = 50): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
  for (let i = 0; i < n; i++) {
    const s = (i - n / 2) * passoM;
    out.push([lat0 + (s * Math.cos((rumoGraus * Math.PI) / 180)) / 110574, lon0 + (s * Math.sin((rumoGraus * Math.PI) / 180)) / kx]);
  }
  return out;
}

describe('orientacaoCosta (cálculo OSM)', () => {
  const P = { lat: 38.7, lon: -9.4 };

  it('costa oeste (terra a leste, a via corre para sul) → virada a 270°', () => {
    const r = orientacaoCosta(P, [{ coords: recta(P.lat, P.lon - 0.001, 180) }]);
    expect(r.ok).toBe(true);
    expect(r.arredondado).toBe(270);
    expect(r.ambigua).toBe(false);
    expect(r.distM).toBeGreaterThan(50);
  });

  it('costa sul (terra a norte, a via corre para este) → virada a 180°', () => {
    const r = orientacaoCosta(P, [{ coords: recta(P.lat - 0.001, P.lon, 90) }]);
    expect(r.arredondado).toBe(180);
  });

  it('costa virada a SSW (Carcavelos, rumo da via 105°) → 195°', () => {
    const r = orientacaoCosta(P, [{ coords: recta(P.lat, P.lon, 105) }]);
    expect(r.arredondado).toBe(195);
  });

  it('a via partida em duas (ligadas pelas pontas) dá o mesmo resultado', () => {
    const c = recta(P.lat, P.lon - 0.001, 180);
    const r = orientacaoCosta(P, [{ coords: c.slice(40) }, { coords: c.slice(0, 41) }]);
    expect(r.arredondado).toBe(270);
    expect(r.cadeiaCurta).toBe(false);
  });

  it('rochas e recortes pequenos não viram a orientação (suavização de 500 m)', () => {
    const c = recta(P.lat, P.lon - 0.001, 180, 160, 25).map(([la, lo], i): [number, number] => [la, lo + (i % 4 === 1 ? 0.0002 : 0)]);
    const r = orientacaoCosta(P, [{ coords: c }]);
    expect(difAng(r.graus, 270)).toBeLessThan(10);
  });

  it('ponta (a costa dobra 90° no ponto mais próximo) → ambígua', () => {
    // desce para sul 500 m até P e segue 500 m para este (terra à esquerda: uma ponta virada a SW)
    const a: Array<[number, number]> = Array.from({ length: 11 }, (_, i) => [P.lat + (0.0045 * (10 - i)) / 10, P.lon]);
    const b: Array<[number, number]> = Array.from({ length: 10 }, (_, i) => [P.lat, P.lon + (0.0057 * (i + 1)) / 10]);
    const r = orientacaoCosta({ lat: P.lat - 0.0003, lon: P.lon - 0.0003 }, [{ coords: [...a, ...b] }]);
    expect(r.ambigua).toBe(true);
  });

  it('sem linha de costa → não calcula', () => {
    expect(orientacaoCosta(P, []).ok).toBe(false);
  });
});

describe('coastOrientation em src/lib/spots.ts', () => {
  it('todos os spots têm orientação inteira em [0, 360)', () => {
    for (const s of spots) {
      expect(Number.isInteger(s.coastOrientation), s.id).toBe(true);
      expect(s.coastOrientation, s.id).toBeGreaterThanOrEqual(0);
      expect(s.coastOrientation, s.id).toBeLessThan(360);
    }
  });

  it('o ficheiro de revisão cobre os 189 spots e está aplicado (final = spots.ts)', () => {
    expect(linhas.length).toBe(spots.length);
    for (const s of spots) expect(porId.get(s.id)?.final, s.id).toBe(s.coastOrientation);
  });

  it('nenhum spot fica a 270° sem justificação (água interior isenta, explicitamente)', () => {
    const em270 = spots.filter((s) => s.coastOrientation === 270);
    for (const s of em270) {
      const l = porId.get(s.id)!;
      const justificado =
        (l.origem === 'curado' && l.curado === 270) ||
        (l.origem.startsWith('osm') && l.calculado === 270) ||
        (l.origem === 'mantido' && l.revisao && l.motivos.length > 0) ||
        // água interior (albufeiras, lagoas, rios interiores, cable parks): a orientação não se usa para o vento
        (l.origem === 'agua-interior' && s.aguaInterior === true && AGUA_INTERIOR.includes(s.id));
      expect(justificado, `${s.id}: ${JSON.stringify(l.motivos)}`).toBe(true);
    }
    // antes: 144 de 185 a 270°
    expect(em270.length).toBeLessThan(144);
  });

  it('água interior: só os 10 spots da lista, todos com origem `agua-interior`', () => {
    expect(spots.filter((s) => s.aguaInterior).map((s) => s.id).sort()).toEqual([...AGUA_INTERIOR].sort());
    for (const l of linhas) expect(l.origem === 'agua-interior', l.id).toBe(AGUA_INTERIOR.includes(l.id));
  });

  it.each(REVISAO_V2)('revisão v2 (25/10): %s fica a %i°, fixado à mão (VALOR_MANUAL)', (id, v) => {
    const s = spots.find((x) => x.id === id)!;
    expect(s.coastOrientation).toBe(v);
    const l = porId.get(id)!;
    expect(l.origem).toBe('manual');
    expect(l.final).toBe(v);
    expect(s.aguaInterior).toBeUndefined();
  });

  it('os spots curados da v6 têm a mesma orientação no motor antigo', () => {
    for (const [id, c] of Object.entries(CURADOS)) {
      const s = spots.find((x) => x.id === id);
      expect(s?.coastOrientation, id).toBe(c.praiaVirada);
    }
  });

  it.each([
    ['carcavelos', 190],
    ['supertubos', 240],
    ['guincho', 280],
    ['nazare', 280],
    ['ribeira-ilhas', 280],
    ['lagos', 150],
  ])('referência da #178: %s ≈ %i° (±15°)', (id, ref) => {
    const s = spots.find((x) => x.id === id)!;
    expect(difAng(s.coastOrientation, ref)).toBeLessThanOrEqual(15);
  });

  it('Carcavelos com nortada já não é cross-shore (kite) nem side-onshore (surf)', () => {
    const car = spots.find((s) => s.id === 'carcavelos')!;
    for (const wd of [340, 350, 0, 10, 20]) {
      const k = windSportDirectionSafety(car, wd);
      expect(k.direction, `wd ${wd}`).not.toBe('cross-shore');
      expect(k.direction, `wd ${wd}`).toBe('offshore');
      expect(k.scoreCap, `wd ${wd}`).not.toBeNull();
      expect(classifyWind(car, wd), `wd ${wd}`).toBe('offshore');
    }
  });

  it('coastOrientation 0 é «virada a norte», não «sem valor» (`?? 270`)', () => {
    const norte = { ...spots[0], coastOrientation: 0 };
    expect(classifyWind(norte, 0)).toBe('onshore');
    expect(classifyWind(norte, 180)).toBe('offshore');
    expect(windSportDirectionSafety(norte, 0).direction).toBe('onshore');
  });
});
