/**
 * VenTu — Saúde do feed de notícias por fonte (`lastSeen` + aviso de silêncio)
 *
 * A saúde por região (`feed-health.js`) só acende quando já não há NENHUM item
 * pt, que é tarde: em 2026-11-15 a ANS parou a 02/11, as Notícias do Mar a
 * 06/11 e a FPS a 12/10, e a TTL de 7 dias (`merge-persist.js`) apagou os
 * últimos itens de cada uma antes de alguém notar — o feed pt chegou a zero.
 *
 * Este módulo guarda, por fonte, quando foi a última vez que ela publicou algo
 * que o pipeline viu (`lastSeen`) e avisa quando uma fonte passa N dias sem
 * entregar nada novo. O estado vive em `public/data/news-sources.json`, fora do
 * `news.json`, para **sobreviver à TTL** e a uma fonte temporariamente em baixo
 * — sem isso, o dia em que a fonte morre é exactamente o dia em que a memória
 * dela desaparece.
 *
 * N é por fonte (`staleAfterDays` no `FEEDS`), porque uma federação que publica
 * uma vez por mês não pode ter o mesmo prazo de um jornal diário.
 *
 * Nunca falha o job: qualquer erro de leitura/escrita é só um aviso no log.
 */

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '../../public/data/news-sources.json');
/** Prazo por omissão: 5 dias dá 2 dias de margem antes da TTL de 7. */
const DEFAULT_STALE_AFTER_DAYS = 5;
const TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Dias (fraccionários) desde `iso` até `now`; null se alguma data não prestar. */
function daysBetween(iso, now) {
  const seen = toDate(iso);
  const ref = toDate(now);
  if (!seen || !ref) return null;
  return (ref.getTime() - seen.getTime()) / DAY_MS;
}

/**
 * Lê o estado anterior. Ficheiro ausente ou ilegível → estado vazio (o
 * pipeline volta a aprender o `lastSeen` de cada fonte nesta corrida).
 */
function loadSourceHealth(statePath = STATE_PATH) {
  try {
    if (!fs.existsSync(statePath)) return { updatedAt: null, sources: {} };
    const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    return { updatedAt: data.updatedAt || null, sources: data.sources || {} };
  } catch (e) {
    console.warn(`  ⚠️ Estado de saúde das fontes ilegível (${e.message}) — a recomeçar.`);
    return { updatedAt: null, sources: {} };
  }
}

/**
 * Aplica os relatórios desta corrida ao estado anterior.
 *
 * `lastSeen` é **monotónico**: só avança, nunca recua. Uma fonte que responde
 * com o feed vazio, um 503 ou todos os itens filtrados mantém o `lastSeen` que
 * já tínhamos — é isso que distingue «não publicou» de «não conseguimos ver».
 *
 * Várias URLs podem alimentar a mesma fonte (Stab Mag tem 2, IKSURF tem 3): o
 * que interessa é quando a fonte falou pela última vez, não o feed.
 *
 * @param {{
 *   reports?: Array<{ source: string, url?: string, status?: string, lastSeen?: string|null, staleAfterDays?: number }>,
 *   previous?: { sources?: Record<string, object> },
 *   now?: Date|string,
 *   defaultStaleAfterDays?: number,
 * }} input
 * @returns {{ state: { updatedAt: string, sources: Record<string, object> } }}
 */
function buildSourceHealth({
  reports = [],
  previous = { sources: {} },
  now = new Date(),
  defaultStaleAfterDays = DEFAULT_STALE_AFTER_DAYS,
} = {}) {
  const ref = toDate(now) || new Date();
  const sources = { ...(previous.sources || {}) };

  const bySource = new Map();
  for (const report of reports || []) {
    if (!report || !report.source) continue;
    const group = bySource.get(report.source) || [];
    group.push(report);
    bySource.set(report.source, group);
  }

  for (const [source, group] of bySource) {
    const prior = sources[source] || {};
    const seen = group
      .map((r) => (toDate(r.lastSeen) ? new Date(r.lastSeen).toISOString() : null))
      .filter(Boolean)
      .sort();
    const seenNow = seen.length > 0 ? seen[seen.length - 1] : null;
    const lastSeen = [prior.lastSeen, seenNow].filter(Boolean).sort().pop() || null;

    const anyOk = group.some((r) => r.status === 'ok');
    const firstProblem = group.find((r) => r.status && r.status !== 'ok');
    const configuredWindow = group.find((r) => Number.isFinite(r.staleAfterDays));

    sources[source] = {
      lastSeen,
      lastCheckedAt: ref.toISOString(),
      // 'ok' = esta fonte entregou itens que passaram os filtros nesta corrida.
      // Caso contrário fica o motivo, que é o que o log mostra (fetch_failed,
      // empty_feed, filtered_out) sem apagar o lastSeen que já sabíamos.
      lastStatus: anyOk ? 'ok' : (firstProblem && firstProblem.status) || 'empty_feed',
      // O FEEDS manda quando diz alguma coisa (mudar o prazo no código tem de
      // valer logo, sem esperar que o estado antigo seja limpo à mão).
      staleAfterDays:
        (configuredWindow && configuredWindow.staleAfterDays) ??
        prior.staleAfterDays ??
        defaultStaleAfterDays,
      urls: [...new Set(group.map((r) => r.url).filter(Boolean))],
    };
  }

  return { state: { updatedAt: ref.toISOString(), sources } };
}

