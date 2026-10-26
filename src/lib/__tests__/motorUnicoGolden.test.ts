import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import { allScoresComV6, notaV6DoSpot } from '@/lib/notaV6Agora';
import { applyRegionalBiasFallback, rawToScoreInput } from '@/lib/scoreConditions';
import { loadWaveBiasRegionsBuild } from '@/lib/waveBias';
import { resolveConditionsEntry } from '@/lib/spotConditionsSource';
import { buildMapHoursFile } from '@/lib/mapHoursBuild';
import { findCoveredHourIndex } from '@/lib/openMeteoTime';
import { horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import { avaliaHoras } from '@/lib/modalidades';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { notaHora, type SportScoreV6 } from '@/lib/notaUnica';

/**
 * Motor único (#218), PR 0: golden «ANTES». Grava o que cada superfície mostra
 * HOJE para as fixtures da issue (Guincho, Nazaré, Carcavelos, Peniche /
 * Supertubos, Lagoa de Albufeira e Meia Praia no Algarve; kite e surf), sobre
 * a fixture e2e (`tests/e2e/fixtures/data`, 08/09 08:45):
 *
 * - `regua`: as 16 frames do /mapa (`buildMapHoursFile`). Desde o PR 2 é o
 *   motor v6 (nota × 10; `null` de noite / sem dados); o golden foi regravado
 *   nesse PR (era o motor antigo, 0–100);
 * - `agora`: o bake do /mapa e da lista (`buildSpotData`). Desde o PR 3, em
 *   kitesurf e surf é o `notaV6` que o pipeline grava no `conditions.json`
 *   (linha «agora» de D4) × 10; era o `getAllSportScores` sobre o snapshot;
 * - `spotV6`: a régua de 48 h da página do spot (`avaliaHoras` sobre
 *   `horaDeLinha`), nota /10 ou `null` (noite / sem dados).
 *
 * Os PRs 2 e 3 mudaram `regua` e `agora` DE PROPÓSITO (passam a ser iguais a
 * `spotV6`): o golden regrava-se nesse PR, com a tabela antes/depois no corpo.
 * Regravar: `MOTOR_GOLDEN_UPDATE=1 npx vitest run src/lib/__tests__/motorUnicoGolden.test.ts`.
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const FIX = path.join(ROOT, 'tests/e2e/fixtures/data');
const GOLDEN = path.join(__dirname, 'fixtures', 'motor-unico-antes.json');
const IDS = ['guincho', 'nazare', 'carcavelos', 'supertubos', 'lagoa-albufeira', 'lagos'] as const;
const SPORTS = ['kitesurf', 'surf'] as const;
const NH = 48;

const ler = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));

type Golden = Record<string, Record<string, { regua: Array<number | null>; agora: number; spotV6: Array<number | null> }>> & {
  _meta?: unknown;
};

function construir() {
  const mapHours = ler('map-hours.json') as { generatedAt: string };
  const now = new Date(mapHours.generatedAt);
  const forecasts = ler('forecasts.json') as Record<string, Array<Record<string, unknown>>>;
  const conditions = ler('conditions.json') as Record<string, Record<string, unknown>>;
  const bias = loadWaveBiasRegionsBuild(null, path.join(FIX, 'wave-bias.json'));
  const sel = IDS.map((id) => (spots as Spot[]).find((s) => s.id === id)!);
  const mh = buildMapHoursFile({ forecasts, conditions, spots: sel, now, generatedAt: mapHours.generatedAt });
  const out: Golden = {};
  const linhasPorSpot: Record<string, { linhas: LinhaForecast[]; i0: number }> = {};
  for (const sp of sel) {
    const serie = (sp as Spot & { conditionsSource?: string }).conditionsSource ?? sp.id;
    const linhas = (ler(`forecasts/${serie}.json`) as LinhaForecast[]).filter((l) => typeof l?.time === 'string');
    const i0 = findCoveredHourIndex(linhas.map((l) => l.time), now);
    linhasPorSpot[sp.id] = { linhas, i0 };
    const ed = editorialDe(sp);
    const local = { lat: sp.lat, lon: sp.lon, praiaVirada: ed.praiaVirada };
    const horas = Array.from({ length: NH }, (_, k) => horaDeLinha(linhas, i0 + k, local));
    const raw = resolveConditionsEntry(sp, conditions) as Record<string, unknown>;
    const patch = applyRegionalBiasFallback(raw, sp.region, bias);
    const input = rawToScoreInput(raw);
    const all = allScoresComV6(sp, patch ? { ...input, waveHeight: patch.waveHeight } : input, notaV6DoSpot(sp, conditions));
    out[sp.id] = {};
    for (const sport of SPORTS) {
      out[sp.id][sport] = {
        regua: mh.spots[sp.id][sport],
        agora: all[sport].score,
        spotV6: avaliaHoras(spotModalidadeDe(ed), sport === 'kitesurf' ? 'kite' : 'surf', horas).map((a) => a.n),
      };
    }
  }
  return { out, linhasPorSpot, now: mapHours.generatedAt, times: mh.times };
}

describe('motor único (#218) — golden «antes» das superfícies (fixture e2e)', () => {
  const { out, linhasPorSpot, now, times } = construir();

  if (process.env.MOTOR_GOLDEN_UPDATE) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, `${JSON.stringify({ _meta: { fixture: 'tests/e2e/fixtures/data', now, times }, ...out }, null, 1)}\n`);
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as Golden;

  it('a fixture cobre os 6 spots, com 16 frames e 48 h', () => {
    for (const id of IDS) {
      expect(linhasPorSpot[id].i0).toBeGreaterThanOrEqual(0);
      for (const sport of SPORTS) {
        expect(out[id][sport].regua).toHaveLength(16);
        expect(out[id][sport].spotV6).toHaveLength(NH);
      }
    }
  });

  for (const id of IDS) {
    for (const sport of SPORTS) {
      it(`${id} × ${sport}: régua do /mapa, «agora» do /mapa e régua do spot iguais ao golden`, () => {
        expect(out[id][sport]).toEqual(golden[id][sport]);
      });
    }
  }

  it('notaHora (v6) dá, hora a hora, exactamente a nota da página do spot', () => {
    for (const id of IDS) {
      const sp = (spots as Spot[]).find((s) => s.id === id)!;
      const { linhas, i0 } = linhasPorSpot[id];
      for (const sport of SPORTS) {
        const notas = Array.from({ length: NH }, (_, k) => (notaHora(sp, sport, linhas, i0 + k) as SportScoreV6).nota);
        expect(notas).toEqual(out[id][sport].spotV6);
      }
    }
  });

  it('PR 2: as frames futuras da régua do /mapa = régua do spot × 10 (mesma hora), noite incluída', () => {
    // frame i (passos de 3 h desde a hora coberta) = hora i0 + 3i da régua do spot
    for (const id of IDS) {
      for (const sport of SPORTS) {
        const { regua, spotV6 } = out[id][sport];
        for (let i = 1; i < regua.length; i++) {
          const n = spotV6[3 * i];
          expect(regua[i], `${id} ${sport} #${i}`).toBe(n == null ? null : n * 10);
        }
      }
    }
  });

  it('PR 3: o «agora» do bake (allScores) e a frame 0 da régua do /mapa = régua do spot na hora coberta × 10 (0 diferenças)', () => {
    const diferencas: string[] = [];
    for (const id of IDS) {
      for (const sport of SPORTS) {
        const { agora, regua, spotV6 } = out[id][sport];
        const v6 = spotV6[0];
        if (agora !== (v6 == null ? 0 : v6 * 10)) diferencas.push(`${id} ${sport} agora ${agora} ≠ ${v6}`);
        if (regua[0] !== (v6 == null ? null : v6 * 10)) diferencas.push(`${id} ${sport} régua[0] ${regua[0]} ≠ ${v6}`);
      }
    }
    expect(diferencas).toEqual([]);
  });
});
