import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  AWARENESS_TYPE_MAP,
  capJsonUrl,
  capParamMap,
  capToWarning,
  parseAwarenessCode,
  pointInFeature,
  fetchFeaturesPage,
  fetchPortugalWarnings,
  buildMeteoAlarmPayload,
  sentDatetimeRange,
  redactAuthFromUrl,
  resolveWarningsAuth,
  METEOGATE_SENT_WINDOW_MS,
} = require('../meteoalarmWarnings.js');

const NOW = Date.UTC(2026, 7, 14, 12, 0, 0); // 2026-08-14T12:00Z

/** A realistic CAP Oasis 1.2 payload (agitação marítima laranja, PT). */
function makeCap(overrides = {}) {
  return {
    identifier: 'PT-2026-08-14-001',
    sender: 'ipma@meteoalarm.eu',
    sent: '2026-08-14T08:00:00Z',
    status: 'Actual',
    msgType: 'Alert',
    scope: 'Public',
    info: [
      {
        language: 'pt-PT',
        event: 'Agitação Marítima',
        urgency: 'Immediate',
        severity: 'Severe',
        certainty: 'Likely',
        headline: 'Agitação marítima na costa oeste',
        description: 'Ondas de sudoeste com altura significativa até 4-5 metros.',
        onset: '2026-08-14T09:00:00Z',
        expires: '2026-08-15T21:00:00Z',
        area: [
          {
            areaDesc: 'Costa Oeste',
            polygon: '...',
            parameter: [
              { valueName: 'awareness_type', value: '7' },
              { valueName: 'awareness_level', value: '3' },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function makeFeature(overrides = {}) {
  return {
    type: 'Feature',
    id: 'PT-2026-08-14-001',
    properties: { alertId: 'PT-2026-08-14-001', countryCode: 'PT' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-10, 36.5],
          [-6, 36.5],
          [-6, 42.5],
          [-10, 42.5],
          [-10, 36.5],
        ],
      ],
    },
    links: [
      {
        rel: 'json',
        type: 'application/json',
        href: 'https://storage.meteoalarm.org/signed/cap-pt-001.json',
      },
    ],
    ...overrides,
  };
}

describe('AWARENESS_TYPE_MAP', () => {
  it('mapeia códigos EUMETNET para os nomes PT', () => {
    expect(AWARENESS_TYPE_MAP[7]).toBe('Agitação Marítima');
    expect(AWARENESS_TYPE_MAP[1]).toBe('Vento');
    expect(AWARENESS_TYPE_MAP[3]).toBe('Trovoada');
    expect(AWARENESS_TYPE_MAP[10]).toBe('Precipitação');
    expect(AWARENESS_TYPE_MAP[4]).toBe('Nevoeiro');
  });
});

describe('capJsonUrl', () => {
  it('prefere o link JSON ao hubLink', () => {
    const f = makeFeature();
    expect(capJsonUrl(f)).toBe('https://storage.meteoalarm.org/signed/cap-pt-001.json');
  });

  it('cai para hubLink quando não há link JSON', () => {
    const f = makeFeature({ links: [{ rel: 'canonical', href: 'https://x' }] });
    expect(capJsonUrl(f)).toBeNull();
    const withHub = { ...f, properties: { ...f.properties, hubLink: 'https://hub/meta' } };
    expect(capJsonUrl(withHub)).toBe('https://hub/meta');
  });

  it('devolve null sem links', () => {
    expect(capJsonUrl({})).toBeNull();
    expect(capJsonUrl(null)).toBeNull();
  });
});

describe('capParamMap', () => {
  it('achata parameter/geocode para mapa chave→valor', () => {
    const m = capParamMap([
      { valueName: 'awareness_type', value: '7' },
      { valueName: 'awareness_level', value: '2' },
      { value_name: 'ES_Prefecture', value: 'PT-11' },
    ]);
    expect(m.awareness_type).toBe('7');
    expect(m.awareness_level).toBe('2');
    expect(m.ES_Prefecture).toBe('PT-11');
    expect(capParamMap(undefined)).toEqual({});
  });
});

describe('capToWarning', () => {
  it('normaliza CAP → shape IPMA (tipo, nível, texto, janela, relevant)', () => {
    const w = capToWarning(makeCap(), makeFeature(), 'pt-PT');
    expect(w).not.toBeNull();
    expect(w.type).toBe('Agitação Marítima');
    expect(w.level).toBe('orange');
    expect(w.areaCode).toBe('Costa Oeste');
    expect(w.areaLabel).toBe('Costa Oeste');
    expect(w.text).toContain('Ondas de sudoeste');
    expect(w.startTime).toBe('2026-08-14T09:00:00.000Z');
    expect(w.endTime).toBe('2026-08-15T21:00:00.000Z');
    expect(w.relevant).toBe(true);
  });

  it('mapeia awareness_level 4 → red e 2 → yellow', () => {
    const cap = makeCap();
    const red = structuredClone(cap);
    red.info[0].area[0].parameter = [
      { valueName: 'awareness_type', value: '1' },
      { valueName: 'awareness_level', value: '4' },
    ];
    expect(capToWarning(red, makeFeature(), 'pt-PT').level).toBe('red');
    const yellow = structuredClone(cap);
    yellow.info[0].area[0].parameter[1].value = '2';
    expect(capToWarning(yellow, makeFeature(), 'pt-PT').level).toBe('yellow');
  });

  it('descarta Minor por severity e por awareness_level 1 (green do IPMA)', () => {
    const bySeverity = makeCap();
    bySeverity.info[0].severity = 'Minor';
    expect(capToWarning(bySeverity, makeFeature(), 'pt-PT')).toBeNull();
    const byLevel = makeCap();
    byLevel.info[0].area[0].parameter = [
      { valueName: 'awareness_type', value: '1' },
      { valueName: 'awareness_level', value: '1' },
    ];
    expect(capToWarning(byLevel, makeFeature(), 'pt-PT')).toBeNull();
  });

  it('usa severity quando falta awareness_level', () => {
    const cap = makeCap();
    cap.info[0].area[0].parameter = [{ valueName: 'awareness_type', value: '3' }];
    expect(capToWarning(cap, makeFeature(), 'pt-PT').level).toBe('orange'); // Severe
    cap.info[0].severity = 'Extreme';
    expect(capToWarning(cap, makeFeature(), 'pt-PT').level).toBe('red');
  });

  it('marca como não relevante tipos fora da água', () => {
    const cap = makeCap();
    cap.info[0].area[0].parameter = [{ valueName: 'awareness_type', value: '5' }]; // Tempo Quente
    const w = capToWarning(cap, makeFeature(), 'pt-PT');
    expect(w.type).toBe('Tempo Quente');
    expect(w.relevant).toBe(false);
  });

  it('lê parameter no info (MeteoGate CAP) e códigos "7; coastalevent"', () => {
    const cap = makeCap();
    cap.info[0].area = [{ areaDesc: 'Costa Oeste', geocode: [] }];
    cap.info[0].parameter = [
      { valueName: 'awareness_type', value: '7; coastalevent' },
      { valueName: 'awareness_level', value: '3; orange; Severe' },
    ];
    const w = capToWarning(cap, makeFeature(), 'pt-PT');
    expect(w.type).toBe('Agitação Marítima');
    expect(w.level).toBe('orange');
    expect(w.relevant).toBe(true);
  });

  it('cai para feature quando faltam área/parâmetros', () => {
    const cap = makeCap({ info: [{ language: 'pt-PT', event: 'Vento', severity: 'Moderate', area: [] }] });
    const w = capToWarning(cap, makeFeature(), 'pt-PT');
    expect(w).not.toBeNull();
    expect(w.type).toBe('Vento');
    expect(w.level).toBe('yellow');
    expect(w.areaCode).toBe('PT-2026-08-14-001');
  });

  it('devolve null para payloads inválidos', () => {
    expect(capToWarning(null, makeFeature())).toBeNull();
    expect(capToWarning({}, makeFeature())).toBeNull();
    expect(capToWarning({ info: [] }, makeFeature())).toBeNull();
  });

  it('cai para o nome do evento raw quando falta awareness_type (relevância false)', () => {
    const unknown = makeCap();
    unknown.info[0].event = 'Evento Desconhecido';
    unknown.info[0].area[0].parameter = [];
    const w = capToWarning(unknown, makeFeature(), 'pt-PT');
    expect(w.type).toBe('Evento Desconhecido');
    expect(w.relevant).toBe(false);
  });
});

describe('pointInFeature', () => {
  const feature = makeFeature(); // bbox [-10..-6 lon, 36.5..42.5 lat]

  it('detecta ponto dentro e fora do bbox', () => {
    expect(pointInFeature({ lat: 39.5, lon: -8.5 }, feature)).toBe(true);
    expect(pointInFeature({ lat: 41.5, lon: -9.0 }, feature)).toBe(true);
    expect(pointInFeature({ lat: 35.0, lon: -8.5 }, feature)).toBe(false);
    expect(pointInFeature({ lat: 39.5, lon: -12.0 }, feature)).toBe(false);
  });

  it('é tolerante a geometria ausente', () => {
    expect(pointInFeature({ lat: 39, lon: -8 }, {})).toBe(false);
    expect(pointInFeature({ lat: 39, lon: -8 }, null)).toBe(false);
    expect(pointInFeature(null, feature)).toBe(false);
  });
});

describe('fetchFeaturesPage', () => {
  it('faz a query EDR com Bearer token e devolve features', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ features: [makeFeature()] }),
    }));
    const features = await fetchFeaturesPage('tok', 'PT', 1, fetchImpl);
    expect(features).toHaveLength(1);
    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain('/collections/warnings/locations/PT');
    expect(url).toContain('active=true');
    const headers = fetchImpl.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('lança erro claro para 401/403 (token inválido)', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(fetchFeaturesPage('bad', 'PT', 1, fetchImpl)).rejects.toThrow(/401/);
  });

  it('MeteoGate: datetime < 24 h, apikey na query, sem Bearer; 204 → []', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 204, json: async () => ({}) }));
    const features = await fetchFeaturesPage(
      { mode: 'meteogate', key: 'gate-secret' },
      'PT',
      1,
      fetchImpl,
      { nowMs: NOW },
    );
    expect(features).toEqual([]);
    const url = fetchImpl.mock.calls[0][0];
    expect(url).toContain('https://api.meteogate.eu/warnings/collections/warnings/locations/PT');
    expect(url).toContain('datetime=');
    expect(url).toContain('apikey=gate-secret');
    expect(url).not.toContain('active=true');
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
    const dt = new URL(url).searchParams.get('datetime');
    const [start, end] = dt.split('/');
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(METEOGATE_SENT_WINDOW_MS);
  });

  it('não vaza a apikey na mensagem de erro HTTP', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    await expect(
      fetchFeaturesPage({ mode: 'meteogate', key: 'super-secret-key' }, 'PT', 1, fetchImpl),
    ).rejects.toThrow(/apikey=REDACTED/);
    await expect(
      fetchFeaturesPage({ mode: 'meteogate', key: 'super-secret-key' }, 'PT', 1, fetchImpl),
    ).rejects.not.toThrow(/super-secret-key/);
  });
});

