'use strict';

/**
 * Guard de nomes dos controlos de camada do mapa — regra «nome = modo».
 *
 * Contexto (auditoria 2026-09-21, fechada em 2026-09-25): o nome acessível de um
 * controlo de camada tem de ser CONSTANTE — descreve a CAMADA («Vento»,
 * «Radar IPMA», «Isóbatas 8/16/30 m», «Agrupar spots», «Só a bombar»). Quem diz
 * se está ligado é o `aria-pressed` (estado) + a marca visual. Antes o rótulo
 * alternava com o estado («Ocultar vento» / «Mostrar vento») e o leitor de ecrã
 * anunciava «Ocultar vento, premido» com a camada LIGADA — contraditório. A
 * mesma regra voltou a ser violada em três rondas seguidas (cluster, «só a
 * bombar», camadas do HUD), por isso passa a haver este guarda: um `aria-label`
 * construído a partir de uma condição (ternário, `&&`/`||`, template com
 * interpolação) num toggle falha o CI.
 *
 * Escopo: o chrome do mapa — `src/components/spots/map/**` +
 * `SpotMapInteractive.tsx` + `MapLayerToggle.tsx`. O que interessa é o toggle
 * (`aria-pressed`), porque é aí que o estado já está expresso: um controlo de
 * acção (fechar, abrir fullscreen) pode ter nome de acção, mas se tem
 * `aria-pressed` então o nome tem de ser a camada/modo.
 *
 * Excepção documentada (por FICHEIRO, em TRANSPORT_FILES): os transportes de
 * tempo — `map/MapTimeTrack.tsx` (play/pause do radar e das 48 h) e
 * `map/MapTimeChrome.tsx` (o HUD de horas da v3, `data-map-hours-play`). Não
 * são camadas: o nome descreve a ACÇÃO e alterna de propósito («Pausar» ↔
 * «Reproduzir»), comportamento fixado por
 * `tests/e2e/ipma-radar-carousel.spec.ts`. Cada entrada é validada pelo CLI
 * (`validateScope`): o ficheiro tem de existir e ter mesmo um toggle — uma
 * excepção que sobrevive ao ficheiro que a justificava é um buraco silencioso.
 *
 * Limitações honestas (o guarda é estático, não substitui revisão):
 *  - só vê o `aria-label` de elementos que declaram `aria-pressed` na mesma tag;
 *  - o código comentado é ignorado (os comentários são mascarados antes da
 *    análise, para não contar toggles que já não existem);
 *  - um nome vindo de props de outro ficheiro (ex. `label` calculado no pai)
 *    não é seguido — o guarda resolve apenas `const` do PRÓPRIO ficheiro;
 *  - um identificador sem `const` no ficheiro é assumido constante (é o caso
 *    das props), para não dar falsos positivos;
 *  - uma CHAMADA é opaca e não é julgada (`itemName(item)`, `getLabel()`): o
 *    que o guarda tranca é o `aria-label` inline — ternário, `&&`/`||`/`??`,
 *    template interpolado —, que é a forma das três regressões reais. Julgar
 *    chamadas punha um falso positivo em código são (`const name =
 *    itemName(item)`, MapLayersMenu v3) e a saída seria uma excepção por
 *    ficheiro, que é pior: tirava cobertura ao ficheiro inteiro.
 */

/** Atributo cuja presença marca um toggle (o estado vive aqui, não no nome). */
const PRESSED_ATTRIBUTE = 'aria-pressed';
/** O nome acessível que tem de ser constante. */
const LABEL_ATTRIBUTE = 'aria-label';

/**
 * Controlos de transporte de tempo — não são camadas (ver o cabeçalho).
 * Excluídos por caminho exacto (independente do sistema de ficheiros).
 * O CLI verifica que cada um existe e tem toggle (ver validateScope).
 */
const TRANSPORT_FILES = [
  'src/components/spots/map/MapTimeTrack.tsx',
  'src/components/spots/map/MapTimeChrome.tsx',
];

/** Profundidade máxima ao seguir `const X = Y`. */
const MAX_ALIAS_DEPTH = 3;

function countNewlines(text) {
  let n = 0;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1;
  return n;
}

function isIdentifierStart(ch) {
  return /[A-Za-z_$]/.test(ch ?? '');
}

