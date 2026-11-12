import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fraseCartaoV6 } from '@/components/spots/MapSpotPreview';
import { mapUiMarkers } from '@/lib/translations/mapUi/markers';

/**
 * Fase B do /mapa, B3.5 — acabamentos da B2–B4 face à maquete:
 * (1) B2: pílulas a 38 px só no painel desktop; linha «nível + contagem» no peek;
 * (2) B3: rótulos de dia e triângulo do passo, chips de maré/brisa em r-chip v6;
 * (3) B4: «[Bom] para surf às 14h» e selo de confiança v6.
 * Tudo atrás de [data-pele='v6'], sem @media nem :root (a regra do ficheiro).
 */
const raiz = process.cwd();
const css = readFileSync(join(raiz, 'src/styles/mapa-pele-v6.css'), 'utf-8');
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
const regras = [...semComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ seletor: m[1].trim(), corpo: m[2] }));
const regra = (s: string) => regras.find((r) => r.seletor === s);
const ler = (f: string) => readFileSync(join(raiz, f), 'utf-8');

describe('B3.5 · CSS', () => {
  it('cada regra nova está dentro da pele', () => {
    for (const s of [
      "[data-pele='v6'] [data-map-panel] [data-mx='modalidades'] .pill",
      "[data-pele='v6'] [data-mx='f-cont']",
      "[data-pele='v6'] [data-mr='r-dn']",
      "[data-pele='v6'] [data-mr='r-c'][data-on]::before",
      "[data-pele='v6'] [data-ms='meta'] [data-provenance-axis='confidence']",
    ]) expect(regra(s), s).toBeDefined();
    expect(semComentarios).not.toMatch(/:root|@media/);
  });
  it('pílulas a 38 px só no painel; a folha mantém 44 px', () => {
    expect(regra("[data-pele='v6'] [data-map-panel] [data-mx='modalidades'] .pill")!.corpo).toContain('min-height:38px');
    expect(regra("[data-pele='v6'] [data-mx='modalidades'] .pill")!.corpo).toContain('min-height:44px');
  });
  it('triângulo espuma no desktop, escondido na régua compacta', () => {
    expect(regra("[data-pele='v6'] [data-mr='r-c'][data-on]::before")!.corpo).toContain('border-top-color:var(--espuma)');
    expect(regra("[data-pele='v6'] [data-mr='regua'][data-compacto] [data-mr='r-c'][data-on]::before")!.corpo).toContain('display:none');
  });
});

describe('B3.5 · componentes', () => {
  it('rótulos de dia só com a pele, no mesmo gancho condicional', () => {
    const f = ler('src/components/spots/map/MapTimeChrome.tsx');
    expect(f).toContain("data-mr={v6 ? 'r-dias' : undefined}");
    expect(f).toContain("data-mr={v6 ? 'r-dn' : undefined}");
    expect(f).toMatch(/if \(!v6 \|\| n <= 1\) return \[\];/);
  });
  it('a linha do nível do peek só existe com tecto (e só na pele) e sobe os snaps', () => {
    const f = ler('src/components/spots/map/components/MapExploreSheet.tsx');
    expect(f).toMatch(/const nivelRotulo = v6 && selectedDifficulty !== 'all'/);
    expect(f).toContain('const extra = grabberH - GRABBER_H + linhaNivelH;');
    expect(f).toContain("onClick={() => onDifficultyChange('all')}");
  });
});

describe('B3.5 · frase do cartão', () => {
  it('«para surf às 14h», «para surf agora» e, em todas as modalidades, só a hora', () => {
    expect(fraseCartaoV6('pt', 'surf', 'Surf', '14h')).toBe('para surf às 14h');
    expect(fraseCartaoV6('pt', 'surf', 'Surf', 'agora')).toBe('para surf agora');
    expect(fraseCartaoV6('pt', 'all', 'Melhor modalidade', '14h')).toBe('às 14h');
    expect(fraseCartaoV6('en', 'kitesurf', 'Kitesurf', '14h')).toBe('for kitesurf at 14h');
    expect(fraseCartaoV6('de', 'kitesurf', 'Kitesurfen', '14h')).toBe('für Kitesurfen um 14h');
  });
  it('as duas chaves existem nas cinco línguas', () => {
    for (const [loc, d] of Object.entries(mapUiMarkers)) {
      expect(d.cardForSport, loc).toContain('{sport}');
      expect(d.cardAtHour, loc).toContain('{hora}');
    }
  });
});
