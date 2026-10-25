/**
 * Água interior (`aguaInterior: true`, revisão da orientação de 25/10): albufeiras,
 * lagoas e rios interiores e cable parks não têm lado de mar nem de terra. A
 * direcção do vento fica neutra — a nota não muda com ela — e a UI não mostra
 * onshore / offshore / lateral. Nos spots de costa nada muda.
 */
import { describe, expect, it } from 'vitest';
import { spots } from '@/lib/spots';
import {
  classifyWind,
  getAllSportScores,
  getSportScore,
  windQualityTier,
  windSportDirectionSafety,
  type Conditions,
} from '@/lib/sportScore';
import { getCompatibleSports, type SportType } from '@/lib/sportRatings';
import { getSpotScoreFactors } from '@/lib/spotScoreFactors';
import { orientacaoVento } from '@/lib/wind';
import { detectThermal } from '@/lib/mapThermal';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { avaliaHoras, ventoRel, type HoraModalidade } from '@/lib/modalidades';
import { notaV6DeCondicoes } from '@/lib/notaV6Condicoes';
import { ventoRelTxt, ondaRelTxt } from '@/lib/spotVeredicto';
import { spotV6Copy } from '@/lib/translations/spotPage/v6';
import type { Spot } from '@/types';

const INTERIOR = [
  'cabedelo-wakepark',
  'ilha-do-ermal',
  'lagos-wakepark',
  'castelo-bode',
  'alqueva',
  'praia-da-lomba',
  'murtosa',
  'foil-lagoa-albufeira',
  'lagoa-sancha',
  'foil-alvor',
];
const kt = (x: number) => x / 1.94384;
const base: Conditions = {
  waveHeight: 0.3,
  wavePeriod: 6,
  waveDirection: 270,
  windSpeed: kt(20),
  windDirection: 0,
  windGust: kt(24),
  waterTemp: 18,
};
const RUMOS = Array.from({ length: 36 }, (_, i) => i * 10);
const DESPORTOS: SportType[] = ['kitesurf', 'windsurf', 'foil', 'surf', 'bodyboard', 'sup', 'wakeboard'];
const porId = (id: string) => spots.find((s) => s.id === id)!;
const hora = (wd: number): HoraModalidade => ({
  t: '2026-07-15T15:00',
  w: 20,
  g: 24,
  wd,
  hs: 0.3,
  tp: 6,
  sd: 270,
  tide: 1.5,
  tideUp: true,
  sunEl: 40,
  sunAz: 240,
});

describe('água interior: o modelo', () => {
  it('são exactamente os 10 spots da revisão (albufeiras, lagoas, rios interiores, cable parks)', () => {
    expect(spots.filter((s) => s.aguaInterior).map((s) => s.id).sort()).toEqual([...INTERIOR].sort());
  });

  it('orientacaoVento: undefined em água interior, coastOrientation na costa', () => {
    for (const s of spots) expect(orientacaoVento(s), s.id).toBe(s.aguaInterior ? undefined : s.coastOrientation);
  });
});

describe('água interior: a direcção do vento não muda a nota (motor antigo)', () => {
  it.each(INTERIOR)('%s: a mesma nota para qualquer direcção, sem aviso offshore', (id) => {
    const s = porId(id);
    for (const sport of DESPORTOS) {
      const ref = getSportScore(s, sport, { ...base, windDirection: 0 });
      for (const wd of RUMOS) {
        const r = getSportScore(s, sport, { ...base, windDirection: wd });
        expect(r.score, `${id} ${sport} wd ${wd}`).toBe(ref.score);
        expect(r.directionSafety, `${id} ${sport} wd ${wd}`).toBeUndefined();
        expect(r.factorsEn.some((f) => /offshore|onshore|cross-shore/i.test(f)), `${id} ${sport} wd ${wd}`).toBe(false);
      }
    }
  });

  it('classificação neutra: classifyWind null, banda de vento sem direcção nem tecto, sem cor de qualidade', () => {
    const s = porId('alqueva');
    for (const wd of RUMOS) {
      expect(classifyWind(s, wd)).toBeNull();
      const d = windSportDirectionSafety(s, wd);
      expect(d).toMatchObject({ direction: null, angleFromOnshore: null, dirFactor: 1, safety: null, scoreCap: null });
      expect(windQualityTier(s, wd, 'kitesurf')).toBeNull();
      expect(windQualityTier(s, wd, 'surf')).toBeNull();
    }
  });

  it('o mesmo spot como costa (sem a flag) volta a depender da direcção — é a flag que desliga', () => {
    const lagoa = porId('foil-lagoa-albufeira');
    const comoCosta: Spot = { ...lagoa, aguaInterior: undefined };
    const notas = new Set(RUMOS.map((wd) => getSportScore(comoCosta, 'kitesurf', { ...base, windDirection: wd }).score));
    expect(notas.size).toBeGreaterThan(1);
    // a 270°, vento de E (90°) seria offshore e teria tecto; em água interior não
    expect(getSportScore(comoCosta, 'kitesurf', { ...base, windDirection: 90 }).directionSafety).toBe('offshore');
    expect(getSportScore(lagoa, 'kitesurf', { ...base, windDirection: 90 }).directionSafety).toBeUndefined();
  });

  it('factores do mapa: o vento vai só com os nós, sem rótulo onshore/offshore/lateral', () => {
    const s = porId('castelo-bode');
    for (const wd of [0, 90, 180, 270]) {
      const c = { ...base, windDirection: wd };
      const allScores = getAllSportScores(s, c);
      for (const locale of ['pt', 'en']) {
        const seg = getSpotScoreFactors({ spot: s, conditions: c, allScores, sport: 'all', locale, max: 6 });
        const vento = seg.find((x) => x.kind === 'wind');
        if (vento) expect(vento.label, `${locale} wd ${wd}`).toBe('20 kt');
        for (const x of seg) expect(x.label, `${locale} wd ${wd}`).not.toMatch(/offshore|onshore|lateral|cross|de mar|de terra/i);
      }
    }
  });

  it('térmico do mapa: sem brisa de mar em água interior', () => {
    const t = { lisbonHour: 15, airTemp: 30, sst: 18, windSpeedMs: 6, windDirection: 270 };
    expect(detectThermal({ ...t, coastOrientation: 270 })).not.toBeNull();
    expect(detectThermal({ ...t, coastOrientation: orientacaoVento(porId('alqueva')) })).toBeNull();
  });
});

