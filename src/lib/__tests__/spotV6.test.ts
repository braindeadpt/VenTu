/**
 * Página de spot v6 (#184): dados (um objecto por hora), preferência da
 * modalidade, tokens/contraste, fotos e textos.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { construirHoras, nivelMedioZH, type LinhaForecast } from '@/lib/horaSpot';
import { avaliaHoras, bandaDe, MODALIDADES_VISIVEIS, tectoSeguranca, WIND_OFFSHORE_ROUND } from './spotV6.helpers';
import { parsePrefModalidade, modalidadeDaUrl, LS_MODALIDADE, gravarPrefModalidade, lerPrefModalidade, modalidadeInicial } from '@/lib/modalidadePref';
import { editorialDe, spotModalidadeDe, SPOTS_CURADOS } from '@/lib/spotEditorial';
import { fotoDoSpot, FOTOS_POR_SPOT, FOTOS_META } from '@/lib/spotFotos';
import { V6_BANDAS, V6_UI } from '@/lib/v6Tokens';
import { spots, getSpotBySlug } from '@/lib/spots';
import { construirFrase, parteTxt } from '@/lib/spotVeredicto';
import { spotPageV6 } from '@/lib/translations/spotPage/v6';
import { instanteLisboa, posicaoSol } from '@/lib/sol';
import fs from 'fs';
import path from 'path';

const linha = (time: string, o: Partial<LinhaForecast> = {}): LinhaForecast => ({
  time,
  waveHeight: 1.44,
  wavePeriod: 10.6,
  waveDirection: 301.4,
  windSpeed: 10, // m/s → 19,4 nós
  windDirection: 340,
  windGust: 12,
  tideHeight: 0,
  waterTemp: 17.6,
  ...o,
});
const serie = (n: number, t0 = '2026-10-14T00:00') => {
  const out: LinhaForecast[] = [];
  const base = Date.UTC(+t0.slice(0, 4), +t0.slice(5, 7) - 1, +t0.slice(8, 10));
  for (let k = 0; k < n; k++) {
    const d = new Date(base + k * 3600000).toISOString().slice(0, 16);
    out.push(linha(d, { tideHeight: Math.sin((k / 12.4) * 2 * Math.PI) * 1.2 }));
  }
  return out;
};

describe('construirHoras: um objecto por hora a partir do forecast', () => {
  const guincho = getSpotBySlug('guincho')!;
  const ed = editorialDe(guincho);
  const agora = instanteLisboa('2026-10-14T14:20');
  const d = construirHoras(serie(96), { lat: guincho.lat, lon: guincho.lon, praiaVirada: ed.praiaVirada }, agora);
  // Nível médio do porto IH de referência do Guincho (Cascais, 2,08 m; auditoria 16/10 A4).
  const NM_GUINCHO = nivelMedioZH(guincho.lat, guincho.lon);

  it('começa na hora actual (Lisboa) e tem 48 horas', () => {
    expect(d.horas).toHaveLength(48);
    expect(d.horas[0].t).toBe('2026-10-14T14:00');
  });
  it('«agora» coberto: semAgora falso', () => {
    expect(d.semAgora).toBe(false);
  });
  it('previsão expirada: semAgora, 48 horas datadas (as últimas da série) e nenhuma é «agora»', () => {
    const tarde = instanteLisboa('2026-10-19T09:00'); // série acaba a 17 out 23h
    const x = construirHoras(serie(96), { lat: guincho.lat, lon: guincho.lon, praiaVirada: ed.praiaVirada }, tarde);
    expect(x.semAgora).toBe(true);
    expect(x.horas).toHaveLength(48);
    expect(x.horas[0].t).toBe('2026-10-16T00:00');
    expect(x.horas[47].t).toBe('2026-10-17T23:00');
  });
  it('previsão ainda por começar: semAgora e as primeiras 48 horas', () => {
    const cedo = instanteLisboa('2026-10-13T09:00');
    const x = construirHoras(serie(96), { lat: guincho.lat, lon: guincho.lon, praiaVirada: ed.praiaVirada }, cedo);
    expect(x.semAgora).toBe(true);
    expect(x.horas).toHaveLength(48);
    expect(x.horas[0].t).toBe('2026-10-14T00:00');
  });
  it('sem linhas: semAgora e nenhuma hora', () => {
    const x = construirHoras([], { lat: guincho.lat, lon: guincho.lon, praiaVirada: ed.praiaVirada }, agora);
    expect(x.semAgora).toBe(true);
    expect(x.horas).toHaveLength(0);
  });
  it('converte m/s em nós inteiros, arredonda onda e período', () => {
    const h = d.horas[0];
    expect(h.w).toBe(19);
    expect(h.g).toBe(23);
    expect(h.hs).toBe(1.4);
    expect(h.tp).toBe(11);
    expect(h.sd).toBe(301);
  });
  it('maré: MSL → zero hidrográfico e tideUp derivado da curva', () => {
    const k = 14; // hora 14 da série
    const msl = Math.sin((k / 12.4) * 2 * Math.PI) * 1.2;
    expect(d.horas[0].tide).toBeCloseTo(Math.round((msl + NM_GUINCHO) * 10) / 10, 5);
    for (let j = 0; j < 47; j++) {
      const a = d.horas[j].tide;
      const b = d.horas[j + 1].tide;
      if (b > a) expect(d.horas[j].tideUp).toBe(true);
      if (b < a) expect(d.horas[j].tideUp).toBe(false);
    }
    expect(d.mares.length).toBeGreaterThan(2);
  });
  it('maré: extremos afinados ao minuto (parábola pelos 3 pontos horários)', () => {
    // seno de período 12,4 h: preia-mar em k = 3,1 + 12,4 = 15,5 h → 15h30, 1,2 + 2,08 ≈ 3,3 m ZH
    const pm = d.mares.find((m) => m.tipo === 'PM' && m.t.startsWith('2026-10-14T15'));
    expect(pm).toBeDefined();
    const min = +pm!.t.slice(11, 13) * 60 + +pm!.t.slice(14, 16);
    expect(Math.abs(min - (15 * 60 + 30))).toBeLessThanOrEqual(3);
    expect(NM_GUINCHO).toBe(2.08);
    expect(pm!.h).toBeCloseTo(1.2 + NM_GUINCHO, 1);
    // baixa-mar em k = 9,3 + 12,4 = 21,7 h → 21h42, 0,8 m ZH
    const bm = d.mares.find((m) => m.tipo === 'BM' && m.t.startsWith('2026-10-14T21'));
    expect(bm).toBeDefined();
    const minB = +bm!.t.slice(11, 13) * 60 + +bm!.t.slice(14, 16);
    expect(Math.abs(minB - (21 * 60 + 42))).toBeLessThanOrEqual(3);
  });
  it('sol calculado em cliente (NOAA); sem chuva nem nuvens na fonte → null e dito', () => {
    const p = posicaoSol(instanteLisboa('2026-10-14T14:00'), guincho.lat, guincho.lon);
    expect(d.horas[0].sunEl).toBe(p.el);
    expect(d.horas[0].sunEl).toBeGreaterThan(35);
    expect(d.horas[0].rain).toBeNull();
    expect(d.horas[0].cloud).toBeNull();
    expect(d.faltam).toEqual(expect.arrayContaining(['rain', 'cloud']));
    expect(Object.keys(d.sol).length).toBeGreaterThanOrEqual(2);
  });
  it('chuva e nuvens no feed (precipitation, cloudCover) → lidas e fora de faltam', () => {
    const s = serie(60).map((l) => ({ ...l, precipitation: 2.5, cloudCover: 100 }));
    const x = construirHoras(s, { lat: guincho.lat, lon: guincho.lon, praiaVirada: ed.praiaVirada }, agora);
    expect(x.horas[0].rain).toBe(2.5);
    expect(x.horas[0].cloud).toBe(100);
    expect(x.faltam).not.toContain('rain');
    expect(x.faltam).not.toContain('cloud');
  });
  it('sem chuva o motor não penaliza (degrada sem penalização)', () => {
    const sp = spotModalidadeDe(ed);
    const com0 = avaliaHoras(sp, 'kite', d.horas.map((h) => ({ ...h, rain: 0 })));
    const semDado = avaliaHoras(sp, 'kite', d.horas);
    expect(semDado.map((r) => r.n)).toEqual(com0.map((r) => r.n));
  });
  it('maré em falta: NaN, sem penalização e marcada em faltam', () => {
    const s = serie(60).map((l) => ({ ...l, tideHeight: undefined }));
    const x = construirHoras(s, { lat: guincho.lat, lon: guincho.lon, praiaVirada: ed.praiaVirada }, agora);
    expect(Number.isNaN(x.horas[0].tide)).toBe(true);
    expect(x.faltam).toContain('tide');
  });
});

describe('notas /10 e bandas da #210', () => {
  it('só kite e surf visíveis', () => {
    expect([...MODALIDADES_VISIVEIS]).toEqual(['kite', 'surf']);
  });
  it('bandas: Não dá <3 ≤ Fraco <5 ≤ Dá <7 ≤ Bom <9 ≤ Muito bom', () => {
    expect([0, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(bandaDe)).toEqual(['nao', 'nao', 'fraco', 'fraco', 'da', 'da', 'bom', 'bom', 'mb', 'mb']);
    expect(bandaDe(null)).toBe('noite');
  });
  it('tecto de segurança do vento: side-offshore 5, offshore 2 (arredonda para baixo, auditoria 16/10 M7)', () => {
    expect(tectoSeguranca(5)).toBe(5);
    // Antes 3 (`scoreToNota(notaToScore(2.5))` = «3 · Fraco», acima do próprio tecto).
    expect(WIND_OFFSHORE_ROUND).toBe(3);
    expect(tectoSeguranca(2.5)).toBe(2);
    expect(tectoSeguranca(null)).toBeNull();
  });
  it('kite com vento side-offshore nunca passa de 5; offshore fica em Fraco ou menos', () => {
    const sp = { praiaVirada: 270, surf: { janela: [240, 300] as [number, number], tol: 25 } };
    const base = { t: '2026-10-14T14:00', w: 20, g: 22, hs: 1, tp: 10, sd: 280, tide: 1.5, tideUp: true, sunEl: 40, sunAz: 200 };
    const lado = avaliaHoras(sp, 'kite', [{ ...base, wd: 270 + 180 - 60 }])[0]; // 120° do onshore
    expect(lado.n).toBeLessThanOrEqual(5);
    expect(lado.seguranca).toBe('side-offshore');
    const off = avaliaHoras(sp, 'kite', [{ ...base, wd: 90 }])[0];
    expect(off.n).toBeLessThanOrEqual(3);
    // surf não leva tecto de vento
    expect(avaliaHoras(sp, 'surf', [{ ...base, wd: 90 }])[0].seguranca).toBeNull();
  });
  it('nunca «/100» nem notas > 10 na frase e na tabela', () => {
    const sp = spotModalidadeDe(editorialDe(getSpotBySlug('guincho')!));
    const H = construirHoras(serie(96), { lat: 38.73, lon: -9.47, praiaVirada: sp.praiaVirada }, instanteLisboa('2026-10-14T09:00')).horas;
    for (const dd of MODALIDADES_VISIVEIS) {
      const NS = avaliaHoras(sp, dd, H);
      NS.forEach((r) => r.n == null || expect(r.n).toBeLessThanOrEqual(10));
      const f = construirFrase({ sp, d: dd, H, NS, sol: {}, copy: spotPageV6.pt, locale: 'pt' });
      H.forEach((_, i) => expect(`${f(i).l1} ${parteTxt(f(i).l2)}`).not.toMatch(/\/\s*100/));
    }
  });
});

describe('ventu.modalidade no formato {d, v}', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    const ls = {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
    };
    // @ts-expect-error ambiente node: window mínimo
    globalThis.window = { localStorage: ls, dispatchEvent: () => true };
    // @ts-expect-error CustomEvent mínimo
    globalThis.CustomEvent = class { constructor(public type: string, public init?: unknown) {} };
  });
  it('lê {d, v} e a string antiga da maquete (e migra-a)', () => {
    expect(parsePrefModalidade('{"d":"surf","v":{}}')).toEqual({ d: 'surf', v: {} });
    expect(parsePrefModalidade('kite')).toEqual({ d: 'kite', v: {} });
    expect(parsePrefModalidade('windsurf')).toBeNull();
    expect(parsePrefModalidade('{estragado')).toBeNull();
    mem.set(LS_MODALIDADE, 'surf');
    expect(lerPrefModalidade()).toEqual({ d: 'surf', v: {} });
    expect(JSON.parse(mem.get(LS_MODALIDADE)!)).toEqual({ d: 'surf', v: {} });
  });
  it('grava {d, v} e a escolha da home actual (ponte)', () => {
    gravarPrefModalidade('kite');
    expect(JSON.parse(mem.get(LS_MODALIDADE)!)).toEqual({ d: 'kite', v: {} });
    expect(mem.get('ventu:sport-chosen')).toBe('kitesurf');
  });
  it('?d= na URL tem prioridade', () => {
    mem.set(LS_MODALIDADE, '{"d":"kite","v":{}}');
    expect(modalidadeDaUrl('?d=surf')).toBe('surf');
    expect(modalidadeInicial('?d=surf')).toBe('surf');
    expect(modalidadeInicial('')).toBe('kite');
    expect(modalidadeDaUrl('?d=foil')).toBeNull();
  });
});

describe('campos editoriais e fotos', () => {
  it('os curados usam os ids reais de spots.ts (lagoa-obidos → obidos-lagoon, com variantes)', () => {
    for (const id of SPOTS_CURADOS) expect(spots.some((s) => s.id === id), id).toBe(true);
    expect(SPOTS_CURADOS).toEqual(expect.arrayContaining(['obidos-lagoon', 'obidos-lagoon-sul', 'foz-arelho', 'guincho', 'costa-caparica', 'lagos', 'cabedelo']));
    expect(editorialDe(getSpotBySlug('guincho')!).praiaVirada).toBe(280);
    expect(editorialDe(getSpotBySlug('obidos-lagoon')!).aguaPlana).toBe(true);
  });
  it('defaults pela orientação da praia (regra documentada)', () => {
    const s = spots.find((x) => !SPOTS_CURADOS.includes(x.id))!;
    const e = editorialDe(s);
    expect(e.estimado).toBe(true);
    expect(e.praiaVirada).toBe(((Math.round(s.coastOrientation) % 360) + 360) % 360);
    expect(e.surf.tol).toBe(25);
  });
  it('cada foto tem crédito completo e o ficheiro existe', () => {
    for (const [id, f] of Object.entries(FOTOS_META)) {
      expect(f.autor, id).toBeTruthy();
      expect(f.perfil, id).toMatch(/^https:\/\//);
      expect(f.pagina, id).toMatch(/^https:\/\//);
      if (f.fonte === 'Unsplash') expect(f.pagina).toContain('utm_source=ventu&utm_medium=referral');
      for (const fn of [f.ficheiro, f.card]) expect(fs.existsSync(path.resolve('public/fotos/spots', fn)), fn).toBe(true);
    }
    expect(FOTOS_META['commons:guincho'].lic).toBe('CC BY-SA 3.0');
    expect(fs.existsSync(path.resolve('public/fotos/spots/CREDITOS.md'))).toBe(true);
  });
  it('substitutas dizem o sítio real; spots longe ficam sem foto', () => {
    expect(fotoDoSpot(getSpotBySlug('guincho')!, 'kite')?.estado).toBe('real');
    expect(FOTOS_POR_SPOT['costa-caparica'].kite.estado).toBe('sub');
    const ilha = spots.find((s) => s.lon < -20)!;
    expect(fotoDoSpot(ilha, 'surf')).toBeNull();
    const perto = spots.find((s) => s.id === 'parede');
    if (perto) {
      const f = fotoDoSpot(perto, 'surf');
      expect(f?.estado).toBe('sub');
      expect(f?.onde).toBeTruthy();
    }
  });
});

describe('tokens v6 e contraste (cores.md)', () => {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  it('os hexes são os do contrato', () => {
    expect(V6_UI).toMatchObject({ abismo: '#030E18', fundo: '#071B2C', mar: '#0C2A42', linha: '#1E4361', espuma: '#F3F8FB', nevoa: '#A9C2D4', sol: '#FFC93C', gelo: '#7FE7FF' });
    expect(Object.fromEntries(Object.entries(V6_BANDAS).map(([k, v]) => [k, v.c]))).toEqual({
      nao: '#A8464A', fraco: '#4479EE', da: '#C99E2A', bom: '#40DCD0', mb: '#FFF07A', noite: '#56677B',
    });
  });
  it('texto no fill de cada banda ≥ 4,5:1', () => {
    for (const [k, v] of Object.entries(V6_BANDAS)) expect(ratio(v.c, v.t), k).toBeGreaterThanOrEqual(4.5);
  });
  it('cor da banda como texto sobre abismo: Dá/Bom/Muito bom ≥ 4,5:1; Não dá/Fraco/Noite ≥ 3:1 (só ≥ 24 px)', () => {
    for (const k of ['da', 'bom', 'mb'] as const) expect(ratio(V6_BANDAS[k].c, V6_UI.abismo), k).toBeGreaterThanOrEqual(4.5);
    for (const k of ['nao', 'fraco', 'noite'] as const) expect(ratio(V6_BANDAS[k].c, V6_UI.abismo), k).toBeGreaterThanOrEqual(3);
  });
  it('o CSS só usa a cor da banda como texto em tamanhos ≥ 24 px', () => {
    const css = fs.readFileSync(path.resolve('src/styles/v6-atlantico.css'), 'utf8');
    const regras = css.split('}').filter((r) => /(^|[;{\s])color:var\(--band\)/.test(r));
    expect(regras.length).toBeGreaterThan(0);
    for (const r of regras) {
      const m = r.match(/font:[^;]*?(?:clamp\((\d+)px|(\d+)px)/);
      expect(m, r).toBeTruthy();
      expect(Number(m![1] ?? m![2]), r).toBeGreaterThanOrEqual(24);
    }
  });
  it('fontes auto-alojadas, sem Google Fonts', () => {
    const css = fs.readFileSync(path.resolve('src/styles/v6-fontes.css'), 'utf8');
    expect(css).not.toMatch(/googleapis|gstatic/);
    expect(css.match(/@font-face/g)?.length).toBe(20);
    expect(fs.existsSync(path.resolve('public/fonts/barlow/OFL.txt'))).toBe(true);
  });
});
