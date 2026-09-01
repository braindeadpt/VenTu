/**
 * CITATION.cff guard (CI).
 *
 * The CITATION.cff at the repo root is what GitHub shows in the «Cite this
 * repository» button — it must never rot: a wrong cff-version, a missing
 * required field, an empty authors list or a malformed DOI would silently
 * break the citation GitHub generates for the project.
 *
 * This is a pure-node check (fs only — no npm ci needed) so it can run as a
 * cheap early step in CI, next to validate-spots/validate-data-files. It
 * validates the CFF spec essentials against the actual file:
 *
 *   1. cff-version present and semver-shaped;
 *   2. spec-required fields (cff-version, message, title, authors);
 *   3. project-expected fields (version, date-released, license, url,
 *      repository-code, keywords);
 *   4. authors: non-empty, every entry identifiable (name or family-names);
 *   5. preferred-citation: present, with type/title/authors and a
 *      well-formed DOI (the one the About/fontes pages show — cross-page
 *      parity is covered by the e2e data-sources spec);
 *   6. top-level doi (the project's OWN Zenodo DOI, once published) —
 *      optional, but well-formed when present (docs/ZENODO.md).
 *
 * Usage (CI):
 *   node scripts/check-citation-cff.js
 *
 * Exit codes:
 *   0 — CITATION.cff is valid;
 *   1 — any structural/required-field/DOI problem (::error:: for GitHub).
 */

const fs = require('node:fs');
const path = require('node:path');

const CFF_PATH = path.join(__dirname, '..', 'CITATION.cff');

// ── Minimal indentation-based YAML parser ─────────────────────────────────
// Enough for CITATION.cff (flat top level + nested lists/dicts), NOT a full
// YAML implementation. Folded scalars (`>-`) keep their marker — fine, we
// only test presence. Comment/blank lines are skipped.
function parseCff(text) {
  const root = {};
  // Stack of { obj, indent } containers; indent -1 = root sentinel.
  const stack = [{ obj: root, indent: -1 }];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.match(/^ */)[0].length;
    const content = line.slice(indent).trim();

    // Pop containers deeper than (or equal to) this line's indent.
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;

    if (content.startsWith('- ')) {
      const itemText = content.slice(2).trim();
      if (!Array.isArray(parent.__list)) parent.__list = [];
      const kv = splitKV(itemText);
      if (kv && kv.value !== undefined && kv.value !== '') {
        const item = { [kv.key]: kv.value };
        parent.__list.push(item);
        stack.push({ obj: item, indent });
      } else {
        parent.__list.push(itemText || null);
      }
      continue;
    }

    const kv = splitKV(content);
    if (!kv) continue;
    if (kv.value !== undefined && kv.value !== '') {
      parent[kv.key] = kv.value;
    } else {
      const child = {};
      parent[kv.key] = child;
      stack.push({ obj: child, indent });
    }
  }

  return normalize(root);
}

/** First `key:` / `key: value` split (value may be empty). */
function splitKV(s) {
  const idx = s.indexOf(':');
  if (idx === -1) return null;
  const key = s.slice(0, idx).trim();
  // Strip surrounding quotes: `doi: "10.5281/zenodo.7970649"` → plain value.
  let value = s.slice(idx + 1).trim();
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    value = value.slice(1, -1);
  }
  return key ? { key, value } : null;
}

/** Turn `{ __list: [...] }` containers into plain arrays, recursively. */
function normalize(node) {
  if (Array.isArray(node)) return node.map(normalize);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '__list') continue;
      out[k] = normalize(v);
    }
    if (Array.isArray(node.__list)) {
      const items = node.__list.map(normalize);
      return Object.keys(out).length ? { ...out, __items: items } : items;
    }
    return out;
  }
  return node;
}

// ── Validation ────────────────────────────────────────────────────────────
const SPEC_REQUIRED = ['cff-version', 'message', 'title', 'authors'];
const PROJECT_EXPECTED = ['version', 'date-released', 'license', 'url', 'repository-code', 'keywords'];

