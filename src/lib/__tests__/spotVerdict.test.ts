import { describe, it, expect } from 'vitest';
import { buildSpotVerdict } from '@/lib/spotVerdict';
import type { HourlyCondition, MagicWindow } from '@/lib/magicWindows';
import type { Conditions } from '@/lib/sportScore';
import type { TideSchedule } from '@/lib/tideSchedule';

const H = 3_600_000;
const T0 = new Date('2026-09-16T10:00:00').getTime();

function hourly24(): HourlyCondition[] {
  return Array.from({ length: 24 }, (_, i) => ({
    time: new Date(T0 + i * H).toISOString(),
    waveHeight: 1.4,
    wavePeriod: 11,
    windSpeed: 5,
    windDirection: 0,
    windGust: 8,
    waterTemp: 18,
    tideHeight: 0,
  }));
}

const conditions: Conditions = {
  waveHeight: 1.4,
  wavePeriod: 11,
  waveDirection: 270,
  windSpeed: 5,
  windDirection: 90,
  windGust: 8,
  waterTemp: 18,
};

const tideRising: TideSchedule = {
  phase: 'rising',
  phaseLabel: 'Maré a subir',
  nextHigh: null,
  nextLow: null,
};

const base = {
  scoreNow: 30,
  conditions,
  tide: tideRising,
  coastOrientation: 270, // costa virada a W → vento E = offshore
  isPt: true,
  nowMs: T0,
};

