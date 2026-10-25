/**
 * Vento forte no kite (#218, decisão do Pedro 25/10): acima de ~30 kt de vento
 * médio a nota NÃO cai a 0/1; a hora é «Só profissionais» (com aviso de perigo)
 * e, para os outros níveis, a nota fica baixa (piso 3 · Fraco). As rajadas muito
 * acima da média continuam a descontar, mas menos. Os tectos de segurança do
 * vento (side-offshore 5,0 · offshore 2,5, #210) ficam por cima de tudo.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { avaliaHoras, bandaDe, MOTOR, type HoraModalidade, type SpotModalidade } from '@/lib/modalidades';
import { construirFrase, palavraEResto } from '@/lib/spotVeredicto';
import { spotPageV6 } from '@/lib/translations/spotPage/v6';
import WindSafetyNote from '@/components/ui/WindSafetyNote';

const require_ = createRequire(import.meta.url);
const ModAvaliaJs = require_(path.resolve(__dirname, '../../../../docs/design/maquetes/modalidades-avalia.js'));
const DEF_JSON = require_(path.resolve(__dirname, '../../../../docs/design/maquetes/modalidades-def.json'));

/** Guincho: a praia olha para 280°. */
const SP: SpotModalidade = { praiaVirada: 280, surf: { janela: [270, 320] } };
const DIR = { mar: 280, 'lat-mar': 325, lat: 10, 'lat-terra': 50, terra: 100 } as const;

function hora(w: number, g: number, wd: number, extra: Partial<HoraModalidade> = {}): HoraModalidade {
  return { t: '2026-09-08T15:00', w, g, wd, hs: 1, tp: 10, sd: 290, tide: 2, tideUp: true, cloud: null, rain: null, sunEl: 40, sunAz: 220, ...extra };
}
const um = (h: HoraModalidade) => avaliaHoras(SP, 'kite', [h])[0];

describe('kite · vento forte: «Só profissionais»', () => {
  it('a partir de 30 kt médios (lateral e lateral de mar) a hora é «Só profissionais», com a faixa', () => {
    expect(um(hora(30, 33, DIR['lat-mar']))).toMatchObject({ n: 4, soProfissionais: true, forte: 'forte', motivo: 'pro' });
    expect(um(hora(34, 38, DIR.lat))).toMatchObject({ soProfissionais: true, forte: 'forte' });
    expect(um(hora(35, 40, DIR.lat))).toMatchObject({ n: 3, soProfissionais: true, forte: 'muito-forte' });
    expect(um(hora(42, 50, DIR['lat-mar']))).toMatchObject({ n: 3, soProfissionais: true, forte: 'tempestade' });
  });

  it('a nota não cai a 0/1: nunca abaixo do piso 3 (rajada +20, onda 3 m, chuva, maré alta)', () => {
    for (const w of [30, 33, 36, 40, 45])
      for (const ge of [0, 5, 10, 20]) {
        const r = um(hora(w, w + ge, DIR['lat-mar'], { hs: 3.2, rain: 2, tide: 3 }));
        expect(r.soProfissionais).toBe(true);
        expect(r.n).toBeGreaterThanOrEqual(3);
        expect(r.n).toBeLessThanOrEqual(4);
        expect(bandaDe(r.n)).toBe('fraco');
      }
  });

  it('abaixo de 30 kt não há estado «Só profissionais» (29 kt fica como antes: 5 · Dá)', () => {
    const r = um(hora(29, 29, DIR['lat-mar']));
    expect(r.soProfissionais).toBeUndefined();
    expect(r.forte).toBeUndefined();
    expect(r.n).toBe(5);
  });

  it('de mar, lateral de terra e de terra NÃO são «Só profissionais»: a nota fica no chão', () => {
    // de mar (onshore puro): decisão em aberto para o Pedro (ver proposta.md); hoje fica fora
    const m = um(hora(35, 38, DIR.mar));
    expect(m.soProfissionais).toBeUndefined();
    expect(m.n).toBeLessThanOrEqual(1);
    const lt = um(hora(35, 38, DIR['lat-terra']));
    expect(lt.soProfissionais).toBeUndefined();
    expect(lt.n).toBeLessThanOrEqual(1);
    expect(um(hora(35, 38, DIR.terra)).n).toBe(0);
  });

  it('os tectos de segurança do vento (#210) continuam por cima', () => {
    // 105° da praia: lateral para o motor, mas já side-offshore para a segurança (tecto 5,0)
    const r = um(hora(32, 34, (280 + 105) % 360));
    expect(r.soProfissionais).toBe(true);
    expect(r.seguranca).toBe('side-offshore');
    expect(r.n).toBeLessThanOrEqual(5);
    // offshore puro: tecto 2,5 → 2 · Não dá, sem «Só profissionais»
    const o = um(hora(35, 38, DIR.terra));
    expect(o.seguranca).toBe('offshore');
    expect(o.n).toBeLessThanOrEqual(2);
  });

  it('de noite não há nota nem estado', () => {
    const r = um(hora(35, 40, DIR.lat, { sunEl: -5 }));
    expect(r.n).toBeNull();
    expect(r.soProfissionais).toBeUndefined();
  });

  it('só o kite tem o estado: windsurf, wing e kite foil ficam como estavam', () => {
    const L = MOTOR.para(SP);
    for (const d of ['windsurf', 'wing', 'kitefoil']) {
      const r = L.avalia(d, hora(40, 45, DIR.lat));
      expect(r.soProfissionais).toBeUndefined();
    }
  });
});

