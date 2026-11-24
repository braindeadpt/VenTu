import { describe, expect, it } from 'vitest';
import { montarCosta, type CostaCompacta } from '@/lib/home/dadosHome';

/**
 * #456 — no domingo do fim do DST (25/10/2026) a hora de parede 01:00 repete-se
 * em Lisboa: 01:00+01:00 e 01:00+00:00 são dois instantes. O `t` truncado não
 * os distingue; a coluna `ms` sim. Sem ela o «agora» caía sempre no primeiro.
 */
describe('montarCosta — agoraI no 01:00 repetido do fim do DST', () => {
  const horas = [
    '2026-10-25T00:00',
    '2026-10-25T01:00',
    '2026-10-25T01:00',
    '2026-10-25T02:00',
  ];
  const ms = [
    Date.parse('2026-10-25T00:00:00+01:00'),
    Date.parse('2026-10-25T01:00:00+01:00'),
    Date.parse('2026-10-25T01:00:00+00:00'),
    Date.parse('2026-10-25T02:00:00+00:00'),
  ];
  const compacta = (extra?: Partial<CostaCompacta>): CostaCompacta => ({ horas, spots: {}, ...extra });

  it('agora no SEGUNDO 01:00 (+00:00) aponta para o índice certo', () => {
    const agoraMs = Date.parse('2026-10-25T01:30:00+00:00');
    const { agoraI } = montarCosta(compacta({ ms }), agoraMs, {});
    expect(agoraI).toBe(2);
  });

  it('agora no PRIMEIRO 01:00 (+01:00) aponta para o índice certo', () => {
    const agoraMs = Date.parse('2026-10-25T01:30:00+01:00');
    const { agoraI } = montarCosta(compacta({ ms }), agoraMs, {});
    expect(agoraI).toBe(1);
  });

  it('compacta antiga sem `ms` cai no lexical de antes (primeiro 01:00)', () => {
    const agoraMs = Date.parse('2026-10-25T01:30:00+00:00');
    const { agoraI } = montarCosta(compacta(), agoraMs, {});
    expect(agoraI).toBe(1);
  });
});