describe('buildSpotVerdict', () => {
  it('sem horas → null', () => {
    expect(buildSpotVerdict({ ...base, hourly: [], windows: [] })).toBeNull();
  });

  it('score ≥80 dentro de janela → «Está épico agora» com hora de fim', () => {
    const windows: MagicWindow[] = [{ start: 0, end: 7, duration: 8, score: 85, reason: 'x', reasonEn: 'x' }];
    const v = buildSpotVerdict({ ...base, scoreNow: 85, hourly: hourly24(), windows });
    expect(v?.headline).toContain('Está épico agora');
    expect(v?.headline).toContain('17h');
    expect(v?.tone).toBe('epic');
  });

  it('score 60–79 dentro de janela → «Está a bombar agora»', () => {
    const windows: MagicWindow[] = [{ start: 0, end: 3, duration: 4, score: 70, reason: '', reasonEn: '' }];
    const v = buildSpotVerdict({ ...base, scoreNow: 70, hourly: hourly24(), windows });
    expect(v?.headline).toContain('a bombar agora');
    expect(v?.tone).toBe('good');
  });

  it('score alto sem janelas → «Está épico agora» (o score manda, nunca «fraco»)', () => {
    const v = buildSpotVerdict({ ...base, scoreNow: 93, hourly: hourly24(), windows: [] });
    expect(v?.headline).toContain('Está épico agora');
    expect(v?.headline).not.toContain('fraco');
    expect(v?.tone).toBe('epic');
  });

  it('score alto + janela futura → «agora» com a janela como contexto', () => {
    const windows: MagicWindow[] = [{ start: 4, end: 8, duration: 5, score: 72, reason: '', reasonEn: '' }];
    const v = buildSpotVerdict({ ...base, scoreNow: 90, hourly: hourly24(), windows });
    expect(v?.headline).toBe('Está épico agora — janela 14h–18h');
    expect(v?.tone).toBe('epic');
  });

  it('score baixo + janela em curso → reporta a janela sem contradizer o badge', () => {
    const windows: MagicWindow[] = [{ start: 0, end: 3, duration: 4, score: 70, reason: '', reasonEn: '' }];
    const v = buildSpotVerdict({ ...base, hourly: hourly24(), windows });
    expect(v?.headline).toContain('Janela prevista em curso');
    expect(v?.tone).toBe('poor');
  });

  it('janela mais tarde hoje → «A próxima janela é …h–…h»', () => {
    const windows: MagicWindow[] = [{ start: 4, end: 8, duration: 5, score: 72, reason: '', reasonEn: '' }];
    const v = buildSpotVerdict({ ...base, hourly: hourly24(), windows });
    expect(v?.headline).toBe('A próxima janela é 14h–18h — ainda vais a tempo');
    expect(v?.tone).toBe('good');
  });

  it('usa a janela cronologicamente próxima, não a de maior score', () => {
    const windows: MagicWindow[] = [
      { start: 20, end: 22, duration: 3, score: 95, reason: '', reasonEn: '' }, // melhor, mais tarde
      { start: 3, end: 5, duration: 3, score: 62, reason: '', reasonEn: '' },   // pior, mais cedo
    ];
    const v = buildSpotVerdict({ ...base, hourly: hourly24(), windows });
    expect(v?.headline).toContain('13h–15h');
  });

  it('janela que atravessa a meia-noite (23h→03h) leva «(amanhã)» — mesma regra da homepage', () => {
    // hourly24() começa às 10:00 locais: índice 13 = 23:00 hoje, 17 = 03:00 amanhã.
    const windows: MagicWindow[] = [{ start: 13, end: 17, duration: 5, score: 72, reason: '', reasonEn: '' }];
    const v = buildSpotVerdict({ ...base, hourly: hourly24(), windows });
    expect(v?.headline).toBe('A próxima janela é 23h–03h (amanhã) — ainda vais a tempo');
    expect(v?.tone).toBe('good');
  });

  it('janela overnight com score alto também marca «(amanhã)»', () => {
    const windows: MagicWindow[] = [{ start: 13, end: 17, duration: 5, score: 72, reason: '', reasonEn: '' }];
    const v = buildSpotVerdict({ ...base, scoreNow: 70, hourly: hourly24(), windows });
    expect(v?.headline).toContain('23h–03h (amanhã)');
  });

  it('janela EN overnight usa «(tomorrow)»', () => {
    const windows: MagicWindow[] = [{ start: 13, end: 17, duration: 5, score: 72, reason: '', reasonEn: '' }];
    const v = buildSpotVerdict({ ...base, isPt: false, hourly: hourly24(), windows });
    expect(v?.headline).toContain('23h–03h (tomorrow)');
  });

  it('janela no mesmo dia NÃO leva sufixo (não regride o caso normal)', () => {
    const windows: MagicWindow[] = [{ start: 4, end: 8, duration: 5, score: 72, reason: '', reasonEn: '' }];
    const v = buildSpotVerdict({ ...base, hourly: hourly24(), windows });
    expect(v?.headline).toContain('14h–18h');
    expect(v?.headline).not.toContain('amanhã');
  });

  it('janela amanhã → «Hoje fraco — amanhã…»', () => {
    const hourly = hourly24();
    const windows: MagicWindow[] = [{ start: 20, end: 22, duration: 3, score: 70, reason: '', reasonEn: '' }];
    // nowMs dentro do mesmo dia → start 20 = T0+20h = dia seguinte 06h
    const v = buildSpotVerdict({ ...base, hourly, windows });
    expect(v?.headline).toContain('amanhã');
    expect(v?.headline).toContain('06h–08h');
  });

  it('sem janelas → fallback honesto', () => {
    const v = buildSpotVerdict({ ...base, hourly: hourly24(), windows: [] });
    expect(v?.headline).toContain('Sem janela');
    expect(v?.tone).toBe('poor');
  });

  it('detalhe inclui ondas, vento com relação e maré', () => {
    const v = buildSpotVerdict({ ...base, hourly: hourly24(), windows: [] });
    expect(v?.detail).toContain('1,4 m');
    expect(v?.detail).toContain('11 s');
    expect(v?.detail).toContain('vento E 10 kt offshore');
    expect(v?.detail).toContain('maré a subir');
  });

  it('EN: relação de vento e maré em inglês', () => {
    const v = buildSpotVerdict({ ...base, isPt: false, hourly: hourly24(), windows: [] });
    expect(v?.detail).toContain('E 10 kt offshore wind');
    expect(v?.detail).toContain('rising tide');
  });

  it('sem coastOrientation → vento sem relação', () => {
    const v = buildSpotVerdict({ ...base, coastOrientation: undefined, hourly: hourly24(), windows: [] });
    expect(v?.detail).toContain('vento E 10 kt');
    expect(v?.detail).not.toContain('offshore');
  });
});
