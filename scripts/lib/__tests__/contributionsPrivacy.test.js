/**
 * VenTu — Privacy guard (S4): no pipeline script may select `email` or
 * `created_at` from the `contributions` table.
 *
 * Structural grep over every source file under scripts/: any REST select
 * (`/rest/v1/contributions?...&select=...`) or supabase-js select
 * (`.from('contributions').select('...')`) that includes `email`,
 * `created_at`, or the wildcard `*` fails the test.
 *
 * Regression guarded: apply-contributions.js used to select the submitter's
 * email (local-part leak in the public overlay) — the select is now
 * `spot_slug,tip_field,message`. This test makes that contract permanent.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORBIDDEN_FIELDS = ['email', 'created_at'];

function listSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue; // never scan tests (self-reference)
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, acc);
    else if (/\.(js|mjs|cjs|ts|tsx)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** @returns {Array<{kind: string, select: string | null}>} */
function findContributionSelects(src) {
  const finds = [];

  // REST API style: /rest/v1/contributions?...&select=a,b,c
  const restRe = /\/rest\/v1\/contributions\?[^'"`]*/g;
  for (const m of src.matchAll(restRe)) {
    const query = m[0].slice(m[0].indexOf('?') + 1);
    const sel = query.match(/(?:^|&)select=([^&]*)/);
    finds.push({ kind: 'rest', select: sel ? sel[1] : null });
  }

  // supabase-js style: .from('contributions').select('a,b,c')
  const sbRe = /from\(\s*['"]contributions['"]\s*\)\s*\.\s*select\(\s*['"]([^'"]*)['"]\s*\)/g;
  for (const m of src.matchAll(sbRe)) {
    finds.push({ kind: 'supabase-js', select: m[1] });
  }

  return finds;
}

function selectFields(select) {
  return select ? select.split(',').map((f) => f.trim()).filter(Boolean) : [];
}

describe('Privacidade das contributions nos scripts de pipeline (S4)', () => {
  it('nenhum script de scripts/ seleciona email/created_at (ou *) das contributions', () => {
    const violations = [];

    for (const file of listSourceFiles(SCRIPTS_DIR)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const find of findContributionSelects(src)) {
        for (const field of selectFields(find.select)) {
          if (field === '*' || FORBIDDEN_FIELDS.includes(field)) {
            violations.push(
              `${path.relative(process.cwd(), file)}: select inclui '${field}' (${find.kind})`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('o grep estrutural deteta selects proibidos e ignora os seguros (auto-teste)', () => {
    const bad = [
      'fetch(`${url}/rest/v1/contributions?type=eq.tip&select=email,message`)',
      'fetch(`${url}/rest/v1/contributions?select=spot_slug,created_at`)',
      'fetch(`${url}/rest/v1/contributions?select=*`)',
      "sb.from('contributions').select('id,email')",
      "sb.from('contributions').select('created_at')",
      "sb.from('contributions').select('*')",
    ];
    for (const src of bad) {
      const fields = findContributionSelects(src).flatMap((f) => selectFields(f.select));
      expect(fields.some((f) => f === '*' || FORBIDDEN_FIELDS.includes(f))).toBe(true);
    }

    const good = [
      'fetch(`${url}/rest/v1/contributions?type=eq.tip&status=eq.done&select=spot_slug,tip_field,message`)',
      "sb.from('contributions').select('id,message')",
      // Interceção POST sem select não pode disparar o guard
      "r.url().includes('/rest/v1/contributions') && r.request().method() === 'POST'",
    ];
    for (const src of good) {
      const fields = findContributionSelects(src).flatMap((f) => selectFields(f.select));
      expect(fields.some((f) => f === '*' || FORBIDDEN_FIELDS.includes(f))).toBe(false);
    }
  });
});
