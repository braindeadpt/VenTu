import { describe, expect, it } from 'vitest';
import { hrefMapa, CAMARA_MAPA } from '@/lib/home/hrefMapa';

/** #273: contrato do URL home → /mapa (`?sport=&wind=&t=&dia=&lat=&lon=&z=&spot=&de=home`). */
const params = (href: string) => {
  const u = new URL(href, 'https://ventu.surf');
  return { path: u.pathname, q: Object.fromEntries(u.searchParams.entries()), keys: [...u.searchParams.keys()] };
};
const HOJE_14 = '2026-10-20T14:00';
const AGORA = '2026-10-20T14:00';

describe('hrefMapa (home → /mapa)', () => {
  it('desktop, kite, hoje às 14h: o exemplo do contrato, por esta ordem', () => {
    expect(hrefMapa({ locale: 'pt', d: 'kite', tMapa: HOJE_14, tAgora: AGORA, desk: true })).toBe(
      '/pt/mapa/?sport=kitesurf&wind=1&t=14&lat=39.35&lon=-8.95&z=7&de=home',
    );
  });

  it('modalidade: kite → kitesurf, surf → surf; locale no caminho', () => {
    expect(params(hrefMapa({ locale: 'en', d: 'surf', tMapa: HOJE_14, tAgora: AGORA, desk: true }))).toMatchObject({
      path: '/en/mapa/',
      q: { sport: 'surf' },
    });
    expect(params(hrefMapa({ locale: 'pt', d: 'kite', tMapa: HOJE_14, tAgora: AGORA, desk: true })).q.sport).toBe('kitesurf');
  });

  it('hoje: sem dia; amanhã de manhã: t=10&dia=1', () => {
    const hoje = params(hrefMapa({ locale: 'pt', d: 'kite', tMapa: '2026-10-20T17:00', tAgora: AGORA, desk: true }));
    expect(hoje.q.t).toBe('17');
    expect(hoje.keys).not.toContain('dia');
    const amanha = params(hrefMapa({ locale: 'pt', d: 'kite', tMapa: '2026-10-21T10:00', tAgora: AGORA, desk: true }));
    expect(amanha.q).toMatchObject({ t: '10', dia: '1' });
    // a hora sai da hora de parede (sem fusos), também à meia-noite e na mudança de mês
    const virada = params(hrefMapa({ locale: 'pt', d: 'surf', tMapa: '2026-11-01T07:00', tAgora: '2026-10-31T22:00', desk: false }));
    expect(virada.q).toMatchObject({ t: '7', dia: '1' });
  });

  it('desktop z=7 com vento; telemóvel z=6.5 e o vento conforme o gate do Lighthouse', () => {
    const d = params(hrefMapa({ locale: 'pt', d: 'kite', tMapa: HOJE_14, tAgora: AGORA, desk: true, ventoMovel: false }));
    expect(d.q).toMatchObject({ wind: '1', z: String(CAMARA_MAPA.zDesk), lat: '39.35', lon: '-8.95' });
    const comVento = params(hrefMapa({ locale: 'pt', d: 'kite', tMapa: HOJE_14, tAgora: AGORA, desk: false, ventoMovel: true }));
    expect(comVento.q).toMatchObject({ wind: '1', z: '6.5' });
    const semVento = params(hrefMapa({ locale: 'pt', d: 'kite', tMapa: HOJE_14, tAgora: AGORA, desk: false, ventoMovel: false }));
    expect(semVento.keys).not.toContain('wind');
    expect(semVento.q.z).toBe('6.5');
  });

  it('rótulo de spot: …&spot=<id>&de=home; sem spot não há spot=', () => {
    const r = params(hrefMapa({ locale: 'pt', d: 'kite', tMapa: HOJE_14, tAgora: AGORA, desk: true, spot: 'guincho' }));
    expect(r.q).toMatchObject({ spot: 'guincho', de: 'home' });
    expect(r.keys.slice(-2)).toEqual(['spot', 'de']);
    const c = params(hrefMapa({ locale: 'pt', d: 'kite', tMapa: HOJE_14, tAgora: AGORA, desk: true }));
    expect(c.keys).not.toContain('spot');
    expect(c.q.de).toBe('home');
  });

  it('só parâmetros do contrato', () => {
    const r = params(hrefMapa({ locale: 'pt', d: 'surf', tMapa: '2026-10-21T13:00', tAgora: AGORA, desk: false, ventoMovel: true, spot: 'nazare' }));
    for (const k of r.keys) expect(['sport', 'wind', 't', 'dia', 'lat', 'lon', 'z', 'spot', 'de']).toContain(k);
  });
});
