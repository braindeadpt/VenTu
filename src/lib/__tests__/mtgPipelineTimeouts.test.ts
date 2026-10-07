import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Guarda: o passo opcional do satélite MTG nunca pode pendurar o pipeline.
 *
 * 7 out 2026: o Data Tailor da EUMETSAT deixou de terminar e o passo
 * «Fetch MTG-I1 FCI frames» ficou pendurado em TODAS as runs até ao limite de
 * 30 min do job, que matava o job inteiro — nenhuma run publicou dados durante
 * mais de 5 h (conditions, previsões, radar). `continue-on-error: true` não
 * protege de um passo pendurado; o que protege é a ordem dos tempos:
 *
 *   janela do script  <  timeout-minutes do passo  <  timeout-minutes do job
 *
 * (o script chegou a esperar 40 min, mais do que o job).
 */
const root = process.cwd();
const workflow = readFileSync(path.join(root, '.github/workflows/update-data.yml'), 'utf8');
const script = readFileSync(path.join(root, 'scripts/fetch-mtg-ir.py'), 'utf8');

/** Texto do passo `- name: <name>` até ao passo seguinte. */
function stepBlock(name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start, `passo «${name}» existe no update-data.yml`).toBeGreaterThanOrEqual(0);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {6}- name: /);
  return next === -1 ? rest : rest.slice(0, next);
}

const MTG_STEP = 'Fetch MTG-I1 FCI frames (EUMETSAT Data Tailor)';

describe('passo MTG do update-data — não pode pendurar o pipeline', () => {
  const block = stepBlock(MTG_STEP);

  it('é opcional (continue-on-error) E tem timeout próprio', () => {
    expect(block).toMatch(/continue-on-error:\s*true/);
    expect(block, 'sem timeout-minutes o passo pendurado mata o job inteiro').toMatch(
      /timeout-minutes:\s*\d+/,
    );
  });

  it('o timeout do passo é menor que o do job', () => {
    const step = Number(block.match(/timeout-minutes:\s*(\d+)/)![1]);
    const job = Number(
      workflow.match(/update-conditions:[\s\S]*?\n {4}timeout-minutes:\s*(\d+)/)![1],
    );
    expect(step).toBeLessThan(job);
    // Folga para os passos que vêm depois (storm state, AQ, UV, commit…).
    expect(job - step).toBeGreaterThanOrEqual(10);
  });

  it('a janela total do script é menor que o timeout do passo', () => {
    const windowS = Number(script.match(/^WINDOW_TIMEOUT_S\s*=\s*(\d+)/m)![1]);
    const stepMin = Number(block.match(/timeout-minutes:\s*(\d+)/)![1]);
    expect(windowS).toBeLessThan(stepMin * 60);
  });

  it('não regressa à janela de 40 min (JOB_TIMEOUT_S * 4)', () => {
    expect(script).not.toMatch(/JOB_TIMEOUT_S\s*\*\s*4/);
  });
});
