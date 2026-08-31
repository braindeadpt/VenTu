import { describe, expect, it } from 'vitest';
import { parseCoherenceTrend } from '../coherenceTrend';

function row(
  day: string,
  hour: string,
  esHs: number,
  ptHs: number,
  pair: string = 'Cabo Silleiro × Porto',
  codes: string[] = ['6200084', '6201077'],
  dateOverride?: string,
) {
  return {
    pair,
    codes,
    hour: `${day}T${hour}`,
    esHs,
    ptHs,
    date: dateOverride ?? `${day}T${hour}:30:00Z`,
  };
}

const CODES = ['6200084', '6201077'];

describe('parseCoherenceTrend (archive horário → trend diário por par)', () => {
  it('agrupa por dia+par, deriva n/mean|Δ|/veredicto e ordena dias', () => {
    const raw = {
      fetchedAt: '2026-08-16T06:00:00Z',
      windowDays: 30,
      pairs: [
        row('2026-08-14', '08', 1.6, 1.5),
        row('2026-08-14', '09', 1.7, 1.6),
        row('2026-08-14', '10', 1.6, 1.7),
        row('2026-08-15', '08', 1.9, 1.8),
        row('2026-08-15', '09', 1.8, 1.9),
      ],
    };
    const data = parseCoherenceTrend(raw);
    expect(data.hasData).toBe(true);
    expect(data.pairs).toHaveLength(1);
    const pair = data.pairs[0];
    expect(pair.pair).toBe('Cabo Silleiro × Porto');
    expect(pair.codes).toEqual(CODES);
    expect(pair.days.map((d) => d.day)).toEqual(['2026-08-14', '2026-08-15']);
    // Dia 14: n=3, mean|Δ| ~0.13 → coherent.
    expect(pair.days[0]).toMatchObject({ n: 3, verdict: 'coherent' });
    // Dia 15: n=2 → insufficient (single/day floor 3).
    expect(pair.days[1]).toMatchObject({ n: 2, verdict: 'insufficient' });
    // Rollup: 1 coherent + 1 insufficient.
    expect(pair.coherent).toBe(1);
    expect(pair.insufficient).toBe(1);
    expect(pair.incoherentRatio).toBe(0);
  });

  it('incoherent diário quando o dia diverge muito (mean|Δ| ≥ 1.5) com n sufic.', () => {
    const raw = {
      pairs: [
        row('2026-08-14', '08', 1.0, 3.0),
        row('2026-08-14', '09', 1.1, 3.2),
        row('2026-08-14', '10', 1.2, 3.1),
      ],
    };
    const data = parseCoherenceTrend(raw);
    const pair = data.pairs[0];
    expect(pair.days[0].verdict).toBe('incoherent');
    expect(pair.incoherent).toBe(1);
    expect(pair.incoherentRatio).toBe(1); // 1 incoherent / 1 não-insufficient
  });

  it('separa pares diferentes e mantém horários por hora (dedup mantém latest date)', () => {
    const raw = {
      pairs: [
        row('2026-08-14', '08', 1.6, 1.5, 'Silleiro × Porto', ['6200084', '6201077']),
        row('2026-08-14', '08', 0.8, 0.9, 'Golfo de Cádiz × Faro', ['6200085', '6201079']),
        // re-fetch da mesma hora com date mais recente substitui
        row('2026-08-14', '08', 1.6, 1.55, 'Silleiro × Porto', ['6200084', '6201077'], '2026-08-14T08:55:00Z'),
      ],
    };
    const data = parseCoherenceTrend(raw);
    expect(data.pairs).toHaveLength(2);
    const silleiro = data.pairs.find((p) => p.codes.join('|') === '6200084|6201077')!;
    // só 1 hora deduplicada → n=1 → insufficient
    expect(silleiro.days[0].n).toBe(1);
    expect(silleiro.days[0].lastHour).toBe('2026-08-14T08:55:00.000Z');
  });

  it('inválidos/corrompidos e vazios → hasData false', () => {
    expect(parseCoherenceTrend(null).hasData).toBe(false);
    expect(parseCoherenceTrend(undefined).hasData).toBe(false);
    expect(parseCoherenceTrend({ pairs: [] }).hasData).toBe(false);
    expect(parseCoherenceTrend({ pairs: [{ esHs: 1 }] }).hasData).toBe(false);
    expect(parseCoherenceTrend({ pairs: [{ hour: 'lixo', codes: ['a', 'b'], esHs: 1, ptHs: 2 }] }).hasData).toBe(false);
  });
});