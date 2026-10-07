/**
 * Testes do guard de orçamento do histórico de dados (auditoria M8).
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { evaluateDataBudget, BUDGET, GROUP_BUDGETS } = require('../../check-data-history-budget.js');

const files = (n) => Array.from({ length: n }, (_, i) => `public/data/f${i}.json`);

describe('check-data-history-budget', () => {
  it('passa dentro do orçamento', () => {
    const { violations, files: count } = evaluateDataBudget({
      files: files(10),
      sizes: files(10).map(() => 1024),
    });
    expect(violations).toEqual([]);
    expect(count).toBe(10);
  });

  it('falha quando o número de ficheiros excede o tecto', () => {
    const { violations } = evaluateDataBudget({
      files: files(BUDGET.maxFiles + 1),
      sizes: files(BUDGET.maxFiles + 1).map(() => 1),
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/ficheiros trackeados/);
  });

  it('falha quando o total de bytes excede o tecto', () => {
    const { violations } = evaluateDataBudget({
      files: ['public/data/big.bin'],
      sizes: [BUDGET.maxBytes + 1],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/MB trackeados/);
  });

  it('acumula as duas violações quando ambas falham', () => {
    const big = files(BUDGET.maxFiles + 1);
    const { violations } = evaluateDataBudget({ files: big, sizes: big.map(() => BUDGET.maxBytes) });
    expect(violations).toHaveLength(2);
  });
});

describe('check-data-history-budget — sub-orçamento sat-mtg/frames', () => {
  const mtg = GROUP_BUDGETS.find((g) => g.label === 'sat-mtg/frames');
  const frames = (n) => Array.from({ length: n }, (_, i) => `public/data/sat-mtg/frames/ir-${i}.webp`);

  it('existe e é mais apertado que o tecto global', () => {
    expect(mtg).toBeDefined();
    expect(mtg.maxBytes).toBeLessThan(BUDGET.maxBytes);
    expect(mtg.maxFiles).toBeLessThan(BUDGET.maxFiles);
  });

  it('passa com a janela de retenção completa (12 frames ~0.3 MB)', () => {
    const f = frames(12);
    const { violations } = evaluateDataBudget({ files: f, sizes: f.map(() => 310 * 1024) });
    expect(violations).toEqual([]);
  });

  it('falha quando os frames acumulam além da retenção, mesmo dentro do tecto global', () => {
    const f = frames(13);
    const { violations } = evaluateDataBudget({ files: f, sizes: f.map(() => 1024) });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/sat-mtg\/frames/);
  });

  it('falha quando os frames pesam demais (regressão de qualidade WebP)', () => {
    const f = frames(12);
    const { violations } = evaluateDataBudget({ files: f, sizes: f.map(() => 820 * 1024) });
    expect(violations.some((v) => /MB em public\/data\/sat-mtg\/frames/.test(v))).toBe(true);
  });

  it('o manifest sat-mtg.json não conta para o sub-orçamento dos frames', () => {
    const f = [...frames(12), 'public/data/sat-mtg.json'];
    const { violations } = evaluateDataBudget({ files: f, sizes: f.map(() => 1024) });
    expect(violations).toEqual([]);
  });
});
