/**
 * Hidratação /news/ (#418): o relógio no render tinha de sair.
 * `groupByDay`/`filterNewsByDate`/`upcomingEvents` aceitam `nowMs`/`now`
 * explícito e o dia de calendário é Europe/Lisbon nas duas pontas.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { groupByDay, filterNewsByDate } from '@/lib/news';
import { upcomingEvents } from '@/lib/events';
import { lisbonDateKey } from '@/lib/events';
import NewsArchiveClient from '@/components/news/NewsArchiveClient';
import type { NewsItem } from '@/types';
import type { VentuEvent } from '@/types/events';

const item = (id: string, publishedAt: string): NewsItem =>
  ({ id, publishedAt, title: id, titleEn: id, summary: '', summaryEn: '', category: 'surf', source: 'x', sourceType: 'rss', sourceRegion: 'pt', keyPoints: [], url: 'https://x.pt', tags: [] }) as NewsItem;

const ev = (id: string, startDate: string, endDate?: string): VentuEvent =>
  ({ id, startDate, endDate, title: id, kind: 'competition', sports: ['surf'] }) as unknown as VentuEvent;

// Inverno (UTC+0): 14 nov 23:30 e 15 nov 00:30 em Lisboa
const INV_2330 = Date.parse('2025-11-14T23:30:00Z');
const INV_0030 = Date.parse('2025-11-15T00:30:00Z');
// Verão (UTC+1): 14 jul 22:30 UTC = 23:30 Lisboa; 14 jul 23:30 UTC = 00:30 Lisboa do dia 15
const VER_2330 = Date.parse('2025-07-14T22:30:00Z');
const VER_0030 = Date.parse('2025-07-14T23:30:00Z');

describe('groupByDay — dia de Lisboa e nowMs explícito', () => {
  const N = [item('a', '2025-11-14T10:00:00Z'), item('b', '2025-11-15T09:00:00Z'), item('velha', '2025-11-01T09:00:00Z')];

  it('23:30 (inverno): hoje = dia 14, ontem = dia 13', () => {
    const g = groupByDay(N, 'pt', INV_2330);
    expect(g[0].date).toBe('2025-11-15');
    expect(g[0].label).not.toBe('Hoje');
    expect(g.find((x) => x.date === '2025-11-14')?.label).toBe('Hoje');
    expect(g.find((x) => x.date === '2025-11-01')?.label).toContain('1');
  });

  it('00:30 (inverno): hoje = dia 15, ontem = dia 14', () => {
    const g = groupByDay(N, 'pt', INV_0030);
    expect(g.find((x) => x.date === '2025-11-15')?.label).toBe('Hoje');
    expect(g.find((x) => x.date === '2025-11-14')?.label).toBe('Ontem');
  });

  it('verão (UTC+1): a mesma regra de dia de Lisboa', () => {
    const NV = [item('a14', '2025-07-14T12:00:00Z'), item('b15', '2025-07-15T12:00:00Z')];
    const g1 = groupByDay(NV, 'pt', VER_2330);
    expect(g1.find((x) => x.date === '2025-07-14')?.label).toBe('Hoje');
    const g2 = groupByDay(NV, 'pt', VER_0030);
    expect(g2.find((x) => x.date === '2025-07-15')?.label).toBe('Hoje');
    expect(g2.find((x) => x.date === '2025-07-14')?.label).toBe('Ontem');
  });

  it('a chave do grupo é o dia de Lisboa, não UTC', () => {
    // 23:00 UTC do dia 14 = 00:00/01:00 Lisboa do dia 15 (verão) — tem de cair no dia 15
    const g = groupByDay([item('tarde', '2025-07-14T23:30:00Z')], 'pt', VER_0030);
    expect(g[0].date).toBe('2025-07-15');
    expect(g[0].label).toBe('Hoje');
  });

  it('«Ontem» no dia a seguir à mudança de primavera (00:30 Lisboa)', () => {
    // 31 mar 00:30 WEST = 30 mar 23:30 UTC. «Hoje» = 31 mar; «Ontem» tem de
    // ser 30 mar — com subtracção de 86400000 ms caía em 29 mar (WET).
    const N31 = [item('h31', '2025-03-30T23:45:00Z'), item('o30', '2025-03-30T10:00:00Z')];
    const g = groupByDay(N31, 'pt', Date.parse('2025-03-30T23:30:00Z'));
    expect(g.find((x) => x.date === '2025-03-31')?.label).toBe('Hoje');
    expect(g.find((x) => x.date === '2025-03-30')?.label).toBe('Ontem');
  });

  it('o heading de grupos antigos mostra a data da chave, não o fuso do leitor', () => {
    // Artigo de 14 jul 23:30 UTC → grupo Lisboa 15 jul. Formatado com
    // timeZone:'UTC' — um leitor a oeste de UTC via «14 July» sem a fixa.
    const g = groupByDay([item('v', '2025-07-14T23:30:00Z')], 'en', INV_0030);
    expect(g[0].date).toBe('2025-07-15');
    expect(g[0].labelEn).toBe('15 July 2025');
  });
});

describe('filterNewsByDate — corte por dia de Lisboa', () => {
  const N = [item('hoje', '2025-11-15T06:00:00Z'), item('d8', '2025-11-08T06:00:00Z'), item('d9', '2025-11-06T10:00:00Z')];
  it('7d a 00:30: inclui o dia do corte (7 dias atrás em Lisboa)', () => {
    const ids = filterNewsByDate(N, '7d', INV_0030).map((i) => i.id);
    expect(ids).toEqual(['hoje', 'd8']);
  });
  it('today a 23:30 vs 00:30 — a fronteira anda um dia', () => {
    const N14 = [...N, item('ontem', '2025-11-14T12:00:00Z')];
    expect(filterNewsByDate(N14, 'today', INV_2330).map((i) => i.id)).toEqual(['hoje', 'ontem']);
    expect(filterNewsByDate(N14, 'today', INV_0030).map((i) => i.id)).toEqual(['hoje']);
  });
  it('30d e all mantêm o comportamento', () => {
    expect(filterNewsByDate(N, 'all', INV_0030)).toHaveLength(3);
    expect(filterNewsByDate(N, '30d', INV_0030)).toHaveLength(3);
  });

  // Mudança de hora de primavera em Lisboa: 2025-03-30 01:00 UTC → UTC+1.
  // 2025-03-30T23:30Z = 31 mar 00:30 Lisboa. O corte subtrai DIAS DE
  // CALENDÁRIO à chave de Lisboa — o dia tem 23h e subtrair 86400000×N
  // em ms caía um dia antes (incluía o dia anterior ao corte).
  const PRIMAVERA_0030 = Date.parse('2025-03-30T23:30:00Z'); // 31 mar 00:30 Lisboa
  it('DST primavera — corte 7d é 24 mar (não 23 mar)', () => {
    const n = [item('fora', '2025-03-23T12:00:00Z'), item('dentro', '2025-03-24T06:00:00Z')];
    expect(filterNewsByDate(n, '7d', PRIMAVERA_0030).map((i) => i.id)).toEqual(['dentro']);
  });
  it('DST primavera — corte 30d é 1 mar (não 28 fev)', () => {
    const n = [item('fora', '2025-02-28T12:00:00Z'), item('dentro', '2025-03-01T06:00:00Z')];
    expect(filterNewsByDate(n, '30d', PRIMAVERA_0030).map((i) => i.id)).toEqual(['dentro']);
  });
});

describe('upcomingEvents — now explícito', () => {
  const E = [ev('passado', '2025-11-14'), ev('hoje', '2025-11-15'), ev('amanha', '2025-11-20'), ev('ate-hoje', '2025-11-10', '2025-11-15')];
  it('a 23:30 do dia 14: todos ainda futuros/em curso (ordem por startDate)', () => {
    expect(upcomingEvents(E, new Date(INV_2330)).map((e) => e.id)).toEqual(['ate-hoje', 'passado', 'hoje', 'amanha']);
  });
  it('a 00:30 do dia 15: «passado» sai, «ate-hoje» (endDate = 15) fica', () => {
    expect(upcomingEvents(E, new Date(INV_0030)).map((e) => e.id)).toEqual(['ate-hoje', 'hoje', 'amanha']);
  });
});

describe('NewsArchiveClient — primeiro render igual ao servidor', () => {
  const BAKED = INV_2330; // build de 14 nov à noite
  const NEWS = [item('a', '2025-11-14T10:00:00Z'), item('b', '2025-11-15T01:00:00Z')];

  // A hidratação REAL (HTML do servidor + hydrateRoot num DOM) está em
  // newsHidratacaoDom.test.ts — renderToStaticMarkup duas vezes só prova
  // determinismo, não apanha mismatches de browser.

  it('usa o relógio do build, não o actual: «Hoje» = o dia do build (14 nov)', () => {
    const html = renderToStaticMarkup(
      createElement(NewsArchiveClient, { bakedNews: NEWS, bakedEvents: [], bakedNowMs: BAKED, locale: 'pt' }),
    );
    expect(html).toContain('Hoje');
    // o item do dia 15 NÃO pode ser «Hoje» (com o relógio real de hoje seria)
    expect(groupByDay(NEWS, 'pt', BAKED).find((g) => g.date === '2025-11-15')?.label).not.toBe('Hoje');
  });

  it('sanity: lisbonDateKey nos dois solstícios', () => {
    expect(lisbonDateKey(new Date(VER_2330))).toBe('2025-07-14');
    expect(lisbonDateKey(new Date(VER_0030))).toBe('2025-07-15');
    expect(lisbonDateKey(new Date(INV_2330))).toBe('2025-11-14');
    expect(lisbonDateKey(new Date(INV_0030))).toBe('2025-11-15');
  });
});
