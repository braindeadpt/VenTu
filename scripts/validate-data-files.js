/**
 * Validates every file under public/data: valid UTF-8 + JSON parses, plus
 * schema invariants for the hand-edited files (news.json, community-tips.json,
 * directory.json, events.json).
 *
 * Guard for the incident where news.json was committed as UTF-16 and broke
 * the static export. Runs dependency-free (plain Node built-ins) so it works
 * in any workflow — including update-news.yml, which does not run `npm ci`.
 *
 * Binary assets under public/data (radar/*.png, …) are skipped — they are not
 * UTF-8 text and must not trip the encoding gate (that broke update-data).
 *
 * The deep validators still live in scripts/ (directory/validate.ts,
 * events/validate.ts); this gate covers the structural invariants that would
 * break the static export or leak data (shape, required fields, uniqueness,
 * URL safety, contributor PII).
 *
 * Usage: node scripts/validate-data-files.js
 *   exit 0 = all good, exit 1 = at least one problem (names every file)
 */

const fs = require('fs');
const path = require('path');
const { isBinaryDataRel } = require('./lib/dataFileKinds');

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

let skippedBinary = 0;
for (const file of files) {
  const rel = path.relative(dataRoot, file);
  // Radar frames and other binaries are intentional non-UTF-8 payloads.
  if (isBinaryDataRel(rel)) {
    skippedBinary += 1;
    continue;
  }
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

// ── Schema invariants for the hand-edited files (same pattern as news.json) ──
const schemaErr = (rel, msg) => errors.push(`${rel}: ${msg}`);
const isNonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0;

// community-tips.json — overlay { spotSlug: { tipField: message } }
// (written by scripts/apply-contributions.js; TIP_FIELD_MAP there is the
//  whitelist below — keep the two in sync)
const tipsPath = path.join(dataRoot, 'community-tips.json');
if (fs.existsSync(tipsPath)) {
  let tips;
  try {
    tips = JSON.parse(fs.readFileSync(tipsPath, 'utf8'));
  } catch {
    tips = null; // already reported as invalid JSON above
  }
  if (tips !== null) {
    const TIP_FIELDS = ['bestTide', 'parking', 'food', 'localRule'];
    const EMAIL_RE = /\S+@\S+\.\S+/;
    if (!tips || typeof tips !== 'object' || Array.isArray(tips)) {
      schemaErr('community-tips.json', 'must be an object keyed by spot slug');
    } else {
      for (const [slug, val] of Object.entries(tips)) {
        const label = `community-tips.json: spot "${slug}"`;
        if (!val || typeof val !== 'object' || Array.isArray(val)) {
          schemaErr(label, 'must be an object of tip fields');
          continue;
        }
        for (const [field, msg] of Object.entries(val)) {
          if (field === 'contributor') {
            schemaErr(label, 'contains forbidden "contributor" key (S4 — contributor identity must never be published)');
          } else if (!TIP_FIELDS.includes(field)) {
            schemaErr(label, `unknown tip field "${field}" (expected ${TIP_FIELDS.join('|')})`);
          }
          if (!isNonEmptyStr(msg)) {
            schemaErr(`${label}.${field}`, 'value must be a non-empty string');
          } else if (EMAIL_RE.test(msg)) {
            schemaErr(`${label}.${field}`, 'value looks like an email address (privacy S4)');
          }
        }
      }
    }
  }
}

// directory.json — { generatedAt, source, count, entries[] } (B2B directory)
// (structural subset of scripts/directory/validate.ts)
const dirPath = path.join(dataRoot, 'directory.json');
if (fs.existsSync(dirPath)) {
  let dir;
  try {
    dir = JSON.parse(fs.readFileSync(dirPath, 'utf8'));
  } catch {
    dir = null;
  }
  if (dir !== null) {
    if (!dir || typeof dir !== 'object' || Array.isArray(dir)) {
      schemaErr('directory.json', 'must be an object {generatedAt, source, count, entries}');
    } else {
      if (!isNonEmptyStr(dir.generatedAt)) {
        schemaErr('directory.json', 'generatedAt must be a non-empty string');
      }
      if (!isNonEmptyStr(dir.source)) {
        schemaErr('directory.json', 'source must be a non-empty string');
      }
      if (!Array.isArray(dir.entries)) {
        schemaErr('directory.json', 'entries must be an array');
      } else {
        if (typeof dir.count !== 'number' || dir.count !== dir.entries.length) {
          schemaErr('directory.json', `count (${dir.count}) must equal entries.length (${dir.entries.length})`);
        }
        const ids = new Set();
        const slugs = new Set();
        dir.entries.forEach((e, i) => {
          const label = `directory.json: entries[${i}]`;
          if (!e || typeof e !== 'object') {
            schemaErr(label, 'must be an object');
            return;
          }
          for (const f of ['id', 'slug', 'name']) {
            if (!isNonEmptyStr(e[f])) {
              schemaErr(`${label}: missing/empty "${f}"`);
            }
          }
          if (typeof e.id === 'string' && e.id) {
            if (ids.has(e.id)) schemaErr(`${label}: duplicate id "${e.id}"`);
            else ids.add(e.id);
          }
          if (typeof e.slug === 'string' && e.slug) {
            if (slugs.has(e.slug)) schemaErr(`${label}: duplicate slug "${e.slug}"`);
            else slugs.add(e.slug);
          }
          if (typeof e.lat !== 'number' || !Number.isFinite(e.lat) || e.lat < 32 || e.lat > 43) {
            schemaErr(`${label}: lat must be a number in [32, 43] (got ${JSON.stringify(e.lat)})`);
          }
          if (typeof e.lon !== 'number' || !Number.isFinite(e.lon) || e.lon < -32 || e.lon > -5) {
            schemaErr(`${label}: lon must be a number in [-32, -5] (got ${JSON.stringify(e.lon)})`);
          }
        });
      }
    }
  }
}

// events.json — array of curated events (structural subset of
// scripts/events/validate.ts; the whitelists below mirror EVENT_SPORTS /
// EVENT_KINDS in src/types/events.ts — keep them in sync)
const eventsPath = path.join(dataRoot, 'events.json');
if (fs.existsSync(eventsPath)) {
  let evts;
  try {
    evts = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
  } catch {
    evts = null;
  }
  if (evts !== null) {
    const EVENT_SPORTS = ['surf', 'kitesurf', 'windsurf', 'sup', 'foil', 'wakeboard', 'bodyboard', 'multi'];
    const EVENT_KINDS = ['competition', 'clinic', 'festival', 'gathering', 'other'];
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    const isIsoDate = (v) => {
      if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
      const [y, m, d] = v.split('-').map(Number);
      if (!y || !m || !d) return false;
      const probe = new Date(Date.UTC(y, m - 1, d));
      return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
    };
    if (!Array.isArray(evts)) {
      schemaErr('events.json', 'must be a JSON array');
    } else {
      const ids = new Set();
      evts.forEach((item, index) => {
        const label = `events.json: [${index}]`;
        if (!item || typeof item !== 'object') {
          schemaErr(label, 'must be an object');
          return;
        }
        for (const f of ['id', 'title', 'titleEn', 'summary', 'summaryEn', 'location']) {
          if (!isNonEmptyStr(item[f])) {
            schemaErr(`${label}: missing/empty "${f}"`);
          }
        }
        if (typeof item.id === 'string' && item.id) {
          if (ids.has(item.id)) schemaErr(`${label}: duplicate id "${item.id}"`);
          else ids.add(item.id);
        }
        if (!isIsoDate(item.startDate)) {
          schemaErr(`${label}: startDate must be ISO YYYY-MM-DD (got ${JSON.stringify(item.startDate)})`);
        }
        if (item.endDate !== undefined && item.endDate !== null && item.endDate !== '') {
          if (!isIsoDate(item.endDate)) {
            schemaErr(`${label}: endDate must be ISO YYYY-MM-DD`);
          } else if (isIsoDate(item.startDate) && item.endDate < item.startDate) {
            schemaErr(`${label}: endDate must be >= startDate`);
          }
        }
        if (!EVENT_SPORTS.includes(item.sport)) {
          schemaErr(`${label}: sport must be one of ${EVENT_SPORTS.join('|')} (got ${JSON.stringify(item.sport)})`);
        }
        if (!EVENT_KINDS.includes(item.kind)) {
          schemaErr(`${label}: kind must be one of ${EVENT_KINDS.join('|')} (got ${JSON.stringify(item.kind)})`);
        }
        if (!Array.isArray(item.spotIds)) {
          schemaErr(`${label}: spotIds must be an array`);
        } else {
          for (const sid of item.spotIds) {
            if (!isNonEmptyStr(sid)) schemaErr(`${label}: invalid spotId entry`);
          }
        }
        if (item.url !== undefined && item.url !== null && item.url !== '') {
          if (typeof item.url !== 'string' || !/^https?:/i.test(item.url)) {
            schemaErr(`${label}: url must be http(s)`);
          }
        }
        if (item.image !== undefined && item.image !== null && item.image !== '') {
          if (typeof item.image !== 'string' || !item.image.startsWith('/')) {
            schemaErr(`${label}: image must be a root-relative path`);
          }
        }
        if (item.free !== undefined && typeof item.free !== 'boolean') {
          schemaErr(`${label}: free must be boolean when set`);
        }
      });
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

console.log(
  `✅ validate-data-files: ${files.length} files OK` +
    (skippedBinary ? ` (${skippedBinary} binary skipped)` : '') +
    ' — UTF-8 valid, JSON parses, schema invariants pass',
);
