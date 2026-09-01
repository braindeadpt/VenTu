/**
 * Hermetic chain E2E for the MeteoAlarm warnings pipeline — runs under
 * `npm run alerts:test-key` (step 2, after the token diagnostic), mirroring
 * observedWaveNazareE2E.test.js for the buoys key.
 *
 * With a MOCKED fetch (no network, no real token) it proves the full chain:
 *   EDR locations (token as Bearer) → CAP Oasis 1.2 → buildMeteoAlarmPayload
 *   over the REAL spots → a warnings.json payload (source 'meteoalarm') that
 *   the verify gate (verifyMeteoAlarmLayer) accepts. The negative case proves
 *   the gate catches a MeteoAlarm layer that came back empty.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildMeteoAlarmPayload } = require('../meteoalarmWarnings.js');
const { verifyMeteoAlarmLayer } = require('../../verify-meteoalarm-warnings.js');
const { parseSpotsFromFile } = require('../../test-meteoalarm-api-key.js');

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Bbox de Portugal (cobre todos os spots reais) — para o mapeamento spot→aviso. */
const PT_BBOX = [[-10, 43], [-6, 43], [-6, 36], [-10, 36], [-10, 43]];

const edrDoc = () => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'warning-1',
      properties: { alertId: 'pt-w-1', countryCode: 'PT' },
      geometry: { type: 'Polygon', coordinates: [PT_BBOX] },
      links: [
        { rel: 'json', type: 'application/json', href: 'https://storage.meteoalarm.org/cap/pt-w-1.json' },
      ],
    },
  ],
});

const capDoc = () => ({
  identifier: 'pt-w-1',
  info: [
    {
      language: 'pt-PT',
      event: 'Vento',
      severity: 'Moderate',
      onset: new Date(Date.now() - 3_600_000).toISOString(),
      expires: new Date(Date.now() + 12 * 3_600_000).toISOString(),
      description: 'Rajadas fortes na costa oeste.',
      area: [
        {
          areaDesc: 'Costa Oeste',
          parameter: [
            { valueName: 'awareness_type', value: '1' },
            { valueName: 'awareness_level', value: '2' },
          ],
        },
      ],
    },
  ],
});

describe('MeteoAlarm warnings chain (hermético, fetch mockado)', () => {
  it('token → EDR → CAP → payload sobre os spots reais → o gate aceita', async () => {
    const fetchMock = async (url) => {
      if (String(url).includes('/collections/warnings/locations/PT')) return json(edrDoc());
      return json(capDoc()); // signed CAP URL (storage) — sem auth
    };

    const spots = parseSpotsFromFile();
    const payload = await buildMeteoAlarmPayload('test-token', spots, { fetchImpl: fetchMock });

    // Forma de warnings.json + source meteoalarm.
    expect(payload.source).toBe('meteoalarm');
    expect(payload.fetchedAt).toBeTruthy();
    expect(payload.warnings.length).toBeGreaterThan(0);
    // Um spot real dentro do bbox fica coberto (guincho vive na costa oeste).
    expect(payload.spotWarnings.guincho).toBeDefined();
    expect(payload.spotWarnings.guincho.length).toBeGreaterThan(0);
    expect(payload.spotWarnings.guincho[0].type).toBe('Vento');

    // O verify gate (o que falha o job em produção) aceita esta camada.
    const verify = verifyMeteoAlarmLayer(payload);
    expect(verify.ok).toBe(true);
    expect(verify.warningCount).toBe(payload.warnings.length);
  });

  it('dia calmo (EDR vazio) → payload meteoalarm SEM avisos → o gate falha', async () => {
    const fetchMock = async (url) => {
      if (String(url).includes('/collections/warnings/locations/PT')) {
        return json({ type: 'FeatureCollection', features: [] });
      }
      return json({}, 404);
    };

    const spots = parseSpotsFromFile();
    const payload = await buildMeteoAlarmPayload('test-token', spots, { fetchImpl: fetchMock });

    expect(payload.source).toBe('meteoalarm');
    expect(payload.warnings).toHaveLength(0);

    // IPMA em baixo + fallback vazio → o gate detecta a dupla falha.
    const verify = verifyMeteoAlarmLayer(payload);
    expect(verify.ok).toBe(false);
    expect(verify.problems.join('\n')).toContain('source:"meteoalarm" mas sem avisos activos');
  });
});