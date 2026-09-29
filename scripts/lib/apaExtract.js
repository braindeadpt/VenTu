'use strict';
/**
 * Extract a literal JS array/object embedded in HTML as `NAME = [...]` or
 * `NAME = {...}` (InfoÁgua pattern: DATA_BeachesData etc. are injected inline
 * by server-render, containing arbitrary HTML/; inside quoted strings).
 * Depth- and string-aware bracket matching — naive indexOf(';') breaks on
 * semicolons inside alert descriptions.
 */
function extractJsVar(src, name) {
  const re = new RegExp(`${name}\\s*=\\s*`);
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length;
  const open = src[i];
  if (open !== '[' && open !== '{') return null;
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let q = '';
  let esc = false;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === q) inStr = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; q = c; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}

module.exports = { extractJsVar };
