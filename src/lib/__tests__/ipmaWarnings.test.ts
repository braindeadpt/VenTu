import { describe, expect, it } from 'vitest';
import {
  relevantWarningsForSpot,
  warningTypeLabel,
  warningBadgeLabel,
  warningLevelLabel,
  ipmaRadarUrl,
  strongestSpotWarning,
  strongestSeaStateForSpots,
  seaStateWarningForSpot,
  MAP_WARNING_TYPES,
  RELEVANT_WARNING_TYPES,
  SEA_STATE_WARNING_TYPES,
  type IpmaWarningsData,
} from '@/lib/ipmaWarnings';

const data: IpmaWarningsData = {
  fetchedAt: '2026-08-14T12:00:00Z',
  warnings: [],
  spotWarnings: {
    peniche: [
      {
        areaCode: 'LRA',
        areaLabel: 'Leiria',
        type: 'Vento',
        level: 'yellow',
        text: 'Rajadas',
        relevant: true,
      },
      {
        areaCode: 'LRA',
        areaLabel: 'Leiria',
        type: 'Tempo Quente',
        level: 'yellow',
        text: 'Calor',
        relevant: false,
      },
    ],
  },
};

describe('ipmaWarnings lib', () => {
  it('filtra só avisos relevantes para o spot', () => {
    const list = relevantWarningsForSpot(data, 'peniche');
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('Vento');
  });

  it('devolve [] para spot sem avisos ou dados null', () => {
    expect(relevantWarningsForSpot(data, 'faro')).toEqual([]);
    expect(relevantWarningsForSpot(null, 'peniche')).toEqual([]);
    expect(relevantWarningsForSpot(undefined, 'peniche')).toEqual([]);
  });

  it('traduz o tipo de aviso pt/en', () => {
    expect(warningTypeLabel('Vento', true)).toBe('Vento');
    expect(warningTypeLabel('Agitação Marítima', false)).toBe('Sea state');
    expect(warningTypeLabel('Desconhecido', true)).toBe('Desconhecido');
  });

  it('gera o URL de radar por locale', () => {
    expect(ipmaRadarUrl('pt')).toContain('/pt/otempo/obs.radar/');
    expect(ipmaRadarUrl('en')).toContain('/en/otempo/obs.radar/');
  });

  it('RELEVANT_WARNING_TYPES cobre os tipos de água', () => {
    expect([...RELEVANT_WARNING_TYPES]).toContain('Agitação Marítima');
    expect([...RELEVANT_WARNING_TYPES]).toContain('Trovoada');
    expect([...RELEVANT_WARNING_TYPES]).not.toContain('Tempo Quente');
  });

  it('MAP_WARNING_TYPES só inclui Agitação Marítima e Vento (badge do mapa)', () => {
    expect([...MAP_WARNING_TYPES]).toEqual(['Agitação Marítima', 'Vento']);
  });

  it('SEA_STATE_WARNING_TYPES só inclui Agitação Marítima (banner de segurança)', () => {
    expect([...SEA_STATE_WARNING_TYPES]).toEqual(['Agitação Marítima']);
  });
});

describe('seaStateWarningForSpot', () => {
  const base: IpmaWarningsData = {
    fetchedAt: '2026-08-14T12:00:00Z',
    warnings: [],
    spotWarnings: {
      peniche: [
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Vento', level: 'red', text: '', relevant: true },
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Agitação Marítima', level: 'yellow', text: '', relevant: true },
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Agitação Marítima', level: 'orange', text: '', relevant: true },
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Tempo Quente', level: 'red', text: '', relevant: false },
      ],
      nazare: [
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Agitação Marítima', level: 'red', text: '', relevant: true },
      ],
      algarve: [
        { areaCode: 'ALG', areaLabel: 'Faro', type: 'Vento', level: 'red', text: '', relevant: true },
      ],
    },
  };

  it('devolve o aviso de Agitação Marítima mais forte (red > orange > yellow)', () => {
    const w = seaStateWarningForSpot(base, 'peniche');
    expect(w?.type).toBe('Agitação Marítima');
    expect(w?.level).toBe('orange');
  });

  it('red vence no mesmo spot', () => {
    const w = seaStateWarningForSpot(base, 'nazare');
    expect(w?.level).toBe('red');
  });

  it('ignora vento/trovoada mesmo a vermelho (só mar perigoso abre o banner)', () => {
    expect(seaStateWarningForSpot(base, 'algarve')).toBeNull();
  });

  it('devolve null sem dados, spot sem avisos ou dados null', () => {
    expect(seaStateWarningForSpot(null, 'peniche')).toBeNull();
    expect(seaStateWarningForSpot(undefined, 'peniche')).toBeNull();
    expect(seaStateWarningForSpot(base, 'faro')).toBeNull();
    expect(seaStateWarningForSpot({ ...base, spotWarnings: {} }, 'peniche')).toBeNull();
  });
});

