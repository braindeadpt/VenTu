import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import { buildMapHoursFile } from '@/lib/mapHoursBuild';
import { linhasAgora } from '@/lib/notaV6AgoraBuild';
import { scoreAtHour } from '@/lib/mapHours';
import { findCoveredHourIndex, hourKeyFromOpenMeteo, seriesTimeMs } from '@/lib/openMeteoTime';
import { construirHoras, horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import { avaliaHorasSite } from '@/lib/modalidades';
import { melhorTodos } from '@/lib/desportosV6';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';

/**
 * Motor único (#218), PR 2: golden do `map-hours.json` com o v6. Desde o PR 6
 * as cinco modalidades v6 (kitesurf, surf, windsurf, bodyboard, foil = melhor
 * vertente) e o `best` com a regra do «Todos» (`desportosV6.melhorTodos`).
 *
 * Para as fixtures da issue (Guincho, Nazaré, Lagoa de Albufeira e Meia Praia
 * no Algarve) sobre a fixture e2e (`tests/e2e/fixtures/data`, 08/09 08:45), as
 * 16 frames de kitesurf e surf têm de ser EXACTAMENTE `avaliaHoras(horaDeLinha(…)) × 10`
 * (0 diferenças), `null` quando o v6 não dá nota (noite / sem dados):
 * - frame «agora» (hora coberta): desde o PR 3, a linha «agora» de D4 (hora
 *   coberta do forecast com as observações frescas do `conditions.json` por
 *   cima, `notaV6AgoraBuild.linhasAgora`) no lugar da hora coberta da série,
 *   as vizinhas dão o sentido da maré;
 * - outras frames: a linha do forecast nessa hora — o mesmo número que a régua
 *   da página do spot (`construirHoras`) mostra para essa hora.
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const FIX = path.join(ROOT, 'tests/e2e/fixtures/data');
const IDS = ['guincho', 'nazare', 'lagoa-albufeira', 'lagos'] as const;
const SPORTS = [
  ['kitesurf', 'kite'],
  ['surf', 'surf'],
  ['windsurf', 'windsurf'],
  ['bodyboard', 'bodyboard'],
  ['foil', 'foil'],
] as const;

const ler = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const serieDe = (sp: Spot) => sp.conditionsSource ?? sp.id;
const slot = (t: string) => Math.floor(seriesTimeMs(t) / 3_600_000);

function construir() {
  const { generatedAt } = ler('map-hours.json') as { generatedAt: string };
  const now = new Date(generatedAt);
  const conditions = ler('conditions.json') as Record<string, Record<string, unknown>>;
  const sel = IDS.map((id) => (spots as Spot[]).find((s) => s.id === id)!);
  const forecasts: Record<string, Array<Record<string, unknown>>> = {};
  for (const sp of sel) forecasts[serieDe(sp)] = ler(`forecasts/${serieDe(sp)}.json`);
  const mh = buildMapHoursFile({ forecasts, conditions, spots: sel, now, generatedAt });
  return { mh, now, conditions, sel, forecasts };
}

describe('map-hours.json com o motor v6 (#218, PR 2) — golden das fixtures', () => {
  const { mh, now, conditions, sel, forecasts } = construir();

  it('16 frames, as cinco modalidades v6 com uma entrada por frame', () => {
    expect(mh.times).toHaveLength(16);
    for (const sp of sel) {
      for (const [sport] of SPORTS) expect(mh.spots[sp.id][sport]).toHaveLength(16);
      expect(mh.spots[sp.id].best).toHaveLength(16);
    }
  });

  it('as cinco modalidades v6 = avaliaHorasSite(…) × 10 nas 16 frames: 0 diferenças', () => {
    const diferencas: string[] = [];
    let comparadas = 0;
    for (const sp of sel) {
      const linhas = (forecasts[serieDe(sp)] as unknown as LinhaForecast[]).filter((l) => typeof l?.time === 'string');
      const live = conditions[sp.id] ?? (sp.conditionsSource ? conditions[sp.conditionsSource] : undefined);
      const ed = editorialDe(sp);
      const local = { lat: sp.lat, lon: sp.lon, praiaVirada: ed.praiaVirada };
      mh.times.forEach((time, i) => {
        const j = linhas.findIndex((l) => slot(l.time) === slot(time));
        expect(j, `${sp.id} frame ${i}: hora na série`).toBeGreaterThanOrEqual(0);
        const isNow = findCoveredHourIndex([time], now) === 0;
        // frame «agora»: a linha de D4 (#218, PR 3) — hora coberta do forecast + observações frescas
        const alvo =
          isNow && live
            ? linhasAgora(live, linhas as unknown as Array<Record<string, unknown>>, now.getTime())!
            : { linhas, j };
        const h = horaDeLinha(alvo.linhas, alvo.j, local);
        for (const [sport, mod] of SPORTS) {
          const [av] = avaliaHorasSite(spotModalidadeDe(ed), mod, [h]);
          const esperado = av.n == null ? null : av.n * 10;
          const real = mh.spots[sp.id][sport][i];
          comparadas++;
          if (real !== esperado) diferencas.push(`${sp.id} ${sport} #${i} ${time}: ${real} ≠ ${esperado}`);
        }
      });
    }
    expect(comparadas).toBe(IDS.length * SPORTS.length * 16);
    expect(diferencas).toEqual([]);
  });

  it('frames futuras = a régua de 48 h da página do spot (construirHoras) × 10, à mesma hora', () => {
    const diferencas: string[] = [];
    for (const sp of sel) {
      const linhas = (forecasts[serieDe(sp)] as unknown as LinhaForecast[]).filter((l) => typeof l?.time === 'string');
      const ed = editorialDe(sp);
      const { horas } = construirHoras(linhas, { lat: sp.lat, lon: sp.lon, praiaVirada: ed.praiaVirada }, now.getTime());
      mh.times.forEach((time, i) => {
        const l = linhas.find((x) => slot(x.time) === slot(time))!;
        const hora = horas.find((x) => x.t === l.time.slice(0, 16));
        if (!hora) return; // fora das 48 h da régua do spot
        for (const [sport, mod] of SPORTS) {
          const [av] = avaliaHorasSite(spotModalidadeDe(ed), mod, [hora]);
          const esperado = av.n == null ? null : av.n * 10;
          if (mh.spots[sp.id][sport][i] !== esperado) diferencas.push(`${sp.id} ${sport} #${i}`);
        }
      });
    }
    expect(diferencas).toEqual([]);
  });

  it('de noite as cinco v6 são null (não 0) e o `best` («Todos») também (PR 6)', () => {
    const noites = mh.times
      .map((t, i) => ({ i, h: Number(hourKeyFromOpenMeteo(t).slice(-2)) }))
      .filter(({ h }) => h === 23 || h === 2);
    expect(noites.length).toBeGreaterThanOrEqual(2);
    for (const sp of sel) {
      for (const { i } of noites) {
        for (const [sport] of SPORTS) expect(mh.spots[sp.id][sport][i]).toBeNull();
        expect(scoreAtHour(mh, sp.id, 'kitesurf', i)).toBeNull();
        expect(scoreAtHour(mh, sp.id, 'big-wave', i)).toBeNull();
        expect(mh.spots[sp.id].best[i]).toBeNull();
        expect(scoreAtHour(mh, sp.id, 'all', i)).toBeNull();
        // SUP e wakeboard (motor antigo) continuam números
        expect(typeof mh.spots[sp.id].sup[i]).toBe('number');
      }
    }
  });

  it('scores v6 de dia são múltiplos de 10 entre 0 e 100', () => {
    for (const sp of sel) {
      for (const [sport] of SPORTS) {
        for (const v of mh.spots[sp.id][sport]) {
          if (v === null) continue;
          expect(v % 10).toBe(0);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('`best` = regra do «Todos» em todas as frames: máximo das v6 com nota (SUP / wakeboard não entram)', () => {
    for (const sp of sel) {
      mh.times.forEach((_, i) => {
        const esperado = melhorTodos(sp, (sport) => mh.spots[sp.id][sport]?.[i]);
        expect(mh.spots[sp.id].best[i], `${sp.id} #${i}`).toBe(esperado);
        const v6 = SPORTS.map(([sport]) => mh.spots[sp.id][sport][i]).filter((v): v is number => v != null);
        expect(mh.spots[sp.id].best[i]).toBe(v6.length ? Math.max(...v6) : null);
      });
    }
  });
});