/**
 * Fontes que passaram `staleAfterDays` sem publicar nada que o pipeline tenha
 * visto. Fontes sem `lastSeen` conhecido não são acusadas (não há como saber).
 *
 * @param {{ state?: { sources?: Record<string, object> }, now?: Date|string }} input
 * @returns {Array<{ source: string, lastSeen: string, days: number, staleAfterDays: number, daysBeforeTtl: number }>}
 */
function staleSources({ state = { sources: {} }, now = new Date() } = {}) {
  const ref = toDate(now) || new Date();
  const out = [];

  for (const [source, info] of Object.entries(state.sources || {})) {
    if (!info || !info.lastSeen) continue;
    const days = daysBetween(info.lastSeen, ref);
    if (days === null) continue;
    const limit = Number.isFinite(info.staleAfterDays) ? info.staleAfterDays : DEFAULT_STALE_AFTER_DAYS;
    if (days <= limit) continue;
    out.push({
      source,
      lastSeen: new Date(info.lastSeen).toISOString(),
      days: Math.floor(days),
      staleAfterDays: limit,
      // Quanto falta até a TTL apagar o último item desta fonte (pode ser ≤ 0).
      daysBeforeTtl: Math.round((TTL_DAYS - days) * 10) / 10,
    });
  }

  return out.sort((a, b) => b.days - a.days);
}

/** «ANS            há 13 d (último 2026-11-02) · fetch_failed» — uma linha por fonte. */
function formatSourceHealth(state, now = new Date()) {
  const entries = Object.entries(state.sources || {})
    .map(([source, info]) => ({ source, ...info }))
    .sort((a, b) => String(a.lastSeen || '').localeCompare(String(b.lastSeen || '')));

  if (entries.length === 0) return ['📋 Fontes: nenhuma observação registada ainda.'];

  const lines = ['📋 Fontes (último item visto por fonte):'];
  for (const entry of entries) {
    const days = daysBetween(entry.lastSeen, now);
    const quando = days === null ? 'sem data' : `há ${Math.floor(days)} d (último ${String(entry.lastSeen).slice(0, 10)})`;
    lines.push(`   ${String(entry.source).padEnd(16)} ${quando} · ${entry.lastStatus || '?'}`);
  }
  return lines;
}

/**
 * Actualiza o estado, escreve-o e emite um `::warning::` por fonte silenciosa.
 *
 * @param {{
 *   reports?: Array<object>,
 *   statePath?: string,
 *   now?: Date|string,
 *   log?: (...args: unknown[]) => void,
 *   defaultStaleAfterDays?: number,
 * }} input
 * @returns {{ state: object, stale: Array<object>, written: boolean, path: string }}
 */
function reportSourceHealth({
  reports = [],
  statePath = STATE_PATH,
  now = new Date(),
  log = console.log,
  defaultStaleAfterDays = DEFAULT_STALE_AFTER_DAYS,
} = {}) {
  const previous = loadSourceHealth(statePath);

  // Corrida em que a Etapa 1 nem chegou a correr: não há nada a aprender, e
  // reescrever o estado marcaria todas as fontes como «vistas agora».
  if (!reports || reports.length === 0) {
    log('   → Saúde por fonte: sem relatórios nesta corrida, estado mantido.');
    return { state: previous, stale: staleSources({ state: previous, now }), written: false, path: statePath };
  }

  const { state } = buildSourceHealth({ reports, previous, now, defaultStaleAfterDays });
  const stale = staleSources({ state, now });

  for (const line of formatSourceHealth(state, now)) log(`   ${line}`);

  for (const entry of stale) {
    const ttl =
      entry.daysBeforeTtl > 0
        ? `a TTL de 7 dias apaga o último item em ${entry.daysBeforeTtl} dia(s)`
        : 'o último item desta fonte já saiu do feed pela TTL de 7 dias';
    log(
      `::warning::Notícias: fonte «${entry.source}» sem itens novos há ${entry.days} dias ` +
        `(último item ${entry.lastSeen.slice(0, 10)}, limite ${entry.staleAfterDays} d) — ${ttl}.`,
    );
  }

  let written = false;
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    written = true;
    log(`   → Estado por fonte escrito em ${statePath}`);
  } catch (e) {
    log(`   ⚠️ Saúde por fonte: não consegui escrever ${statePath} — ${e.message}`);
  }

  return { state, stale, written, path: statePath };
}

module.exports = {
  STATE_PATH,
  DEFAULT_STALE_AFTER_DAYS,
  TTL_DAYS,
  daysBetween,
  loadSourceHealth,
  buildSourceHealth,
  staleSources,
  formatSourceHealth,
  reportSourceHealth,
};
