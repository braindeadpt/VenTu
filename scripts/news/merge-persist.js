/**
 * VenTu — Merge & Persist (Etapa 4)
 *
 * Accumulation logic: reads existing news.json, applies TTL, removes
 * duplicates, merges new items, sorts, caps at 100, writes back.
 */

const path = require('path');
const fs = require('fs');

const NEWS_PATH = path.join(__dirname, '../../public/data/news.json');
const MAX_ITEMS = 100;
const TTL_DAYS = 7;

/**
 * Generate a deterministic-ish ID for RSS items to spot duplicates.
 */
function itemFingerprint(item) {
  return `${item.sourceType}:${item.url || item.title}:${item.source}`;
}

/**
 * Load existing news.json.
 * @returns {Array}
 */
function loadExisting() {
  try {
    if (!fs.existsSync(NEWS_PATH)) return [];
    const raw = fs.readFileSync(NEWS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('  ⚠️ Failed to load existing news.json:', e.message);
    return [];
  }
}

/**
 * Apply TTL — remove items older than TTL_DAYS.
 */
function applyTTL(items) {
  const cutoff = Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000;
  return items.filter((item) => {
    const d = new Date(item.publishedAt);
    return !isNaN(d.getTime()) && d.getTime() >= cutoff;
  });
}

/**
 * Remove duplicates by URL (for RSS) or title+sourceType (for data/llm).
 */
function deduplicate(items) {
  const seen = new Set();
  return items.filter((item) => {
    // Normalise URL: strip trailing slashes
    const url = (item.url || '').replace(/\/+$/, '');
    const key = url ? `url:${url}` : `title:${item.title}:${item.sourceType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Assign a unique ID to items that lack one (e.g., newly created items).
 */
function assignIds(items) {
  let counter = 0;
  return items.map((item) => {
    if (!item.id) {
      item.id = `news-${Date.now()}-${counter++}`;
    }
    return item;
  });
}

/**
 * Sort by publishedAt descending (newest first), then cap.
 */
function sortAndCap(items) {
  return items
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, MAX_ITEMS);
}

/**
 * Merge new items into existing feed.
 *
 * @param {Array} newItems - Fresh items from Etapa 1 + 2 + 3
 * @returns {Array} Full merged, deduplicated, TTL'd, capped array
 */
function mergeNews(newItems) {
  console.log(`\n💾  Etapa 4 — Merge & persist...`);

  const existing = loadExisting();
  console.log(`   → Existing: ${existing.length} items`);

  const afterTTL = applyTTL(existing);
  console.log(`   → After TTL (${TTL_DAYS}d): ${afterTTL.length} items`);

  const combined = [...newItems, ...afterTTL];
  console.log(`   → Combined: ${combined.length} items`);

  const deduped = deduplicate(combined);
  console.log(`   → After dedup: ${deduped.length} items`);

  const withIds = assignIds(deduped);
  const final = sortAndCap(withIds);
  console.log(`   → Final (capped at ${MAX_ITEMS}): ${final.length} items`);

  return final;
}

/**
 * Write news.json to disk.
 */
function persist(items) {
  const dir = path.dirname(NEWS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(NEWS_PATH, JSON.stringify(items, null, 2));
  console.log(`   → Written to ${NEWS_PATH}`);
}

/**
 * Full pipeline: load → merge → sort → cap → save.
 */
function mergeAndPersist(newItems) {
  const merged = mergeNews(newItems);
  persist(merged);
  return merged;
}

module.exports = { mergeAndPersist, mergeNews, loadExisting };
