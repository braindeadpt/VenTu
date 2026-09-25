import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  WINDOW_HOURS_FAST,
  WINDOW_HOURS_SLOW,
  BELOW_HALF_RATIO,
  parseCrons,
  expandField,
  cronFields,
  expectedRuns,
  evaluateCronDelivery,
} = require('../cronDelivery.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..', '..');
const WF = path.join(ROOT, '.github', 'workflows');
/** Agora fixo: um sábado, 12:00 UTC — bem dentro de um dia para não cortar. */
const NOW = new Date('2026-09-26T12:00:00Z').getTime();
const day = (crons, nowMs = NOW) => expectedRuns(crons, nowMs - 24 * 3600_000, nowMs);

const delivery = (over = {}) =>
  evaluateCronDelivery({ crons: ['*/5 * * * *'], observed24h: 288, observed7d: 2016, nowMs: NOW, ...over });

describe('cronDelivery — leitura dos crons', () => {
  it('lê o bloco on.schedule e ignora comentários e outros blocos', () => {
    const yml = [
      'name: X',
      'on:',
      '  schedule:',
      "    # - cron: '0 0 * * *'  (comentado, não conta)",
      "    - cron: '17 * * * *'",
      '    - cron: "47 * * * *"',
      '  workflow_dispatch:',
      'jobs:',
      '  a:',
      '    steps:',
      "      - run: echo \"cron: '0 9 * * *'\"",
    ].join('\n');
    expect(parseCrons(yml)).toEqual(['17 * * * *', '47 * * * *']);
  });

  it('sem schedule (ou sem on:) → sem crons', () => {
    expect(parseCrons('name: X\non:\n  workflow_dispatch:\n')).toEqual([]);
    expect(parseCrons('jobs:\n  a:\n')).toEqual([]);
    expect(parseCrons(null)).toEqual([]);
  });

  it('expande campos: *, passos, faixas e listas; inválidos → null', () => {
    expect(expandField('*', 0, 59)).toEqual({ any: true, values: new Set() });
    expect([...expandField('*/15', 0, 59).values]).toEqual([0, 15, 30, 45]);
    expect([...expandField('5-7', 0, 59).values]).toEqual([5, 6, 7]);
    expect([...expandField('1,3', 0, 59).values]).toEqual([1, 3]);
    expect([...expandField('2-10/4', 0, 59).values]).toEqual([2, 6, 10]);
    expect(expandField('60', 0, 59)).toBe(null);
    expect(expandField('abc', 0, 59)).toBe(null);
  });

  it('normaliza dow=7 para domingo e recusa expressões com o número errado de campos', () => {
    expect([...cronFields('0 6 * * 7').dow.values]).toEqual([0]);
    expect(cronFields('0 6 * *')).toBe(null);
    expect(cronFields('0 6 * * * *')).toBe(null);
  });

  it('nominal por dia das expressões reais do repo', () => {
    expect(day(['17 * * * *', '47 * * * *'])).toBe(48); // update-data
    expect(day(['12,42 * * * *'])).toBe(48); // data-cadence-alert
    expect(day(['7,37 * * * *'])).toBe(48); // staleness-alert
    expect(day(['0 * * * *'])).toBe(24); // ih-health
    expect(day(['*/5 * * * *'])).toBe(288); // telegram-poll
    expect(day(['15 */3 * * *', '30 7 * * *'])).toBe(9); // evaluate-alerts
    expect(day(['40 4 * * *'])).toBe(1); // full-route-audit
    expect(day(['0 7 * * *'])).toBe(1); // ops-audit
  });

  it('janela de 7 dias: um por semana (dow) e o alternado em dom viram 1 e ~3,5', () => {
    const week = (crons) => expectedRuns(crons, NOW - WINDOW_HOURS_SLOW * 3600_000, NOW);
    expect(week(['0 6 * * 1'])).toBe(1); // api-keys / apply-contributions
    expect(week(['0 8 * * 1'])).toBe(1);
    const news = week(['0 6 */2 * *']); // update-news: dias alternados
    expect(news).toBeGreaterThanOrEqual(3);
    expect(news).toBeLessThanOrEqual(4);
  });

  it('dom e dow restritos juntos: dispara quando qualquer um casa (semântica clássica)', () => {
    // `0 0 1 * 1` = dia 1 de cada mês OU segunda-feira.
    const in30d = expectedRuns(['0 0 1 * 1'], NOW - 30 * 24 * 3600_000, NOW);
    expect(in30d).toBeGreaterThanOrEqual(5); // ~4 segundas-feiras + o dia 1 (+ quando calham juntos)
    expect(in30d).toBeLessThanOrEqual(7);
  });

  it('limita a iteração a um ano (não varre décadas por engano)', () => {
    const decade = expectedRuns(['*/5 * * * *'], NOW - 10 * 365 * 24 * 3600_000, NOW);
    expect(decade).toBe(288 * 366);
  });
});

