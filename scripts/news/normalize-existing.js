#!/usr/bin/env node
/**
 * One-shot: re-apply PT-PT normalisation to public/data/news.json
 * without fetching feeds or calling LLMs.
 *
 * Usage: node scripts/news/normalize-existing.js
 */
const path = require('path');
const fs = require('fs');
const { normalizeNewsItems } = require('./normalize-pt-pt');

const NEWS_PATH = path.join(__dirname, '../../public/data/news.json');

function main() {
  if (!fs.existsSync(NEWS_PATH)) {
    console.error(`Missing ${NEWS_PATH}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(NEWS_PATH, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error('news.json is not an array');
    process.exit(1);
  }
  const before = JSON.stringify(raw);
  const normalised = normalizeNewsItems(raw);
  const after = JSON.stringify(normalised, null, 2);
  fs.writeFileSync(NEWS_PATH, `${after}\n`);
  const changed = before !== JSON.stringify(normalised);
  console.log(
    changed
      ? `✓ Normalised ${normalised.length} news items → ${NEWS_PATH}`
      : `✓ No changes needed (${normalised.length} items)`,
  );
}

main();
