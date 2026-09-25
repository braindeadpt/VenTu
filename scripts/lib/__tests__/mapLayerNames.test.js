import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const {
  TRANSPORT_FILES,
  LAYER_SCOPE_DIRS,
  LAYER_SCOPE_FILES,
  getAttribute,
  resolveAlias,
  isConstantLabel,
  findViolationsInSource,
  scanLayerControls,
  validateScope,
} = require('../mapLayerNames.js');

const ROOT = path.join(here, '..', '..', '..');

/** Toggle mínimo: `aria-pressed` + `aria-label` com a expressão indicada. */
const toggle = (labelExpr, extra = '') =>
  `<button aria-pressed={on} aria-label={${labelExpr}} ${extra} />`;

const violationsOf = (source) => findViolationsInSource('src/x.tsx', source);

describe('mapLayerNames — nome = modo nos controlos de camada', () => {
  it('aceita um literal de string (o nome é a camada, não o estado)', () => {
    expect(violationsOf('<button aria-pressed={on} aria-label="Vento" />')).toEqual([]);
    expect(violationsOf(`<button aria-pressed={on} aria-label={'Radar IPMA'} />`)).toEqual([]);
  });

  it('aceita uma chave de tradução constante', () => {
    expect(violationsOf(toggle('t.map.showWind'))).toEqual([]);
    expect(violationsOf(toggle('item.label'))).toEqual([]);
    expect(violationsOf(toggle('t.map.layers.isobaths'))).toEqual([]);
  });

  it('aceita template sem interpolação', () => {
    expect(violationsOf('<button aria-pressed={on} aria-label={`Vento`} />')).toEqual([]);
  });

  it('recusa um ternário — o caso real do «Mostrar vento» ↔ «Ocultar vento»', () => {
    const source = toggle('windEnabled ? t.map.hideWind : t.map.showWind');
    const found = violationsOf(source);
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe('src/x.tsx');
    expect(found[0].line).toBe(1);
    expect(found[0].expression).toBe(
      'windEnabled ? t.map.hideWind : t.map.showWind',
    );
  });

  it('recusa `&&`, `||`, `??` e template interpolado', () => {
    expect(violationsOf(toggle("on && t.map.hideWind"))).toHaveLength(1);
    expect(violationsOf(toggle("on || t.map.showWind"))).toHaveLength(1);
    expect(violationsOf(toggle('on ?? t.map.showWind'))).toHaveLength(1);
    expect(violationsOf('<button aria-pressed={on} aria-label={`Vento ${n}`} />')).toHaveLength(
      1,
    );
  });

  it('segue um identificador até ao `const` do próprio ficheiro', () => {
    // Constante por indirecção: aceite.
    expect(
      violationsOf(
        ['const windLabel = t.map.wind;', toggle('windLabel')].join('\n'),
      ),
    ).toEqual([]);
    // Condicional por indirecção: recusado, com a linha do toggle (2).
    const found = violationsOf(
      ['const windLabel = on ? t.map.hideWind : t.map.showWind;', toggle('windLabel')].join('\n'),
    );
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
    expect(found[0].expression).toBe('windLabel');
  });

  it('não julga identificadores sem `const` local (são props do pai)', () => {
    expect(violationsOf(toggle('clusterLabel'))).toEqual([]);
  });

  it('ignora elementos sem aria-pressed (não são toggles) e toggles sem aria-label', () => {
    // Controlo de acção com nome alternado: fora do escopo do guarda.
    expect(violationsOf('<button aria-label={on ? "Fechar" : "Abrir"} />')).toEqual([]);
    // Toggle cujo nome vem do conteúdo textual: nada a verificar.
    expect(violationsOf('<button aria-pressed={on}>Vento</button>')).toEqual([]);
  });

  it('lê atributos em tags multilinha e ignora comentários', () => {
    const source = [
      '// aria-label={on ? "a" : "b"} em comentário não conta',
      '<button',
      '  aria-pressed={windOn}',
      '  aria-label={windOn ? t.map.hideWind : t.map.showWind}',
      '/>',
    ].join('\n');
    const found = violationsOf(source);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
  });

  it('vê uma tag logo a seguir a um comentário JSX (regressão real)', () => {
    // Sem mascarar comentários, o `}` final de `{/* … */}` fazia a tag passar
    // por comparação (`a > b`) e o toggle desaparecia da varredura.
    const source = [
      '<div>',
      '  {/* Nome = modo, constante — estado só no aria-pressed */}',
      '  <button',
      '    aria-pressed={on}',
      '    aria-label={on ? t.map.hideWind : t.map.showWind}',
      '  />',
      '</div>',
    ].join('\n');
    const { violations, toggles } = scanLayerControls([{ path: 'src/x.tsx', source }]);
    expect(toggles).toBe(1);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(3);
  });

  it('não conta toggles comentados', () => {
    const source = [
      '/*',
      toggle('on ? t.map.hideWind : t.map.showWind'),
      '*/',
      toggle('t.map.wind'),
    ].join('\n');
    const { violations, toggles } = scanLayerControls([{ path: 'src/x.tsx', source }]);
    expect(toggles).toBe(1);
    expect(violations).toEqual([]);
  });

  it('conta os toggles vistos (independente de haver violação)', () => {
    const files = [
      { path: 'src/a.tsx', source: '<button aria-pressed={a} aria-label="Vento" />' },
      { path: 'src/b.tsx', source: toggle('on ? x : y') },
      { path: 'src/c.tsx', source: '<button onClick={f}>Fechar</button>' },
    ];
    const { violations, toggles } = scanLayerControls(files);
    expect(toggles).toBe(2);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe('src/b.tsx');
  });

  it('exclui o transporte de tempo (play/pause), por ficheiro', () => {
    // MapTimeTrack (trilho do radar/48 h) e MapTimeChrome (HUD de horas da v3).
    expect(TRANSPORT_FILES).toEqual([
      'src/components/spots/map/MapTimeTrack.tsx',
      'src/components/spots/map/MapTimeChrome.tsx',
    ]);
    const { toggles } = scanLayerControls(
      TRANSPORT_FILES.map((p) => ({ path: p, source: toggle('on ? pause : play') })),
    );
    expect(toggles).toBe(0);
  });

  it('não julga chamadas — opacas, não estados (caso real do MapLayersMenu v3)', () => {
    // `const name = itemName(item)` é o nome real de main: aceitar, senão o
    // guarda bloqueia código são e a saída seria uma excepção por ficheiro.
    expect(
      violationsOf([
        'const itemName = (item) => item.name ?? item.label;',
        'const render = (item) => {',
        '  const name = itemName(item);',
        '  return ' + toggle('name') + ';',
        '};',
      ].join('\n')),
    ).toEqual([]);
    expect(violationsOf(toggle('getLabel()'))).toEqual([]);
    expect(violationsOf(toggle('t.map.fallback(1)'))).toEqual([]);
    // O que continua apanhado: a condicional inline.
    expect(violationsOf(toggle("on ? getLabel() : 'Vento'"))).toHaveLength(1);
  });

  it('validateScope apanha excepções sem objecto (ficheiro movido ou sem toggle)', () => {
    const configured = [...TRANSPORT_FILES, ...LAYER_SCOPE_FILES].map((p) => ({
      path: p,
      source: toggle('on ? pause : play'),
    }));
    expect(validateScope(configured)).toEqual({ missing: [], pointlessTransport: [] });

    // Nada varrido (rename/movimento) → tudo o que está configurado é reportado.
    expect(validateScope([]).missing).toEqual([...TRANSPORT_FILES, ...LAYER_SCOPE_FILES]);
    expect(
      validateScope([{ path: TRANSPORT_FILES[0], source: '' }]).missing,
    ).toEqual([TRANSPORT_FILES[1], ...LAYER_SCOPE_FILES]);

    const noToggle = TRANSPORT_FILES.map((p) => ({ path: p, source: '<button>Fechar</button>' }));
    expect(validateScope(noToggle).pointlessTransport).toEqual(TRANSPORT_FILES);
  });

  it('getAttribute e resolveAlias: formas que o guarda tem de ler', () => {
    expect(getAttribute('<b aria-label="Vento" />', 'aria-label')).toEqual({
      present: true,
      value: '"Vento"',
    });
    expect(getAttribute('<b aria-pressed />', 'aria-pressed')).toEqual({
      present: true,
      value: null,
    });
    expect(getAttribute('<b />', 'aria-label')).toEqual({ present: false, value: null });
    expect(resolveAlias('const a = on ? 1 : 2;', 'a')).toBe('on ? 1 : 2');
    expect(resolveAlias('const a = t.map.wind;', 'a')).toBe('t.map.wind');
    expect(resolveAlias('const b = 1;', 'a')).toBe(null);
    expect(isConstantLabel('t.map.wind', '')).toBe(true);
    expect(isConstantLabel('on ? x : y', '')).toBe(false);
  });
});