/**
 * Substitui comentários por espaços (mantendo os `\n`), preservando todos os
 * offsets — as linhas continuam exactas e o código comentado deixa de ser
 * analisado. Também resolve o caso real de uma tag JSX imediatamente a seguir
 * a um comentário JSX (`{/* … *\/}`): o `}` anterior faria a tag parecer uma
 * comparação (`a > b`).
 * @param {string} source
 * @returns {string}
 */
function maskComments(source) {
  if (!source.includes('//') && !source.includes('/*')) return source;
  const out = source.split('');
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(source, i);
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      for (let k = i; k < end; k += 1) out[k] = ' ';
      i = end;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      const stop = close === -1 ? source.length : close + 2;
      for (let k = i; k < stop; k += 1) if (out[k] !== '\n') out[k] = ' ';
      i = stop;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/** Salta uma string/`template` a partir da aspa em `i`; devolve o índice seguinte. */
function skipQuoted(source, i) {
  const quote = source[i];
  let j = i + 1;
  while (j < source.length) {
    const c = source[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === quote) return j + 1;
    // `template` com interpolação: salta o bloco ${...} para não terminar no
    // primeiro backtick aninhado.
    if (quote === '`' && c === '$' && source[j + 1] === '{') {
      j = matchBrace(source, j + 1);
      continue;
    }
    j += 1;
  }
  return source.length;
}

/** `{` em `open` → índice a seguir ao `}` correspondente (ou fim do ficheiro). */
function matchBrace(source, open) {
  let depth = 0;
  let j = open;
  while (j < source.length) {
    const c = source[j];
    if (c === "'" || c === '"' || c === '`') {
      j = skipQuoted(source, j);
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
    j += 1;
  }
  return source.length;
}

/** Caractere anterior não-branco (para decidir se um `<` inicia uma tag JSX). */
function previousMeaningful(source, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(source[j])) j -= 1;
  return j < 0 ? '' : source[j];
}

/**
 * Um `<` inicia uma tag JSX quando o próximo caractere é uma letra e o anterior
 * não-branco indica posição de expressão/JSX (`(`, `,`, `=`, `{`, `>`, `&`,
 * `|`, `?`, `:`, `;`, `[` ou início). Isto exclui `Array<T>` e `a > b`.
 */
function isJsxTagStart(source, i) {
  if (!isIdentifierStart(source[i + 1])) return false;
  const prev = previousMeaningful(source, i);
  // O carácter anterior pertence a uma posição de expressão/JSX. `}` cobre o
  // fim de um bloco ou de um comentário JSX (`{/* … */}`); `)` cobre
  // `map(x => (<X/>))` e `{cond && (<X/>)}`.
  return prev === '' || '(,={>&|?:;[])}'.includes(prev);
}

/** Fim da tag (`>` a profundidade 0), ou -1 se não fechar. */
function findTagEnd(source, start) {
  let depth = 0;
  let j = start + 1;
  while (j < source.length) {
    const c = source[j];
    if (c === "'" || c === '"' || c === '`') {
      j = skipQuoted(source, j);
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth += 1;
    else if (c === '}' || c === ')' || c === ']') depth -= 1;
    else if (c === '>' && depth === 0) return j;
    j += 1;
  }
  return -1;
}

/**
 * Tags JSX de abertura do ficheiro (multilinha), ignorando comentários e
 * strings de código. Só o texto da tag — suficiente para ler atributos.
 * @param {string} source
 * @returns {Array<{ index: number, text: string }>}
 */
function extractJsxTags(rawSource) {
  const source = maskComments(rawSource);
  const tags = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(source, i);
      continue;
    }
    if (c === '<' && isJsxTagStart(source, i)) {
      const end = findTagEnd(source, i);
      if (end === -1) break;
      tags.push({ index: i, text: source.slice(i, end + 1) });
      i = end + 1;
      continue;
    }
    i += 1;
  }
  return tags;
}

/**
 * Valor de um atributo dentro do texto de uma tag.
 * @returns {{ present: boolean, value: string | null }} valor cru: `{...}`,
 *   `"..."` ou o token de um atributo booleano/expressão curta.
 */
