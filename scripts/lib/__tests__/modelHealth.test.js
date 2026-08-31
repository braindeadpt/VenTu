import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';

const require = createRequire(import.meta.url);
const {
  HEALTH_FAMILIES,
  countModelSlots,
  mergeCounts,
  classifyModelCounts,
  buildHealthReport,
  writeModelHealth,
  readModelHealth,
  notifyDeadModels,
  deadModelKey,
} = require('../modelHealth.js');

const NUMERIC = (n, fill = null) =>
  Array.from({ length: 168 }, (_, i) => (i < n ? i / 10 : fill));

describe('countModelSlots', () => {
  it('conta valores não-null por modelo numa resposta', () => {
    const hourly = {
      wave_height_ewam: NUMERIC(92),
      wave_height_ecmwf_wam: NUMERIC(168),
    };
    const counts = countModelSlots(hourly, 'wave_height', ['ewam', 'ecmwf_wam']);
    expect(counts.ewam).toEqual({ ok: 92, total: 168, absentCount: 0 });
    expect(counts.ecmwf_wam).toEqual({ ok: 168, total: 168, absentCount: 0 });
  });

  it('marca key ausente como absent (sintoma de modelo morto)', () => {
    const counts = countModelSlots({}, 'wave_height', ['gwam']);
    expect(counts.gwam).toEqual({ ok: 0, total: 0, absentCount: 1 });
  });

  it('trata NaN/undefined como não-válidos', () => {
    const hourly = { wind_speed_10m_icon_eu: [1, null, undefined, NaN, 2] };
    const counts = countModelSlots(hourly, 'wind_speed_10m', ['icon_eu']);
    expect(counts.icon_eu.ok).toBe(2);
    expect(counts.icon_eu.total).toBe(5);
  });
});

describe('mergeCounts', () => {
  it('acumula contagens entre respostas (spots)', () => {
    const acc = {};
    mergeCounts(acc, { ewam: { ok: 92, total: 168, absentCount: 0 } });
    mergeCounts(acc, { ewam: { ok: 168, total: 168, absentCount: 0 } });
    expect(acc.ewam).toEqual({ ok: 260, total: 336, absentCount: 0 });
  });

  it('acumula absentCount', () => {
    const acc = {};
    mergeCounts(acc, { gwam: { ok: 0, total: 0, absentCount: 1 } });
    mergeCounts(acc, { gwam: { ok: 0, total: 0, absentCount: 1 } });
    expect(acc.gwam.absentCount).toBe(2);
  });
});

describe('classifyModelCounts', () => {
  it('ok com pelo menos um valor não-null', () => {
    expect(classifyModelCounts({ ewam: { ok: 1, total: 168, absentCount: 0 } }).ewam.status).toBe('ok');
  });

  it('dead quando 0 não-null com chave presente (o caso ecmwf_wam025)', () => {
    expect(classifyModelCounts({ m: { ok: 0, total: 168, absentCount: 0 } }).m.status).toBe('dead');
  });

  it('dead quando a chave está ausente de todas as respostas', () => {
    expect(classifyModelCounts({ m: { ok: 0, total: 0, absentCount: 4 } }).m.status).toBe('dead');
  });
});

describe('buildHealthReport', () => {
  it('produz o report com dead por família', () => {
    const waveCounts = {
      ewam: { ok: 92, total: 168, absentCount: 0 },
      ecmwf_wam: { ok: 0, total: 168, absentCount: 0 }, // dead
    };
    const windCounts = {
      icon_eu: { ok: 134, total: 168, absentCount: 0 },
      ecmwf_aifs025: { ok: 0, total: 0, absentCount: 2 }, // dead (ausente)
    };
    const report = buildHealthReport({ waveCounts, windCounts, sampledSpots: 3 }, Date.UTC(2026, 7, 14, 12));
    expect(report.source).toBe('open-meteo-model-health');
    expect(report.checkedAt).toBe('2026-08-14T12:00:00.000Z');
    expect(report.sampledSpots).toBe(3);
    expect(report.wave.ecmwf_wam.status).toBe('dead');
    expect(report.wind.ecmwf_aifs025.status).toBe('dead');
    expect(report.dead).toEqual([
      { family: 'wave', model: 'ecmwf_wam' },
      { family: 'wind', model: 'ecmwf_aifs025' },
    ]);
  });
});