describe('kite · rajadas muito acima da média: penalização mais suave', () => {
  it('Guincho 15 kt com rajada a 35 kt (lateral): 1 → 3 · Fraco', () => {
    expect(um(hora(15, 35, DIR.lat)).n).toBe(3);
  });

  it('degraus pela diferença (+7 → −1, +10 → −1,5, +14 → −2) e pela rajada absoluta (32 → −1, 36 → −2, 40 → −2,5)', () => {
    // 20 kt lateral de mar: curva 9,5 × 1
    expect(um(hora(20, 25, DIR['lat-mar'])).n).toBe(10);
    expect(um(hora(20, 28, DIR['lat-mar'])).n).toBe(9); // 9,5 − 1 = 8,5 → 9
    expect(um(hora(20, 31, DIR['lat-mar'])).n).toBe(8); // − 1,5
    expect(um(hora(20, 35, DIR['lat-mar'])).n).toBe(7); // 9,5 − 2 − 1 = 6,5 → 7
    expect(um(hora(20, 40, DIR['lat-mar'])).n).toBe(6); // 9,5 − 2 − 2 = 5,5 → 6
    expect(um(hora(20, 45, DIR['lat-mar'])).n).toBe(5); // 9,5 − 2 − 2,5 = 5
  });

  it('a rajada continua a ser motivo («rajado») fora do vento forte', () => {
    expect(um(hora(15, 35, DIR.lat)).motivo).toBe('rajado');
    expect(um(hora(15, 35, DIR.lat)).f.vento).toBe(-1);
  });
});

describe('kite · vento forte: maquete JS = motor TS', () => {
  it('a grelha 10–45 kt × rajada 0–25 × 19 direcções dá o mesmo nas duas', () => {
    const AV = ModAvaliaJs(DEF_JSON, { DA: 5 }).para(SP);
    const L = MOTOR.para(SP);
    for (let w = 10; w <= 45; w += 1)
      for (let ge = 0; ge <= 25; ge += 5)
        for (let off = 0; off <= 180; off += 10) {
          const h = hora(w, w + ge, (280 + off) % 360);
          expect(L.avalia('kite', h)).toEqual(AV.avalia('kite', h));
        }
  });
});

describe('kite · vento forte: o que se mostra', () => {
  const copy = spotPageV6.pt;
  it('a palavra é «Só profissionais» e a frase diz a faixa', () => {
    const H = [hora(36, 44, DIR.lat)];
    const NS = avaliaHoras(SP, 'kite', H);
    const f = construirFrase({ sp: SP, d: 'kite', H, NS, sol: {}, copy, locale: 'pt' })(0);
    expect(f.l1).toBe('Só profissionais: vento muito forte para kite');
    const { palavra, resto } = palavraEResto(copy, f, bandaDe(NS[0].n), false, !!NS[0].soProfissionais);
    expect(palavra).toBe('Só profissionais');
    expect(resto).toBe('Vento muito forte para kite');
  });

  it('em inglês: «Pros only»', () => {
    const H = [hora(41, 45, DIR['lat-mar'])];
    const NS = avaliaHoras(SP, 'kite', H);
    const f = construirFrase({ sp: SP, d: 'kite', H, NS, sol: {}, copy: spotPageV6.en, locale: 'en' })(0);
    expect(f.l1).toBe('Pros only: storm wind for kite');
  });

  it('o aviso de perigo usa a mesma nota de segurança do vento (texto, não tooltip)', () => {
    const pt = renderToStaticMarkup(createElement(WindSafetyNote, { level: 'so-profissionais', locale: 'pt' }));
    expect(pt).toContain('data-wind-safety="so-profissionais"');
    expect(pt).toContain('role="note"');
    expect(pt).toContain('Só profissionais: vento muito forte');
    const en = renderToStaticMarkup(createElement(WindSafetyNote, { level: 'so-profissionais', locale: 'en' }));
    expect(en).toContain('Pros only: very strong wind');
  });
});
