import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import postcss, { type AtRule, type Rule } from 'postcss';

/**
 * Guarda do <select> nativo legível nos dois temas.
 *
 * Bug (desktop): o seletor de língua do cabeçalho abria o popup nativo com
 * fundo BRANCO e as opções (PT, ES, DE, FR) em cinzento claro — ilegíveis.
 * Causa: nenhum color-scheme no tema, por isso o browser desenhava o popup em
 * esquema claro enquanto as <option> herdavam a tinta clara do tema escuro.
 *
 * Contrato (globals.css, @layer base):
 *  - select → color-scheme: dark (tema escuro, por defeito);
 *  - .theme-ocean select → color-scheme: light;
 *  - superfícies v6 (sempre escuras) voltam a dark mesmo com .theme-ocean;
 *  - option/optgroup com fundo e tinta explícitos dos tokens do tema.
 * O color-scheme fica no select (não no :root) para não mexer em scrollbars
 * nem noutros controlos do site.
 */
const ROOT = join(__dirname, '..', '..', '..');
const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf-8');
const v6Home = readFileSync(join(ROOT, 'src/styles/v6-home.css'), 'utf-8');
const v6Atl = readFileSync(join(ROOT, 'src/styles/v6-atlantico.css'), 'utf-8');

/** Regras dentro de `@layer base` → mapa selector normalizado → declarações. */
function baseLayerRules(src: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  postcss.parse(src).walkAtRules('layer', (at: AtRule) => {
    if (at.params.trim() !== 'base') return;
    at.walkRules((rule: Rule) => {
      // ignora regras dentro de @media (reduced motion, etc.)
      if (rule.parent && rule.parent.type === 'atrule' && (rule.parent as AtRule).name !== 'layer') return;
      const decls: Record<string, string> = {};
      rule.walkDecls((d) => {
        decls[d.prop] = d.value.replace(/\s+/g, ' ').trim();
      });
      for (const sel of rule.selectors) {
        const key = sel.replace(/\s+/g, ' ').trim();
        out.set(key, { ...(out.get(key) ?? {}), ...decls });
      }
    });
  });
  return out;
}

const rules = baseLayerRules(css);

describe('<select> nativo — color-scheme por tema (popup legível)', () => {
  it('tema escuro (defeito): select tem color-scheme dark', () => {
    expect(rules.get('select')?.['color-scheme']).toBe('dark');
  });

  it('tema claro (.theme-ocean): select tem color-scheme light', () => {
    expect(rules.get('.theme-ocean select')?.['color-scheme']).toBe('light');
  });

  it('superfícies v6 ficam dark mesmo com .theme-ocean', () => {
    const v6 = [...rules.entries()].find(([sel]) => sel.startsWith('.theme-ocean :is(') && sel.endsWith(' select'));
    expect(v6, 'regra .theme-ocean :is(…v6…) select').toBeTruthy();
    const [sel, decls] = v6!;
    for (const s of ['.v6', '.v6h', '.site-header[data-v6]']) expect(sel).toContain(s);
    expect(decls['color-scheme']).toBe('dark');
    // e os ficheiros v6 continuam a declarar o esquema escuro nas raízes
    expect(v6Home).toMatch(/\.v6h\{[^}]*color-scheme:dark/);
    expect(v6Home).toMatch(/\.site-header\[data-v6=home\]\{[^}]*color-scheme:dark/);
    expect(v6Atl).toMatch(/\.v6\{[^}]*color-scheme:dark/);
  });

  it('option/optgroup com fundo e tinta explícitos dos tokens do tema', () => {
    for (const sel of ['select option', 'select optgroup']) {
      expect(rules.get(sel)?.['background-color']).toBe('rgb(var(--bg-elevated))');
      expect(rules.get(sel)?.['color']).toBe('rgb(var(--fg))');
    }
  });

  it('o tema claro define os tokens que as opções usam (fundo claro, tinta escura)', () => {
    const ocean = rules.get('.theme-ocean');
    expect(ocean?.['--bg-elevated']).toMatch(/^255 255 255/);
    expect(ocean?.['--fg']).toMatch(/^15 23 42/);
    const dark = rules.get(':root');
    expect(dark?.['--bg-elevated']).toMatch(/^30 41 59/);
    expect(dark?.['--fg']).toMatch(/^241 245 249/);
  });

  it('não põe color-scheme no :root nem no .theme-ocean (scrollbars e outros controlos intactos)', () => {
    expect(rules.get(':root')?.['color-scheme']).toBeUndefined();
    expect(rules.get('.theme-ocean')?.['color-scheme']).toBeUndefined();
  });
});