describe('água interior: motor v6 (modalidades)', () => {
  it.each(INTERIOR)('%s: a nota v6 de kite não muda com a direcção e a relação é neutra', (id) => {
    const sp = spotModalidadeDe(editorialDe(porId(id)));
    expect(sp.aguaInterior).toBe(true);
    const notas = avaliaHoras(sp, 'kite', RUMOS.map(hora));
    expect(new Set(notas.map((n) => n.n)).size, id).toBe(1);
    for (const n of notas) expect(n.seguranca).toBeNull();
    for (const wd of RUMOS) expect(ventoRel(sp, wd).k).toBe('neutro');
  });

  it('textos v6 sem lado de mar/terra («em água interior» / «on inland water»)', () => {
    const sp = spotModalidadeDe(editorialDe(porId('lagos-wakepark')));
    expect(ventoRelTxt(spotV6Copy('pt'), sp, 90)).toBe('em água interior');
    expect(ondaRelTxt(spotV6Copy('pt'), sp, 200)).toBe('em água interior');
    expect(ventoRelTxt(spotV6Copy('en'), sp, 90)).toBe('on inland water');
    const ed = editorialDe(porId('lagos-wakepark'));
    expect(ed.tipoAgua).toBe('agua-plana');
  });

  it('nota v6 do pipeline (notaV6DeCondicoes): igual para qualquer direcção', () => {
    const s = porId('foil-alvor');
    const raw = (wd: number) => ({ windSpeed: kt(20), windGust: kt(24), windDirection: wd, waveHeight: 0.3, wavePeriod: 6, waveDirection: 270, waterTemp: 18 });
    const t = '2026-07-15T15:00';
    const ns = new Set(RUMOS.map((wd) => notaV6DeCondicoes(s, 'kitesurf', raw(wd), { t })?.n));
    expect(ns.size).toBe(1);
  });
});

describe('spots de costa: sem mudança', () => {
  const costa = spots.filter((s) => !s.aguaInterior);

  it('nenhum spot de costa fica com a direcção neutra', () => {
    expect(costa.length).toBe(spots.length - INTERIOR.length);
    for (const s of costa) {
      expect(classifyWind(s, s.coastOrientation), s.id).toBe('onshore');
      expect(windSportDirectionSafety(s, (s.coastOrientation + 180) % 360).direction, s.id).toBe('offshore');
      expect(ventoRel(spotModalidadeDe(editorialDe(s)), editorialDe(s).praiaVirada).k, s.id).toBe('mar');
    }
  });

  it('Guincho: cross-shore > onshore > offshore (tecto), como antes', () => {
    const g = porId('guincho');
    const k = (wd: number) => getSportScore(g, 'kitesurf', { ...base, windDirection: wd });
    const cross = k((g.coastOrientation + 90) % 360);
    const on = k(g.coastOrientation);
    const off = k((g.coastOrientation + 180) % 360);
    expect(cross.score).toBeGreaterThan(on.score);
    expect(on.score).toBeGreaterThan(off.score);
    expect(off.directionSafety).toBe('offshore');
  });

  it('factores do mapa num spot de costa continuam com a relação do vento', () => {
    const g = porId('guincho');
    const c = { ...base, windDirection: (g.coastOrientation + 90) % 360 };
    const seg = getSpotScoreFactors({ spot: g, conditions: c, allScores: getAllSportScores(g, c), sport: 'kitesurf', locale: 'en', max: 6 });
    const vento = seg.find((x) => x.kind === 'wind');
    expect(vento?.label).toMatch(/kt/);
    expect(vento?.label).not.toBe('20 kt');
  });

  it('compatibilidade: as listas de desportos dos spots interiores não mudaram', () => {
    for (const id of INTERIOR) expect(getCompatibleSports(porId(id)).length, id).toBeGreaterThan(0);
  });
});