function getAttribute(tagText, name) {
  const len = tagText.length;
  let i = 1;
  while (i < len) {
    const c = tagText[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(tagText, i);
      continue;
    }
    if (isIdentifierStart(c) && (i === 1 || /[\s/]/.test(tagText[i - 1]))) {
      let j = i;
      while (j < len && /[\w$:.-]/.test(tagText[j])) j += 1;
      const attr = tagText.slice(i, j);
      let k = j;
      while (k < len && /\s/.test(tagText[k])) k += 1;
      if (tagText[k] !== '=') {
        if (attr === name) return { present: true, value: null };
        i = j;
        continue;
      }
      let v = k + 1;
      while (v < len && /\s/.test(tagText[v])) v += 1;
      let end = v;
      if (tagText[v] === '{') end = matchBrace(tagText, v);
      else if (tagText[v] === '"' || tagText[v] === "'") end = skipQuoted(tagText, v);
      else while (end < len && !/[\s>]/.test(tagText[end])) end += 1;
      if (attr === name) return { present: true, value: tagText.slice(v, end) };
      i = Math.max(end, i + 1);
      continue;
    }
    i += 1;
  }
  return { present: false, value: null };
}

/** Inicializador de `const|let|var <ident> = ...` (até `;` a profundidade 0). */
function resolveAlias(source, ident) {
  const re = new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*=\\s*`, 'g');
  const m = re.exec(source);
  if (!m) return null;
  let i = m.index + m[0].length;
  const start = i;
  let depth = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(source, i);
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth += 1;
    else if (c === '}' || c === ')' || c === ']') depth -= 1;
    else if (depth === 0 && c === ';') break;
    i += 1;
  }
  return source.slice(start, i).trim();
}

/** `nome(...)` / `obj.metodo(...)` — chamada, valor não inferível aqui. */
function isCallExpression(expr) {
  const m = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/.exec((expr ?? '').trim());
  return m !== null;
}

/**
 * O nome é uma expressão CONSTANTE (não depende de estado)?
 *
 * Aceita: literal de string, template sem `${...}`, acesso a membro
 * (`t.map.showWind`, `item.label`) e um identificador cujo `const` no MESMO
 * ficheiro seja, ele próprio, uma destas formas (seguido até MAX_ALIAS_DEPTH).
 * Identificador sem `const` no ficheiro é aceite (é uma prop — ver limitações).
 * Qualquer condição no caminho (`? :`, `&&`, `||`, `??`, `${...}`) falha.
 */
function isConstantLabel(expression, source, depth = 0) {
  // `source` chega já mascarado (sem comentários) pelos chamadores públicos.
  const expr = (expression ?? '').trim();
  if (!expr) return false;
  if (depth > MAX_ALIAS_DEPTH) return false;

  // Literal de string ou template sem interpolação.
  if (/^'(?:[^'\\]|\\.)*'$/.test(expr)) return true;
  if (/^"(?:[^"\\]|\\.)*"$/.test(expr)) return true;
  if (expr.startsWith('`')) return !expr.includes('${');

  // Acesso a membro (uma ou mais ramificações) — inclui `item.label` e
  // `t.map.showWind`; não inclui chamadas (`t()`), que podem devolver estados.
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(expr)) return true;

  // Chamada — opaca: não se julga (ver limitações no cabeçalho).
  if (isCallExpression(expr)) return true;

  // Identificador simples: resolve o `const` do ficheiro.
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    const alias = resolveAlias(source, expr);
    if (alias === null) return true; // prop sem declaração local — não julgamos
    if (isCallExpression(alias)) return true; // `const x = f(y)` — opaca
    return isConstantLabel(alias, source, depth + 1);
  }

  return false;
}

/** Nome acessível do toggle, a partir do valor cru do atributo. */
function labelExpression(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  const value = rawValue.trim();
  if (value.startsWith('{') && value.endsWith('}')) return value.slice(1, -1).trim();
  return value;
}

/**
 * Violações num ficheiro: toggles (`aria-pressed`) cujo `aria-label` depende de
 * uma condição.
 * @param {string} relPath caminho relativo à raiz (para a exclusão do transporte)
 * @param {string} source
 * @returns {Array<{ file: string, line: number, expression: string }>}
 */
