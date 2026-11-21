/**
 * Guard: no fetch() to an absolute '/data/...' or '/geo/...' path in src —
 * paths.ts forbids it (breaks under NEXT_PUBLIC_BASE_PATH); getAssetPath() is
 * required. Regression test for the 2026-11-21 audit finding.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', '..', 'src');
const ABS_FETCH = /fetch(?:Impl)?\(\s*['"`]\/(?:data|geo)\//;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts'))
      yield p;
  }
}

describe('asset paths', () => {
  it('no absolute /data|/geo fetch() in src — use getAssetPath()', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const content = fs.readFileSync(file, 'utf-8');
      // `\s` cobre `fetch(` e o path separados por newline; reporta a linha do fetch.
      for (const m of content.matchAll(new RegExp(ABS_FETCH.source, 'g'))) {
        const line = content.slice(0, m.index).split('\n').length;
        offenders.push(`${path.relative(SRC, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
