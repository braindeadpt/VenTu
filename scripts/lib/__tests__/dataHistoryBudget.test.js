/**
 * Testes do guard de orçamento do histórico de dados (auditoria M8).
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { evaluateDataBudget, BUDGET } = require('../../check-data-history-budget.js');

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
