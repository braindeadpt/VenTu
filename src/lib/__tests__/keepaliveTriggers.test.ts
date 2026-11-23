import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Contrato do keep-alive externo (docs/EXTERNAL-KEEPALIVE.md).
 *
 * O scheduler do GitHub é best-effort: as execuções nominais medidas em
 * 21–24/09 mostram a entrega a cair para 2–23% em alguns crons (Telegram
 * Link Poll 2%, Pipeline Staleness Alert 12%, Data Cadence Alert 12%, IH
 * Tide Health Monitor 23%). O `update-data.yml` já aceitava
 * `repository_dispatch(ping)` de um cron externo (cron-job.org) — e é isso
 * que faz a cadência não depender do GitHub.
 *
 * Os MONITORES ficaram de fora desse contrato: se o GitHub não os entregava,
 * ninguém vigiava o pipeline precisamente quando o scheduler falhava. Agora
 * declaram o MESMO `types: [ping]`: um único POST do cron externo acorda
 * todos os workflows que o declaram, portanto o mesmo keep-alive que
 * ressuscita o pipeline ressuscita também os seus vigilantes, sem qualquer
 * reconfiguração do lado externo.
 *
 * Este guarda prende a lista: um monitor novo (ou um `schedule` que volte a
 * ser a única via) falha aqui em vez de depender em silêncio do scheduler.
 * Os `schedule:` continuam presentes de propósito — o ping é ADITIVO, nunca
 * substitui a cadência normal do GitHub (os dois triggers falham de forma
 * independente).
 */
const ROOT = join(__dirname, '..', '..', '..');

const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

/** Piso do bloco `on:` — até ao primeiro bloco de topo que o segue. */
function onBlock(src: string): string {
  const yml = src.replace(/\r\n/g, '\n');
  const start = yml.search(/^on:/m);
  expect(start, 'workflow sem bloco `on:`').toBeGreaterThan(-1);
  const rest = yml.slice(start);
  const end = rest.search(/^(permissions|concurrency|env|jobs|defaults):/m);
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * O pipeline + os monitores que partilham o keep-alive externo.
 * `evaluate-alerts.yml` é o workflow único de alertas+Telegram: o poll de
 * /start é um passo do mesmo job, antes da avaliação (o antigo
 * telegram-poll.yml separado foi fundido — dois workflows no mesmo ping
 * liam o offset partilhado em corrida).
 */
const KEEPALIVE_WORKFLOWS: string[] = [
  'update-data.yml',
  'staleness-alert.yml',
  'data-cadence-alert.yml',
  'ih-health.yml',
  'evaluate-alerts.yml',
];

describe('keep-alive externo (repository_dispatch ping)', () => {
  it.each(KEEPALIVE_WORKFLOWS)('%s aceita repository_dispatch(ping)', (file) => {
    const on = onBlock(read(join('.github', 'workflows', file)));
    expect(on, `${file}: sem repository_dispatch`).toMatch(/repository_dispatch:/);
    expect(on, `${file}: sem types: [ping]`).toMatch(/types:\s*\[\s*ping\s*\]/);
  });

  it.each(KEEPALIVE_WORKFLOWS)('%s mantém o schedule (o ping é aditivo)', (file) => {
    const on = onBlock(read(join('.github', 'workflows', file)));
    expect(on, `${file}: schedule removido — o ping não o substitui`).toMatch(
      /^\s*schedule:/m,
    );
  });

  it('o ping NÃO é o único gatilho do update-data (crons :17/:47 preservados)', () => {
    const on = onBlock(read(join('.github', 'workflows', 'update-data.yml')));
    expect(on).toMatch(/cron:\s*'17 \* \* \* \*'/);
    expect(on).toMatch(/cron:\s*'47 \* \* \* \*'/);
  });

  it('os monitores continuam a aceitar workflow_dispatch (ops manual)', () => {
    for (const file of KEEPALIVE_WORKFLOWS) {
      const on = onBlock(read(join('.github', 'workflows', file)));
      expect(on, `${file}: sem workflow_dispatch`).toMatch(/workflow_dispatch:/);
    }
  });

  it('o poll de /start vive num só workflow e corre ANTES da avaliação', () => {
    // Dois workflows separados acordados pelo mesmo ping liam o offset
    // partilhado do Supabase em corrida («Ligado ✅» + «Link inválido» na
    // mesma mensagem) e a avaliação podia escolher canais antes da ligação
    // concluir. O poll é agora um passo do evaluate-alerts.yml, sempre
    // antes do passo de avaliação.
    const wf = join('.github', 'workflows');
    const all = readdirSync(join(ROOT, wf)).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
    const callers = all.filter((f) => read(join(wf, f)).includes('telegram:poll'));
    expect(callers, 'telegram:poll deve ter um único dono').toEqual(['evaluate-alerts.yml']);

    // Os dois passos têm de viver no MESMO job — comparar posições no
    // ficheiro inteiro deixaria passar dois jobs independentes (a avaliação
    // num segundo job podia correr em paralelo, sem ordem).
    const src = read(join(wf, 'evaluate-alerts.yml'));
    const afterJobs = src.slice(src.indexOf('jobs:'));
    const jobStart = afterJobs.search(/^  alerts:/m);
    expect(jobStart, 'job `alerts` em falta').toBeGreaterThan(-1);
    const rest = afterJobs.slice(jobStart + 1);
    const nextJob = rest.search(/^  [A-Za-z0-9_-]+:/m);
    const job = nextJob === -1 ? rest : rest.slice(0, nextJob);
    const pollIdx = job.indexOf('telegram:poll');
    const evalIdx = job.indexOf('alerts:evaluate');
    expect(pollIdx, 'passo do poll fora do job `alerts`').toBeGreaterThan(-1);
    expect(evalIdx, 'passo de avaliação fora do job `alerts` ou antes do poll').toBeGreaterThan(pollIdx);
    // Os alertas por email nunca dependem do bot: a avaliação corre mesmo se
    // o poll for saltado (sem secrets) ou falhar.
    expect(job.slice(pollIdx)).toMatch(/if:\s*always\(\)/);
    // E o teto tem de estar no PASSO do poll — um `timeout-minutes` ao nível
    // do job não reserva tempo para a avaliação.
    const stepStart = job.indexOf('- name: Poll Telegram');
    const nextStep = job.slice(stepStart + 1).search(/^      -\s/m);
    const pollStep =
      nextStep === -1 ? job.slice(stepStart) : job.slice(stepStart, stepStart + 1 + nextStep);
    // A chave tem de estar ativa e com valor — `/timeout-minutes/` solto
    // também casava uma linha comentada.
    expect(pollStep, 'passo do poll sem timeout-minutes ativo').toMatch(
      /^\s+timeout-minutes:\s*\d+/m,
    );
  });
});
