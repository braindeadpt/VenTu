import { describe, it, expect } from 'vitest';
import { computeBestWindowsForSpot } from '@/lib/bestWindowBuild';
import { spots } from '@/lib/spots';
import type { ForecastHourRow } from '@/lib/bestWindowToday';
import type { Spot } from '@/types';

const HOUR_MS = 3_600_000;
const casteloBode = spots.find((s) => s.slug === 'castelo-bode') as Spot;

function row(ms: number, windMs: number): ForecastHourRow {
  return {
    time: new Date(ms).toISOString(),
    waveHeight: 0,
    wavePeriod: 5,
    windSpeed: windMs,
    windDirection: 270,
    windGust: windMs * 1.2,
    waterTemp: 20,
  };
}

const CALM = 2.6; // ~5 kt → wakeboard 80
const STORM = 15.4; // ~30 kt → wakeboard ≤ 35 (< 60)

describe('#456 — janelas de SUP/wakeboard não atravessam a noite', () => {
  it('uma hora boa antes do anoitecer não «cola» a manhã seguinte', () => {
    // Caso do Devin Review: 1 h boa isolada, depois tempestade + noite (score
    // 0), e 10 h boas na manhã seguinte. A janela tem de ser só a da manhã —
    // antes do fix, `computeMagicWindows` reaproveitava a hora isolada e
    // emitia 16h→15h através de 14 h de noite.
    const NOW = Date.parse('2026-07-15T15:00:00Z');
    const forecast: ForecastHourRow[] = Array.from({ length: 24 }, (_, i) => {
      const ms = NOW + (i + 1) * HOUR_MS; // 16:00Z … 15:00Z do dia seguinte
      // i=0: 16:00Z calmo isolado; i=1–4: tempestade; i=5–13: noite (o sol
      // mata mesmo com calmo); i=14–23: manhã/dia calmo.
      const wind = i === 0 || i >= 14 ? CALM : i <= 4 ? STORM : CALM;
      return row(ms, wind);
    });

    const { bestWindowsBySport } = computeBestWindowsForSpot(casteloBode, forecast, NOW);
    const w = bestWindowsBySport.wakeboard;
    expect(w).toBeDefined();
    // Só as horas calmas de dia (06:00Z–14:00Z; a última linha fica fora do
    // corte `t < now+24h`) podem formar janela; a hora isolada das 16:00Z
    // fica de fora (horas de parede da etiqueta ISO → UTC).
    expect(w!.start).toBe(6);
    expect(w!.end).toBe(14);
  });

  it('sem nenhuma hora ≥ 60, não há janela (noite ou tempestade a valer)', () => {
    const NOW = Date.parse('2026-07-15T15:00:00Z');
    const forecast: ForecastHourRow[] = Array.from({ length: 24 }, (_, i) =>
      row(NOW + (i + 1) * HOUR_MS, i < 12 ? STORM : CALM),
    );
    // i<12 (16:00Z–03:00Z): tempestade + noite; i>=12 (04:00Z–15:00Z): madrugada
    // ainda de noite até ~05:00Z e depois dia calmo ≥60 — janela só na parte boa.
    const { bestWindowsBySport } = computeBestWindowsForSpot(casteloBode, forecast, NOW);
    const w = bestWindowsBySport.wakeboard;
    expect(w).toBeDefined();
    expect(w!.start).toBeGreaterThanOrEqual(4);
    expect(w!.end).toBeLessThanOrEqual(15);
  });
});
