import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import {
  avaliaHorasSpotV6,
  modalidadesCompativeisSpot,
  resolverModalidadeSpot,
} from '@/lib/spotV6Modalidade';
import type { HoraSpot } from '@/lib/horaSpot';

const guincho = spots.find((s) => s.id === 'guincho')!;
const lagoa = spots.find((s) => s.id === 'lagoa-albufeira')!;
const casteloBode = spots.find((s) => s.id === 'castelo-bode')!;

const HORA_DIA: HoraSpot = {
  t: '2026-10-14T14:00',
  ms: Date.parse('2026-10-14T13:00:00Z'),
  w: 6,
  g: 9,
  wd: 315,
  hs: 0,
  tp: 0,
  sd: 270,
  tide: Number.NaN,
  tideUp: false,
  sunEl: 38,
  sunAz: 190,
  agua: 21,
  semDados: ['onda'],
};

const HORA_NOITE: HoraSpot = {
  ...HORA_DIA,
  t: '2026-10-14T23:00',
  ms: Date.parse('2026-10-14T22:00:00Z'),
  sunEl: -25,
};

describe('spotV6Modalidade (#459)', () => {
  it('Guincho aceita ?sport=windsurf e ?sport=foil directamente', () => {
    expect(resolverModalidadeSpot(guincho, '?sport=windsurf', 'surf')).toBe('windsurf');
    expect(resolverModalidadeSpot(guincho, '?sport=foil', 'kite')).toBe('foil');
    expect(resolverModalidadeSpot(guincho, '?d=surf', 'kite')).toBe('surf');
  });

  it('lagoa-albufeira (sem surf) ignora localStorage surf e abre em kite', () => {
    expect(modalidadesCompativeisSpot(lagoa)).not.toContain('surf');
    expect(resolverModalidadeSpot(lagoa, '', 'surf')).toBe('kite');
    expect(resolverModalidadeSpot(lagoa, '?sport=surf', 'surf')).toBe('kite');
  });

  it('castelo-bode (wakepark) nunca cai em Surf «Sem dados» e dá nota real de dia', () => {
    expect(resolverModalidadeSpot(casteloBode, '', 'surf')).toBe('wakeboard');
    expect(resolverModalidadeSpot(casteloBode, '', 'kite')).toBe('wakeboard');
    const sp = spotModalidadeDe(editorialDe(casteloBode));
    const ns = avaliaHorasSpotV6(casteloBode, sp, 'wakeboard', [HORA_DIA, HORA_NOITE]);
    expect(ns[0].semDados).toBeUndefined();
    expect(typeof ns[0].n).toBe('number');
    expect(ns[0].n!).toBeGreaterThanOrEqual(5);
    expect(ns[1].n).toBeNull();
    expect(ns[1].semDados).toBeUndefined();
  });
});
