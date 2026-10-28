import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SpotListCard from '@/components/spots/SpotListCard';
import VeredictoNoite from '@/components/compare/VeredictoNoite';
import { JanelaNoite, rotuloDiaJanela } from '@/components/ui/NoiteJanela';
import type { JanelaSeguinte } from '@/lib/noiteListas';

const JAN: JanelaSeguinte = {
  sport: 'surf',
  w: { startIso: '2026-10-29T07:00', endIso: '2026-10-29T11:00', score: 80 },
  dia: 1,
};
const COND = { waveHeight: 1.2, wavePeriod: 10, windSpeed: 3 };

const cartao = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(SpotListCard, {
      name: 'Guincho',
      region: 'Cascais',
      score: 0,
      conditions: COND,
      href: '/pt/spots/guincho/',
      locale: 'pt',
      ...props,
    }),
  );

describe('SpotListCard de noite (prop noite, paralela a semNota)', () => {
  it('lua + «Noite» + próxima janela «Amanhã 07–11h [8]», sem o «0» nem a banda', () => {
    const html = cartao({ noite: { janela: JAN }, statusLine: 'N/A' });
    expect(html).toContain('data-noite=""');
    expect(html).toContain('Noite');
    expect(html).toContain('Próxima janela');
    expect(html).toContain('Amanhã');
    expect(html).toContain('07–11h');
    expect(html).toContain('data-nota-janela="8"');
    expect(html).not.toContain('Não dá');
    expect(html).not.toContain('N/A');
    expect(html).not.toMatch(/text-num-lg[^>]*>0</);
  });

  it('sem janela: «Sem janela boa nas próximas horas»', () => {
    const html = cartao({ noite: { janela: null } });
    expect(html).toContain('Sem janela boa nas próximas horas');
    expect(html).not.toContain('data-nota-janela');
  });

  it('de dia nada muda (numeral e banda)', () => {
    const html = cartao({ score: 72 });
    expect(html).not.toContain('data-noite');
    expect(html).toMatch(/text-num-lg[^>]*>7</);
  });

  it('EN / ES / DE / FR têm copy própria', () => {
    expect(cartao({ noite: { janela: JAN }, locale: 'en' })).toContain('Next window');
    expect(cartao({ noite: { janela: null }, locale: 'es' })).toContain('Sin ventana buena en las próximas horas');
    expect(cartao({ noite: { janela: JAN }, locale: 'de' })).toContain('Nächstes Fenster');
    expect(cartao({ noite: { janela: JAN }, locale: 'fr' })).toContain('Prochaine fenêtre');
  });
});

describe('JanelaNoite / rótulo do dia', () => {
  it('hoje, amanhã, dia da semana (sem relógio: dia da semana)', () => {
    expect(rotuloDiaJanela('2026-10-29T07:00', 0, 'pt')).toBe('Hoje');
    expect(rotuloDiaJanela('2026-10-29T07:00', 1, 'pt')).toBe('Amanhã');
    expect(rotuloDiaJanela('2026-10-30T07:00', 2, 'pt')).toBe('Sexta');
    expect(rotuloDiaJanela('2026-10-30T07:00', null, 'en')).toBe('Friday');
  });

  it('a nota da janela aparece UMA vez', () => {
    const html = renderToStaticMarkup(createElement(JanelaNoite, { janela: JAN, locale: 'pt', layout: 'pilha' }));
    expect(html.match(/data-nota-janela/g)).toHaveLength(1);
    expect(html).toContain('Próxima janela: Amanhã 07–11h, nota 8 em 10');
  });
});

describe('JanelaNoite na tabela do /spots (layout «tabela»): uma linha, altura de linha normal', () => {
  it('«Amanhã 07–11h · 8» numa só linha, sem pilha nem quebra', () => {
    const html = renderToStaticMarkup(createElement(JanelaNoite, { janela: JAN, locale: 'pt', layout: 'tabela' }));
    expect(html).toContain('whitespace-nowrap');
    expect(html).not.toContain('flex-col');
    expect(html).not.toContain('flex-wrap');
    expect(html.match(/data-nota-janela/g)).toHaveLength(1);
    expect(html).toContain('Amanhã');
    expect(html).toContain('07–11h');
    expect(html).toContain('Próxima janela: Amanhã 07–11h, nota 8 em 10');
  });

  it('sem janela: «–» (o texto longo fica no title / leitor de ecrã, não parte a linha)', () => {
    const html = renderToStaticMarkup(createElement(JanelaNoite, { janela: null, locale: 'pt', layout: 'tabela' }));
    expect(html).toContain('data-noite-sem-janela');
    expect(html).toContain('>–<');
    expect(html).toContain('title="Sem janela boa nas próximas horas"');
    expect(html).not.toContain('whitespace-normal');
  });
});

describe('Comparador de noite: sem «Vencedor» falso', () => {
  it('«Amanhã ganha Guincho», à frente do segundo', () => {
    const html = renderToStaticMarkup(
      createElement(VeredictoNoite, { locale: 'pt', pronto: true, vencedor: { slug: 'guincho', nome: 'Guincho' }, segundo: 'Carcavelos' }),
    );
    expect(html).toContain('Amanhã ganha Guincho');
    expect(html).toContain('à frente de Carcavelos');
    expect(html).not.toMatch(/vencedor/i);
    expect(html).not.toContain('/10');
  });

  it('ninguém nas 24 h', () => {
    const html = renderToStaticMarkup(createElement(VeredictoNoite, { locale: 'pt', pronto: true, vencedor: null, segundo: null }));
    expect(html).toContain('Ninguém com janela boa nas próximas 24 horas');
    expect(html).toContain('Sem vencedor esta noite.');
  });

  it('à espera das janelas: esqueleto, nunca «ninguém»', () => {
    const html = renderToStaticMarkup(createElement(VeredictoNoite, { locale: 'en', pronto: false, vencedor: null, segundo: null }));
    expect(html).not.toContain('No one');
    expect(html).toContain('Night');
  });
});
