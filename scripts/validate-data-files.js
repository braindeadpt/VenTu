/**
 * Validates every file under public/data: valid UTF-8 + JSON parses.
 *
 * Guard for the incident where news.json was committed as UTF-16 and broke
 * the static export. Runs dependency-free (plain Node built-ins) so it works
 * in any workflow — including update-news.yml, which does not run `npm ci`.
 *
 * Usage: node scripts/validate-data-files.js
 *   exit 0 = all good, exit 1 = at least one problem (names every file)
 */

const fs = require('fs');
const path = require('path');

const dataRoot = path.join(__dirname, '../public/data');
const errors = [];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else files.push(p);
  }
}

if (fs.existsSync(dataRoot)) {
  walk(dataRoot);
} else {
  console.log('✅ validate-data-files: public/data does not exist — nothing to validate');
  process.exit(0);
}

for (const file of files) {
  const rel = path.relative(dataRoot, file);
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    errors.push(`${rel}: unreadable (${e.message})`);
    continue;
  }

  // 1. No BOMs — UTF-8 BOM or UTF-16 (FF FE / FE FF) means a converter wrote it
  const hasBom =
    (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) ||
    (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) ||
    (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff);
  if (hasBom) {
    errors.push(`${rel}: BOM detected (UTF-8 BOM or UTF-16) — write plain UTF-8`);
    continue;
  }

  // 2. Valid UTF-8 — decode→re-encode must be byte-identical. UTF-16 content
  //    decodes with replacement chars and re-encodes to different bytes, so
  //    this catches UTF-16/truncated input on every Node version.
  if (!Buffer.from(buf.toString('utf8'), 'utf8').equals(buf)) {
    errors.push(`${rel}: invalid UTF-8 (possibly UTF-16 or other encoding)`);
    continue;
  }

  // 3. NUL bytes — the classic UTF-16 signature inside text data
  if (buf.includes(0)) {
    errors.push(`${rel}: contains NUL bytes`);
    continue;
  }

  // 4. JSON files (including .backup snapshots) must parse
  if (/\.json(?:\.backup)?$/i.test(rel)) {
    try {
      JSON.parse(buf.toString('utf8'));
    } catch (e) {
      errors.push(`${rel}: invalid JSON (${e.message})`);
    }
  }
}

// news.json invariants (S3: only http(s) URLs; required fields; no dups)
const newsPath = path.join(dataRoot, 'news.json');
if (fs.existsSync(newsPath)) {
  let items;
  try {
    items = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  } catch {
    items = null; // already reported above as invalid JSON
  }
  if (Array.isArray(items)) {
    const badUrl = items.filter((i) => !/^https?:/i.test(String((i && i.url) || '')));
    if (badUrl.length > 0) {
      errors.push(`news.json: ${badUrl.length} item(s) with non-http(s) url (first: ${badUrl[0].url})`);
    }
    for (const field of ['title', 'publishedAt', 'source', 'id']) {
      const missing = items.filter((i) => !i[field]);
      if (missing.length > 0) {
        errors.push(`news.json: ${missing.length} item(s) missing required field "${field}"`);
      }
    }
    const seen = new Set();
    const dups = items.filter((i) => seen.has(i.url) || !seen.add(i.url));
    if (dups.length > 0) {
      errors.push(`news.json: ${dups.length} duplicate url(s)`);
    }
  }
}

if (errors.length > 0) {
  console.error(`❌ validate-data-files: ${errors.length} problem(s) across ${files.length} file(s)\n`);
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log(`✅ validate-data-files: ${files.length} files OK — UTF-8 valid, JSON parses`);