/** Percorre o escopo real do CLI (mesma varredura que o passo de CI). */
function realScope() {
  const out = [];
  const walk = (absDir, relDir) => {
    for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
      const abs = path.join(absDir, e.name);
      const rel = `${relDir}/${e.name}`;
      if (e.isDirectory()) walk(abs, rel);
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
  };
  for (const dir of LAYER_SCOPE_DIRS) walk(path.join(ROOT, dir), dir);
  for (const file of LAYER_SCOPE_FILES) out.push(file);
  return out
    .filter((rel) => !TRANSPORT_FILES.includes(rel))
    .map((rel) => ({ path: rel, source: fs.readFileSync(path.join(ROOT, rel), 'utf-8') }));
}

describe('mapLayerNames — controlos de camada reais', () => {
  const files = realScope();

  it('varre o chrome do mapa e encontra toggles (senão o guarda não guarda nada)', () => {
    const { toggles } = scanLayerControls(files);
    // Pisos iguais aos do CLI (MIN_FILES / MIN_TOGGLES).
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(toggles).toBeGreaterThanOrEqual(8);
  });

  it('todos os toggles reais têm nome constante (nome=modo)', () => {
    const { violations } = scanLayerControls(files);
    expect(violations).toEqual([]);
  });

  it('detectaria a regressão se um toggle real voltasse a alternar o nome', () => {
    // Muta em memória o ficheiro real (o CLI alimenta a MESMA função) e
    // confirma que o guarda não passaria a verde.
    const target = 'src/components/spots/map/components/MapControls.tsx';
    const original = files.find((f) => f.path === target);
    expect(original, `${target} saiu do escopo do guarda`).toBeTruthy();
    const mutated = original.source.replace(
      'aria-label={windLabel}',
      'aria-label={windEnabled ? t.map.hideWind : t.map.showWind}',
    );
    expect(mutated).not.toBe(original.source);
    const { violations } = scanLayerControls([{ path: target, source: mutated }]);
    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe(target);
  });
});
