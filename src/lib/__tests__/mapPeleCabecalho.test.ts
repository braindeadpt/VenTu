import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MAP_PELE_CABECALHO_ATTR, marcarCabecalho } from '@/lib/mapPeleCabecalho';
import { V6_UI } from '@/lib/v6Tokens';

/** Fase B do /mapa, B8: cabeçalho do site em tokens v6 + atribuição, só com `?pele=v6`. */
const ler = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

function fakeDoc(temCabecalho = true) {
  const attrs = new Map<string, string>();
  const el = {
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  };
  return { doc: { querySelector: () => (temCabecalho ? el : null) } as unknown as Document, attrs };
}

describe('marcarCabecalho', () => {
  it('marca o cabeçalho só com a pele e desmarca no cleanup', () => {
    const { doc, attrs } = fakeDoc();
    const limpar = marcarCabecalho(doc, 'v6');
    expect(attrs.get(MAP_PELE_CABECALHO_ATTR)).toBe('v6');
    limpar();
    expect(attrs.has(MAP_PELE_CABECALHO_ATTR)).toBe(false);
  });
  it('sem pele retira a marca (desligar a flag no próprio /mapa)', () => {
    const { doc, attrs } = fakeDoc();
    attrs.set(MAP_PELE_CABECALHO_ATTR, 'v6');
    marcarCabecalho(doc, null);
    expect(attrs.has(MAP_PELE_CABECALHO_ATTR)).toBe(false);
  });
  it('sem cabeçalho não falha', () => {
    const { doc } = fakeDoc(false);
    expect(() => marcarCabecalho(doc, 'v6')()).not.toThrow();
  });
});

describe('mapa-pele-cabecalho.css', () => {
  const css = ler('src/styles/mapa-pele-cabecalho.css');
  const regras = css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter(Boolean);
  it('todas as regras exigem o atributo da pele (desligada = zero diferença)', () => {
    expect(regras.length).toBeGreaterThan(0);
    for (const r of regras) {
      for (const s of r.split('{')[0].split(',').map((x) => x.trim())) {
        expect(s, s).toMatch(/^\.site-header\[data-pele-cabecalho='v6'\]/);
      }
    }
    expect(css).not.toMatch(/@media|:root|@import|@font-face/);
  });
  it('usa as cores v6 (abismo, linha, espuma, névoa, sol, gelo)', () => {
    const hex = (c: string) => c.replace('#', '').match(/../g)!.map((h) => parseInt(h, 16)).join(' ');
    expect(css).toContain(`--bg-base:${hex(V6_UI.abismo)}`);
    expect(css).toContain(`--accent:${hex(V6_UI.gelo)}`);
    for (const c of [V6_UI.linha, V6_UI.espuma, V6_UI.nevoa, V6_UI.sol]) expect(css.toUpperCase()).toContain(c.toUpperCase());
  });
  it('não muda a altura do cabeçalho (48 px, h-12)', () => {
    expect(css).not.toMatch(/height|min-height|padding/);
  });
});

describe('ligações', () => {
  it('o /mapa importa o CSS e chama o hook com a pele', () => {
    const c = ler('src/components/spots/MapaFullscreenClient.tsx');
    expect(c).toContain("import '@/styles/mapa-pele-cabecalho.css'");
    expect(c).toContain('useMapPeleCabecalho(pele)');
  });
  it('o Header não ganha atributo de pele no markup (só o gancho neutro da etiqueta)', () => {
    const h = ler('src/components/layout/Header.tsx');
    expect(h).not.toContain('data-pele');
    expect(h).toContain('data-cabecalho-onde');
  });
  it('a atribuição v6 mantém o controlo Leaflet e as ligações acima de .theme-ocean', () => {
    const v6 = ler('src/styles/mapa-pele-v6.css');
    expect(v6).toContain("[data-pele='v6'] .leaflet-control-attribution{");
    expect(v6).toContain("[data-pele='v6'] .leaflet-control-attribution a[href]{");
    expect(v6).not.toMatch(/leaflet-control-attribution[^{]*\{[^}]*display:\s*none/);
  });
});
