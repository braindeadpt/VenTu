#!/usr/bin/env node
/**
 * VenTu — Audit encoding history of public/data (UTF-16 / BOM / invalid UTF-8)
 *
 * Streams every blob under a path across ALL refs + reflog (including orphaned
 * commits from rebases) via `git cat-file --batch` and flags any content with
 * a BOM (UTF-8 or UTF-16), NUL bytes, or invalid UTF-8 — the incident class
 * that corrupted news.json and broke the static export.
 *
 * Parser note (the fix): the response state machine accumulates partial chunks
 * across data events (a `remaining` counter, not the current chunk length), so
 * blobs > 64 KB are fully analyzed. The original ad-hoc scan compared only the
 * current chunk against the total size and silently skipped every large blob.
 * Non-blob objects (trees) are skipped. Blobs are deduplicated by sha.
 *
 * Usage:
 *   node scripts/scan-history-encoding.js [PATH]    # default: public/data
 *   exit 0 = clean, 1 = at least one corrupt blob, 2 = git error
 *
 * Example output:
 *   ❌ 8bdd3082a964… (110,062 bytes) — UTF-16 BOM (FF FE / FE FF)
 *      path: public/data/news.json
 *      introduzido em: 92e1a366 fix(security): audit remediation — …
 *      removido em:    aac0c6a5 fix(ci): restore UTF-8 news.json …
 *
 * Runtime: streams the whole history of the path (~1–2 min for public/data).
 */

const { spawn, execFileSync } = require('child_process');

const pathFilter = process.argv[2] || 'public/data';
const corrupt = [];

// ── 1. Enumerate blob shas (deduped) + first path per sha ──
function enumerate(cb) {
  const rev = spawn(
    'git',
    ['rev-list', '--objects', '--all', '--reflog', '--', pathFilter],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let out = '';
  let err = '';
  rev.stdout.on('data', (d) => { out += d; });
  rev.stderr.on('data', (d) => { err += d; });
  rev.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ git rev-list failed (${code}): ${err.trim()}`);
      process.exit(2);
    }
    const shas = [];
    const pathsBySha = new Map();
    for (const line of out.split('\n')) {
      const m = line.match(/^([0-9a-f]{40})\s+(.*)$/);
      if (!m) continue;
      const [, sha, rawPath] = m;
      if (!pathsBySha.has(sha)) {
        pathsBySha.set(sha, unquote(rawPath || ''));
        shas.push(sha);
      }
    }
    cb(shas, pathsBySha);
  });
}

// Minimal un-quoter for git's C-style paths (e.g. "garr\u00e3o.json").
function unquote(p) {
  if (p[0] !== '"' || p[p.length - 1] !== '"') return p;
  return p
    .slice(1, -1)
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ── 2. Stream every blob through git cat-file --batch and analyze content ──
function analyze(sha, content) {
  const checks = [];
  // BOM — UTF-8 (EF BB BF) or UTF-16 (FF FE / FE FF)
  if (content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) {
    checks.push('UTF-8 BOM');
  } else if (
    content.length >= 2 &&
    ((content[0] === 0xff && content[1] === 0xfe) || (content[0] === 0xfe && content[1] === 0xff))
  ) {
    checks.push('UTF-16 BOM (FF FE / FE FF)');
  }
  // NUL bytes — the classic UTF-16 signature inside text data
  if (content.includes(0)) checks.push('NUL bytes');
  // Invalid UTF-8 — decode→re-encode must be byte-identical
  if (!Buffer.from(content.toString('utf8'), 'utf8').equals(content)) {
    checks.push('invalid UTF-8');
  }
  if (checks.length > 0) corrupt.push({ sha, size: content.length, checks });
}

function runBatch(shas, pathsBySha) {
  const batch = spawn('git', ['cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = Buffer.alloc(0);
  let cur = null; // { sha, type, size, remaining, chunks }
  let analyzed = 0;

  batch.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (!cur) {
        const nl = buf.indexOf(0x0a);
        if (nl === -1) break; // need more bytes for the header
        const header = buf.slice(0, nl).toString('utf8').trim();
        buf = buf.slice(nl + 1);
        const m = header.match(/^([0-9a-f]{40})\s+(\S+)\s+(\d+)$/);
        // "missing <sha>" or garbage → stay in header phase
        cur = m ? { sha: m[1], type: m[2], size: Number(m[3]), remaining: Number(m[3]), chunks: [] } : null;
        continue;
      }
      // Full response available? content bytes + trailing newline
      if (buf.length >= cur.remaining + 1) {
        if (cur.type === 'blob' && cur.remaining > 0) {
          cur.chunks.push(buf.slice(0, cur.remaining));
        }
        buf = buf.slice(cur.remaining + 1);
        if (cur.type === 'blob') {
          analyzed += 1;
          analyze(cur.sha, Buffer.concat(cur.chunks));
        }
        cur = null;
        continue;
      }
      // Partial chunk: keep what we can (accumulate, never compare only the
      // current chunk against the total — that bug skipped every blob > 64 KB).
      if (cur.type === 'blob' && cur.remaining > 0) {
        const take = Math.min(buf.length, cur.remaining);
        cur.chunks.push(buf.slice(0, take));
        cur.remaining -= take;
      }
      buf = Buffer.alloc(0);
      break;
    }
  });

  batch.stderr.on('data', (d) => {
    console.error(`⚠️  cat-file stderr: ${d}`);
  });

  batch.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ git cat-file failed (${code})`);
      process.exit(2);
    }
    report(shas.length, analyzed, pathsBySha);
  });

  // Feed every unique sha
  batch.stdin.write(shas.join('\n') + '\n');
  batch.stdin.end();
}

// ── 3. Provenance per corrupt blob: introduced / removed commits ──
function report(totalShas, analyzed, pathsBySha) {
  console.log(`\nScan: ${pathFilter} — ${totalShas} unique objects, ${analyzed} blobs analyzed`);

  if (corrupt.length === 0) {
    console.log('✅ scan-history-encoding: no BOM / NUL / invalid UTF-8 in history');
    process.exit(0);
  }

  for (const c of corrupt) {
    console.log(`\n❌ ${c.sha.slice(0, 12)}… (${c.size.toLocaleString()} bytes) — ${c.checks.join(' · ')}`);
    // rev-list --objects prints repo-relative paths (e.g. public/data/news.json),
    // so print them as-is — no pathFilter prefix (that double-prefixed the path).
    const p = pathsBySha.get(c.sha);
    console.log(`   path: ${p || pathFilter}`);
    try {
      const log = execFileSync(
        'git',
        ['log', '--all', `--find-object=${c.sha}`, '--format=%h%x09%ad%x09%s', '--date=short'],
        { encoding: 'utf8' },
      ).trim().split('\n').filter(Boolean);
      // git log --find-object lists newest first: last line = introduced,
      // first line = where it was last seen/removed.
      if (log.length > 0) {
        const [h, d, ...rest] = log[log.length - 1].split('\t');
        console.log(`   introduzido em: ${h} ${d} ${rest.join(' ').slice(0, 60)}`);
        const [h2, d2, ...rest2] = log[0].split('\t');
        if (log.length > 1) console.log(`   removido em:    ${h2} ${d2} ${rest2.join(' ').slice(0, 60)}`);
      }
    } catch {
      // --find-object can be slow; provenance is best-effort
    }
  }

  console.log(`\n❌ scan-history-encoding: ${corrupt.length} corrupt blob(s) in history`);
  process.exit(1);
}

enumerate(runBatch);
