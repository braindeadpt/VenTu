/**
 * alertWarnTriggers — gatilho de aviso independente do score (B4).
 */
import { describe, it, expect } from 'vitest';
const {
  isSafetyNavWarning,
  ipmaWarningTriggers,
  ihSafetyTriggers,
  nhcStormTriggers,
  warningTriggersForSpot,
  triggerLine,
  triggerEmailLine,
  triggerLines,
} = require('../alertWarnTriggers');

const SEA_RED = {
  type: 'Agitação Marítima',
  level: 'red',
  areaLabel: 'Porto',
  text: 'Ondas de 6 metros.',
};
const WIND_ORANGE = { type: 'Vento', level: 'orange', areaLabel: 'Faro', text: '' };
const RAIN_YELLOW = { type: 'Precipitação', level: 'yellow', areaLabel: 'Faro' };
const HEAT_RED = { type: 'Calor', level: 'red', areaLabel: 'Beja', relevant: false };

describe('ipmaWarningTriggers', () => {
  const data = {
    spotWarnings: {
      spotA: [SEA_RED, WIND_ORANGE, RAIN_YELLOW],
      spotB: [RAIN_YELLOW],
      spotC: [HEAT_RED],
    },
  };

  it('orange+red disparam; amarelo fica de fora', () => {
    const t = ipmaWarningTriggers(data, 'spotA');
    expect(t).toHaveLength(2);
    expect(t.map((x) => x.level).sort()).toEqual(['orange', 'red']);
  });

  it('só amarelo → sem trigger', () => {
    expect(ipmaWarningTriggers(data, 'spotB')).toEqual([]);
  });

  it('vermelho não-marítimo também dispara (aviso oficial é risco real)', () => {
    const t = ipmaWarningTriggers(data, 'spotC');
    expect(t).toHaveLength(1);
    expect(t[0].type).toBe('Calor');
  });

  it('spot sem avisos / payload ausente → []', () => {
    expect(ipmaWarningTriggers(data, 'nope')).toEqual([]);
    expect(ipmaWarningTriggers(null, 'spotA')).toEqual([]);
  });
});

describe('isSafetyNavWarning — faixa §0', () => {
  it.each([
    'Embarcação à deriva',
    'ARRIBA INSTÁVEL - PERIGO',
    'Interdição de área — zona de banhos',
    'Exercício militar com fogo real',
    'Derrame de hidrocarbonetos',
    'Operação de busca e salvamento em curso',
  ])('dispara: %s', (category) => {
    expect(isSafetyNavWarning({ category })).toBe(true);
  });

  it.each([
    'Sinalização marítima — boia apagada',
    'Obras no cais — dragagem em curso',
    'Proibição de fundear', // só embarcações
    'Aviso à navegação',
    '',
  ])('não dispara: %s', (category) => {
    expect(isSafetyNavWarning({ category })).toBe(false);
  });

  it('orcas nunca entram (collection dedicada)', () => {
    expect(
      isSafetyNavWarning({
        category: 'Interação hostil com orcas',
        collection: 'orca_anavnet_point',
      }),
    ).toBe(false);
  });
});

describe('ihSafetyTriggers', () => {
  const data = {
    warnings: [
      { id: 1, ref: 'ANAV 10/26', category: 'Embarcação à deriva' },
      { id: 2, ref: 'ANAV 11/26', category: 'Sinalização marítima' },
    ],
    coverage: { spotA: [1, 2], spotB: [2] },
  };

  it('filtra §0: só o aviso de perigo real dispara', () => {
    const t = ihSafetyTriggers(data, 'spotA');
    expect(t).toHaveLength(1);
    expect(t[0].ref).toBe('ANAV 10/26');
    expect(ihSafetyTriggers(data, 'spotB')).toEqual([]);
  });
});

describe('nhcStormTriggers', () => {
  const data = {
    spotStorms: {
      mosteiros: [
        {
          name: 'Hanna',
          classificationLabel: 'Tempestade tropical',
          centerDistKm: 240,
          movementDirDeg: 45,
          movementSpeedMph: 12,
        },
      ],
    },
  };

  it('spot dentro do cone → trigger com nome+classe', () => {
    const t = nhcStormTriggers(data, 'mosteiros');
    expect(t).toHaveLength(1);
    expect(t[0].kind).toBe('nhc');
    expect(t[0].name).toBe('Hanna');
  });

  it('spot fora / payload vazio → []', () => {
    expect(nhcStormTriggers(data, 'nazare')).toEqual([]);
    expect(nhcStormTriggers({}, 'mosteiros')).toEqual([]);
  });
});

describe('warningTriggersForSpot + linhas', () => {
  const sources = {
    warnings: { spotWarnings: { s: [SEA_RED] } },
    coastal: {
      warnings: [{ id: 1, ref: 'ANAV 10/26', category: 'Arriba instável' }],
      coverage: { s: [1] },
    },
    storms: { spotStorms: { s: [{ name: 'Fay', classificationLabel: 'Depressão tropical' }] } },
  };

  it('combina as 3 fontes', () => {
    const t = warningTriggersForSpot(sources, 's');
    expect(t.map((x) => x.kind)).toEqual(['ipma', 'ih', 'nhc']);
  });

  it('fontes em falta degradam sem erro', () => {
    expect(warningTriggersForSpot({ storms: sources.storms }, 's')).toHaveLength(1);
    expect(warningTriggersForSpot(null, 's')).toEqual([]);
  });

  it('triggerLine PT/EN por tipo', () => {
    const t = warningTriggersForSpot(sources, 's');
    expect(triggerLine(t[0], true)).toBe('⚠️ Aviso vermelho — Agitação Marítima — Porto');
    expect(triggerLine(t[0], false)).toBe('⚠️ red warning — Agitação Marítima — Porto');
    expect(triggerLine(t[1], true)).toContain('⚠️ Perigo na água (IH): ANAV 10/26');
    expect(triggerLine(t[2], true)).toContain('🌀 Fay — Depressão tropical: spot no cone');
    expect(triggerLine(t[2], false)).toContain('official uncertainty cone');
  });

  it('triggerEmailLine anexa o texto oficial IPMA', () => {
    const t = ipmaWarningTriggers({ spotWarnings: { s: [SEA_RED] } }, 's');
    expect(triggerEmailLine(t[0], true)).toContain(': Ondas de 6 metros.');
    expect(triggerLine(t[0], true)).not.toContain('Ondas de 6 metros');
  });

  it('triggerLines devolve só linhas não-vazias', () => {
    expect(triggerLines([{ kind: 'x' }], true)).toEqual([]);
    expect(triggerLines(null, true)).toEqual([]);
  });
});
