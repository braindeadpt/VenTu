import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import { notasHorariasCompare } from '@/lib/compareHourlyScores';
import { desvioFusoMin, instanteDaParede } from '@/lib/sol';
import { seriesTimeMs } from '@/lib/openMeteoTime';
import { rawToScoreInput } from '@/lib/scoreConditions';

/**
 * #456 (ponto 2): a tabela horária do comparador casava as horas por igualdade
 * de string. Num spot dos Açores a série vem em `…T11:00-01:00` e o eixo em
 * `…T12:00+00:00` — a mesma hora real, strings diferentes — e todas as 24
 * células do segundo spot saíam «—». Passa a casar pelo instante.
 *
 * Fixtures e2e: `carcavelos` (Lisboa) × `santa-barbara` (Açores), ambas
 * alinhadas no mesmo instante de partida (08/09/2026 00:00 de Lisboa). A série
 * dos Açores é reescrita para a hora de parede deles, como o pipeline faz.
 */
const FIX = path.join(__dirname, '..', '..', '..', 'tests/e2e/fixtures/data');
const ler = (f: string) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const spotDe = (id: string) => (spots as Spot[]).find((s) => s.id === id)!;
const HOURS = 24;

type Linha = Record<string, unknown>;

/** Etiqueta `YYYY-MM-DDTHH:mm±hh:mm` na hora de parede de `tz`, mesmo instante. */
function emFuso(t: string, tz: string): string {
  const ms = seriesTimeMs(t);
  const off = desvioFusoMin(ms, tz);
  const wall = new Date(ms + off * 60000).toISOString().slice(0, 16);
  const abs = Math.abs(off);
  const sinal = off < 0 ? '-' : '+';
  return `${wall}${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

const cond = ler('conditions.json') as Record<string, Record<string, unknown>>;
const carcavelos = ler('forecasts/carcavelos.json') as Linha[];
const santaBarbara = ler('forecasts/santa-barbara.json') as Linha[];

describe('#456 — comparador casa as horas pelo instante (Continente × Açores)', () => {
  const axis = carcavelos.slice(0, HOURS).map((r) => String(r.time));
  const azores = santaBarbara
    .slice(0, HOURS)
    .map((r) => ({ ...r, time: emFuso(String(r.time), 'Atlantic/Azores') }));
  const sp = spotDe('santa-barbara');
  const fallback = rawToScoreInput(cond[sp.id] ?? {});

  it('a série dos Açores é reescrita para −01:00/+00:00 sem mudar de instante', () => {
    expect(azores[0].time).toMatch(/T\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(seriesTimeMs(String(azores[5].time))).toBe(seriesTimeMs(String(santaBarbara[5].time)));
    expect(String(azores[0].time)).not.toBe(String(santaBarbara[0].time));
  });

  it('surf: as 24 horas dos dois spots preenchem-se (sem «—» falsos)', () => {
    const pelaAxis = notasHorariasCompare(sp, 'surf', azores, axis, fallback);
    const pelaSerie = notasHorariasCompare(
      sp,
      'surf',
      azores,
      azores.map((r) => String(r.time)),
      fallback,
    );

    expect(pelaAxis).toHaveLength(HOURS);
    // A janela da fixture tem dia e noite: o v6 só dá nota de dia.
    expect(pelaAxis.filter((v) => v != null).length).toBeGreaterThan(6);
    // Casar pelo eixo de Lisboa ou pela própria série tem de dar o mesmo.
    expect(pelaAxis).toEqual(pelaSerie);
    expect(pelaSerie.some((v) => v != null)).toBe(true);
  });

  it('SUP (motor antigo): todas as horas presentes, nenhuma célula vazia', () => {
    const sup = notasHorariasCompare(sp, 'sup', azores, axis, fallback);
    expect(sup).toHaveLength(HOURS);
    expect(sup.every((v) => v != null)).toBe(true);
  });

  it('continente não muda: eixo e série iguais dão o mesmo resultado', () => {
    const c = spotDe('carcavelos');
    const times = carcavelos.slice(0, HOURS).map((r) => String(r.time));
    const fb = rawToScoreInput(cond[c.id] ?? {});
    expect(notasHorariasCompare(c, 'surf', carcavelos, times, fb)).toEqual(
      notasHorariasCompare(c, 'surf', carcavelos, times, fb),
    );
    expect(notasHorariasCompare(c, 'surf', carcavelos, times, fb).some((v) => v != null)).toBe(true);
  });

  it('uma hora ausente da série continua a ser «—» (não inventa dados)', () => {
    const c = spotDe('carcavelos');
    const times = [carcavelos[0], carcavelos[1]].map((r) => String(r.time));
    const fb = rawToScoreInput(cond[c.id] ?? {});
    const sem = notasHorariasCompare(c, 'surf', carcavelos.slice(2), times, fb);
    expect(sem).toEqual([null, null]);
  });
});

