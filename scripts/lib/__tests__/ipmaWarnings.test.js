import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  areaCentroids,
  normalizeWarning,
  dedupeAndSort,
  mapSpotsToAreas,
  buildWarningsPayload,
  WATER_SPORT_TYPES,
  seaWarningForSpot,
  seaWarningLine,
  seaWarningEmailLine,
} = require('../ipmaWarnings.js');

const DISTRICTS = {
  data: [
    { idRegiao: 1, idAreaAviso: 'LRA', local: 'Leiria', latitude: '39.7473', longitude: '-8.8069' },
    { idRegiao: 1, idAreaAviso: 'FAR', local: 'Faro', latitude: '37.0146', longitude: '-7.9331' },
    { idRegiao: 3, idAreaAviso: 'AOR', local: 'Açores Ocidental', latitude: '39.4', longitude: '-31.2' },
  ],
};

describe('areaCentroids', () => {
  it('calcula centróides por idAreaAviso e adiciona fallbacks da Madeira', () => {
    const c = areaCentroids(DISTRICTS);
    expect(c.LRA).toMatchObject({ label: 'Leiria', lat: 39.7473, lon: -8.8069 });
    expect(c.MCN).toMatchObject({ label: 'Madeira — Costa Norte', lat: 32.85 });
  });

  it('ignora linhas sem código/coordenadas e aceita null', () => {
    expect(areaCentroids(null)).toEqual(expect.objectContaining({ MCN: expect.anything() }));
    expect(areaCentroids({ data: [{ local: 'x' }] })).toEqual(
      expect.objectContaining({ MCN: expect.anything() }),
    );
  });
});

describe('normalizeWarning', () => {
  const centroids = areaCentroids(DISTRICTS);

  it('normaliza um aviso activo com relevância', () => {
    const w = normalizeWarning(
      {
        idAreaAviso: 'LRA',
        awarenessLevelID: 'yellow',
        awarenessTypeName: 'Vento',
        text: 'Rajadas fortes',
        startTime: '2026-08-14T10:00:00',
        endTime: '2026-08-14T18:00:00',
      },
      centroids,
    );
    expect(w).toMatchObject({ areaCode: 'LRA', areaLabel: 'Leiria', type: 'Vento', level: 'yellow', relevant: true });
  });

  it('devolve null para green ou campos em falta', () => {
    expect(normalizeWarning({ idAreaAviso: 'LRA', awarenessLevelID: 'green', awarenessTypeName: 'Vento' }, centroids)).toBeNull();
    expect(normalizeWarning({ idAreaAviso: 'LRA', awarenessLevelID: 'yellow' }, centroids)).toBeNull();
    expect(normalizeWarning(null, centroids)).toBeNull();
  });

  it('marca tipos fora da água como não relevantes', () => {
    const w = normalizeWarning({ idAreaAviso: 'LRA', awarenessLevelID: 'yellow', awarenessTypeName: 'Tempo Quente' }, centroids);
    expect(w.relevant).toBe(false);
  });

  it('WATER_SPORT_TYPES cobre agitação, vento, trovoada, precipitação e nevoeiro', () => {
    expect([...WATER_SPORT_TYPES]).toEqual([
      'Agitação Marítima',
      'Vento',
      'Trovoada',
      'Precipitação',
      'Nevoeiro',
    ]);
  });
});

describe('dedupeAndSort', () => {
  it('funde períodos do mesmo aviso numa janela larga', () => {
    const merged = dedupeAndSort([
      { areaCode: 'GDA', areaLabel: 'Guarda', type: 'Tempo Quente', level: 'yellow', text: 'x', startTime: '2026-08-14T15:27:00', endTime: '2026-08-14T18:00:00', relevant: false },
      { areaCode: 'GDA', areaLabel: 'Guarda', type: 'Tempo Quente', level: 'yellow', text: 'x', startTime: '2026-08-16T09:00:00', endTime: '2026-08-17T15:00:00', relevant: false },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].startTime).toBe('2026-08-14T15:27:00');
    expect(merged[0].endTime).toBe('2026-08-17T15:00:00');
  });

  it('ordena por severidade (red > orange > yellow) e depois relevância', () => {
    const sorted = dedupeAndSort([
      { areaCode: 'A', areaLabel: 'A', type: 'Vento', level: 'yellow', text: '', relevant: true },
      { areaCode: 'B', areaLabel: 'B', type: 'Agitação Marítima', level: 'red', text: '', relevant: true },
      { areaCode: 'C', areaLabel: 'C', type: 'Tempo Quente', level: 'orange', text: '', relevant: false },
      { areaCode: 'D', areaLabel: 'D', type: 'Tempo Frio', level: 'orange', text: '', relevant: false },
    ]);
    // red > orange; empate em orange cai no alfabético (Tempo Frio < Tempo Quente);
    // yellow relevante fica por último.
    expect(sorted.map((w) => w.areaCode)).toEqual(['B', 'D', 'C', 'A']);
  });
});