describe('strongestSpotWarning', () => {
  const base: IpmaWarningsData = {
    fetchedAt: '2026-08-14T12:00:00Z',
    warnings: [],
    spotWarnings: {
      peniche: [
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Vento', level: 'yellow', text: '', relevant: true },
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Agitação Marítima', level: 'orange', text: '', relevant: true },
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Trovoada', level: 'red', text: '', relevant: true },
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Tempo Quente', level: 'red', text: '', relevant: false },
      ],
      nazare: [
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Vento', level: 'red', text: '', relevant: true },
        { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Agitação Marítima', level: 'yellow', text: '', relevant: true },
      ],
      algarve: [
        { areaCode: 'ALG', areaLabel: 'Faro', type: 'Trovoada', level: 'red', text: '', relevant: true },
      ],
    },
  };

  it('devolve o aviso mais forte entre Agitação/Vento (nível manda)', () => {
    const w = strongestSpotWarning(base, 'peniche');
    expect(w).not.toBeNull();
    expect(w?.type).toBe('Agitação Marítima'); // orange > yellow
    expect(w?.level).toBe('orange');
  });

  it('red vence yellow no mesmo spot', () => {
    const w = strongestSpotWarning(base, 'nazare');
    expect(w?.type).toBe('Vento');
    expect(w?.level).toBe('red');
  });

  it('ignora tipos fora de Agitação/Vento mesmo a vermelho', () => {
    expect(strongestSpotWarning(base, 'algarve')).toBeNull(); // só Trovoada
  });

  it('devolve null sem dados, spot sem avisos ou dados null', () => {
    expect(strongestSpotWarning(null, 'peniche')).toBeNull();
    expect(strongestSpotWarning(undefined, 'peniche')).toBeNull();
    expect(strongestSpotWarning(base, 'faro')).toBeNull();
    expect(strongestSpotWarning({ ...base, spotWarnings: {} }, 'peniche')).toBeNull();
  });
});

describe('warningLevelLabel (nível localizado — fonte única)', () => {
  it('pt/en por nível, fallback para a key crua', () => {
    expect(warningLevelLabel('yellow', 'pt')).toBe('Amarelo');
    expect(warningLevelLabel('yellow', 'en')).toBe('Yellow');
    expect(warningLevelLabel('orange', 'pt')).toBe('Laranja');
    expect(warningLevelLabel('orange', 'en')).toBe('Orange');
    expect(warningLevelLabel('red', 'pt')).toBe('Vermelho');
    expect(warningLevelLabel('red', 'en')).toBe('Red');
    // Locales fora de pt usam o rótulo EN; nível desconhecido → key crua.
    expect(warningLevelLabel('orange', 'de')).toBe('Orange');
    expect(warningLevelLabel('storm', 'pt')).toBe('storm');
  });
});

describe('warningBadgeLabel (badge «Mar perigoso»)', () => {
  it('Agitação Marítima → «Mar perigoso» / «Dangerous sea» (mesma redacção do hero)', () => {
    expect(warningBadgeLabel({ type: 'Agitação Marítima' }, true)).toBe('Mar perigoso');
    expect(warningBadgeLabel({ type: 'Agitação Marítima' }, false)).toBe('Dangerous sea');
  });

  it('Vento e outros tipos mantêm o rótulo do tipo', () => {
    expect(warningBadgeLabel({ type: 'Vento' }, true)).toBe('Vento');
    expect(warningBadgeLabel({ type: 'Vento' }, false)).toBe('Wind');
    expect(warningBadgeLabel({ type: 'Trovoada' }, true)).toBe('Trovoada');
  });

  it('null/undefined → string vazia (nunca quebra)', () => {
    expect(warningBadgeLabel(null, true)).toBe('');
    expect(warningBadgeLabel(undefined, false)).toBe('');
  });
});

describe('strongestSeaStateForSpots (Dawn Patrol)', () => {
  const empty: IpmaWarningsData = { fetchedAt: '2026-08-14T12:00:00Z', warnings: [], spotWarnings: {} };
  const w = (type: string, level: 'yellow' | 'orange' | 'red') => ({
    areaCode: 'LRA',
    areaLabel: 'Leiria',
    type,
    level,
    text: '',
    relevant: true,
  });
  const dp = (over: Record<string, ReturnType<typeof w>[]> = {}) => ({
    ...empty,
    spotWarnings: {
      ...empty.spotWarnings,
      ...over,
    },
  });

  it('devolve o aviso de Agitação Marítima mais forte entre vários spots', () => {
    const d = dp({
      'supertubos': [w('Agitação Marítima', 'yellow')],
      'nazare': [w('Agitação Marítima', 'red')],
    });
    const out = strongestSeaStateForSpots(d, ['supertubos', 'nazare']);
    expect(out?.level).toBe('red');
    expect(out?.type).toBe('Agitação Marítima');
  });

  it('ignora Vento (não abre o aviso de mar perigoso)', () => {
    const d = dp({ 'guincho': [w('Vento', 'red')] });
    expect(strongestSeaStateForSpots(d, ['guincho'])).toBeNull();
  });

  it('null sem avisos de Agitação em nenhum spot', () => {
    expect(strongestSeaStateForSpots(empty, ['peniche'])).toBeNull();
    expect(strongestSeaStateForSpots(null, ['peniche'])).toBeNull();
    expect(strongestSeaStateForSpots(dp({}), [])).toBeNull();
  });
});
