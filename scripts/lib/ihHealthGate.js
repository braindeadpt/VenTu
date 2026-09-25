/**
 * Gate do `ih-health.yml` — num ping do keep-alive, sondar IH/IPMA só quando
 * o pipeline está atrasado.
 *
 * Contexto: o `repository_dispatch(ping)` do cron externo é entregue a TODOS
 * os workflows que o declaram (docs/EXTERNAL-KEEPALIVE.md), incluindo este
 * monitor. Enquanto o pipeline ressuscita de verdade (update-data) ou é
 * barato (heartbeats que só lêem um ficheiro), aqui um ping faz sempre duas
 * sondagens HTTP a terceiros (IH `tide_obs_nrt/items` + manifest/PNG do radar
 * IPMA) — trabalho de rede que duplica a cadência horária do monitor e a
 * sondagem de radar do data-cadence-alert (cada 30 min). Num sistema saudável
 * o ping passa a ser um no-op: o gate só abre quando há motivo para olhar.
 *
 * Definição de «atrasado»: a MESMA dos dois heartbeats
 * (`pipelineStaleness.js` / `dataCadence.js` — 3 h dia / 5 h noite). Não se
 * inventa um terceiro limiar: um sinal que é «stale» para o alerta é «stale»
 * para o gate, e vice-versa, portanto os dois nunca se contradizem.
 *
 * O gate NÃO é a única via de sonda: o `schedule` horário continua a sondar
 * sempre (é a cadência do monitor) e o data-cadence-alert sonda o radar a
 * cada 30 min. O gate fecha apenas o caminho do ping.
 *
 * Abre a sonda quando QUALQUER um destes se verifica:
 *   1. o trigger não é um ping (schedule / workflow_dispatch) — cadência normal;
 *   2. `IH_HEALTH_FORCE=1` (escape hatch de ops / simulações);
 *   3. há um incidente aberto (`ih-outage` / `ipma-radar-outage`) — sem isto
 *      a recuperação nunca seria detectada e a issue ficava aberta para sempre;
 *   4. o `pipeline-meta.json` do checkout está atrasado (ou em falta/ilegível);
 *   5. o último commit de `public/data/**` está atrasado.
 *
 * Fail-open deliberado: se um dos sinais não puder ser medido (API de commits
 * indisponível) decide-se pelos outros; se NENHUM puder ser medido, sonda-se —
 * duplicar uma sonda é barato, ficar cego durante uma outage não é.
 */

const { evaluatePipelineStaleness } = require('./pipelineStaleness');
const { evaluateDataCadence } = require('./dataCadence');

/** Triggers em que o gate se aplica (o ping do keep-alive externo). */
const GATED_TRIGGERS = ['repository_dispatch'];

/**
 * @typedef {object} IhHealthGateInput
 * @property {string} [eventName] GitHub event (`GITHUB_EVENT_NAME`)
 * @property {object | null} [meta] `public/data/pipeline-meta.json`
 * @property {number | null} [lastCommitAtMs] committer date do último commit de `public/data/**`
 * @property {boolean} [openIncidents] existe incidente aberto (ih-outage / ipma-radar-outage)
 * @property {boolean} [force] sonda sempre (`IH_HEALTH_FORCE=1`)
 * @property {number} [nowMs]
 * @property {{ dayHours?: number; nightHours?: number }} [opts] limiares (testes)
 */

/**
 * @param {IhHealthGateInput} [input]
 * @returns {{
 *   probe: boolean;
 *   gated: boolean;
 *   reason: string;
 *   signals: string[];
 *   metaStaleness: ReturnType<typeof evaluatePipelineStaleness>;
 *   dataCadence: ReturnType<typeof evaluateDataCadence>;
 * }}
 */
function evaluateIhHealthGate(input = {}) {
  const {
    eventName = '',
    meta = null,
    lastCommitAtMs = null,
    openIncidents = false,
    force = false,
    nowMs = Date.now(),
    opts = {},
  } = input;

  const gated = GATED_TRIGGERS.includes(eventName);

  // Estado real do pipeline, pelas duas métricas dos heartbeats (puro e barato:
  // calculado sempre, para aparecer no log mesmo quando outro motivo abre a
  // sonda — um gate que esconde o estado que mediu não serve para diagnosticar).
  const metaStaleness = evaluatePipelineStaleness(meta, nowMs, opts);
  const dataCadence = evaluateDataCadence(lastCommitAtMs, nowMs, opts);

  const signals = [];
  const staleReasons = [];

  if (metaStaleness.stale) {
    const age = metaStaleness.fullAgeHours ?? metaStaleness.obsAgeHours;
    const ageText = age === null ? 'sem timestamps' : `${age.toFixed(1)} h`;
    signals.push('pipeline-meta');
    staleReasons.push(
      `pipeline-meta.json atrasado (${ageText} > ${metaStaleness.thresholdHours} h ${metaStaleness.isDaytime ? 'dia' : 'noite'})`,
    );
  }

  if (dataCadence.unknown) {
    // Não é motivo para sondar (o meta decide) — mas fica visível no log.
    signals.push('data-commit-desconhecido');
  } else if (dataCadence.stale) {
    signals.push('data-commit');
    staleReasons.push(
      `último commit de public/data há ${dataCadence.ageHours.toFixed(1)} h (limiar ${dataCadence.thresholdHours} h)`,
    );
  }

  const result = (probe, reason) => ({
    probe,
    gated,
    reason,
    signals,
    metaStaleness,
    dataCadence,
  });

  // 1. Cadência normal (schedule) e dispatch manual: sonda sempre. O gate
  //    existe para o ping, que é o caminho que duplica sondagens.
  if (!gated) {
    return result(true, `trigger "${eventName || 'desconhecido'}" fora do gate — cadência normal do monitor`);
  }

  // 2. Escape hatch de ops / simulações.
  if (force) {
    return result(true, 'IH_HEALTH_FORCE=1 — sonda forçada');
  }

  // 3. Incidente aberto: o monitor tem de poder fechá-lo na recuperação.
  if (openIncidents) {
    const extra = staleReasons.length > 0 ? ` · pipeline também atrasado: ${staleReasons.join(' · ')}` : '';
    return result(
      true,
      `incidente aberto (ih-outage / ipma-radar-outage) — sonda necessária para detectar a recuperação${extra}`,
    );
  }

  // 4/5. Só com o pipeline atrasado é que o ping abre a sonda.
  if (staleReasons.length > 0) {
    return result(true, `ping com pipeline atrasado — ${staleReasons.join(' · ')}`);
  }

  const metaAge =
    metaStaleness.fullAgeHours === null ? '—' : `${metaStaleness.fullAgeHours.toFixed(1)} h`;
  const commitAge = dataCadence.unknown ? '— (API indisponível)' : `${dataCadence.ageHours.toFixed(1)} h`;
  return result(
    false,
    `ping com pipeline saudável (pipeline-meta ${metaAge} · último commit de dados ${commitAge}) — sonda IH/IPMA saltada`,
  );
}

module.exports = { GATED_TRIGGERS, evaluateIhHealthGate };
