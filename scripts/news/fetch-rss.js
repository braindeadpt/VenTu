/**
 * VenTu — RSS Feed Fetcher (Etapa 1)
 *
 * Fetches articles from configured RSS feeds, parses XML, normalises
 * fields, applies spam filter, and returns clean NewsItem stubs.
 *
 * No LLM here — pure deterministic fetch + parse + filter.
 */

const { canDiscard, isSafeHttpUrl } = require('./spam-filter');
const { applyCategoryKeywords } = require('./category-keywords');
// Sanitização partilhada (descodificação numa só passagem + garantia «sem
// `<`/`>`») — ver scripts/lib/sanitizeText.js e o porquê em cada alerta do
// CodeQL que a motivou (js/double-escaping, js/incomplete-multi-character-*).
const { stripTags } = require('../lib/sanitizeText');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Feed configuration: source → category hint + region */
const FEEDS = [
  // ── Portugal (Cena PT) ──
  { url: 'https://www.ansurfistas.com/feed/',           source: 'ANS',              defaultCategory: 'surf',       sourceRegion: 'pt' },
  { url: 'https://www.noticiasdomar.pt/feed/',          source: 'Notícias do Mar',  defaultCategory: 'general',  sourceRegion: 'pt' },
  { url: 'https://www.fps.pt/feed/',                    source: 'FPS',              defaultCategory: 'surf',       sourceRegion: 'pt' },
  // Surftotal: a /feed e a /rss do WordPress dão 404; o feed do arquivo de
  // notícias é este (?format=feed). Imprensa nacional, por isso a fonte toda
  // é `pt` — o feed mistura peças internacionais, mas isso é da linha
  // editorial do jornal, não uma classificação nossa por item.
  { url: 'https://www.surftotal.com/noticias?format=feed', source: 'Surftotal',     defaultCategory: 'surf',       sourceRegion: 'pt' },
  // ── Internacional ──
  { url: 'https://stabmag.com/feed/',             source: 'Stab Mag',    defaultCategory: 'surf',       sourceRegion: 'intl' },
  { url: 'https://stabmag.com/category/news/feed/', source: 'Stab Mag',    defaultCategory: 'surf',       sourceRegion: 'intl' },
  { url: 'https://www.iksurfmag.com/feed/',        source: 'IKSURF Mag',  defaultCategory: 'kitesurf',   sourceRegion: 'intl' },
  { url: 'https://www.iksurfmag.com/category/kitesurfing/feed/', source: 'IKSURF Mag', defaultCategory: 'kitesurf', sourceRegion: 'intl' },
  { url: 'https://www.iksurfmag.com/category/windsurfing/feed/', source: 'IKSURF Mag', defaultCategory: 'windsurf', sourceRegion: 'intl' },
  { url: 'https://www.surfd.com/feed/',            source: 'SURFD',       defaultCategory: 'surf',       sourceRegion: 'intl' },
  // Wakeboard (nicho — único RSS estável encontrado em 2026-05-25)
  { url: 'https://www.alliancewake.com/feed/',     source: 'Alliance Wake', defaultCategory: 'wakeboard', sourceRegion: 'intl' },
];

/**
 * As entidades e o strip de tags vivem em `scripts/lib/sanitizeText.js`
 * (descodificação numa só passagem + contrato «sem `<`/`>`»), partilhado com
 * o `evaluate-alerts.js`. Ver os testes em `lib/__tests__/sanitizeText.test.js`.
 */

/**
 * Extract text from an RSS field (handles CDATA and regular content).
 *
 * Order matters (H1): tags are stripped BEFORE entities are decoded, and
 * stripped AGAIN after. Decoding first — or only once, after the strip —
 * lets a hostile feed smuggle markup through as `&lt;/script&gt;&lt;img …&gt;`,
 * which becomes live HTML once JSON-LD serialises the string into a
 * `<script>` block. Text is never allowed to leave this function containing a
 * `<` or `>`.
 */
function extractField(itemXml, fieldName) {
  const cdataR = new RegExp(`<${fieldName}[\\s\\S]*?>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${fieldName}>`);
  const m = itemXml.match(cdataR);
  if (m) return stripTags(m[1]);

  const plainR = new RegExp(`<${fieldName}[\\s\\S]*?>([\\s\\S]*?)</${fieldName}>`);
  const m2 = itemXml.match(plainR);
  if (m2) return stripTags(m2[1]);

  return '';
}

/**
 * Normalise a pubDate to ISO string. Returns null on failure.
 */