// DOI syntax per DataCite: 10.<registrant>/<suffix> — registrant 4-9 digits.
const DOI_RE = /^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/;

/**
 * @param {string} text CITATION.cff content
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateCff(text) {
  const errors = [];
  let cff;
  try {
    cff = parseCff(text);
  } catch (e) {
    return { ok: false, errors: [`CITATION.cff não pôde ser lido/parseado: ${e.message}`] };
  }

  // 1 + 2. cff-version e campos obrigatórios do spec.
  const cffVersion = String(cff['cff-version'] ?? '');
  if (!/^\d+\.\d+\.\d+$/.test(cffVersion)) {
    errors.push(`cff-version inválida: ${JSON.stringify(cffVersion)} (esperado x.y.z, ex. 1.2.0)`);
  }
  for (const f of SPEC_REQUIRED) {
    const v = cff[f];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      errors.push(`campo obrigatório do CFF em falta ou vazio: ${f}`);
    }
  }

  // 3. Campos que o projecto usa (título da aba About, botão cite, footer).
  for (const f of PROJECT_EXPECTED) {
    const v = cff[f];
    if (v === undefined || v === null || v === '') {
      errors.push(`campo esperado em falta: ${f}`);
    }
  }

  // 3b. doi do PROJECT (nível superior): opcional — só entra quando o
  // projecto for publicado no Zenodo (docs/ZENODO.md). Se presente, tem de
  // estar bem formado (o da preferred-citation continua a ser o da Open-Meteo).
  const ownDoi = String(cff.doi ?? '').trim();
  if (ownDoi && !DOI_RE.test(ownDoi)) {
    errors.push(`doi (projecto) inválido: ${JSON.stringify(ownDoi)} (esperado 10.<registrant>/<suffix>)`);
  }

  // 4. authors: não-vazio e com identificação em cada entrada.
  const authors = Array.isArray(cff.authors) ? cff.authors : [];
  if (authors.length === 0) {
    errors.push('authors: pelo menos um autor é obrigatório');
  } else {
    authors.forEach((a, i) => {
      const name = String(a?.name ?? '');
      const family = String(a?.['family-names'] ?? '');
      if (!name && !family) {
        errors.push(`authors[${i}]: entrada sem name nem family-names`);
      }
    });
  }

  // 5. preferred-citation: bloco com type/title/authors e DOI bem formado.
  const pc = cff['preferred-citation'];
  if (!pc || typeof pc !== 'object') {
    errors.push('preferred-citation: bloco obrigatório (a citação que o GitHub mostra) em falta');
  } else {
    for (const f of ['type', 'title', 'authors']) {
      const v = pc[f];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
        errors.push(`preferred-citation: campo em falta ou vazio: ${f}`);
      }
    }
    const doi = String(pc.doi ?? '');
    if (!DOI_RE.test(doi)) {
      errors.push(`preferred-citation: doi inválido: ${JSON.stringify(doi)} (esperado 10.<registrant>/<suffix>)`);
    }
    const url = String(pc.url ?? '');
    if (url && !/^https?:\/\//.test(url)) {
      errors.push(`preferred-citation: url deve ser http(s): ${JSON.stringify(url)}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  if (!fs.existsSync(CFF_PATH)) {
    console.log('✅ CITATION.cff ausente — nada a verificar.');
    process.exit(0);
  }
  const text = fs.readFileSync(CFF_PATH, 'utf-8');
  const { ok, errors } = validateCff(text);
  if (ok) {
    console.log('✅ CITATION.cff válido (cff-version, campos obrigatórios, authors, preferred-citation com DOI).');
    process.exit(0);
  }
  console.error('::error::CITATION.cff inválido — corrige o ficheiro (é a citação que o GitHub mostra em «Cite this repository»).');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

module.exports = { parseCff, validateCff, main, DOI_RE };

if (require.main === module) main();
