import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_PELE_LS_KEY, MAP_PELE_PARAM, resolveMapPele } from '@/lib/mapPele';
import { V6_BANDAS, V6_UI } from '@/lib/v6Tokens';

/** Fase B, PR B0: flag da pele v6 do /mapa e tokens no âmbito [data-pele=v6]. */
describe('resolveMapPele (flag ?pele=v6 + localStorage)', () => {
  it('chaves estáveis', () => {
    expect(MAP_PELE_PARAM).toBe('pele');
    expect(MAP_PELE_LS_KEY).toBe('ventu:map:pele');
  });
  it('sem parâmetro e sem nada gravado: o /mapa de hoje, sem mexer na preferência', () => {
    expect(resolveMapPele(null, null)).toEqual({ pele: null, gravar: null });
  });
  it('?pele=v6 liga e grava (maiúsculas e espaços tolerados)', () => {
    expect(resolveMapPele('v6', null)).toEqual({ pele: 'v6', gravar: 'v6' });
    expect(resolveMapPele(' V6 ', null)).toEqual({ pele: 'v6', gravar: 'v6' });
  });
  it('sem parâmetro, vale o gravado (só o valor exacto v6)', () => {
    expect(resolveMapPele(null, 'v6')).toEqual({ pele: 'v6', gravar: null });
    expect(resolveMapPele(null, 'v5')).toEqual({ pele: null, gravar: null });
    expect(resolveMapPele(null, '')).toEqual({ pele: null, gravar: null });
  });
  it('qualquer outro ?pele= desliga e apaga a preferência, mesmo com v6 gravado', () => {
    for (const p of ['0', 'actual', 'off', '', 'v7']) {
      expect(resolveMapPele(p, 'v6'), p).toEqual({ pele: null, gravar: 'apagar' });
    }
  });
});

describe('mapa-pele-v6.css', () => {
  const css = fs.readFileSync(path.resolve('src/styles/mapa-pele-v6.css'), 'utf8');
  const regras = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter(Boolean);

  it('todas as regras ficam no âmbito [data-pele=v6] (desligada = zero diferença)', () => {
    expect(regras.length).toBeGreaterThan(0);
    for (const r of regras) {
      const seletores = r.split('{')[0].split(',').map((s) => s.trim());
      for (const s of seletores) expect(s, s).toMatch(/^\[data-pele='v6'\]/);
    }
    expect(css).not.toMatch(/@font-face|@import|:root|html|body\s*\{/);
  });

  it('os tokens v6 são os de v6Tokens.ts (cores.md), sem inventar outros', () => {
    const v = (nome: string) => css.match(new RegExp(`--${nome}:(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase();
    for (const [nome, cor] of Object.entries(V6_UI)) expect(v(nome), nome).toBe(cor.toUpperCase());
    for (const [b, { c, t }] of Object.entries(V6_BANDAS)) {
      expect(v(`b-${b}`), b).toBe(c.toUpperCase());
      expect(v(`b-${b}-t`), `${b}-t`).toBe(t.toUpperCase());
    }
  });

  it('Barlow Condensed + Barlow, das fontes já auto-alojadas', () => {
    expect(css).toMatch(/--disp:'Barlow Condensed'/);
    expect(css).toMatch(/--txt:'Barlow'/);
    const fontes = fs.readFileSync(path.resolve('src/styles/v6-fontes.css'), 'utf8');
    expect(fontes).not.toMatch(/googleapis|gstatic/);
  });
});
