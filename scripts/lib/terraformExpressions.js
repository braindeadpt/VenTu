/**
 * Cloudflare Ruleset Engine — validação local de expressões WAF (sintaxe).
 *
 * Valida as expressões `expression = ...` do terraform/main.tf contra a
 * gramática do ruleset engine (docs: /ruleset-engine/rules-language/),
 * SEM token da API — corre no CI (job terraform) e localmente.
 *
 * Cobre o subconjunto que o módulo usa + construções comuns:
 *   - operadores booleanos: and / or / not
 *   - operadores de comparação infix: ==, !=, <, >, <=, >=, in, contains, matches
 *   - chamadas de função com whitelist (funções do ruleset engine)
 *   - campos com subscripts: http.request.headers["content-type"][*]
 *   - set literals: http.request.method in {"GET" "POST"}
 *   - strings com escapes \" e \\
 *
 * Semântica especial: starts_with()/ends_with() são FUNÇÕES e não operadores
 * infix (correção da doc oficial) — a fonte não pode ser literal e o 2.º
 * argumento tem de ser string literal.
 *
 * Limite honesto: campos desconhecidos (ex.: `cf.bot_management.*`) só são
 * apanhados pela API no plan/apply — este validador é de sintaxe + whitelist.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// Funções válidas do ruleset engine (subconjunto curado — ao adicionar uma
// função nova, rever contra
// https://developers.cloudflare.com/ruleset-engine/rules-language/functions/).
const FUNCTION_WHITELIST = new Set([
  'any',
  'all',
  'concat',
  'contains',
  'decode_base64',
  'encode_base64',
  'ends_with',
  'has_key',
  'has_value',
  'join',
  'len',
  'lookup_json_boolean',
  'lookup_json_integer',
  'lookup_json_string',
  'lower',
  'regex_replace',
  'split',
  'starts_with',
  'string',
  'to_string',
  'upper',
]);

// Operadores infix em forma de palavra (o resto são símbolos == != < > <= >=).
const WORD_OPERATORS = new Set(['in', 'contains', 'matches']);

class LexError extends Error {}

/** Tokeniza a expressão — lança LexError em carácter/string inválida. */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if ('()[]{},.'.includes(c)) {
      tokens.push({ type: 'punct', value: c, start: i });
      i += 1;
      continue;
    }
    if (c === '*') {
      tokens.push({ type: 'punct', value: '*', start: i });
      i += 1;
      continue;
    }
    if (c === '"') {
      const start = i;
      i += 1;
      let value = '';
      let closed = false;
      while (i < n) {
        const ch = src[i];
        if (ch === '\\') {
          const next = src[i + 1];
          if (next === '"' || next === '\\') {
            value += next;
            i += 2;
            continue;
          }
          value += ch;
          i += 1;
          continue;
        }
        if (ch === '"') {
          closed = true;
          i += 1;
          break;
        }
        value += ch;
        i += 1;
      }
      if (!closed) throw new LexError(`pos ${start}: string não terminada`);
      tokens.push({ type: 'string', value, start });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
      tokens.push({ type: 'number', value: m[0], start });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      tokens.push({ type: 'ident', value: m[0], start });
      i += m[0].length;
      continue;
    }
    if ('=!<>'.includes(c)) {
      const two = src.slice(i, i + 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=') {
        tokens.push({ type: 'op', value: two, start: i });
        i += 2;
        continue;
      }
      if (c === '=' || c === '!') throw new LexError(`pos ${i}: operador inválido '${c}'`);
      tokens.push({ type: 'op', value: c, start: i });
      i += 1;
      continue;
    }
    throw new LexError(`pos ${i}: carácter inesperado '${c}'`);
  }
  return tokens;
}

