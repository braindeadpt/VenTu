import { describe, expect, it } from 'vitest';
import { ALL_SPORTS } from '@/lib/sportRatings';
import { DESPORTOS_ALERTAS, DESPORTOS_SEM_ALERTAS, temAlertasCondicoes } from '@/lib/desportosV6';

/** #218, PR 6 — alertas de wakeboard desligados por agora (decisão do Pedro, 27/10). */
describe('alertas de condições por desporto', () => {
  it('o wakeboard não tem alertas; os outros todos têm', () => {
    expect(DESPORTOS_SEM_ALERTAS).toEqual(['wakeboard']);
    expect(temAlertasCondicoes('wakeboard')).toBe(false);
    for (const s of ['surf', 'kitesurf', 'windsurf', 'bodyboard', 'sup', 'foil']) expect(temAlertasCondicoes(s)).toBe(true);
  });

  it('o formulário oferece ALL_SPORTS sem o wakeboard, pela mesma ordem', () => {
    expect(DESPORTOS_ALERTAS).toEqual(ALL_SPORTS.filter((s) => s !== 'wakeboard'));
    expect(DESPORTOS_ALERTAS).not.toContain('wakeboard');
  });
});
