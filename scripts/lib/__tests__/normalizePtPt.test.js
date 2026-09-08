import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  normalizePtText,
  normalizeNewsItem,
  normalizeNewsItems,
} = require('../../news/normalize-pt-pt.js');

describe('normalize-pt-pt', () => {
  it('fixes DESENGANCADO → UNHOOKED', () => {
    expect(normalizePtText('KITE MTB DESENGANCADO 1440 BACKROLL')).toBe(
      'KITE MTB UNHOOKED 1440 BACKROLL',
    );
  });

  it('rewrites Confira → Descobre', () => {
    expect(normalizePtText('Confira a Nova Gama para Outono/Inverno 2027 agora!')).toBe(
      'Descobre a Nova Gama para Outono/inverno 2027 agora!',
    );
  });

  it('strips PT WordPress footers', () => {
    const raw =
      'Unhooked backroll... quantos consegues contar? O post KITE MTB UNHOOKED 1440 BACKROLL apareceu pela primeira vez no IKSURFMAG.';
    expect(normalizePtText(raw)).toBe(
      'Unhooked backroll... quantos consegues contar?',
    );
  });

  it('strips alternate PT footer forms', () => {
    expect(
      normalizePtText(
        'Texto útil. A publicação “foo” apareceu pela primeira vez na IKSURFMAG.',
      ),
    ).toBe('Texto útil.');
    expect(
      normalizePtText('Texto. O artigo “bar” apareceu primeiro no IKSURFMAG.'),
    ).toBe('Texto.');
  });

  it('strips trailing hashtags from titles', () => {
    expect(
      normalizePtText('Que viagem Vice-Campeão Gabriel #kitesurf #gkakiteworldtour'),
    ).toBe('Que viagem Vice-Campeão Gabriel');
  });

  it('normalises formal product “o seu” phrases', () => {
    expect(normalizePtText('sabendo que o seu equipamento está seguro')).toBe(
      'sabendo que o equipamento está seguro',
    );
    expect(normalizePtText('feedback que lhe permite saber sempre onde está o seu kite')).toBe(
      'feedback que lhe permite saber sempre onde está o kite',
    );
  });

  it('trims truncated “logo antes de.” endings', () => {
    expect(
      normalizePtText(
        'A corrida mais lendária, onde o Liam garantiu a vitória com o seu último truque logo antes de.',
      ),
    ).toBe(
      'A corrida mais lendária, onde o Liam garantiu a vitória com o último truque',
    );
  });

  it('normalizeNewsItem touches PT fields and EN footers', () => {
    const item = normalizeNewsItem({
      title: 'Confira a Nova Gama #duotone',
      summary:
        'Embale‑o. O post Wherever the forecast takes you apareceu pela primeira vez no IKSURFMAG.',
      titleEn: 'Check the New Range #duotone',
      summaryEn:
        'Pack it. The post Wherever the forecast takes you appeared first on IKSURFMAG.',
    });
    expect(item.title).toBe('Descobre a Nova Gama');
    expect(item.summary).toBe('Embale‑o.');
    expect(item.titleEn).toBe('Check the New Range');
    expect(item.summaryEn).toBe('Pack it.');
  });

  it('normalizeNewsItems maps arrays immutably', () => {
    const input = [{ title: 'DESENGANCADO', summary: 'x' }];
    const out = normalizeNewsItems(input);
    expect(out[0].title).toBe('UNHOOKED');
    expect(input[0].title).toBe('DESENGANCADO');
  });
});