describe('cronDelivery — decisão', () => {
  it('nominal alto → janela de 24 h, e 2% do nominal é finding', () => {
    const d = delivery({ crons: ['*/5 * * * *'], observed24h: 6, observed7d: 45 });
    expect(d.judge).toBe(true);
    expect(d.windowHours).toBe(WINDOW_HOURS_FAST);
    expect(d.expected).toBe(288);
    expect(d.observed).toBe(6);
    expect(d.ratio).toBeCloseTo(6 / 288, 5);
    expect(d.belowHalf).toBe(true);
  });

  it('exactamente metade NÃO é finding (o limiar é «abaixo de metade»)', () => {
    expect(delivery({ crons: ['0 * * * *'], observed24h: 12, observed7d: 100 }).belowHalf).toBe(false);
    expect(delivery({ crons: ['0 * * * *'], observed24h: 11, observed7d: 100 }).belowHalf).toBe(true);
    expect(BELOW_HALF_RATIO).toBe(0.5);
  });

  it('ping a cobrir o scheduler não é finding (conta qualquer gatilho)', () => {
    // update-data: 48 runs agendadas/dia, observadas 58 (48 schedule + pings).
    const d = delivery({ crons: ['17 * * * *', '47 * * * *'], observed24h: 58, observed7d: 224 });
    expect(d.judge).toBe(true);
    expect(d.expected).toBe(48);
    expect(d.ratio).toBeGreaterThan(1);
    expect(d.belowHalf).toBe(false);
  });

  it('nominal baixo (diário/semanal) → janela de 7 dias', () => {
    const weekly = delivery({ crons: ['0 6 * * 1'], observed24h: 0, observed7d: 1 });
    expect(weekly.judge).toBe(true);
    expect(weekly.windowHours).toBe(WINDOW_HOURS_SLOW);
    expect(weekly.expected).toBe(1);
    expect(weekly.belowHalf).toBe(false);

    const missed = delivery({ crons: ['0 6 * * 1'], observed24h: 0, observed7d: 0 });
    expect(missed.belowHalf).toBe(true);
  });

  it('contagem indisponível ou sem crons → não julga (nunca inventa finding)', () => {
    // A janela que decide é a que tem de estar disponível: 24 h no cron de 5
    // min, 7 dias no semanal (o outro número é diagnóstico, não decide).
    expect(delivery({ crons: ['*/5 * * * *'], observed24h: null, observed7d: 45 }).judge).toBe(false);
    expect(delivery({ crons: ['0 6 * * 1'], observed24h: 0, observed7d: null }).judge).toBe(false);
    expect(delivery({ crons: ['*/5 * * * *'], observed24h: 6, observed7d: null }).judge).toBe(true);
    const none = delivery({ crons: [], observed24h: 0, observed7d: 0 });
    expect(none.judge).toBe(false);
    expect(none.reason).toMatch(/não julgado/);
    expect(none.belowHalf).toBe(false);
  });

  it('mede 80% como saudável e 20% como finding (mesmo cron, mesma janela)', () => {
    const ok = delivery({ crons: ['0 * * * *'], observed24h: 19, observed7d: 130 });
    expect(ok.belowHalf).toBe(false);
    const bad = delivery({ crons: ['0 * * * *'], observed24h: 5, observed7d: 42 });
    expect(bad.belowHalf).toBe(true);
  });
});

describe('cronDelivery — workflows reais', () => {
  const files = fs.readdirSync(WF).filter((f) => /\.ya?ml$/.test(f));

  it('todo workflow com schedule tem nominal > 0 (na semana, mesmo os semanais)', () => {
    const scheduled = files
      .map((f) => ({ file: f, crons: parseCrons(fs.readFileSync(path.join(WF, f), 'utf-8')) }))
      .filter((w) => w.crons.length > 0);
    expect(scheduled.length).toBeGreaterThanOrEqual(8);
    for (const w of scheduled) {
      const perWeek = expectedRuns(w.crons, NOW - WINDOW_HOURS_SLOW * 3600_000, NOW);
      expect(perWeek, `${w.file}: ${w.crons.join(' | ')}`).toBeGreaterThan(0);
      // E a decisão nunca fica por julgar por causa do ritmo.
      const d = evaluateCronDelivery({
        crons: w.crons,
        observed24h: 0,
        observed7d: 0,
        nowMs: NOW,
      });
      expect(d.judge, `${w.file} não julgado: ${d.reason}`).toBe(true);
    }
  });

  it('os crons do pipeline e dos monitores continuam a ser lidos', () => {
    const read = (f) => parseCrons(fs.readFileSync(path.join(WF, f), 'utf-8'));
    expect(read('update-data.yml')).toEqual(['17 * * * *', '47 * * * *']);
    expect(read('ih-health.yml')).toEqual(['0 * * * *']);
    expect(read('telegram-poll.yml')).toEqual(['*/5 * * * *']);
    expect(read('staleness-alert.yml')).toEqual(['7,37 * * * *']);
    expect(read('data-cadence-alert.yml')).toEqual(['12,42 * * * *']);
  });

  it('o cenário real de 2026-09-25 (grava-se o resultado da medição)', () => {
    const read = (f) => parseCrons(fs.readFileSync(path.join(WF, f), 'utf-8'));
    // Contagens observadas nesse dia (API): telegram-poll 6 em 24 h.
    const d = evaluateCronDelivery({
      crons: read('telegram-poll.yml'),
      observed24h: 6,
      observed7d: 45,
      nowMs: NOW,
    });
    expect(d.expected).toBe(288);
    expect(d.ratio).toBeLessThan(0.05);
    expect(d.belowHalf).toBe(true);
  });
});