describe('writeModelHealth / readModelHealth', () => {
  it('escreve e lê atomicamente (tmp → rename)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventu-model-health-'));
    const p = join(dir, 'model-health.json');
    const report = { source: 'x', checkedAt: '2026-08-14T12:00:00.000Z', dead: [] };
    writeModelHealth(report, p);
    expect(readModelHealth(p)).toEqual(report);
    expect(readModelHealth(join(dir, 'missing.json'))).toBeNull();
    unlinkSync(p);
  });
});

describe('notifyDeadModels', () => {
  const base = (dead) => ({
    source: 'open-meteo-model-health',
    checkedAt: '2026-08-14T12:00:00.000Z',
    sampledSpots: 2,
    wave: {},
    wind: {},
    dead,
  });
  const logs = [];
  const log = (m) => logs.push(m);

  it('não notifica quando não há modelos mortos', async () => {
    const res = await notifyDeadModels(base([]), { log });
    expect(res.reason).toBe('no-dead-models');
    expect(res.notified).toBe(false);
  });

  it('notifica só na transição para morto (novos), não repetidos', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ventu-model-health-'));
    const p = join(dir, 'mh.json');
    // run 1: ecmwf_wam morre → notifica
    writeFileSync(p, JSON.stringify(base([{ family: 'wave', model: 'ecmwf_wam' }])));
    const send = vi.fn(async () => true);
    const res1 = await notifyDeadModels(
      base([
        { family: 'wave', model: 'ecmwf_wam' },
        { family: 'wave', model: 'gwam' },
      ]),
      { send, chatId: '123', reportPath: p, log },
    );
    expect(res1.notified).toBe(true);
    expect(res1.newlyDead).toEqual([{ family: 'wave', model: 'gwam' }]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe('123');
    expect(send.mock.calls[0][1]).toContain('gwam');
    expect(send.mock.calls[0][1]).not.toContain('ecmwf_wam');
    // run 2 (update-conditions escreve o report antes de notificar):
    // mesmos mortos que no disco → não volta a notificar (sem spam).
    writeModelHealth(
      base([
        { family: 'wave', model: 'ecmwf_wam' },
        { family: 'wave', model: 'gwam' },
      ]),
      p,
    );
    const send2 = vi.fn(async () => true);
    const res2 = await notifyDeadModels(
      base([
        { family: 'wave', model: 'ecmwf_wam' },
        { family: 'wave', model: 'gwam' },
      ]),
      { send: send2, chatId: '123', reportPath: p, log },
    );
    expect(res2.notified).toBe(false);
    expect(res2.reason).toBe('already-reported');
    expect(send2).not.toHaveBeenCalled();
  });

  it('sem OPS_TELEGRAM_CHAT_ID → dry-run (nunca envia)', async () => {
    const send = vi.fn(async () => true);
    const res = await notifyDeadModels(base([{ family: 'wind', model: 'x' }]), {
      send,
      chatId: undefined,
      log,
    });
    expect(res.notified).toBe(false);
    expect(res.reason).toBe('no-chat-id');
    expect(send).not.toHaveBeenCalled();
  });

  it('deadModelKey é estável por família', () => {
    expect(deadModelKey({ family: 'wave', model: 'gwam' })).toBe('wave:gwam');
  });

  it('HEALTH_FAMILIES espelha o ensemble configurado', () => {
    expect(HEALTH_FAMILIES.wave.models).toContain('ecmwf_wam');
    expect(HEALTH_FAMILIES.wave.models).not.toContain('ecmwf_wam025');
    expect(HEALTH_FAMILIES.wind.models).toContain('icon_eu');
  });
});