describe('fetchPortugalWarnings', () => {
  it('agrega features + CAP, tolerando CAPs em falha', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('/collections/warnings/locations/')) {
        return { ok: true, status: 200, json: async () => ({ features: [makeFeature(), makeFeature({ id: 'no-cap', links: [] })] }) };
      }
      if (url.includes('cap-pt-001')) {
        return { ok: true, status: 200, json: async () => makeCap() };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    const items = await fetchPortugalWarnings('tok', { fetchImpl, nowMs: NOW });
    expect(items).toHaveLength(2);
    const withCap = items.find((i) => i.cap);
    expect(withCap.cap.info[0].event).toBe('Agitação Marítima');
    const noCap = items.find((i) => i.url === null);
    expect(noCap.cap).toBeNull();
  });
});

describe('buildMeteoAlarmPayload', () => {
  const capFeature = makeFeature();
  const spots = [
    { id: 'cascais', lat: 38.7, lon: -9.42 },
    { id: 'porto-santo', lat: 33.06, lon: -16.33 }, // fora do bbox
  ];

  function fetchImpl(url) {
    if (url.includes('/collections/warnings/locations/')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ features: [capFeature] }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => makeCap() });
  }

  it('produz warnings.json com source meteoalarm e spotWarnings por bbox', async () => {
    const payload = await buildMeteoAlarmPayload('tok', spots, { fetchImpl, nowMs: NOW });
    expect(payload.source).toBe('meteoalarm');
    expect(payload.fetchedAt).toBe(new Date(NOW).toISOString());
    expect(payload.warnings).toHaveLength(1);
    expect(payload.warnings[0].type).toBe('Agitação Marítima');
    expect(payload.warnings[0].level).toBe('orange');
    expect(payload.spotWarnings.cascais).toHaveLength(1);
    expect(payload.spotWarnings['porto-santo']).toBeUndefined();
  });

  it('descarta avisos expirados', async () => {
    const expiredCap = makeCap();
    expiredCap.info[0].expires = '2026-08-14T08:00:00Z'; // antes de NOW (12:00Z)
    const f = (url) => {
      if (url.includes('/collections/warnings/locations/')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ features: [capFeature] }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => expiredCap });
    };
    const payload = await buildMeteoAlarmPayload('tok', spots, { fetchImpl: f, nowMs: NOW });
    expect(payload.warnings).toHaveLength(0);
    expect(payload.spotWarnings).toEqual({});
  });
});

