import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { WARNING_BADGE_COLORS } from '@/lib/mapWindArrow';

/**
 * #458 (P0): na pele v6 do /mapa, `--score-poor` é o azul da banda «Fraco» (#4479EE).
 * Os avisos de perigo e o IPMA «Laranja» usavam esse token e ficavam azuis, com 4,34:1.
 * A pele repõe-lhes uma cor de alerta no próprio elemento do aviso.
 */
const css = fs.readFileSync(path.resolve('src/styles/mapa-pele-v6.css'), 'utf8');
const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Valor de `--score-poor` declarado na regra cujo seletor contém `gancho`. */
function poorNoGancho(gancho: string): [number, number, number] | null {
  for (const regra of semComentarios.split('}')) {
    const [seletores, corpo = ''] = regra.split('{');
    if (!seletores.split(',').some((s) => s.trim() === `[data-pele='v6'] ${gancho}`)) continue;
    const m = corpo.match(/--score-poor:\s*(\d+)\s+(\d+)\s+(\d+)/);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return null;
}

function luminancia([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contraste(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const FUNDO: [number, number, number] = [7, 27, 44]; // --fundo #071B2C, painéis da pele
const AZUL_FRACO: [number, number, number] = [68, 121, 238];

/** Texto do aviso sobre o próprio fundo do chip (`bg-score-poor/15` sobre #071B2C). */
function sobreChip(cor: [number, number, number]): [number, number, number] {
  return FUNDO.map((f, i) => Math.round(f * 0.85 + cor[i] * 0.15)) as [number, number, number];
}

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

describe('pele v6: alertas fora do azul de «Fraco» (#458)', () => {
  const ganchos = [
    "[data-alerta='perigo']",
    '[data-map-storms-toggle]',
    '[data-map-warn-areas-toggle]',
    '[data-map-coastal-warnings-toggle]',
    "[data-ipma-nivel='orange']",
  ];

  it.each(ganchos)('%s tem cor própria, não o azul da banda, e passa AA (≥ 4,5:1)', (g) => {
    const cor = poorNoGancho(g);
    expect(cor, g).not.toBeNull();
    expect(cor).not.toEqual(AZUL_FRACO);
    expect(contraste(cor!, sobreChip(cor!))).toBeGreaterThanOrEqual(4.5);
  });

  it('o «Laranja» do chip é o laranja do selo do marcador', () => {
    expect(poorNoGancho("[data-ipma-nivel='orange']")).toEqual(hex(WARNING_BADGE_COLORS.orange));
  });

  it('o azul da banda continua a ser o --score-poor da pele (marcadores, pontos, grupos)', () => {
    expect(semComentarios).toMatch(/--score-poor:68 121 238/);
  });

  it('os componentes expõem os ganchos', () => {
    // Normaliza CRLF→LF: num checkout Windows (autocrlf) o source tem \r\n
    // e os asserts com \n literal falham sem a conversão.
    const ler = (p: string) => fs.readFileSync(path.resolve(p), 'utf8').replace(/\r\n/g, '\n');
    const nota = ler('src/components/ui/WindSafetyNote.tsx');
    expect(nota).toMatch(/data-alerta=\{level === 'side-offshore' \? undefined : 'perigo'\}/);
    expect(ler('src/components/ui/WarningPill.tsx')).toMatch(/data-ipma-nivel=\{warning\.level\}/);
  });

  it('a pílula da hora não pinta o texto com a cor da nota na pele', () => {
    const chrome = fs.readFileSync(path.resolve('src/components/spots/map/MapTimeChrome.tsx'), 'utf8');
    expect(chrome).toMatch(/color: v6 \? 'rgb\(var\(--fg\)\)' : 'rgb\(var\(--verdict\)\)'/);
  });
});
