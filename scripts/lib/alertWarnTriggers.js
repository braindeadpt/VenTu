/**
 * B4 — gatilho de AVISO para alertas de utilizador (independente do score).
 *
 * Um favorito dispara alerta de segurança quando tem aviso oficial activo,
 * mesmo sem condições boas:
 *   - IPMA: aviso orange|red em `spotWarnings[spotId]` (qualquer tipo — os
 *     níveis IPMA são risco oficial; o tipo vai explícito na linha);
 *   - IH: aviso à navegação da faixa §0 — perigo físico para quem está na
 *     água (port directo de src/lib/verdict/navWarningSafety.ts);
 *   - NHC: spot dentro do cone de incerteza oficial (`storms.json › spotStorms`).
 *
 * Avisos amarelos IPMA e avisos IH de sinalização NÃO disparam — o
 * utilizador pediu avisos reais, não ruído (amarelos são comuns; um aviso
 * «boia apagada» não é perigo para banhistas).
 *
 * @see docs/STORM-STUDY.md §B4
 */

// ── Faixa §0 (perigo real para quem está na água) — port de navWarningSafety.ts
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const FLOATING_HAZARD_RE = /(submers|deriva|naufrag|contentor)/;
const OBJECT_RE = /obje[ct]+o/;
const FLOATING_STATE_RE = /(deriva|flutuant)/;
const CLIFF_RE = /(arriba|falesia|derroc|desmoron|abatimento)/;
const INTERDICTION_RE = /(interdi|restric|proibi)/;
const VESSEL_ONLY_RE = /(fundear|pairar)/;
const MILITARY_RE = /(militar|artilharia|\btiros?\b|fogo real|explosiv|\bminas?\b)/;
const POLLUTION_RE = /(poluic|derram|hidrocarbonet|mare negra)/;
const RESCUE_RE = /(busca|operacao de salvamento|salvamento em curso|rescue|\bsar\b)/;

/**
 * true = o aviso costeiro/local é perigo físico para quem está na água.
 * Idêntico ao classificador da faixa §0 do spot page — um alerta de
 * utilizador nunca dispara com avisos que a UI considera informativos.
 */
function isSafetyNavWarning(w) {
  if (!w || w.collection === 'orca_anavnet_point') return false;
  const cat = norm(w.category);
  if (!cat) return false;
  if (FLOATING_HAZARD_RE.test(cat)) return true;
  if (OBJECT_RE.test(cat) && FLOATING_STATE_RE.test(cat)) return true;
  if (CLIFF_RE.test(cat)) return true;
  if (INTERDICTION_RE.test(cat) && !VESSEL_ONLY_RE.test(cat)) return true;
  if (MILITARY_RE.test(cat)) return true;
  if (POLLUTION_RE.test(cat)) return true;
  return RESCUE_RE.test(cat);
}

// ── Triggers por fonte ────────────────────────────────────────────────

const TRIGGER_LEVELS = new Set(['orange', 'red']);

/**
 * Avisos IPMA laranja/vermelho activos sobre o spot.
 * @param {{ spotWarnings?: Record<string, Array<object>> } | null | undefined} data warnings.json
 * @param {string} spotId
 */
function ipmaWarningTriggers(data, spotId) {
  const list = data?.spotWarnings?.[spotId];
  if (!Array.isArray(list)) return [];
  return list
    .filter((w) => w && TRIGGER_LEVELS.has(w.level))
    .map((w) => ({
      kind: 'ipma',
      level: w.level,
      type: w.type,
      areaLabel: w.areaLabel,
      text: w.text,
      startTime: w.startTime,
      endTime: w.endTime,
    }));
}

/**
 * Avisos IH (costeiros + locais) da faixa §0 que cobrem o spot.
 * @param {{ warnings?: Array<object>, coverage?: Record<string, Array<number>> } | null | undefined} data ih-coastal-warnings.json
 * @param {string} spotId
 */
function ihSafetyTriggers(data, spotId) {
  const ids = data?.coverage?.[spotId];
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const byId = new Map((data.warnings || []).map((w) => [w.id, w]));
  return ids
    .map((id) => byId.get(id))
    .filter((w) => w && isSafetyNavWarning(w))
    .map((w) => ({ kind: 'ih', ref: w.ref, category: w.category }));
}

