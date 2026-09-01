import { describe, it, expect } from 'vitest';
import {
  parseCoastalWarningsArchive,
  clearCoastalWarningsArchiveCache,
} from '@/lib/coastalWarningsArchive';

describe('parseCoastalWarningsArchive', () => {
  it('parse válido → refs saneadas, ordenadas por lastSeen desc', () => {
    const data = parseCoastalWarningsArchive({
      fetchedAt: '2026-08-31T08:00:00Z',
      windowDays: 90,
      dayCount: 3,
      refs: [
        {
          ref: 'ANAV NR 1670/26',
          category: 'Requisitos de segurança maritima',
          source: 'ih',
          url: 'https://geoanavnet.hidrografico.pt/1',
          firstSeen: '2026-08-28',
          lastSeen: '2026-08-30',
          daysInForce: ['2026-08-30', '2026-08-28'],
          nDays: 2,
        },
        {
          ref: 'AVISO 9001/26',
          category: 'Ejercicio naval',
          source: 'es',
          url: '',
          firstSeen: '2026-08-31',
          lastSeen: '2026-08-31',
          daysInForce: ['2026-08-31'],
          nDays: 1,
        },
      ],
    });

    expect(data.hasData).toBe(true);
    expect(data.dayCount).toBe(3);
    expect(data.refs.map((r) => r.ref)).toEqual(['AVISO 9001/26', 'ANAV NR 1670/26']);
    const es = data.refs[0];
    expect(es.source).toBe('es');
    expect(es.daysInForce).toEqual(['2026-08-31']);
    // daysInForce deduplicado e ordenado (o raw trazia fora de ordem)
    expect(data.refs[1].daysInForce).toEqual(['2026-08-28', '2026-08-30']);
    expect(data.refs[1].nDays).toBe(2);
  });

  it('entradas inválidas (sem ref/datas) são descartadas', () => {
    const data = parseCoastalWarningsArchive({
      refs: [
        { ref: '', firstSeen: '2026-08-31', lastSeen: '2026-08-31' },
        { ref: 'OK', firstSeen: 'nope', lastSeen: '2026-08-31' },
        { ref: 'ANAV NR 1/26', firstSeen: '2026-08-31', lastSeen: '2026-08-31', daysInForce: 'x', nDays: 'y' },
      ],
    });
    expect(data.refs).toHaveLength(1);
    expect(data.refs[0].ref).toBe('ANAV NR 1/26');
    expect(data.refs[0].daysInForce).toEqual([]);
    expect(data.refs[0].nDays).toBe(0);
  });

  it('raw null/object sem refs → hasData false (a secção esconde-se)', () => {
    expect(parseCoastalWarningsArchive(null).hasData).toBe(false);
    expect(parseCoastalWarningsArchive({ refs: [] }).hasData).toBe(false);
    expect(parseCoastalWarningsArchive('lixo').hasData).toBe(false);
  });

  it('defaults tolerantes a ficheiro antigo (sem dayCount/windowDays)', () => {
    const data = parseCoastalWarningsArchive({ refs: [{ ref: 'A', firstSeen: 'x', lastSeen: 'y' }] });
    expect(data.windowDays).toBe(90);
    expect(data.dayCount).toBe(0);
  });

  it('dailyActive: contagens por dia com preenchimento contíguo (0 onde falta)', () => {
    const data = parseCoastalWarningsArchive({
      days: [
        { date: '2026-08-28', warnings: [{ id: 1 }, { id: 2 }] },
        { date: '2026-08-30', warnings: [{ id: 3 }] },
      ],
    });
    // min=28 → max=30, contíguo com o dia 29 a zero.
    expect(data.dailyActive).toEqual([
      { date: '2026-08-28', count: 2 },
      { date: '2026-08-29', count: 0 },
      { date: '2026-08-30', count: 1 },
    ]);
  });

  it('dailyActive: deduplica ids no mesmo dia e ignora dias inválidos', () => {
    const data = parseCoastalWarningsArchive({
      days: [
        { date: '2026-08-28', warnings: [{ id: 1 }, { id: 1 }, { id: 'es-1' }] },
        { date: 'nao-data', warnings: [{ id: 9 }] },
        { date: '2026-08-29', warnings: [] },
      ],
    });
    expect(data.dailyActive).toEqual([
      { date: '2026-08-28', count: 2 },
      { date: '2026-08-29', count: 0 },
    ]);
  });

  it('dailyActive: sem days → array vazio (chart escondido)', () => {
    const data = parseCoastalWarningsArchive({ refs: [] });
    expect(data.dailyActive).toEqual([]);
  });
});

describe('loadCoastalWarningsArchive (cache hook)', () => {
  it('clearCoastalWarningsArchiveCache não rebenta', () => {
    expect(() => clearCoastalWarningsArchiveCache()).not.toThrow();
  });
});
