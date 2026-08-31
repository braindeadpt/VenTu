import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { applyCoherenceGate, ES_BUOY_CODES } = require('../../fetch-wave-bias.js');

const ES = ES_BUOY_CODES;

describe('applyCoherenceGate (gate ES×PT da atribuição regional)', () => {
  const buoys = {
    '6200084': { name: 'Cabo Silleiro', source: 'wmo-es', n: 40, me: 0.3 },
    '6200085': { name: 'Golfo de Cádiz', source: 'wmo-es', n: 38, me: -0.1 },
  };
  const archiveBuoys = {
    '6200084': { name: 'Cabo Silleiro', readings: [{ date: 'x', hm0: 1 }] },
    '6200083': { name: 'Villano-Sisargas', readings: [{ date: 'x', hm0: 2 }] },
    '6200085': { name: 'Golfo de Cádiz', readings: [{ date: 'x', hm0: 0.5 }] },
  };
  const incoherent = {
    day: '2026-08-14',
    pairs: [{ codes: ['6200084', '6201077'], verdict: 'incoherent' }],
  };

  it('exclui da atribuição a boia ES com par incoherent e marca o per-buoy', () => {
    const { liveBuoys, coherenceGate } = applyCoherenceGate(buoys, archiveBuoys, incoherent, ES);
    // Silleiro gated → fora do mapa spot→boia; Villano/Cádiz mantêm-se.
    expect(Object.keys(liveBuoys).sort()).toEqual(['6200083', '6200085']);
    expect(buoys['6200084'].regionAttribution).toBe(false);
    expect(buoys['6200085'].regionAttribution).toBeUndefined();
    expect(coherenceGate).toEqual({ day: '2026-08-14', gatedCodes: ['6200084'] });
  });

  it('sem relatório ou sem incoherent → sem gate (todas as boias atribuem)', () => {
    const { liveBuoys, coherenceGate } = applyCoherenceGate(buoys, archiveBuoys, null, ES);
    expect(Object.keys(liveBuoys).sort()).toEqual(['6200083', '6200084', '6200085']);
    expect(coherenceGate).toBeNull();

    const clean = {
      day: '2026-08-14',
      pairs: [{ codes: ['6200084', '6201077'], verdict: 'coherent' }],
    };
    const r2 = applyCoherenceGate(buoys, archiveBuoys, clean, ES);
    expect(r2.coherenceGate).toBeNull();
    expect(Object.keys(r2.liveBuoys).length).toBe(3);
  });

  it('review e insufficient não bloqueiam', () => {
    const rep = {
      day: '2026-08-14',
      pairs: [
        { codes: ['6200084', '6201077'], verdict: 'review' },
        { codes: ['6200085', '6201079'], verdict: 'insufficient' },
      ],
    };
    const { liveBuoys, coherenceGate } = applyCoherenceGate(buoys, archiveBuoys, rep, ES);
    expect(Object.keys(liveBuoys).length).toBe(3);
    expect(coherenceGate).toBeNull();
  });

  it('mantém códigos não-ES no arquivo fora do mapa (só a rota ES participa)', () => {
    const withPt = { ...archiveBuoys, '6201077': { name: 'Porto', readings: [{ date: 'x', hm0: 1 }] } };
    const { liveBuoys } = applyCoherenceGate(buoys, withPt, incoherent, ES);
    expect(Object.keys(liveBuoys).sort()).toEqual(['6200083', '6200085']);
  });
});
