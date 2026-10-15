/**
 * Frase nacional da noite (#183): «Amanhã de manhã: <frase>» com um só «:».
 *
 * As frases sem `corpo` (pouco vento, frente, vento torto, mar grande, vento a
 * estragar) já trazem os seus dois pontos; ao pô-las atrás do nome do bloco
 * saía «Amanhã de manhã: pouco vento na costa: kite não dá». Agora os «:» da
 * 1.ª oração da frase passam a vírgula, nas 5 línguas (es/de/fr usam a cópia EN).
 */
import { describe, expect, it } from 'vitest';
import { homeV6Copy } from '@/lib/translations/homeV6';
import { textoFrase } from '@/lib/home/homeV6';
import { locales } from '@/lib/i18n';

const limpa = (s: string) => textoFrase(s).replace(/\s+/g, ' ').trim();
/** A 1.ª oração (até ao primeiro «. »), onde não pode haver dois «:». */
const primeiraOracao = (s: string) => limpa(s).split(/\.(?:\s|$)/)[0];
const doisPontos = (s: string) => (s.match(/:/g) ?? []).length;

describe('home v6: frase da noite com um só «:»', () => {
  it('pt: «Amanhã de manhã: pouco vento na costa, kite não dá.»', () => {
    const c = homeV6Copy('pt');
    expect(limpa(c.comBloco(c.nomeBloco(1, 'manha'), c.poucoVentoCosta('kite')))).toBe(
      'Amanhã de manhã: pouco vento na costa, kite não dá.',
    );
    expect(c.comBloco(c.nomeBloco(1, 'manha'), c.poucoVentoCosta('kite'))).toContain('<em>não dá</em>');
    expect(limpa(c.comBloco(c.nomeBloco(1, 'tarde'), c.ventoTorto('kite', 'fraco')))).toBe(
      'Amanhã à tarde: vento torto para kite, fraco em toda a costa.',
    );
  });

  it('en: «Tomorrow morning: light wind on the coast, kite is a no go.»', () => {
    const c = homeV6Copy('en');
    expect(limpa(c.comBloco(c.nomeBloco(1, 'manha'), c.poucoVentoCosta('kite')))).toBe(
      'Tomorrow morning: light wind on the coast, kite is a no go.',
    );
  });

  it('o corpo das frases com `corpo` (sem «:») só ganha o prefixo', () => {
    const c = homeV6Copy('pt');
    expect(limpa(c.comBloco(c.nomeBloco(1, 'manha'), 'kite <em>dá</em> no Guincho, das 14h às 18h.'))).toBe(
      'Amanhã de manhã: kite dá no Guincho, das 14h às 18h.',
    );
  });

  it('uma 2.ª frase com «:» fica como está (só a 1.ª oração é tocada)', () => {
    const c = homeV6Copy('pt');
    expect(limpa(c.comBloco(c.nomeBloco(1, 'manha'), c.diaMornoKite('kite', 'o Guincho', 'das 14h às 18h')))).toBe(
      'Amanhã de manhã: dia morno para kite. O melhor é o Guincho: dá das 14h às 18h.',
    );
  });

  for (const loc of locales) {
    it(`${loc}: todas as variantes da frase nacional saem com um só «:» na 1.ª oração`, () => {
      const c = homeV6Copy(loc);
      const variantes: Record<string, string> = {
        frenteKite: c.frenteKite('kite'),
        poucoVentoCosta: c.poucoVentoCosta('kite'),
        ventoTorto: c.ventoTorto('kite', c.banda.fraco.toLowerCase()),
        diaMornoKite: c.diaMornoKite('kite', 'Guincho', c.quando(c.das(14), '18h')),
        marMexido: c.marMexido('surf', 'Ericeira', c.quando(c.das(9), '12h')),
        frenteSurf: c.frenteSurf('surf'),
        marGrande: c.marGrande('surf', c.banda.nao.toLowerCase()),
        ventoEstragaNaoDa: c.ventoEstragaNaoDa('surf'),
        ventoEstragaFraco: c.ventoEstragaFraco('surf'),
        corpo: `kite <em>${c.banda.bom.toLowerCase()}</em> ${c.naCosta}, ${c.quando('', null)}.`,
      };
      for (const dia of [0, 1] as const)
        for (const k of ['manha', 'tarde', 'fim'] as const)
          for (const [nome, frase] of Object.entries(variantes)) {
            const txt = c.comBloco(c.nomeBloco(dia, k), frase);
            expect(doisPontos(primeiraOracao(txt)), `${loc} ${dia}/${k} ${nome}: «${limpa(txt)}»`).toBe(1);
            expect(limpa(txt), `${loc} ${nome}: sem «::» nem «: :»`).not.toMatch(/:\s*:|,\s*,|:\s*,|,\s*:/);
            expect(limpa(txt).charAt(0)).toBe(limpa(txt).charAt(0).toUpperCase());
          }
    });
  }
});