/** Parser recursivo descendente — lança Error com `pos N:` em sintaxe inválida. */
function parse(tokens) {
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isIdent = (t, v) => Boolean(t && t.type === 'ident' && t.value === v);
  const fail = (msg, tok) => {
    const at = tok ? tok.start : tokens.length ? tokens[tokens.length - 1].start + 1 : 0;
    throw new Error(`pos ${at}: ${msg}`);
  };

  function expectPunct(v) {
    const t = next();
    if (!t || t.type !== 'punct' || t.value !== v) {
      fail(`esperava '${v}'`, t || tokens[tokens.length - 1]);
    }
  }

  // Cada nível devolve o termo mais interno (para a semântica de
  // starts_with/ends_with saber o tipo do argumento).
  function parseOr() {
    let left = parseAnd();
    while (isIdent(peek(), 'or')) {
      next();
      left = parseAnd();
    }
    return left;
  }

  function parseAnd() {
    let left = parseUnary();
    while (isIdent(peek(), 'and')) {
      next();
      left = parseUnary();
    }
    return left;
  }

  function parseUnary() {
    if (isIdent(peek(), 'not')) {
      next();
      parseUnary();
      return { kind: 'unary' };
    }
    return parseComparison();
  }

  function parseComparison() {
    const left = parseTerm();
    const t = peek();
    if (t && (t.type === 'op' || (t.type === 'ident' && WORD_OPERATORS.has(t.value)))) {
      next();
      parseTerm();
      return { kind: 'comparison' };
    }
    return left;
  }

  function parseTerm() {
    const t = peek();
    if (!t) fail('expressão vazia / token em falta', null);
    if (t.type === 'string' || t.type === 'number') {
      next();
      return { kind: t.type };
    }
    if (t.type === 'punct') {
      if (t.value === '(') {
        next();
        parseOr();
        expectPunct(')');
        return { kind: 'group' };
      }
      if (t.value === '{') {
        next();
        while (peek() && peek().type !== 'punct') {
          const e = peek();
          if (e.type !== 'string' && e.type !== 'number') {
            fail('set literal só aceita strings/números', e);
          }
          next();
        }
        expectPunct('}');
        return { kind: 'set' };
      }
      fail(`token inesperado '${t.value}'`, t);
    }
    // ident → função ou campo
    const name = t.value;
    const nameTok = t;
    next();
    if (peek() && peek().type === 'punct' && peek().value === '(') {
      if (!FUNCTION_WHITELIST.has(name)) {
        fail(`função desconhecida '${name}' (fora da whitelist do ruleset engine)`, nameTok);
      }
      next(); // (
      const args = [];
      if (!(peek() && peek().type === 'punct' && peek().value === ')')) {
        for (;;) {
          // Argumentos de função são EXPRESSÕES completas (comparações
          // incluídas) — ex. oficial: any(headers[*] == "application/json").
          args.push(parseOr());
          const n = peek();
          if (n && n.type === 'punct' && n.value === ',') {
            next();
            continue;
          }
          break;
        }
      }
      expectPunct(')');
      checkFunctionSemantics(name, args, nameTok);
      return { kind: 'call', name, args };
    }
    // campo: ident (. ident)* com subscripts [..]
    while (peek() && peek().type === 'punct' && peek().value === '.') {
      next();
      const id = next();
      if (!id || id.type !== 'ident') fail("esperava identificador após '.'", id);
    }
    while (peek() && peek().type === 'punct' && peek().value === '[') {
      next();
      const inner = peek();
      if (!inner) fail('subscript não fechado', null);
      if (
        inner.type === 'string' ||
        inner.type === 'number' ||
        (inner.type === 'punct' && inner.value === '*')
      ) {
        next();
      } else {
        fail('subscript só aceita string/número/*', inner);
      }
      expectPunct(']');
    }
    return { kind: 'field', name };
  }

  function checkFunctionSemantics(fnName, args, tok) {
    if (fnName === 'starts_with' || fnName === 'ends_with') {
      if (args.length !== 2) {
        fail(`${fnName}() requer exatamente 2 argumentos (fonte, substring)`, tok);
      }
      if (args[0].kind === 'string') {
        fail(`${fnName}(): a fonte não pode ser uma string literal (só field/função)`, tok);
      }
      if (args[1].kind !== 'string') {
        fail(`${fnName}(): o 2.º argumento (substring) tem de ser string literal`, tok);
      }
    }
  }

  parseOr();
  if (pos < tokens.length) {
    fail(`token inesperado '${tokens[pos].value}' no fim`, tokens[pos]);
  }
}

/** Valida uma expressão — { ok, errors[] } (erros com posição). */
function validateExpression(expr) {
  try {
    const tokens = tokenize(expr);
    parse(tokens);
    return { ok: true, errors: [] };
  } catch (err) {
    return { ok: false, errors: [err.message] };
  }
}

/**
 * Extrai as expressões `expression = ...` de um ficheiro HCL:
 * heredocs `<<-EOT ... EOT` e strings inline (com unescape de \" e \\).
 */
