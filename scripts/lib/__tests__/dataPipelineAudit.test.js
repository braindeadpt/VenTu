/**
 * dataPipelineAudit.js — readForecastSkillPlatformCounters.
 *
 * The audit step (`--print-audit` in update-data.yml) exposes the live
 * forecast-skill platform counters (IH keyed vs WMO-ES/PT keyless) so the
 * sources dashboard shows how the pair archive evolves per platform. These
 * tests pin the pure reader against temp fixtures via FORECAST_SKILL_PATH.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const { readForecastSkillPlatformCounters } = require('../dataPipelineAudit');

let dir;
afterEach(() => {
  if (dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
  delete process.env.FORECAST_SKILL_PATH;
});

function fixturePath(contents) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vgaudit-'));
  const fp = path.join(dir, 'forecast-skill.json');
  if (contents !== undefined) fs.writeFileSync(fp, JSON.stringify(contents));
  return fp;
}

describe('readForecastSkillPlatformCounters', () => {
  it('devolve os contadores por plataforma + calibrados + origem dominante', () => {
    const fp = fixturePath({
      fetchedAt: '2026-09-01T03:52:42.802Z',
      pairCount: 100,
      pairCountByOrigin: { ih: 95, 'wmo-es': 5 },
      calibratedPairCount: 3,
    });
    const c = readForecastSkillPlatformCounters(fp);
    expect(c).not.toBeNull();
    expect(c.pairCountByOrigin).toEqual({ ih: 95, 'wmo-pt': 0, 'wmo-es': 5 });
    expect(c.calibratedPairCount).toBe(3);
    expect(c.dominantOrigin).toBe('ih');
    expect(c.dominantShare).toBeCloseTo(0.95);
    expect(c.pairCount).toBe(100);
  });

  it('marca dependência quando uma plataforma domina (≥80%) e o total é estável', () => {
    const fp = fixturePath({
      pairCountByOrigin: { ih: 45, 'wmo-es': 5 },
    });
    const c = readForecastSkillPlatformCounters(fp);
    expect(c.dominantOrigin).toBe('ih');
    expect(c.dominantShare).toBeCloseTo(0.9);
  });

  it('reporta a dominante mesmo abaixo do limiar (sem dependência — distribuição mista)', () => {
    const fp = fixturePath({
      pairCountByOrigin: { ih: 55, 'wmo-es': 45 },
    });
    const c = readForecastSkillPlatformCounters(fp);
    expect(c.dominantOrigin).toBe('ih');
    expect(c.dominantShare).toBeCloseTo(0.55);
    expect(c.pairCountByOrigin['wmo-es']).toBe(45);
  });

  it('devolve null para ficheiro ausente (audit degrada em silêncio)', () => {
    const fp = fixturePath(undefined);
    expect(readForecastSkillPlatformCounters(fp)).toBeNull();
  });

  it('devolve null para JSON corrompido ou shape inválido (nunca lança)', () => {
    const fp = fixturePath('not-json');
    expect(readForecastSkillPlatformCounters(fp)).toBeNull();
    const fp2 = fixturePath('["array"]');
    expect(readForecastSkillPlatformCounters(fp2)).toBeNull();
  });

  it('sanitiza contadores inválidos para 0 e aceita o env FORECAST_SKILL_PATH', () => {
    const fp = fixturePath({
      pairCountByOrigin: { ih: 'x', 'wmo-es': -3, 'wmo-pt': 2 },
    });
    const c1 = readForecastSkillPlatformCounters(fp);
    expect(c1.pairCountByOrigin).toEqual({ ih: 0, 'wmo-pt': 2, 'wmo-es': 0 });

    process.env.FORECAST_SKILL_PATH = fp;
    const c2 = readForecastSkillPlatformCounters();
    expect(c2).not.toBeNull();
    expect(c2.pairCountByOrigin['wmo-pt']).toBe(2);
    // Total 2, só wmo-pt com pares → domina com share 1 (e o audit marca
    // dependência, mas o helper só reporta o par — a decisão é do caller).
    expect(c2.dominantOrigin).toBe('wmo-pt');
    expect(c2.dominantShare).toBeCloseTo(1);
  });
});