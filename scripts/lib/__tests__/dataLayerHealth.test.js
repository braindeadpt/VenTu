import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  deriveRadarLayerStatus,
  deriveWarningsLayerStatus,
  deriveCoastalWarningsLayerStatus,
  loadCoastalWarningsLayerStatus,
  applyLayerStreak,
  applyCoastalEsStreak,
  evaluateDataLayerHealth,
  RADAR_MAX_AGE_MINUTES,
  WARNINGS_MAX_AGE_HOURS,
  COASTAL_MAX_AGE_HOURS,
} from '../dataLayerHealth.js';

const NOW = Date.parse('2026-08-15T12:00:00Z');
const agoMin = (m) => new Date(NOW - m * 60_000).toISOString();

describe('deriveRadarLayerStatus', () => {
  it('ok com frame recente dentro da janela (≤25m)', () => {
    expect(deriveRadarLayerStatus({ frameTime: agoMin(10) }, NOW)).toBe('ok');
    expect(deriveRadarLayerStatus({ frames: [{ frameTime: agoMin(5) }] }, NOW)).toBe('ok');
  });

  it('stale quando o frame existe mas é velho (>25m)', () => {
    expect(deriveRadarLayerStatus({ frameTime: agoMin(60) }, NOW)).toBe('stale');
  });

  it('down sem frame, sem ficheiro ou frameTime inválido', () => {
    expect(deriveRadarLayerStatus(null, NOW)).toBe('down');
    expect(deriveRadarLayerStatus({}, NOW)).toBe('down');
    expect(deriveRadarLayerStatus({ frameTime: null }, NOW)).toBe('down');
    expect(deriveRadarLayerStatus({ frames: [] }, NOW)).toBe('down');
  });

  it('a janela está alinhada com a cadência de 5 min', () => {
    expect(RADAR_MAX_AGE_MINUTES).toBe(25);
  });
});

describe('deriveWarningsLayerStatus', () => {
  it('ok com fetchedAt fresco (≤24h), mesmo sem avisos activos (estado legítimo)', () => {
    expect(deriveWarningsLayerStatus({ fetchedAt: agoMin(60), warnings: [] }, NOW)).toBe('ok');
    expect(
      deriveWarningsLayerStatus({ fetchedAt: agoMin(60), warnings: [{ id: 'w' }], source: 'ipma' }, NOW),
    ).toBe('ok');
  });

  it('stale quando fetchedAt é velho mas existe', () => {
    expect(deriveWarningsLayerStatus({ fetchedAt: new Date(NOW - 48 * 3_600_000).toISOString() }, NOW)).toBe('stale');
  });

  it('down sem ficheiro ou sem fetchedAt', () => {
    expect(deriveWarningsLayerStatus(null, NOW)).toBe('down');
    expect(deriveWarningsLayerStatus({}, NOW)).toBe('down');
    expect(deriveWarningsLayerStatus({ fetchedAt: 'nope' }, NOW)).toBe('down');
  });

  it('a janela é de 24 h', () => {
    expect(WARNINGS_MAX_AGE_HOURS).toBe(24);
  });
});

describe('deriveCoastalWarningsLayerStatus', () => {
  it('ok com fetchedAt fresco (≤24h), mesmo sem avisos em vigor (estado legítimo)', () => {
    expect(deriveCoastalWarningsLayerStatus({ fetchedAt: agoMin(60), warnings: [] }, NOW)).toBe('ok');
    expect(
      deriveCoastalWarningsLayerStatus(
        { fetchedAt: agoMin(30), warnings: [{ id: 1 }], coverage: { nazare: [1] } },
        NOW,
      ),
    ).toBe('ok');
  });

  it('stale quando fetchedAt é velho mas existe', () => {
    expect(
      deriveCoastalWarningsLayerStatus({ fetchedAt: new Date(NOW - 48 * 3_600_000).toISOString() }, NOW),
    ).toBe('stale');
  });

  it('down sem ficheiro ou sem fetchedAt', () => {
    expect(deriveCoastalWarningsLayerStatus(null, NOW)).toBe('down');
    expect(deriveCoastalWarningsLayerStatus({}, NOW)).toBe('down');
    expect(deriveCoastalWarningsLayerStatus({ fetchedAt: 'nope' }, NOW)).toBe('down');
  });

  it('a janela é de 24 h', () => {
    expect(COASTAL_MAX_AGE_HOURS).toBe(24);
  });
});

