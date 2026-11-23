/**
 * Mar batido (P2.4): o mar de vento dentro da onda penaliza −1 na lógica
 * «onda» quando é uma fatia grande do total (ww ≥ 0,5 m e ≥ 35 % de hs).
 * Ausente na fonte (`ww` undefined) → sem penalização; os adaptadores do
 * mapa e dos alertas propagam `windWaveHeight` para a mesma hora pontuar igual.
 */
import { describe, expect, it } from 'vitest';
import { avaliaHoras, CHOP_MIN_HS_M, CHOP_MIN_WW_M, type HoraModalidade, type SpotModalidade } from '@/lib/modalidades';
import { horaDeLinha, type LinhaForecast } from '@/lib/horaSpot';
import { linhaDeCondicoes } from '@/lib/notaV6AgoraBuild';

/** Guincho: a praia olha para 280°. */
const SP: SpotModalidade = { praiaVirada: 280, surf: { janela: [270, 320] } };

function hora(extra: Partial<HoraModalidade> = {}): HoraModalidade {
  return { t: '2026-09-08T15:00', w: 10, g: 12, wd: 280, hs: 1.5, tp: 9, sd: 290, tide: 1, tideUp: true, cloud: null, rain: null, sunEl: 40, sunAz: 220, ...extra };
}
const surf = (h: HoraModalidade) => avaliaHoras(SP, 'surf', [h])[0].n ?? Number.NaN;

describe('chop · mar batido na lógica de onda', () => {
  it('ww grande dentro da onda desconta 1 ponto', () => {
    const limpa = surf(hora());
    expect(surf(hora({ ww: 0.6 }))).toBe(limpa - 1); // 0,6/1,5 = 40 % ≥ 35 %
  });

  it('abaixo dos limiares não desconta', () => {
    const limpa = surf(hora());
    expect(surf(hora({ ww: 0.4 }))).toBe(limpa); // ww < 0,5
    expect(surf(hora({ hs: 2.0, ww: 0.6 }))).toBe(surf(hora({ hs: 2.0 }))); // 30 % < 35 %
    expect(surf(hora({ hs: 0.3, ww: 0.6 }))).toBe(surf(hora({ hs: 0.3 }))); // hs < limiar
  });

  it('sem ww na fonte (linhas antigas) não há penalização', () => {
    const h = hora();
    delete (h as { ww?: number }).ww;
    expect(surf(h)).toBe(surf(hora({ ww: 0.6 })) + 1);
  });

  it('horaDeLinha lê windWaveHeight da linha do forecast', () => {
    const linha: LinhaForecast = { time: '2026-09-08T15:00+01:00', waveHeight: 1.5, wavePeriod: 9, waveDirection: 290, windWaveHeight: 0.6, windSpeed: 5, windDirection: 280, windGust: 6, tideHeight: 1 };
    const h = horaDeLinha([linha], 0, { lat: 38.7, lon: -9.4, praiaVirada: 280 });
    expect(h.ww).toBe(0.6);
  });

  it('linhaDeCondicoes (mapa) propaga o windWaveHeight da row', () => {
    const l = linhaDeCondicoes({ waveHeight: 1.5, wavePeriod: 9, waveDirection: 290, windWaveHeight: 0.6, windSpeed: 5, windDirection: 280, waterTemp: 17 }, '2026-09-08T15:00+01:00');
    expect(l.windWaveHeight).toBe(0.6);
    const sem = linhaDeCondicoes({ waveHeight: 1.5, wavePeriod: 9, waveDirection: 290, windSpeed: 5, windDirection: 280 }, '2026-09-08T15:00+01:00');
    expect(sem.windWaveHeight).toBeUndefined();
  });

  it('constantes exportadas batidas com os limiares de afinação', () => {
    expect(CHOP_MIN_HS_M).toBe(0.4);
    expect(CHOP_MIN_WW_M).toBe(0.5);
  });
});