/**
 * Tempestades tropicais cujo cone oficial cobre o spot (NHC).
 * @param {{ spotStorms?: Record<string, Array<object>> } | null | undefined} data storms.json
 * @param {string} spotId
 */
function nhcStormTriggers(data, spotId) {
  const hits = data?.spotStorms?.[spotId];
  if (!Array.isArray(hits)) return [];
  return hits
    .filter((s) => s && s.name)
    .map((s) => ({
      kind: 'nhc',
      name: s.name,
      classificationLabel: s.classificationLabel,
      centerDistKm: s.centerDistKm,
      movementDirDeg: s.movementDirDeg,
      movementSpeedMph: s.movementSpeedMph,
    }));
}

/**
 * Todos os triggers de aviso activos para um spot — a entrada única do
 * evaluator. Fontes em falta degradam para [] (nunca inventa).
 * @param {{ warnings?: object, coastal?: object, storms?: object }} sources
 * @param {string} spotId
 */
function warningTriggersForSpot(sources, spotId) {
  const s = sources || {};
  return [
    ...ipmaWarningTriggers(s.warnings, spotId),
    ...ihSafetyTriggers(s.coastal, spotId),
    ...nhcStormTriggers(s.storms, spotId),
  ];
}

// ── Linhas para email / Telegram ──────────────────────────────────────

const LEVEL_LABEL = {
  red: { pt: 'vermelho', en: 'red' },
  orange: { pt: 'laranja', en: 'orange' },
  yellow: { pt: 'amarelo', en: 'yellow' },
};

/**
 * Linha compacta de UM trigger (Telegram / itens do email).
 * @param {object} trigger
 * @param {boolean} isPt
 */
function triggerLine(trigger, isPt) {
  if (!trigger) return '';
  const loc = isPt ? 'pt' : 'en';
  if (trigger.kind === 'ipma') {
    const level = LEVEL_LABEL[trigger.level]?.[loc] || trigger.level;
    const area = trigger.areaLabel ? ` — ${trigger.areaLabel}` : '';
    return isPt
      ? `⚠️ Aviso ${level} — ${trigger.type}${area}`
      : `⚠️ ${level} warning — ${trigger.type}${area}`;
  }
  if (trigger.kind === 'ih') {
    const ref = trigger.ref || '';
    const cat = trigger.category ? ` — ${trigger.category}` : '';
    return isPt
      ? `⚠️ Perigo na água (IH): ${ref}${cat}`
      : `⚠️ In-water hazard (IH): ${ref}${cat}`;
  }
  if (trigger.kind === 'nhc') {
    const cls = trigger.classificationLabel || '';
    return isPt
      ? `🌀 ${trigger.name}${cls ? ` — ${cls}` : ''}: spot no cone de incerteza oficial (NOAA/NHC)`
      : `🌀 ${trigger.name}${cls ? ` — ${cls}` : ''}: spot inside the official uncertainty cone (NOAA/NHC)`;
  }
  return '';
}

/**
 * Linha de EMAIL de um trigger — a compacta + texto oficial IPMA quando
 * existe (mesmo padrão do «Mar perigoso»: área + texto da fonte).
 * @param {object} trigger
 * @param {boolean} isPt
 */
function triggerEmailLine(trigger, isPt) {
  const base = triggerLine(trigger, isPt);
  if (trigger?.kind === 'ipma' && trigger.text) return `${base}: ${trigger.text}`;
  return base;
}

/**
 * Linhas de um spot com triggers — uma por trigger, ordenadas por
 * severidade implícita (IPMA já vem ordenado red>orange pelo payload).
 * @param {Array<object>} triggers
 * @param {boolean} isPt
 * @param {'compact'|'email'} variant
 */
function triggerLines(triggers, isPt, variant = 'compact') {
  const fn = variant === 'email' ? triggerEmailLine : triggerLine;
  return (triggers || []).map((t) => fn(t, isPt)).filter(Boolean);
}

module.exports = {
  isSafetyNavWarning,
  ipmaWarningTriggers,
  ihSafetyTriggers,
  nhcStormTriggers,
  warningTriggersForSpot,
  triggerLine,
  triggerEmailLine,
  triggerLines,
};