describe('loadCoastalWarningsLayerStatus (ficheiro real)', () => {
  it('lê ih-coastal-warnings.json → status + em vigor + cobertura + esHealth', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlh-coastal-'));
    fs.mkdirSync(path.join(dir, 'public', 'data'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'public', 'data', 'ih-coastal-warnings.json'),
      JSON.stringify({
        fetchedAt: agoMin(10),
        warnings: [{ id: 1 }, { id: 2 }],
        coverage: { nazare: [1], guincho: [1, 2] },
        esHealth: { configured: true, status: 'error', error: 'HTTP 403', lastErrorAt: agoMin(5), lastOkAt: '2026-08-10T00:00:00Z' },
      }),
    );
    const layer = loadCoastalWarningsLayerStatus(dir, NOW);
    expect(layer.status).toBe('ok');
    expect(layer.activeWarnings).toBe(2);
    expect(layer.coveredSpots).toBe(2);
    expect(layer.fetchedAt).toBe(agoMin(10));
    expect(layer.es).toEqual({
      configured: true,
      status: 'error',
      error: 'HTTP 403',
      lastErrorAt: agoMin(5),
      lastOkAt: '2026-08-10T00:00:00Z',
    });
  });

  it('sem esHealth no ficheiro → sem chave es (legacy/primeiro run)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlh-coastal-noes-'));
    fs.mkdirSync(path.join(dir, 'public', 'data'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'public', 'data', 'ih-coastal-warnings.json'),
      JSON.stringify({ fetchedAt: agoMin(10), warnings: [], coverage: {} }),
    );
    const layer = loadCoastalWarningsLayerStatus(dir, NOW);
    expect(layer.es).toBeUndefined();
  });

  it('devolve null sem ficheiro (primeiro run)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlh-coastal-null-'));
    expect(loadCoastalWarningsLayerStatus(dir, NOW)).toBeNull();
  });
});

describe('applyCoastalEsStreak (fonte ES cross-border)', () => {
  it('configurado + erro → incrementa streak a partir do meta anterior', () => {
    const layer = applyCoastalEsStreak(
      { status: 'ok', es: { configured: true, status: 'error' } },
      { coastalWarningsLayer: { es: { streak: 2, lastOkAt: '2026-08-10T00:00:00Z' } } },
    );
    expect(layer.es.streak).toBe(3);
    expect(layer.es.lastStatus).toBe('error');
    expect(layer.es.lastOkAt).toBe('2026-08-10T00:00:00Z');
  });

  it('configurado + erro sem streak anterior → arranca em 1', () => {
    const layer = applyCoastalEsStreak({ status: 'ok', es: { configured: true, status: 'error' } }, null);
    expect(layer.es.streak).toBe(1);
  });

  it('configurado + ok → reseta para 0 e actualiza lastOkAt', () => {
    const layer = applyCoastalEsStreak(
      { status: 'ok', es: { configured: true, status: 'ok', lastOkAt: '2026-08-10T00:00:00Z' } },
      { coastalWarningsLayer: { es: { streak: 5, lastStatus: 'error' } } },
    );
    expect(layer.es.streak).toBe(0);
    expect(layer.es.lastOkAt).toBeTruthy();
  });

  it('não configurado → es estático sem streak (disabled)', () => {
    const layer = applyCoastalEsStreak({ status: 'ok', es: { configured: false, status: 'disabled' } }, null);
    expect(layer.es.streak).toBe(0);
    expect(layer.es.lastStatus).toBe('disabled');
  });

  it('sem camada ou sem es → devolve tal como está', () => {
    expect(applyCoastalEsStreak(null, {})).toBeNull();
    const plain = applyCoastalEsStreak({ status: 'ok' }, {});
    expect(plain.es).toBeUndefined();
  });
});

describe('applyLayerStreak (genérico)', () => {
  it('incrementa em down/stale e preserva lastOkAt', () => {
    const s = applyLayerStreak(
      { status: 'stale' },
      { radarLayer: { streak: 2, lastOkAt: '2026-08-10T00:00:00Z' } },
      'radarLayer',
    );
    expect(s.streak).toBe(3);
    expect(s.lastOkAt).toBe('2026-08-10T00:00:00Z');
    expect(s.lastStatus).toBe('stale');
  });

  it('arranca em 1 sem streak anterior', () => {
    expect(applyLayerStreak({ status: 'down' }, null, 'warningsLayer').streak).toBe(1);
  });

  it('reseta para 0 quando ok (actualiza lastOkAt)', () => {
    const s = applyLayerStreak(
      { status: 'ok' },
      { radarLayer: { streak: 5, lastStatus: 'stale' } },
      'radarLayer',
    );
    expect(s.streak).toBe(0);
    expect(s.lastOkAt).toBeTruthy();
  });

  it('devolve null sem camada', () => {
    expect(applyLayerStreak(null, {}, 'radarLayer')).toBeNull();
  });
});

