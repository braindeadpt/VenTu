import { describe, it, expect } from 'vitest';
import { scoreRangeForBand } from '../scoreBand';
import { spots } from '../spots';
import type { EnsembleBand } from '../ensembleBand';

const trafaria = spots.find((s) => s.id === 'trafaria')!;

const band = (waveLo: number, waveHi: number, windLo: number, windHi: number, n = 4): EnsembleBand => ({
  wave: { p10: waveLo, p50: (waveLo + waveHi) / 2, p90: waveHi, n },
  wind: { p10: windLo, p50: (windLo + windHi) / 2, p90: windHi, n },
});

const hour = { waveDirectionDeg: 290, wavePeriodS: 10, windDirectionDeg: 45, waterTempC: 17 };

describe('scoreRangeForBand', () => {
  it('intervalo lo→hi com scorer real nos cantos da banda', () => {
    const r = scoreRangeForBand({ spot: trafaria, sport: 'surf', band: band(0.8, 2.4, 2, 14), hour });
    expect(r).not.toBeNull();
    expect(r!.lo).toBeLessThanOrEqual(r!.hi);
    expect(r!.lo).toBeGreaterThanOrEqual(0);
    expect(r!.hi).toBeLessThanOrEqual(100);
  });

  it('banda estreita → intervalo estreito', () => {
    const wide = scoreRangeForBand({ spot: trafaria, sport: 'surf', band: band(0.5, 3.5, 1, 18), hour })!;
    const tight = scoreRangeForBand({ spot: trafaria, sport: 'surf', band: band(1.4, 1.6, 7, 9), hour })!;
    expect(tight.hi - tight.lo).toBeLessThan(wide.hi - wide.lo);
  });

  it('desportos diferentes → bandas diferentes', () => {
    const surf = scoreRangeForBand({ spot: trafaria, sport: 'surf', band: band(0.8, 2.4, 2, 14), hour });
    const kite = scoreRangeForBand({ spot: trafaria, sport: 'kitesurf', band: band(0.8, 2.4, 2, 14), hour });
    expect(surf).not.toBeNull();
    expect(kite).not.toBeNull();
    // kite premia vento; surf premia onda — os cantos não podem dar o mesmo.
    expect(surf).not.toEqual(kite);
  });

  it('omite sem banda ou com membros insuficientes — nunca inventa', () => {
    expect(scoreRangeForBand({ spot: trafaria, sport: 'surf', band: null, hour })).toBeNull();
    expect(scoreRangeForBand({ spot: trafaria, sport: 'surf', band: undefined, hour })).toBeNull();
    expect(
      scoreRangeForBand({ spot: trafaria, sport: 'surf', band: band(1, 2, 5, 9, 2), hour }),
    ).toBeNull();
    // Família única (só onda) não fecha o canto conjunto.
    const waveOnly: EnsembleBand = { wave: { p10: 1, p50: 1.5, p90: 2, n: 4 }, wind: null };
    expect(scoreRangeForBand({ spot: trafaria, sport: 'surf', band: waveOnly, hour })).toBeNull();
  });

  it('resultado ordenado mesmo que o scorer inverta os cantos', () => {
    const r = scoreRangeForBand({ spot: trafaria, sport: 'kitesurf', band: band(0.3, 4.0, 3, 20), hour })!;
    expect(r.lo).toBeLessThanOrEqual(r.hi);
  });
});