describe('resolveWarningsAuth / sentDatetimeRange', () => {
  it('prefere METEOGATE_API_KEY', () => {
    expect(resolveWarningsAuth({ METEOGATE_API_KEY: 'g', METEOALARM_API_KEY: 'a' })).toEqual({
      mode: 'meteogate',
      key: 'g',
    });
    expect(resolveWarningsAuth({ METEOALARM_API_KEY: 'a' }).mode).toBe('meteoalarm');
    expect(resolveWarningsAuth({})).toBeNull();
  });

  it('sentDatetimeRange cobre quase 24 h', () => {
    const range = sentDatetimeRange(NOW);
    const [start, end] = range.split('/');
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(METEOGATE_SENT_WINDOW_MS);
    expect(METEOGATE_SENT_WINDOW_MS).toBeLessThan(24 * 3600 * 1000);
  });

  it('redactAuthFromUrl mascara apikey', () => {
    expect(redactAuthFromUrl('https://x/w?apikey=secret&language=pt-PT')).toContain('apikey=REDACTED');
    expect(redactAuthFromUrl('https://x/w?apikey=secret&language=pt-PT')).not.toContain('secret');
  });

  it('parseAwarenessCode lê o inteiro inicial', () => {
    expect(parseAwarenessCode('7; coastalevent')).toBe('7');
    expect(parseAwarenessCode('2')).toBe('2');
  });
});