function normaliseDate(pubDate) {
  if (!pubDate) return null;
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Check if the item is too old (> 7 days).
 */
function isTooOld(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return false;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return d.getTime() < weekAgo;
}

/** Razões possíveis para um item do feed não entrar na fila. */
const DROP_REASONS = ['invalidos', 'spam', 'idade', 'duplicados'];

/** «2 idade, 1 spam» — para o log e para o detalhe do relatório. */
function summariseDrops(dropped) {
  return DROP_REASONS.filter((k) => dropped[k] > 0)
    .map((k) => `${dropped[k]} ${k}`)
    .join(', ');
}

/** A razão que mais pesou (ou null se nada foi descartado). */
function dominantReason(dropped) {
  const sorted = DROP_REASONS.map((k) => [k, dropped[k] || 0]).sort((a, b) => b[1] - a[1]);
  return sorted[0] && sorted[0][1] > 0 ? sorted[0][0] : null;
}

/**
 * Fetch and parse a single RSS feed.
 *
 * Devolve sempre um relatório (nunca lança) e distingue os três estados que
 * antes apareciam todos como «✓ 0 items»: o pedido falhou (`fetch_failed`), o
 * feed respondeu mas não trazia itens (`empty_feed`) e o feed trazia itens que
 * foram todos descartados (`filtered_out`, com o motivo principal — idade,
 * spam, inválidos ou duplicados dentro do próprio feed).
 *
 * @param {{ url: string; source: string; defaultCategory: string; sourceRegion?: string }} feed
 * @returns {Promise<{ items: Array<object>, report: object }>}
 */
async function fetchFeed(feed) {
  const dropped = { invalidos: 0, spam: 0, idade: 0, duplicados: 0 };
  const report = {
    url: feed.url,
    source: feed.source,
    sourceRegion: feed.sourceRegion || 'intl',
    // ok | fetch_failed | empty_feed | filtered_out
    status: 'ok',
    inFeed: 0,
    passed: 0,
    dropped,
    detail: '',
  };

  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      report.status = 'fetch_failed';
      report.detail = `HTTP ${res.status}`;
      console.warn(`  ⚠️ fetch falhou (${report.detail}): ${feed.url}`);
      return { items: [], report };
    }
    const xml = await res.text();
    const items = [];
    const seenUrls = new Set();
    const itemRegex = /<item[\s\S]*?<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      report.inFeed += 1;
      const raw = match[0];
      const title = extractField(raw, 'title');
      const description = extractField(raw, 'description').replace(/\s*The\s+post\s+.*?appeared\s+first\s+on\s+.*?\.\s*/gi, '').trim();
      const link = extractField(raw, 'link');
      const pubDate = extractField(raw, 'pubDate');

      const stub = {
        title,
        titleEn: title,
        summary: description ? description.substring(0, 400) : '',
        summaryEn: description ? description.substring(0, 400) : '',
        url: link,
        publishedAt: normaliseDate(pubDate) || new Date().toISOString(),
        source: feed.source,
        defaultCategory: feed.defaultCategory,
        sourceType: 'rss',
        sourceRegion: feed.sourceRegion || 'intl',
        tags: feed.sourceRegion === 'pt' ? ['cena-pt'] : [],
      };

      // Filtros, por ordem, com a razão registada: título/URL inválidos →
      // spam (`canDiscard` é a mesma guarda de sempre, só depois do caso de
      // URL inválida) → idade → repetido dentro do próprio feed.
      if (!stub.title || !stub.url || !isSafeHttpUrl(stub.url)) {
        dropped.invalidos += 1;
        continue;
      }
      if (canDiscard(stub)) {
        dropped.spam += 1;
        continue;
      }
      if (isTooOld(stub.publishedAt)) {
        dropped.idade += 1;
        continue;
      }
      const urlKey = stub.url.replace(/\/+$/, '');
      if (seenUrls.has(urlKey)) {
        dropped.duplicados += 1;
        continue;
      }
      seenUrls.add(urlKey);

      items.push(applyCategoryKeywords(stub));
    }

    report.passed = items.length;
    if (report.inFeed === 0) {
      report.status = 'empty_feed';
      report.detail = 'feed sem itens';
      console.warn(`  ⚠️ feed sem itens: ${feed.url}`);
    } else if (items.length === 0) {
      report.status = 'filtered_out';
      report.detail = `${report.inFeed} no feed, 0 depois dos filtros (${summariseDrops(dropped)})`;
      console.warn(`  ⚠️ ${report.detail}: ${feed.url}`);
    } else {
      const discarded = report.inFeed - items.length;
      const extra = discarded > 0 ? ` — ${discarded} descartados (${summariseDrops(dropped)})` : '';
      console.log(`  ✓ ${feed.url}: ${items.length} itens${extra}`);
    }

    return { items, report };
  } catch (e) {
    report.status = 'fetch_failed';
    report.detail = e.name === 'TimeoutError' || e.name === 'AbortError' ? 'timeout' : e.message;
    console.warn(`  ⚠️ fetch falhou (${report.detail}): ${feed.url}`);
    return { items: [], report };
  }
}

/**
 * Fetch all configured feeds and keep each feed's report.
 * @returns {Promise<{ items: Array<object>, reports: Array<object> }>}
 */
async function fetchAllFeedsDetailed() {
  console.log('\n📡  Etapa 1 — Fetch RSS feeds...');
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const items = results.flatMap((r) => r.items);
  const reports = results.map((r) => r.report);
  const unhealthy = reports.filter((r) => r.status !== 'ok');
  console.log(
    `   → Total: ${FEEDS.length} feeds, ${items.length} itens passaram os filtros` +
      (unhealthy.length > 0 ? ` (${unhealthy.length} fonte(s) sem itens novos)` : ''),
  );
  return { items, reports };
}

/**
 * Fetch all configured feeds.
 * @returns {Promise<Array>} Flat array of raw NewsItem stubs
 */
async function fetchAllFeeds() {
  const { items } = await fetchAllFeedsDetailed();
  return items;
}

module.exports = { fetchAllFeeds, fetchAllFeedsDetailed, fetchFeed, extractField, FEEDS, dominantReason };
