import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import postcss, { type Rule } from 'postcss';

/**
 * #459 V1 — pele v6 da página de spot na raiz `.v6`: os tokens do site são
 * remapeados para a paleta v6 (sempre escura), a faixa de segurança e as
 * acções ficam com contraste AA nos dois temas e os números são tabulares.
 */
const css = readFileSync(join(process.cwd(), 'src/styles/v6-atlantico.css'), 'utf-8');
const root = postcss.parse(css);

function regra(seletor: string): Rule {
  let achada: Rule | undefined;
  root.walkRules((r) => {
    if (r.selectors.includes(seletor) && !achada) achada = r;
  });
  if (!achada) throw new Error(`sem regra para ${seletor}`);
  return achada;
}

function decl(r: Rule, prop: string): string | undefined {
  let v: string | undefined;
  r.walkDecls(prop, (d) => {
    v = d.value;
  });
  return v;
}

const hex = (h: string) => {
  const n = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const lum = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const mistura = (cor: number[], alfa: number, fundo: number[]) =>
  cor.map((c, i) => Math.round(c * alfa + fundo[i] * (1 - alfa)));

const ABISMO = hex('#030E18');
const FUNDO = hex('#071B2C');

describe('spot v6 — tokens na raiz (#459 V1)', () => {
  it('os tokens do site são remapeados em .v6 e não só no contexto', () => {
    const r = regra('.v6');
    // a regra com o remap é a que define --fg; tem de ser na raiz
    let raiz: Rule | undefined;
    root.walkRules((x) => {
      if (x.selectors.includes('.v6') && decl(x, '--fg')) raiz = x;
    });
    expect(r).toBeTruthy();
    expect(raiz, 'remap dos tokens em .v6').toBeTruthy();
    expect(decl(raiz!, '--fg')).toBe('243 248 251');
    expect(decl(raiz!, '--bg-elevated')).toBe('7 27 44');
    let noCtx = false;
    root.walkRules((x) => {
      if (x.selectors.some((s) => /\.ctx\s*$/.test(s)) && decl(x, '--fg')) noCtx = true;
    });
    expect(noCtx, 'o remap saiu do .v6 .ctx').toBe(false);
  });

  it('o rodapé do site na rota de spot recebe os mesmos tokens e fundo escuro', () => {
    let remap = false;
    root.walkRules((x) => {
      if (x.selectors.includes('body:has(.v6) [data-site-footer]') && decl(x, '--fg')) remap = true;
    });
    expect(remap).toBe(true);
    let fundo: string | undefined;
    root.walkRules((x) => {
      if (x.selector === 'body:has(.v6) [data-site-footer]') fundo = decl(x, 'background') ?? fundo;
    });
    expect(fundo).toBe('#030E18');
  });

  it('o contorno das acções tem ≥ 3:1 sobre o --abismo e o --fundo', () => {
    let borda: string | undefined;
    root.walkRules((x) => {
      borda = decl(x, '--acao-borda') ?? borda;
    });
    expect(borda).toBeTruthy();
    expect(contraste(hex(borda!), ABISMO)).toBeGreaterThanOrEqual(3);
    expect(contraste(hex(borda!), FUNDO)).toBeGreaterThanOrEqual(3);
    expect(decl(regra('.v6 .acao'), 'box-shadow')).toContain('var(--acao-borda)');
  });

  it('cada font: (excepto inherit) é seguido de algarismos tabulares', () => {
    const falhas: string[] = [];
    root.walkRules((r) => {
      let pendente = false;
      r.each((n) => {
        if (n.type !== 'decl') return;
        if (n.prop === 'font' && n.value !== 'inherit') pendente = true;
        if (n.prop === 'font-variant-numeric' && /tabular-nums/.test(n.value)) pendente = false;
      });
      if (pendente) falhas.push(r.selector);
    });
    expect(falhas).toEqual([]);
  });

  it('faixa de perigo: título, meta e pílula com contraste AA sobre o fundo misturado', () => {
    const perigo = mistura(hex('#A8464A'), 0.18, ABISMO);
    expect(contraste(hex('#FFFFFF'), perigo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hex('#E7EEF3'), perigo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hex('#FF8A8E'), perigo)).toBeGreaterThanOrEqual(3);
    const amarelo = mistura(hex('#C99E2A'), 0.16, ABISMO);
    expect(contraste(hex('#E7EEF3'), amarelo)).toBeGreaterThanOrEqual(4.5);
    for (const pilula of ['#F28C28', '#FFC93C', '#E0656A']) {
      expect(contraste(hex('#04131F'), hex(pilula)), pilula).toBeGreaterThanOrEqual(4.5);
    }
    expect(decl(regra('.v6 [data-faixa=perigo] [data-faixa-t]'), 'color')).toBe('#fff');
    expect(decl(regra('.v6 [data-faixa] [data-faixa-meta]'), 'color')).toBe('#E7EEF3');
    expect(decl(regra('.v6 [data-faixa]'), 'font-family')).toBe('var(--txt)');
  });

  it('popovers das acções com fundo sólido', () => {
    expect(decl(regra('.v6 .acoes .absolute.z-50'), 'background')).toBe('var(--fundo)');
  });

  it('aviso «Laranja» compacto: tinta AA sem mexer no fill da banda', () => {
    // a raiz continua a mapear --score-poor para a banda «Não dá» (#A8464A)
    let raiz: Rule | undefined;
    root.walkRules((x) => {
      if (x.selectors.includes('.v6') && decl(x, '--fg')) raiz = x;
    });
    expect(decl(raiz!, '--score-poor')).toBe('168 70 74');
    // e cores.md: «Não dá» como texto só ≥ 24 px — o pill ganha tinta AA própria
    expect(decl(regra(".v6 [data-ipma-nivel='orange']"), '--score-poor')).toBe('242 140 40');
    // #F28C28 sobre o --abismo e sobre a sua tinta bg-score-poor/15
    const tinta = mistura(hex('#F28C28'), 0.15, ABISMO);
    expect(contraste(hex('#F28C28'), ABISMO)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(hex('#F28C28'), tinta)).toBeGreaterThanOrEqual(4.5);
  });

  it('erro do popover «Alerta-me»: vermelho AA do tema escuro', () => {
    expect(decl(regra('.v6 .acao-alerta'), '--score-poor')).toBe('248 113 113');
    // #F87171 sobre o --fundo sólido do popover
    expect(contraste(hex('#F87171'), FUNDO)).toBeGreaterThanOrEqual(4.5);
  });
});
