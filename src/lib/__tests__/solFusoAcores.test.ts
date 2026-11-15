import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import type { Spot } from '@/types';
import {
  desvioFusoMin,
  fusoDoSpot,
  instanteDaParede,
  nascerPor,
  paredeLisboa,
  posicaoSol,
} from '@/lib/sol';

/**
 * #456 (ponto 1): o nascer/pôr do sol passa a ser devolvido na hora de parede
 * do spot. Nos Açores o pipeline grava a hora deles (−01:00 no inverno,
 * +00:00 no verão, sempre 1 h atrás de Lisboa) e o `nascerPor` formatava em
 * `paredeLisboa`: o texto «até ao pôr do sol (19h50)» ficava 1 h à frente da
 * régua de 48 h. Continente e Madeira não mudam.
 *
 * A regra do fuso tem de ser a mesma do pipeline (`scripts/lib/openMeteoUtc.js`);
 * o último teste falha se as duas divergirem.
 */
const requireCjs = createRequire(import.meta.url);
const openMeteoUtc = requireCjs('../../../scripts/lib/openMeteoUtc.js') as {
  spotTimeZone: (spot: { lat: number; lon: number }) => string;
  offsetMinutes: (ms: number, tz: string) => number;
};

const spotDe = (id: string) => (spots as Spot[]).find((s) => s.id === id)!;
const ACORES = ['santa-barbara', 'monte-verde', 'mosteiros', 'praia-vitoria'];
const TZ_ACORES = 'Atlantic/Azores';
const INVERNO = '2026-01-15';
const VERAO = '2026-06-15';

/** Instante de um `HH:mm` no fuso do spot, ancorado na meia-noite local. */
const instanteDe = (dia: string, hhmm: string, tz: string) => instanteDaParede(`${dia}T${hhmm}`, tz);

describe('#456 — fuso do spot no nascer e pôr do sol', () => {
  it('fusoDoSpot: Açores a oeste de −24,4°, tudo o resto em Lisboa', () => {
    expect(fusoDoSpot(-25.5487)).toBe(TZ_ACORES); // santa-barbara
    expect(fusoDoSpot(-24.4)).toBe(TZ_ACORES); // limiar incluído
    expect(fusoDoSpot(-24.39)).toBe('Europe/Lisbon');
    expect(fusoDoSpot(-9.3379)).toBe('Europe/Lisbon'); // carcavelos
    expect(fusoDoSpot(-16.9)).toBe('Europe/Lisbon'); // Madeira: mesmos desvios
    expect(fusoDoSpot(Number.NaN)).toBe('Europe/Lisbon');
  });

  it('catálogo: os Açores ficam em Atlantic/Azores e o resto não muda', () => {
    const acores = (spots as Spot[]).filter((s) => fusoDoSpot(s.lon) === TZ_ACORES).map((s) => s.id);
    for (const id of ACORES) expect(acores, id).toContain(id);
    for (const sp of spots as Spot[]) {
      // a mesma decisão do pipeline, spot a spot (o nome da zona da Madeira pode diferir)
      const noPipeline = openMeteoUtc.spotTimeZone({ lat: sp.lat, lon: sp.lon }) === TZ_ACORES;
      expect(fusoDoSpot(sp.lon), sp.id).toBe(noPipeline ? TZ_ACORES : 'Europe/Lisbon');
    }
  });

  it('santa-barbara: inverno e verão em Atlantic/Azores, coerentes com o sol', () => {
    const sp = spotDe('santa-barbara');
    expect(fusoDoSpot(sp.lon)).toBe(TZ_ACORES);

    for (const dia of [INVERNO, VERAO]) {
      const np = nascerPor(dia, sp.lat, sp.lon);
      expect(np, dia).not.toBeNull();

      // A hora devolvida é a de parede dos Açores: lida nesse fuso, o sol está
      // no horizonte (refracção incluída em `posicaoSol`, por isso a folga).
      for (const hhmm of [np!.nascer, np!.por]) {
        const ms = instanteDe(dia, hhmm, TZ_ACORES);
        expect(Math.abs(posicaoSol(ms, sp.lat, sp.lon).el), `${dia} ${hhmm}`).toBeLessThan(1);
        // …e em Lisboa a mesma hora de parede é 1 h mais tarde — o valor que o
        // código antigo devolvia (o bug do +1 h).
        expect(paredeLisboa(ms).slice(11, 16)).not.toBe(hhmm);
      }
    }

    // Desvios reais dos Açores: −1 h no inverno, 0 no verão (Lisboa: 0 e +1 h).
    const meioInverno = instanteDaParede(`${INVERNO}T12:00`, TZ_ACORES);
    const meioVerao = instanteDaParede(`${VERAO}T12:00`, TZ_ACORES);
    expect(desvioFusoMin(meioInverno, TZ_ACORES)).toBe(-60);
    expect(desvioFusoMin(meioVerao, TZ_ACORES)).toBe(0);
    expect(desvioFusoMin(meioInverno, 'Europe/Lisbon')).toBe(0);
    expect(desvioFusoMin(meioVerao, 'Europe/Lisbon')).toBe(60);

    // O dia de verão tem o sol a nascer mais cedo do que o de inverno.
    expect(nascerPor(VERAO, sp.lat, sp.lon)!.nascer < nascerPor(INVERNO, sp.lat, sp.lon)!.nascer).toBe(true);
  });

  it('o pôr do sol dos Açores coincide com a passagem dia→noite da régua', () => {
    const sp = spotDe('santa-barbara');
    const np = nascerPor(VERAO, sp.lat, sp.lon)!;
    const msPor = instanteDe(VERAO, np.por, TZ_ACORES);
    // A régua marca noite quando o sol passa de −0,8° (`posicaoSol` da hora
    // seguinte): uma hora antes ainda é dia, uma hora depois já é noite. Com o
    // texto em Lisboa (+1 h) o «até ao pôr do sol» caía já dentro da noite.
    expect(posicaoSol(msPor - 3_600_000, sp.lat, sp.lon).el).toBeGreaterThan(0);
    expect(posicaoSol(msPor + 3_600_000, sp.lat, sp.lon).el).toBeLessThan(-0.8);
  });

  it('carcavelos: Continente inalterado (hora de parede de Lisboa)', () => {
    const sp = spotDe('carcavelos');
    expect(fusoDoSpot(sp.lon)).toBe('Europe/Lisbon');
    for (const dia of [INVERNO, VERAO]) {
      const np = nascerPor(dia, sp.lat, sp.lon)!;
      const ms = instanteDe(dia, np.nascer, 'Europe/Lisbon');
      // o instante do nascer lido em Lisboa é a própria hora devolvida
      expect(paredeLisboa(ms).slice(11, 16)).toBe(np.nascer);
      expect(Math.abs(posicaoSol(ms, sp.lat, sp.lon).el)).toBeLessThan(1);
    }
  });

  it('a regra do fuso é a mesma do pipeline (scripts/lib/openMeteoUtc.js)', () => {
    for (const sp of spots as Spot[]) {
      const tzPipeline = openMeteoUtc.spotTimeZone({ lat: sp.lat, lon: sp.lon });
      const tzCliente = fusoDoSpot(sp.lon);
      for (const ms of [Date.UTC(2026, 0, 15, 12), Date.UTC(2026, 6, 15, 12)]) {
        // Mesma hora de parede (o nome da zona pode diferir: Madeira).
        expect(desvioFusoMin(ms, tzCliente), `${sp.id} ${new Date(ms).toISOString()}`).toBe(
          openMeteoUtc.offsetMinutes(ms, tzPipeline),
        );
      }
    }
  });
});
