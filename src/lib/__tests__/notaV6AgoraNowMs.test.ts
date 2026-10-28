import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import { rawToScoreInput } from '@/lib/scoreConditions';
import { notaV6AgoraDe } from '@/lib/notaV6AgoraBuild';

/**
 * Motor único (#218): a nota v6 «agora» é determinística no instante dado.
 *
 * A frescura da boia (observedWave) e do vento observado contam a partir de
 * `nowMs`, não do relógio de parede — senão a fixture e2e, regenerada no
 * instante dela (map-hours.generatedAt), passava ou falhava conforme a idade
 * da boia no dia em que o teste corre. E a decisão de produto de 28/10: um
 * spot sem onda no modelo (lagos e albufeiras: waveHeight null) dá surf e
 * bodyboard «sem dados», não 0.
 */
const ROOT = path.join(__dirname, '..', '..', '..');
const FIX = path.join(ROOT, 'tests/e2e/fixtures/data');
const ler = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const spotDe = (id: string) => (spots as Spot[]).find((s) => s.id === id)!;

const req = createRequire(import.meta.url);
const { makeForecastReader } = req('../../../scripts/lib/scoreSpotConditions.js') as {
  makeForecastReader: (dir: string) => (id: string) => Array<Record<string, unknown>> | null;
};
const reader = makeForecastReader(FIX);

const NOW = Date.parse((ler('map-hours.json') as { generatedAt: string }).generatedAt);
const H = 3_600_000;
const conditions = ler('conditions.json') as Record<string, Record<string, unknown>>;

/** Linha da Nazaré com a boia da fixture lida 1 h antes do instante da fixture (fresca, a 11,9 km). */
function nazareComBoiaFresca() {
  const base = structuredClone(conditions.nazare);
  const boia: Record<string, unknown> = {
    ...(base.observedWave as Record<string, unknown>),
    observedAt: new Date(NOW - H).toISOString(),
  };
  const comBoia = { ...base, observedWave: boia };
  const semBoia = { ...base };
  delete semBoia.observedWave;
  return { comBoia, semBoia, boia };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('frescura da boia na nota v6 «agora» conta a partir de nowMs', () => {
  it('rawToScoreInput: fresca no instante da fixture, caducada 24 h depois = sem boia', () => {
    const { comBoia, semBoia, boia } = nazareComBoiaFresca();
    // o relógio de parede não conta: fixa-o longe do instante pedido
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 30 * 24 * H);

    const agora = rawToScoreInput(comBoia, NOW);
    expect(agora.waveHeight).toBe(boia.waveHeight);
    expect(agora.waveHeight).not.toBe(rawToScoreInput(semBoia, NOW).waveHeight);

    expect(rawToScoreInput(comBoia, NOW + 24 * H)).toEqual(rawToScoreInput(semBoia, NOW + 24 * H));
    // leitura «do futuro» (instante antes da boia) também não conta
    expect(rawToScoreInput(comBoia, NOW - 2 * H)).toEqual(rawToScoreInput(semBoia, NOW - 2 * H));
  });

  it('notaV6AgoraDe: a boia fresca muda a nota no instante da fixture; a +24 h dá o mesmo que sem boia', () => {
    const sp = spotDe('nazare');
    const hours = reader(sp.id);
    expect(hours?.length).toBeGreaterThan(0);
    const { comBoia, semBoia } = nazareComBoiaFresca();
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 30 * 24 * H);

    const comAgora = notaV6AgoraDe(sp, comBoia, hours, NOW);
    const semAgora = notaV6AgoraDe(sp, semBoia, hours, NOW);
    expect(comAgora).not.toBeNull();
    expect(comAgora).not.toEqual(semAgora);

    const depois = NOW + 24 * H;
    expect(notaV6AgoraDe(sp, comBoia, hours, depois)).toEqual(notaV6AgoraDe(sp, semBoia, hours, depois));
  });

  it('o mesmo nowMs dá a mesma nota seja qual for o relógio de parede', () => {
    const sp = spotDe('nazare');
    const hours = reader(sp.id);
    const { comBoia } = nazareComBoiaFresca();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const a = notaV6AgoraDe(sp, comBoia, hours, NOW);
    vi.setSystemTime(NOW + 24 * H);
    const b = notaV6AgoraDe(sp, comBoia, hours, NOW);
    expect(b).toEqual(a);
  });
});

describe('lago sem onda no modelo = surf e bodyboard «sem dados» (decisão de 28/10)', () => {
  it('alqueva com waveHeight null: notaV6.sem tem surf e bodyboard, nota null (não 0)', () => {
    const sp = spotDe('alqueva');
    const row = { ...conditions.alqueva, waveHeight: null, wavePeriod: null, waveDirection: null };
    delete (row as Record<string, unknown>).notaV6;
    const hours = (reader(sp.conditionsSource ?? sp.id) ?? []).map((h) => ({
      ...h,
      waveHeight: null,
      wavePeriod: null,
      waveDirection: null,
    }));
    expect(hours.length).toBeGreaterThan(0);

    const nv = notaV6AgoraDe(sp, row, hours, NOW)!;
    expect(nv).not.toBeNull();
    expect(nv.sem).toEqual(expect.arrayContaining(['surf', 'bodyboard']));
    expect(nv.surf).toBeNull();
    expect(nv.bodyboard).toBeNull();
    // o vento continua a contar: kite tem nota (0 com 3 nós, mas número)
    expect(typeof nv.kite).toBe('number');
    expect(nv.sem).not.toContain('kite');
  });
});