function findViolationsInSource(relPath, source) {
  if (typeof source !== 'string') return [];
  const masked = maskComments(source);
  const violations = [];
  for (const tag of extractJsxTags(masked)) {
    if (!getAttribute(tag.text, PRESSED_ATTRIBUTE).present) continue;
    const raw = getAttribute(tag.text, LABEL_ATTRIBUTE);
    if (!raw.present) continue;
    // Sem valor (`aria-label` a seco) não é um nome alternado.
    const expr = labelExpression(raw.value);
    if (expr === null || expr === '') continue;
    if (isConstantLabel(expr, masked)) continue;
    violations.push({
      file: relPath,
      line: countNewlines(masked.slice(0, tag.index)) + 1,
      expression: expr.replace(/\s+/g, ' ').slice(0, 160),
    });
  }
  return violations;
}

/**
 * Varre uma lista de ficheiros e devolve violações + quantos toggles viu.
 * A contagem serve para o CLI falhar quando o escopo encolhe (um guarda que
 * não vê nada não está a guardar nada).
 * @param {Array<{ path: string, source: string }>} files
 * @returns {{ violations: Array<object>, toggles: number }}
 */
function scanLayerControls(files) {
  const violations = [];
  let toggles = 0;
  for (const { path: relPath, source } of files) {
    if (TRANSPORT_FILES.includes(relPath)) continue;
    const masked = maskComments(source);
    for (const tag of extractJsxTags(masked)) {
      if (!getAttribute(tag.text, PRESSED_ATTRIBUTE).present) continue;
      toggles += 1;
      const raw = getAttribute(tag.text, LABEL_ATTRIBUTE);
      if (!raw.present) continue;
      const expr = labelExpression(raw.value);
      if (expr === null || expr === '') continue;
      if (isConstantLabel(expr, masked)) continue;
      violations.push({
        file: relPath,
        line: countNewlines(masked.slice(0, tag.index)) + 1,
        expression: expr.replace(/\s+/g, ' ').slice(0, 160),
      });
    }
  }
  return { violations, toggles };
}

/** Quantos toggles (`aria-pressed`) um ficheiro declara. */
function countToggles(source) {
  if (typeof source !== 'string') return 0;
  const masked = maskComments(source);
  let n = 0;
  for (const tag of extractJsxTags(masked)) {
    if (getAttribute(tag.text, PRESSED_ATTRIBUTE).present) n += 1;
  }
  return n;
}

/**
 * A configuração do guarda ainda corresponde ao código? Uma entrada em
 * TRANSPORT_FILES/LAYER_SCOPE_FILES que aponta para um ficheiro inexistente, ou
 * uma excepção para um ficheiro que já não tem toggles, são buracos silenciosos
 * (o guarda passa a verde sem cobrir o que julgava cobrir).
 * @param {Array<{ path: string, source: string }>} files ficheiros varridos
 * @returns {{ missing: string[], pointlessTransport: string[] }}
 */
function validateScope(files) {
  const byPath = new Map(files.map((f) => [f.path, f.source]));
  const configured = [...TRANSPORT_FILES, ...LAYER_SCOPE_FILES];
  const missing = configured.filter((p) => !byPath.has(p));
  const pointlessTransport = TRANSPORT_FILES.filter(
    (p) => byPath.has(p) && countToggles(byPath.get(p)) === 0,
  );
  return { missing, pointlessTransport };
}

/** Caminhos onde vivem os controlos de camada do mapa (varridos pelo CLI). */
const LAYER_SCOPE_DIRS = ['src/components/spots/map'];
const LAYER_SCOPE_FILES = [
  'src/components/spots/SpotMapInteractive.tsx',
  'src/components/spots/MapLayerToggle.tsx',
  // A pílula partilhada: é onde o `aria-pressed` nasce em quase todos os
  // filtros do mapa — se aqui o nome voltar a alternar, alastra a todos.
  'src/components/ui/FilterPill.tsx',
];

module.exports = {
  PRESSED_ATTRIBUTE,
  LABEL_ATTRIBUTE,
  TRANSPORT_FILES,
  MAX_ALIAS_DEPTH,
  LAYER_SCOPE_DIRS,
  LAYER_SCOPE_FILES,
  maskComments,
  extractJsxTags,
  getAttribute,
  isCallExpression,
  countToggles,
  validateScope,
  resolveAlias,
  isConstantLabel,
  findViolationsInSource,
  scanLayerControls,
};
