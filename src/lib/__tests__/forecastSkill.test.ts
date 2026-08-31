import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseForecastSkillBuoys,
  resolveSpotBuoySkill,
  loadForecastSkillForSpot,
  clearForecastSkillCache,
  clearForecastSkillClientCache,
  type ForecastSkillData,
} from '@/lib/forecastSkill';

const rawWithSkill = {
  fetchedAt: '2026-08-15T03:52:42.802Z',
  pairCount: 22,
  pairCountByOrigin: { ih: 12, 'wmo-es': 10 },
  calibratedPairCount: 10,
  byOrigin: {
    ih: { n: 12, me: 0.2, mae: 0.4, rmse: 0.5, corr: 0.91, meanLeadHours: 12 },
    'wmo-es': { n: 10, me: -0.3, mae: 0.6, rmse: 0.7, corr: 0.88, meanLeadHours: 6 },
  },
  byBuoy: {
    '19': { buoyName: 'CSA92/D', n: 47, me: 0.2, mae: 0.4, rmse: 0.5, corr: 0.91, meanLeadHours: 12, origin: 'ih' },
    '6200084': { buoyName: 'Cabo Silleiro', n: 30, me: -0.3, mae: 0.6, rmse: 0.7, corr: 0.88, meanLeadHours: 6, origin: 'wmo-es' },
    // Sem stats utilizáveis → ignorada.
    '2': { buoyName: 'CSA88/2', n: 3, me: 0.1 },
  },
};

afterEach(() => {
  clearForecastSkillCache();
  clearForecastSkillClientCache();
  vi.unstubAllGlobals();
});

describe('parseForecastSkillBuoys', () => {
  it('parseia byBuoy com stats finitas e ordena por nome', () => {
    const data = parseForecastSkillBuoys(rawWithSkill);
    expect(data.hasData).toBe(true);
    expect(data.fetchedAt).toBe('2026-08-15T03:52:42.802Z');
    expect(data.pairCount).toBe(22);
    expect(data.buoys).toHaveLength(2);
    expect(data.buoys[0]).toMatchObject({
      id: '6200084',
      name: 'Cabo Silleiro',
      n: 30,
      me: -0.3,
      mae: 0.6,
      rmse: 0.7,
      corr: 0.88,
      meanLeadHours: 6,
      origin: 'wmo-es',
    });
    expect(data.buoys[1]).toMatchObject({ id: '19', name: 'CSA92/D', n: 47, me: 0.2, origin: 'ih' });
  });

  it('parseia byOrigin separado por plataforma (IH vs WMO-ES)', () => {
    const data = parseForecastSkillBuoys(rawWithSkill);
    expect(data.byOrigin).toEqual({
      ih: expect.objectContaining({ n: 12, me: 0.2, mae: 0.4, rmse: 0.5, corr: 0.91, meanLeadHours: 12 }),
      'wmo-es': expect.objectContaining({ n: 10, me: -0.3, mae: 0.6, rmse: 0.7, corr: 0.88, meanLeadHours: 6 }),
    });
  });

  it('parseia os contadores de pares por origem e por calibração', () => {
    const data = parseForecastSkillBuoys(rawWithSkill);
    expect(data.pairCountByOrigin).toEqual({ ih: 12, 'wmo-es': 10 });
    expect(data.calibratedPairCount).toBe(10);
  });

  it('degrada os contadores para 0 em ficheiros antigos ou corrompidos', () => {
    const data = parseForecastSkillBuoys({
      pairCount: 5,
      byBuoy: rawWithSkill.byBuoy,
    });
    expect(data.pairCountByOrigin).toEqual({ ih: 0, 'wmo-es': 0 });
    expect(data.calibratedPairCount).toBe(0);
    expect(parseForecastSkillBuoys(null).pairCountByOrigin).toEqual({ ih: 0, 'wmo-es': 0 });
    expect(parseForecastSkillBuoys(null).calibratedPairCount).toBe(0);
  });

  it('byOrigin sanea valores corrompidos e fica null sem stats', () => {
    const data = parseForecastSkillBuoys({
      byOrigin: { ih: { n: 'x', me: 'y' }, 'wmo-es': null },
      byBuoy: rawWithSkill.byBuoy,
    });
    expect(data.byOrigin).toEqual({ ih: null, 'wmo-es': null });
  });

  it('devolve vazio para null/corrompido/sem stats', () => {
    expect(parseForecastSkillBuoys(null).hasData).toBe(false);
    expect(parseForecastSkillBuoys({ byBuoy: {} }).hasData).toBe(false);
    expect(parseForecastSkillBuoys({ byBuoy: { 19: { n: 'x', me: 'y' } } }).hasData).toBe(false);
    expect(parseForecastSkillBuoys('nope').hasData).toBe(false);
  });
});

describe('resolveSpotBuoySkill', () => {
  const skill: ForecastSkillData = parseForecastSkillBuoys(rawWithSkill);

  it('resolve pela mapping IH (idEst) quando existe skill', () => {
    const ih = { spotMapping: { guincho: { idEst: 19, distanceKm: 60 } } };
    const b = resolveSpotBuoySkill('guincho', ih, null, skill);
    expect(b).toMatchObject({ id: '19', name: 'CSA92/D', n: 47, me: 0.2 });
  });

  it('cai para a mapping WMO (code) quando o IH não tem skill', () => {
    const ih = { spotMapping: { guincho: { idEst: 2, distanceKm: 93.9 } } };
    const wmo = { spotMapping: { guincho: { code: '6200084', distanceKm: 56 } } };
    // idEst 2 existe mas não tem skill (n=3) → procura WMO.
    const b = resolveSpotBuoySkill('guincho', ih, wmo, skill);
    expect(b).toMatchObject({ id: '6200084', name: 'Cabo Silleiro' });
  });

  it('devolve null quando não há mapping, skill, ou o spot não é mapeado', () => {
    expect(resolveSpotBuoySkill('guincho', null, null, skill)).toBeNull();
    expect(resolveSpotBuoySkill('nope', { spotMapping: {} }, null, skill)).toBeNull();
    expect(resolveSpotBuoySkill('guincho', { spotMapping: { guincho: { idEst: 19 } } }, null, parseForecastSkillBuoys(null))).toBeNull();
  });
});

describe('loadForecastSkillForSpot (client)', () => {
  it('faz fetch de forecast-skill + ih-buoys e resolve o skill do spot', async () => {
    const fetchStub = vi.fn(async (path: string) => {
      if (String(path).includes('forecast-skill.json')) {
        return { ok: true, json: async () => rawWithSkill };
      }
      if (String(path).includes('ih-buoys.json')) {
        return { ok: true, json: async () => ({ spotMapping: { guincho: { idEst: 19, distanceKm: 60 } } }) };
      }
      throw new Error(`unexpected ${path}`);
    });
    const b = await loadForecastSkillForSpot('guincho', fetchStub as unknown as typeof fetch, (p) => p);
    expect(b).toMatchObject({ id: '19', name: 'CSA92/D', n: 47 });
  });

  it('degrada graciosamente sem forecast-skill (null, nunca lança)', async () => {
    const fetchStub = vi.fn(async () => {
      throw new Error('offline');
    });
    const b = await loadForecastSkillForSpot('guincho', fetchStub as unknown as typeof fetch, (p) => p);
    expect(b).toBeNull();
  });
});
