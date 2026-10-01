/** meteosatIr — motor primário do Satélite IR: EUMETView WMS (Meteosat-11
 *  SEVIRI IR10.8 «msg_fes:ir108»). Determinístico: recebe o relógio.
 */
import { describe, it, expect } from 'vitest';
import {
  meteosatIrFrames,
  meteosatIrTileUrl,
  meteosatIrFrameClock,
  meteosatIrFrameFullClock,
  METEOSAT_IR_LAYER,
  METEOSAT_IR_WMS_URL,
  METEOSAT_IR_CADENCE_MIN,
  METEOSAT_IR_BOUNDS,
} from '@/lib/meteosatIr';

const NOW = Date.parse('2026-10-01T13:07:43Z');
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/;

describe('meteosatIrFrames', () => {
  it('devolve N slots de 15 min, mais recente primeiro, alinhados à cadência', () => {
    const frames = meteosatIrFrames(NOW, 12);
    expect(frames).toHaveLength(12);
    for (const f of frames) {
      expect(f.frameTime).toMatch(ISO_RE);
      // o `time=` do GetMap mantém .000Z (formato do WMS do EUMETView)
      expect(f.time).toBe(f.frameTime.replace('Z', '.000Z'));
    }
    for (let i = 0; i + 1 < frames.length; i += 1) {
      const delta = Date.parse(frames[i].frameTime) - Date.parse(frames[i + 1].frameTime);
      expect(delta).toBe(METEOSAT_IR_CADENCE_MIN * 60_000);
    }
  });

  it('o slot mais recente fica ~METEOSAT_IR_LAG_MS atrás e alinhado a 15 min', () => {
    const newest = Date.parse(meteosatIrFrames(NOW, 12)[0].frameTime);
    const lag = NOW - newest;
    expect(lag).toBeGreaterThanOrEqual(30 * 60_000);
    expect(lag).toBeLessThan(30 * 60_000 + 15 * 60_000);
    expect(newest % (15 * 60_000)).toBe(0);
  });
});

describe('meteosatIrTileUrl', () => {
  it('monta o GetMap com camada, estilo, transparência e time', () => {
    const url = meteosatIrTileUrl('2026-10-01T12:30:00.000Z');
    expect(url.startsWith(METEOSAT_IR_WMS_URL)).toBe(true);
    expect(url).toContain(`layers=${METEOSAT_IR_LAYER}`);
    expect(url).toContain('request=GetMap');
    expect(url).toContain('format=image/png');
    expect(url).toContain('time=2026-10-01T12:30:00.000Z');
  });
});

describe('GOES comparabilidade e bounds', () => {
  it('Portugal, Açores e Madeira dentro do disco ±77°', () => {
    const [[s, w], [n, e]] = METEOSAT_IR_BOUNDS;
    for (const [lat, lon] of [
      [38.7, -9.1], // Lisboa
      [37.7, -25.7], // Ponta Delgada
      [32.7, -16.9], // Funchal
    ] as Array<[number, number]>) {
      expect(lat).toBeGreaterThanOrEqual(s);
      expect(lat).toBeLessThanOrEqual(n);
      expect(lon).toBeGreaterThanOrEqual(w);
      expect(lon).toBeLessThanOrEqual(e);
    }
  });
});

describe('meteosatIrFrameClock / meteosatIrFrameFullClock', () => {
  it('converte UTC real para hora de Lisboa (outubro = WEST UTC+1)', () => {
    expect(meteosatIrFrameClock('2026-10-01T12:30:00Z')).toBe('13:30');
    expect(meteosatIrFrameFullClock('2026-10-01T12:30:00Z')).toBe('2026-10-01 13:30');
  });

  it('entrada inválida → null, nunca lança', () => {
    expect(meteosatIrFrameClock(null)).toBeNull();
    expect(meteosatIrFrameClock('lixo')).toBeNull();
    expect(meteosatIrFrameFullClock('')).toBeNull();
  });
});
