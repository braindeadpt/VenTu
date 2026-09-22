#!/usr/bin/env node
/**
 * Guard de drift das funções SQL do Supabase (auditoria LOW8).
 *
 * `is_ventu_admin()` estava copiada verbatim em 3 ficheiros (contributions,
 * directory, admin-rls). Com CREATE OR REPLACE, editar só uma cópia deixava as
 * outras em drift silencioso conforme a ordem de aplicação no SQL Editor.
 * Consolidada em supabase/supabase-admin-helpers.sql, este guard impede que
 * volte a acontecer: cada `public.<funcao>` só pode ter UMA definição em
 * supabase/*.sql.
 *
 * Uso: node scripts/check-sql-function-drift.js
 *   exit 0 = sem duplicados; exit 1 = função definida em >1 ficheiro.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_DIR = path.join(__dirname, '..', 'supabase');
const FUNCTION_RE = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi;

/**
 * @param {{ file: string, sql: string }[]} sources
 * @returns {{ fn: string, files: string[] }[]} funções definidas em >1 ficheiro
 */
function findDuplicateFunctionDefinitions(sources) {
  const byFn = new Map();
  for (const { file, sql } of sources) {
    const seenInFile = new Set();
    for (const match of sql.matchAll(FUNCTION_RE)) {
      const fn = match[1].toLowerCase();
      // Repetir a definição no MESMO ficheiro (re-aplicação idempotente) não é
      // drift — só ficheiros diferentes a definirem a mesma função contam.
      if (seenInFile.has(fn)) continue;
      seenInFile.add(fn);
      if (!byFn.has(fn)) byFn.set(fn, new Set());
      byFn.get(fn).add(file);
    }
  }
  return [...byFn.entries()]
    .filter(([, files]) => files.size > 1)
    .map(([fn, files]) => ({ fn, files: [...files].sort() }));
}

function main() {
  const sources = fs
    .readdirSync(SUPABASE_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ file: f, sql: fs.readFileSync(path.join(SUPABASE_DIR, f), 'utf-8') }));

  const duplicates = findDuplicateFunctionDefinitions(sources);
  if (duplicates.length > 0) {
    console.error('❌ check-sql-function-drift: funções definidas em mais de um ficheiro\n');
    for (const { fn, files } of duplicates) {
      console.error(`  - public.${fn}: ${files.join(', ')}`);
    }
    console.error(
      '\nDeixa uma única definição (ex.: supabase/supabase-admin-helpers.sql) e aplica-a primeiro; ver supabase/README.md.',
    );
    process.exit(1);
  }

  const total = new Set(sources.flatMap(({ sql }) => [...sql.matchAll(FUNCTION_RE)].map((m) => m[1].toLowerCase()))).size;
  console.log(`✅ check-sql-function-drift: ${total} funções public.*, nenhuma duplicada entre ficheiros`);
}

module.exports = { findDuplicateFunctionDefinitions };

if (require.main === module) main();
