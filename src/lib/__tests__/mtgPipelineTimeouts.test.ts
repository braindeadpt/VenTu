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

describe('passo MTG do update-data — nunca bloqueia os dados centrais', () => {
  const idx = (name: string) => {
    const i = workflow.indexOf(`- name: ${name}`);
    expect(i, `passo «${name}» existe`).toBeGreaterThanOrEqual(0);
    return i;
  };

  it('corre DEPOIS de «Update Conditions» e do upload do artefacto central', () => {
    const mtg = idx(MTG_STEP);
    expect(mtg).toBeGreaterThan(idx('Update Conditions (Open-Meteo)'));
    expect(mtg).toBeGreaterThan(idx('Upload fresh data artifact'));
  });

  it('tem orçamento: salta o MTG se o job já gastou demasiado tempo', () => {
    const gate = stepBlock('MTG budget gate');
    const budget = Number(gate.match(/-lt\s+(\d+)/)![1]);
    const stepMin = Number(stepBlock(MTG_STEP).match(/timeout-minutes:\s*(\d+)/)![1]);
    const job = Number(
      workflow.match(/update-conditions:[\s\S]*?\n {4}timeout-minutes:\s*(\d+)/)![1],
    );
    // pior caso: orçamento + passo + ~2 min de upload < limite do job
    expect(budget + stepMin * 60 + 120).toBeLessThan(job * 60);
    expect(stepBlock(MTG_STEP)).toMatch(/steps\.mtgbudget\.outputs\.ok == 'true'/);
  });

  it('o relógio do job arranca antes do checkout', () => {
    expect(idx('Job clock')).toBeLessThan(idx('Checkout'));
  });

  it('os frames MTG seguem em artefacto próprio, aplicado no commit-and-push', () => {
    expect(stepBlock('Upload MTG frames artifact')).toMatch(/name:\s*ventu-mtg/);
    const dl = stepBlock('Download MTG frames artifact (optional)');
    expect(dl, 'sem artefacto MTG o commit-and-push não pode falhar').toMatch(
      /continue-on-error:\s*true/,
    );
  });

  it('o update-conditions não descarrega o histórico git inteiro', () => {
    const job = workflow.match(/update-conditions:[\s\S]*?- name: Schedule gate/)![0];
    expect(job).toMatch(/^\s+fetch-depth:\s*1\s*$/m);
    expect(job).not.toMatch(/^\s+fetch-depth:\s*0\s*$/m);
  });
});
