/**
 * Unit tests for scripts/lib/coastalWarningsArchive.js — the daily snapshot
 * archive of IH coastal navigation warnings (when each warning was in force).
 *
 * Covers the merge (new day appends / same day replaces), the rolling-window
 * prune, the per-ref timeline derivation and the atomic read/write round-trip
 * with a temp output path.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const require = createRequire(import.meta.url);
const {
  ARCHIVE_WINDOW_DAYS,
  lisbonDateStr,
  emptyArchive,
  readArchive,
  writeArchive,
  toArchivedWarning,
  mergeDaySnapshot,
  pruneArchive,
  buildRefTimeline,
  buildReport,
} = require('../coastalWarningsArchive.js');

const w1 = { id: 18151, ref: 'ANAV NR 1670/26', category: 'Requisitos de segurança maritima', url: 'https://geoanavnet.hidrografico.pt/1', source: 'ih', polygons: [[[0, 0], [1, 1]]] };
const w2 = { id: 18271, ref: 'ANAV NR 18271/26', category: 'Exercício militar', url: 'https://geoanavnet.hidrografico.pt/2', source: 'ih', polygons: [[[0, 0], [1, 1]]] };
const es = { id: 9001, ref: 'AVISO 9001/26', category: 'Ejercicio naval', url: 'https://armada.defensa.gob.es/', source: 'es', polygons: [[[0, 0], [1, 1]]] };

describe('lisbonDateStr', () => {
  it('YYYY-MM-DD em Europe/Lisbon', () => {
    expect(lisbonDateStr(new Date('2026-08-15T10:00:00Z'))).toBe('2026-08-15');
  });
});

describe('toArchivedWarning', () => {
  it('compacta — mantém id/ref/category/source/url, descarta polygons', () => {
    expect(toArchivedWarning(w1)).toEqual({
      id: 18151,
      ref: 'ANAV NR 1670/26',
      category: 'Requisitos de segurança maritima',
      source: 'ih',
      url: 'https://geoanavnet.hidrografico.pt/1',
    });
    expect(toArchivedWarning(w1)).not.toHaveProperty('polygons');
    expect(toArchivedWarning(es).source).toBe('es');
    expect(toArchivedWarning({}).source).toBe('ih');
  });
});

describe('mergeDaySnapshot', () => {
  it('novo dia → snapshot adicionado (append)', () => {
    const archive = emptyArchive();
    mergeDaySnapshot(archive, [w1, w2], '2026-08-30');
    mergeDaySnapshot(archive, [w1, es], '2026-08-31');
    expect(archive.dayCount).toBe(2);
    expect(archive.days.map((d) => d.date)).toEqual(['2026-08-30', '2026-08-31']);
    expect(archive.days[1].warnings.map((w) => w.ref)).toEqual(['ANAV NR 1670/26', 'AVISO 9001/26']);
  });

  it('mesmo dia → substitui o snapshot anterior (re-fetch corrige o dia)', () => {
    const archive = emptyArchive();
    const first = mergeDaySnapshot(archive, [w1], '2026-08-31');
    expect(first.replaced).toBe(false);
    const second = mergeDaySnapshot(archive, [w1, w2], '2026-08-31');
    expect(second.replaced).toBe(true);
    expect(archive.dayCount).toBe(1);
    expect(archive.days[0].warnings).toHaveLength(2);
  });

  it('sem avisos → snapshot vazio do dia (o dia fica registado como sem avisos)', () => {
    const archive = emptyArchive();
    mergeDaySnapshot(archive, [], '2026-08-31');
    expect(archive.days).toEqual([{ date: '2026-08-31', warnings: [] }]);
  });

  it('usar o padrão lisbonDateStr() quando não é dado um date', () => {
    const archive = emptyArchive();
    mergeDaySnapshot(archive, [w1]);
    expect(archive.days[0].date).toBe(lisbonDateStr());
  });
});

describe('pruneArchive', () => {
  it('remove snapshots fora da janela (por data)', () => {
    const archive = emptyArchive();
    mergeDaySnapshot(archive, [w1], '2026-05-01');
    mergeDaySnapshot(archive, [w1], '2026-08-01');
    // now = 2026-08-31 → cutoff 2026-06-02; 2026-05-01 cai fora.
    pruneArchive(archive, new Date('2026-08-31T12:00:00Z').getTime());
    expect(archive.days.map((d) => d.date)).toEqual(['2026-08-01']);
    expect(archive.dayCount).toBe(1);
  });

  it('ARCHIVE_WINDOW_DAYS é 90 (trimestre de histórico)', () => {
    expect(ARCHIVE_WINDOW_DAYS).toBe(90);
  });
});

describe('buildRefTimeline / buildReport', () => {
  it('deriva firstSeen/lastSeen/daysInForce por ref, ordenado por lastSeen desc', () => {
    const archive = emptyArchive();
    mergeDaySnapshot(archive, [w1], '2026-08-28');
    mergeDaySnapshot(archive, [w1, w2], '2026-08-30');
    mergeDaySnapshot(archive, [w2], '2026-08-31');
    const refs = buildRefTimeline(archive);

    expect(refs).toHaveLength(2);
    const [r2, r1] = refs; // w2 visto até 31, w1 até 30
    expect(r2.ref).toBe('ANAV NR 18271/26');
    expect(r2).toMatchObject({ firstSeen: '2026-08-30', lastSeen: '2026-08-31', nDays: 2 });
    expect(r2.daysInForce).toEqual(['2026-08-30', '2026-08-31']);
    expect(r1.ref).toBe('ANAV NR 1670/26');
    expect(r1).toMatchObject({ firstSeen: '2026-08-28', lastSeen: '2026-08-30', nDays: 2 });
  });

  it('fonte ES preservada no timeline', () => {
    const archive = emptyArchive();
    mergeDaySnapshot(archive, [es], '2026-08-31');
    const refs = buildRefTimeline(archive);
    expect(refs[0]).toMatchObject({ ref: 'AVISO 9001/26', source: 'es', nDays: 1 });
  });

  it('buildReport fecha o ciclo: dias + refs coerentes', () => {
    const archive = emptyArchive();
    mergeDaySnapshot(archive, [w1], '2026-08-30');
    mergeDaySnapshot(archive, [w1, w2], '2026-08-31');
    const report = buildReport(archive);
    expect(report.dayCount).toBe(2);
    expect(report.refs).toHaveLength(2);
    expect(report.days).toHaveLength(2);
  });
});

describe('readArchive / writeArchive (round-trip atómico)', () => {
  it('escreve e relê o mesmo conteúdo (com .tmp a desaparecer)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coastal-archive-'));
    const outPath = join(dir, 'archive.json');
    try {
      const archive = emptyArchive();
      mergeDaySnapshot(archive, [w1, es], '2026-08-31');
      buildReport(archive);
      writeArchive(archive, outPath);

      expect(readArchive(outPath)).toEqual(archive);
      const tmp = join(dir, 'archive.json.tmp');
      // ficheiro temporário não pode sobrar (rename atómico)
      const hasTmp = (() => {
        try {
          readFileSync(tmp);
          return true;
        } catch {
          return false;
        }
      })();
      expect(hasTmp).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ficheiro em falta → archive vazio', () => {
    expect(readArchive(join(tmpdir(), 'nao-existe-archive.json'))).toEqual(emptyArchive());
  });

  it('ficheiro corrompido → archive vazio (não rebenta)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coastal-archive-'));
    const outPath = join(dir, 'corrupt.json');
    try {
      writeArchive({ days: 'nope' }, outPath);
      const read = readArchive(outPath);
      expect(read.days).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