/**
 * Extrai as expressões WAF de um ficheiro markdown — as linhas
 * `- **Filter:** `...`` e `- **Expression:** `...`` do docs/SECURITY-HEADERS.md
 * (as equivalências curl/painel que espelham o terraform/). Devolve
 * `[{ expression, where }]` com `where = markdown@L<linha>`.
 */
function extractMarkdownExpressions(md) {
  const out = [];
  // `^\s*` pode atravessar linhas em branco (\s inclui \n) e desviar o
  // início do match — a linha é calculada pelo FIM do match, que é sempre a
  // linha real da expressão (a que contém o backtick de fecho).
  const re = /^\s*-\s+\*\*(?:Filter|Expression):\*\*\s*`([^`]+)`/gm;
  let m;
  while ((m = re.exec(md)) !== null) {
    const lineNo = md.slice(0, m.index + m[0].length).split(/\r?\n/).length;
    out.push({ expression: m[1].trim(), where: `markdown@L${lineNo}` });
  }
  return out;
}

/**
 * Detecta drift entre dois conjuntos de expressões (ex.: terraform/ vs
 * SECURITY-HEADERS.md). O doc é a fonte de verdade que o terraform replica —
 * se uma expressão existir num lado e não no outro, é drift a reportar.
 */
function checkExpressionDrift(a, b) {
  const problems = [];
  const setA = new Set(a.map((e) => e.expression));
  const setB = new Set(b.map((e) => e.expression));
  for (const e of b) {
    if (!setA.has(e.expression)) {
      problems.push(`${e.where}: expressão não existe no terraform/ (drift): ${e.expression}`);
    }
  }
  for (const e of a) {
    if (!setB.has(e.expression)) {
      problems.push(`${e.where}: expressão não existe no SECURITY-HEADERS.md (drift): ${e.expression}`);
    }
  }
  return problems;
}

function extractExpressions(hcl) {
  const out = [];
  // `\r?` — o ficheiro em disco tem CRLF (autocrlf); sem ele o heredoc não casa.
  const heredocRe = /expression\s*=\s*<<-EOT\r?\n([\s\S]*?)\r?\n\s*EOT/g;
  let m;
  while ((m = heredocRe.exec(hcl)) !== null) {
    out.push({ expression: m[1].replace(/\r/g, '').trim(), where: `heredoc@${m.index}` });
  }
  const inlineRe = /expression\s*=\s*"((?:[^"\\]|\\.)*)"/g;
  while ((m = inlineRe.exec(hcl)) !== null) {
    const raw = m[1].replace(/\\(["\\])/g, '$1').replace(/\r/g, '');
    out.push({ expression: raw, where: `inline@${m.index}` });
  }
  return out;
}

/** Valida todas as expressões de um ficheiro Terraform. */
function validateTerraformFile(filePath) {
  const hcl = fs.readFileSync(filePath, 'utf8');
  const exprs = extractExpressions(hcl);
  const problems = [];
  // Só falha se o ficheiro contém `expression =` mas nada foi extraído
  // (ex.: variables.tf não tem expressões — passa em silêncio).
  if (exprs.length === 0 && /\bexpression\s*=/.test(hcl)) {
    problems.push(`${path.basename(filePath)}: contém 'expression =' mas nenhuma expressão extraída — regex partiu?`);
  }
  for (const { expression, where } of exprs) {
    const r = validateExpression(expression);
    if (!r.ok) {
      problems.push(`${path.basename(filePath)} ${where}: ${r.errors.join('; ')}`);
    }
  }
  return { ok: problems.length === 0, problems, count: exprs.length };
}

/** Valida as expressões WAF de um ficheiro markdown (SECURITY-HEADERS.md). */
function validateMarkdownFile(filePath) {
  const md = fs.readFileSync(filePath, 'utf8');
  const exprs = extractMarkdownExpressions(md);
  const problems = [];
  if (exprs.length === 0) {
    problems.push(`${path.basename(filePath)}: nenhuma expressão WAF encontrada — regex de extração partiu?`);
  }
  for (const { expression, where } of exprs) {
    const r = validateExpression(expression);
    if (!r.ok) {
      problems.push(`${path.basename(filePath)} ${where}: ${r.errors.join('; ')}`);
    }
  }
  return { ok: problems.length === 0, problems, count: exprs.length };
}

module.exports = {
  validateExpression,
  extractExpressions,
  extractMarkdownExpressions,
  validateTerraformFile,
  validateMarkdownFile,
  checkExpressionDrift,
};
