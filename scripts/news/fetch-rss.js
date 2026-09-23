/**
 * VenTu — RSS Feed Fetcher (Etapa 1)
 *
 * Fetches articles from configured RSS feeds, parses XML, normalises
 * fields, applies spam filter, and returns clean NewsItem stubs.
 *
 * No LLM here — pure deterministic fetch + parse + filter.
 */

const { canDiscard } = require('./spam-filter');
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

/**
 * Fetch and parse a single RSS feed.
 * @param {{ url: string; source: string; defaultCategory: string }} feed
 * @returns {Promise<Array<{ title: string; titleEn: string; summary: string; summaryEn: string; url: string; publishedAt: string; source: string; defaultCategory: string; sourceType: string }>>}
 */
async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.warn(`  ⚠️ RSS ${res.status}: ${feed.url}`);
      return [];
    }
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item[\s\S]*?<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
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

      // Apply filters
      if (canDiscard(stub)) continue;
      if (isTooOld(stub.publishedAt)) continue;

      items.push(applyCategoryKeywords(stub));
    }

    console.log(`  ✓ ${feed.url}: ${items.length} items`);
    return items;
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      console.warn(`  ⏰ Timeout: ${feed.url}`);
    } else {
      console.warn(`  ✗ Error: ${feed.url} — ${e.message}`);
    }
    return [];
  }
}

/**
 * Fetch all configured feeds.
 * @returns {Promise<Array>} Flat array of raw NewsItem stubs
 */
async function fetchAllFeeds() {
  console.log('\n📡  Etapa 1 — Fetch RSS feeds...');
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const flat = results.flat();
  console.log(`   → Total: ${FEEDS.length} feeds, ${flat.length} items passed filters`);
  return flat;
}

module.exports = { fetchAllFeeds, extractField, FEEDS };