describe('mapSpotsToAreas + buildWarningsPayload', () => {
  const centroids = areaCentroids(DISTRICTS);
  const spots = [
    { id: 'peniche', lat: 39.33, lon: -9.38 }, // LRA
    { id: 'faro', lat: 37.0, lon: -7.9 }, // FAR
  ];

  it('mapeia spots à área mais próxima', () => {
    const m = mapSpotsToAreas(spots, centroids);
    expect(m.peniche.areaCode).toBe('LRA');
    expect(m.faro.areaCode).toBe('FAR');
  });

  it('constrói payload com spotWarnings só para áreas afectadas', () => {
    const warnings = [
      { idAreaAviso: 'LRA', awarenessLevelID: 'yellow', awarenessTypeName: 'Vento', text: 'Rajadas', startTime: '2026-08-14T10:00:00', endTime: '2026-08-14T18:00:00' },
      { idAreaAviso: 'LRA', awarenessLevelID: 'green', awarenessTypeName: 'Nevoeiro' },
    ];
    const payload = buildWarningsPayload(warnings, DISTRICTS, spots, new Date('2026-08-14T12:00:00Z'));
    expect(payload.fetchedAt).toBe('2026-08-14T12:00:00.000Z');
    expect(payload.warnings).toHaveLength(1);
    expect(payload.spotWarnings.peniche).toHaveLength(1);
    expect(payload.spotWarnings.peniche[0].type).toBe('Vento');
    expect(payload.spotWarnings.faro).toBeUndefined();
  });
});

describe('seaWarningForSpot', () => {
  const data = {
    spotWarnings: {
      peniche: [
        { type: 'Vento', level: 'orange' },
        { type: 'Agitação Marítima', level: 'yellow' },
        { type: 'Agitação Marítima', level: 'orange' },
      ],
      faro: [{ type: 'Tempo Quente', level: 'red' }],
    },
  };

  it('devolve o aviso de agitação marítima mais forte (red > orange > yellow)', () => {
    expect(seaWarningForSpot(data, 'peniche').level).toBe('orange');
  });

  it('ignora outros tipos de aviso (Tempo Quente não é mar perigoso)', () => {
    expect(seaWarningForSpot(data, 'faro')).toBeNull();
  });

  it('devolve null sem dados, sem spot, ou sem agitação activa', () => {
    expect(seaWarningForSpot(null, 'peniche')).toBeNull();
    expect(seaWarningForSpot(data, 'sem-spot')).toBeNull();
    expect(seaWarningForSpot({ spotWarnings: {} }, 'peniche')).toBeNull();
  });
});

describe('seaWarningLine', () => {
  it('formata a linha «Mar perigoso» em PT com o nível', () => {
    expect(seaWarningLine({ level: 'orange' }, true)).toBe('⚠️ Mar perigoso — agitação marítima (laranja)');
  });

  it('formata a linha «Dangerous sea» em EN com o nível', () => {
    expect(seaWarningLine({ level: 'red' }, false)).toBe('⚠️ Dangerous sea — sea state warning (red)');
  });

  it('devolve string vazia sem aviso', () => {
    expect(seaWarningLine(null, true)).toBe('');
    expect(seaWarningLine(undefined, false)).toBe('');
  });
});

describe('seaWarningEmailLine (emails: área + texto oficial do IPMA)', () => {
  const sea = {
    level: 'orange',
    areaLabel: 'Viana do Castelo',
    text: 'Ondulação de NW com ondas de 4 a 5 metros.',
  };

  it('compacto + área + texto oficial em PT', () => {
    expect(seaWarningEmailLine(sea, true)).toBe(
      '⚠️ Mar perigoso — agitação marítima (laranja) — Viana do Castelo: Ondulação de NW com ondas de 4 a 5 metros.',
    );
  });

  it('EN com a mesma estrutura', () => {
    expect(seaWarningEmailLine(sea, false)).toBe(
      '⚠️ Dangerous sea — sea state warning (orange) — Viana do Castelo: Ondulação de NW com ondas de 4 a 5 metros.',
    );
  });

  it('sem texto oficial → só compacto + área', () => {
    expect(seaWarningEmailLine({ level: 'red', areaLabel: 'Lisboa' }, true)).toBe(
      '⚠️ Mar perigoso — agitação marítima (vermelho) — Lisboa',
    );
  });

  it('sem área nem texto → idêntico ao compacto', () => {
    expect(seaWarningEmailLine({ level: 'yellow' }, false)).toBe(
      '⚠️ Dangerous sea — sea state warning (yellow)',
    );
  });

  it('devolve string vazia sem aviso', () => {
    expect(seaWarningEmailLine(null, true)).toBe('');
    expect(seaWarningEmailLine(undefined, false)).toBe('');
  });
});