describe('evaluateDataLayerHealth (unificado)', () => {
  const allOk = {
    buoyLayer: { status: 'ok', streak: 0 },
    radarLayer: { status: 'ok', streak: 0 },
    warningsLayer: { status: 'ok', streak: 0 },
  };

  it('todas ok → level ok com três linhas ok', () => {
    const r = evaluateDataLayerHealth(allOk);
    expect(r.level).toBe('ok');
    expect(r.oks).toHaveLength(3);
    expect(r.failures).toHaveLength(0);
    expect(r.warnings).toHaveLength(0);
    expect(r.layers.map((l) => l.key)).toEqual(['buoyLayer', 'radarLayer', 'warningsLayer']);
  });

  it('uma camada no limiar de aviso → level warn com ::warning:: isolada', () => {
    const r = evaluateDataLayerHealth(
      { ...allOk, radarLayer: { status: 'stale', streak: 4 } },
      { warnAfter: 3, failAfter: 6 },
    );
    expect(r.level).toBe('warn');
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/^::warning::Radar IPMA em 'stale' há 4 runs/);
    expect(r.oks).toHaveLength(2);
  });

  it('uma camada no limiar de falha → level fail com ::error:: (e a outra a avisar)', () => {
    const r = evaluateDataLayerHealth(
      {
        ...allOk,
        radarLayer: { status: 'stale', streak: 7 },
        warningsLayer: { status: 'stale', streak: 4 },
      },
      { warnAfter: 3, failAfter: 6 },
    );
    expect(r.level).toBe('fail');
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]).toMatch(/^::error::Radar IPMA em 'stale' há 7 runs/);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/^::warning::Avisos IPMA\/MeteoAlarm/);
  });

  it('linhas ok incluem os limiares globais', () => {
    const r = evaluateDataLayerHealth(allOk, { warnAfter: 4, failAfter: 8 });
    expect(r.oks[0]).toContain('4/8');
  });

  it('meta null/incompleto não rebenta (camadas vazias = ok)', () => {
    const r = evaluateDataLayerHealth(null);
    expect(r.level).toBe('ok');
    expect(r.oks).toHaveLength(3);
  });

  it('feed ES configurado com erros repetidos (≥ limiar) → ::warning::', () => {
    const r = evaluateDataLayerHealth(
      {
        ...allOk,
        coastalWarningsLayer: {
          status: 'ok',
          streak: 0,
          es: { configured: true, status: 'error', streak: 4, error: 'HTTP 403', lastOkAt: '2026-08-10T00:00:00Z' },
        },
      },
      { warnAfter: 3, failAfter: 6 },
    );
    expect(r.level).toBe('warn');
    expect(r.warnings.some((w) => w.startsWith('::warning::Avisos ES'))).toBe(true);
    expect(r.warnings[0]).toContain('há 4 runs');
  });

  it('feed ES configurado com erros ≥ limiar de falha → ::error:: + level fail', () => {
    const r = evaluateDataLayerHealth(
      {
        ...allOk,
        coastalWarningsLayer: {
          status: 'ok',
          streak: 0,
          es: { configured: true, status: 'error', streak: 7, error: 'HTTP 403' },
        },
      },
      { warnAfter: 3, failAfter: 6 },
    );
    expect(r.level).toBe('fail');
    expect(r.failures[0]).toMatch(/^::error::Avisos ES \(Avisos a los navegantes\) em erro há 7 runs/);
  });

  it('feed ES ok (configurado) → linha ✅ sem alarme', () => {
    const r = evaluateDataLayerHealth(
      {
        ...allOk,
        coastalWarningsLayer: {
          status: 'ok',
          streak: 0,
          es: { configured: true, status: 'ok', lastOkAt: '2026-08-10T00:00:00Z' },
        },
      },
    );
    expect(r.level).toBe('ok');
    expect(r.oks.some((o) => o.includes('Avisos ES (cross-border): feed ok'))).toBe(true);
  });

  it('feed ES sem configurar → nenhuma linha ES (sem alarme falso)', () => {
    const r = evaluateDataLayerHealth(allOk);
    expect(r.level).toBe('ok');
    expect(r.oks.some((o) => o.includes('Avisos ES'))).toBe(false);
    expect(r.warnings.some((w) => w.includes('Avisos ES'))).toBe(false);
  });
});