/**
 * Motor da home v6 «Atlântico» (#183): blocos, ranking único, janela, linhas
 * do top 3 e frase nacional. Porta do `nucleo.js` da maquete aprovada
 * (`docs/design/maquetes/home/fontes/nucleo.js`), só com kite e surf.
 *
 * - As notas são as da página de spot (#184): o mesmo objecto por spot e hora
 *   (`construirHoras` / `linhaParaHora`) e o mesmo `avaliaHoras` (motor
 *   `modalidades-def.json` + tecto de segurança do vento da #210). Nenhum
 *   limiar aqui: as bandas vêm de `bandaDe` (escala 0–10).
 * - Ranking único: a lista (nº 1–3), o melhor da régua, os rótulos do mapa e
 *   a foto do hero saem todos de `ranking()`.
 * - Regra de ouro: as linhas só lêem o objecto da hora; máximos com «até».
 * - Paridade: `src/lib/home/__tests__/paridade-home.test.ts` (0 diferenças
 *   com o `nucleo.js` original sobre os dados da maquete).
 */
import {
  avaliaHoras,
  bandaDe,
  bandaRank,
  curva,
  defDe,
  degrau,
  dif,
  MODALIDADES_DEF,
  pico,
  ventoRel,
  type AvaliacaoHora,
  type BandaK,
  type DefOnda,
  type DefVento,
  type Modalidade,
  type SpotModalidade,
} from '@/lib/modalidades';
import type { HoraSpot } from '@/lib/horaSpot';
import COSTA from './costaV6.json';
import { homeV6Copy, type HomeV6Copy } from '@/lib/translations/homeV6';

export type ZonaHome = 'norte' | 'oeste' | 'lisboa' | 'vicentina' | 'sagres' | 'algarve';

export interface SpotCosta {
  id: string;
  maqueteId: string;
  nome: string;
  curto?: string;
  concelho: string;
  zona: ZonaHome;
  desportos: Modalidade[];
  art: '' | 'o' | 'a';
}

export const COSTA_V6 = COSTA as unknown as {
  zonas: Record<ZonaHome, { nome: string; em: string; nomeEn: string; emEn: string }>;
  blocos: Array<{ id: 'manha' | 'tarde' | 'fim'; nome: string; de: number; ate: number; luz: number }>;
  spots: SpotCosta[];
};

/** Um spot da home com as suas horas (o mesmo objecto da página de spot). */
export interface SpotHome extends SpotCosta {
  lat: number;
  lon: number;
  /** O que o motor lê (`spotModalidadeDe(editorialDe(spot))`). */
  sp: SpotModalidade;
  /** Horas desde as 00h do dia 0 (hora local de Lisboa), uma por índice. */
  h: HoraSpot[];
}

export interface Bloco {
  id: string;
  dia: 0 | 1;
  k: 'manha' | 'tarde' | 'fim';
  a: number;
  z: number;
  luz: number;
  passado: boolean;
  atual: boolean;
}

export interface Linha {
  sp: SpotHome;
  i: number;
  n: number | null;
  b: BandaK;
  jn: { a: number; z: number; b: BandaK } | null;
  fim: number;
  NS: Array<number | null>;
}

const CM = MODALIDADES_DEF.comum as unknown as { noite: number; rajadaNaFrase: number; estragaAcimaDe: number };
const ROSA = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const rumo = (d: number) => ROSA[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
const hora = (t: string) => +t.slice(11, 13);
const diaDe = (t: string) => t.slice(0, 10);

/** Noite = o sol abaixo do limiar do motor (`comum.noite`). */
export const ehNoite = (sunEl: number) => sunEl < CM.noite;

export interface Modelo {
  NH: number;
  spots: SpotHome[];
  /** Hora local `YYYY-MM-DDTHH:MM` do índice i (do spot de referência). */
  t: (i: number) => string;
  hh: (i: number) => number;
  notas: (d: Modalidade) => Record<string, Array<number | null>>;
  avaliacoes: (d: Modalidade) => Record<string, AvaliacaoHora[]>;
  spotsDe: (d: Modalidade) => SpotHome[];
  blocos: (agoraI: number) => Bloco[];
  avalia: (sp: SpotHome, d: Modalidade, bl: Bloco, agoraI: number) => Linha;
  ranking: (d: Modalidade, bl: Bloco, agoraI: number) => Linha[];
  janela: (NS: ReadonlyArray<number | null>, i: number) => Linha['jn'];
  quando: (r: Linha, bl: Bloco) => string;
  linha: (r: Linha, d: Modalidade, bl: Bloco) => { l1: string; l2: string; pal: string | null };
  nacional: (d: Modalidade, bl: Bloco, agoraI: number) => { txt: string; corpo?: string; b: BandaK };
  ventoNome: (h: HoraSpot, sp: SpotHome) => string;
  copy: HomeV6Copy;
}

/**
 * Modelo da home sobre os spots com as suas horas. `copy` escolhe a língua
 * (PT-PT por omissão; a paridade com a maquete é em PT).
 */
export function criarModelo(spots: SpotHome[], copy: HomeV6Copy = homeV6Copy('pt')): Modelo {
  const REF = spots.find((s) => s.id === 'guincho') ?? spots[0];
  const NH = Math.min(...spots.map((s) => s.h.length));
  const t = (i: number) => REF.h[Math.max(0, Math.min(REF.h.length - 1, i))]?.t ?? '';
  const hh = (i: number) => hora(t(i));
  const c = copy;
  const ordemTodos = spots.map((s) => s.id);

  const cacheA: Partial<Record<Modalidade, Record<string, AvaliacaoHora[]>>> = {};
  function avaliacoes(d: Modalidade) {
    if (cacheA[d]) return cacheA[d]!;
    const m: Record<string, AvaliacaoHora[]> = {};
    for (const s of spots) m[s.id] = avaliaHoras(s.sp, d, s.h.slice(0, NH));
    return (cacheA[d] = m);
  }
  const cacheN: Partial<Record<Modalidade, Record<string, Array<number | null>>>> = {};
  function notas(d: Modalidade) {
    if (cacheN[d]) return cacheN[d]!;
    const A = avaliacoes(d);
    const m: Record<string, Array<number | null>> = {};
    for (const s of spots) m[s.id] = A[s.id].map((r) => r.n);
    return (cacheN[d] = m);
  }
  const PD = (d: Modalidade) => defDe(d);
  const pouco = (h: HoraSpot, p: DefVento) => curva(p.vento, h.w) === 0 && h.w < pico(p.vento);
  const rajado = (h: HoraSpot, p: DefVento) => degrau(p.rajada, h.g - h.w) > 0 || h.g > p.tecto[0];
  const chove = (h: HoraSpot, p: { chuva: DefVento['chuva'] }) => degrau(p.chuva, h.rain) > 0;
  const DA = 5;
  const ondaPouca = (h: HoraSpot, p: DefOnda) => curva(p.tamanho, h.hs) < DA && h.hs < pico(p.tamanho);
  const ondaGrandeDemais = (h: HoraSpot, p: DefOnda) => curva(p.tamanho, h.hs) < DA && h.hs > pico(p.tamanho);
  const ventoEstraga = (h: HoraSpot, p: DefOnda) => h.w >= p.vento.desde + CM.estragaAcimaDe;
  const spotsDe = (d: Modalidade) => spots.filter((s) => s.desportos.includes(d));

  function janela(NS: ReadonlyArray<number | null>, i: number): Linha['jn'] {
    const b = bandaDe(NS[i] ?? null);
    const rk = bandaRank(b);
    if (rk < 2) return null;
    let a = i;
    let z = i;
    while (z + 1 < NH && bandaRank(bandaDe(NS[z + 1] ?? null)) >= rk) z++;
    while (a - 1 >= 0 && bandaRank(bandaDe(NS[a - 1] ?? null)) >= rk) a--;
    return { a, z, b };
  }
  const fimHora = (j: number) => c.horaH((hh(j) + 1) % 24);
  const acabaNoite = (NS: ReadonlyArray<number | null>, z: number) => z + 1 < NH && NS[z + 1] == null;
  function ventoNome(h: HoraSpot, sp: SpotHome) {
    const v = h.wd;
    const k = hora(h.t);
    const tarde = k >= 11 && k <= 21;
    if (Math.abs(dif(v, 345)) <= 25 && tarde && sp.zona !== 'algarve') return c.nortada(rumo(v));
    if (sp.zona === 'algarve' && tarde && Math.abs(dif(v, 245)) <= 35) return c.brisa(rumo(v));
    return c.ventoDe(rumo(v));
  }
  function intervalo(sp: SpotHome, a: number, z: number, k: 'w' | 'g'): [number, number] {
    let lo = 1e9;
    let hi = -1e9;
    for (let j = a; j <= z; j++) {
      lo = Math.min(lo, sp.h[j][k]);
      hi = Math.max(hi, sp.h[j][k]);
    }
    return [lo, hi];
  }
  const faixaN = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

  /* blocos: hoje e amanhã × manhã, tarde, fim de tarde (pela data e hora de cada índice: sem contas de fuso) */
  function blocos(agoraI: number): Bloco[] {
    const out: Bloco[] = [];
    const dia0 = diaDe(t(0));
    const dias: string[] = [];
    for (let i = 0; i < NH; i++) {
      const d = diaDe(t(i));
      if (!dias.includes(d)) dias.push(d);
    }
    if (dias[0] !== dia0) return out;
    for (let d = 0 as 0 | 1; d < 2; d = (d + 1) as 0 | 1) {
      const dia = dias[d];
      if (!dia) break;
      for (const b of COSTA_V6.blocos) {
        let a = -1;
        let z = -1;
        let luz = -1;
        for (let i = 0; i < NH; i++) {
          if (diaDe(t(i)) !== dia) continue;
          const k = hh(i);
          if (k >= b.de && k <= b.ate) {
            if (a < 0) a = i;
            z = i;
          }
          if (k === b.luz) luz = i;
        }
        if (a < 0 || hh(z) !== b.ate) continue;
        out.push({ id: `${d}-${b.id}`, dia: d, k: b.id, a, z, luz: luz < 0 ? a : luz, passado: z < agoraI, atual: agoraI >= a && agoraI <= z });
      }
      if (d === 1) break;
    }
    return out;
  }

  /* avaliação de um spot num bloco: no bloco actual, a hora de agora; nos outros, a melhor hora do bloco com sol ≥ 2° */
  function avalia(sp: SpotHome, d: Modalidade, bl: Bloco, agoraI: number): Linha {
    const NS = notas(d)[sp.id];
    let i = bl.atual ? agoraI : bl.a;
    if (!bl.atual) {
      let best = -2;
      for (let j = bl.a; j <= bl.z; j++)
        if (sp.h[j].sunEl >= 2 && (NS[j] ?? -1) > best) {
          best = NS[j] ?? -1;
          i = j;
        }
    }
    const n = NS[i] ?? null;
    const b = bandaDe(n);
    const jn = janela(NS, i);
    return { sp, i, n, b, jn, fim: jn ? jn.z : i, NS };
  }
  function ranking(d: Modalidade, bl: Bloco, agoraI: number): Linha[] {
    return spotsDe(d)
      .map((sp) => avalia(sp, d, bl, agoraI))
      .sort(
        (x, y) =>
          (y.n ?? -1) - (x.n ?? -1) || y.fim - y.i - (x.fim - x.i) || ordemTodos.indexOf(x.sp.id) - ordemTodos.indexOf(y.sp.id),
      );
  }

  /* «até às 19h», «das 13h às 17h», «até ao pôr do sol» */
  function quando(r: Linha, bl: Bloco): string {
    const { NS, jn } = r;
    if (!jn) return '';
    const desde = bl.atual ? '' : c.das(hh(Math.max(jn.a, bl.a)));
    const fimTxt = acabaNoite(NS, jn.z) ? null : fimHora(jn.z);
    return c.quando(desde, fimTxt);
  }
  function linha(r: Linha, d: Modalidade, bl: Bloco) {
    const { sp, i, n, b, jn } = r;
    const h = sp.h[i];
    // hora sem o dado da fonte (auditoria 16/10, M2): «sem dados», não «noite»
    if (n == null && avaliacoes(d)[sp.id]?.[i]?.semDados) return { l1: c.semDadosHora, l2: '', pal: null };
    if (n == null) return { l1: c.noite, l2: '', pal: null };
    let l1: string;
    let l2: string;
    if (d === 'kite') {
      const p = PD('kite') as DefVento;
      if (jn) {
        l1 = `${c.banda[b]} ${quando(r, bl)}`;
        const [lo, hi] = intervalo(sp, i, jn.z, 'w');
        l2 = `<b>${ventoNome(h, sp)} ${faixaN([lo, hi])} ${c.nos}</b>`;
        const gmax = intervalo(sp, i, jn.z, 'g')[1];
        if (gmax - hi >= CM.rajadaNaFrase) l2 += c.rajadasAte(gmax);
        else {
          const vr = ventoRel(sp.sp, h.wd);
          l2 += `, ${vr.k === 'lat-mar' ? c.lateralMar : c.relCurta(vr)}`;
        }
      } else {
        const vr = ventoRel(sp.sp, h.wd);
        if (pouco(h, p)) l1 = c.poucoVento;
        else if (vr.k === 'terra' || vr.k === 'lat-terra') l1 = c.ventoTerra;
        else if (rajado(h, p)) l1 = c.rajado(c.banda[b], chove(h, p));
        else l1 = c.banda[b];
        l2 = `<b>${ventoNome(h, sp)} ${h.w} ${c.nos}</b>, ${c.rajadas} ${h.g}`;
      }
    } else {
      const p = PD('surf') as DefOnda;
      const vr = ventoRel(sp.sp, h.wd);
      if (jn) {
        l1 = `${c.banda[b]} ${quando(r, bl)}`;
        l2 = `<b>${c.mar(h.hs, h.tp, rumo(h.sd))}</b> · ${
          h.w < 6 ? c.quaseSemVento : vr.k === 'terra' ? c.terral(rumo(h.wd), h.w) : c.vento(rumo(h.wd), h.w)
        }`;
      } else {
        if (ondaGrandeDemais(h, p)) l1 = c.ondaGrandeDemais;
        else if (ventoEstraga(h, p) && vr.k !== 'terra') l1 = c.ventoEstraga;
        else if (ondaPouca(h, p)) l1 = c.poucaOnda;
        else l1 = c.banda[b];
        l2 = `<b>${c.marCurto(h.hs, h.tp)}</b> · ${c.vento(rumo(h.wd), h.w)}${chove(h, p as unknown as DefVento) ? c.chuvaSuf : ''}`;
      }
    }
    return { l1, l2, pal: jn ? c.banda[b] : null };
  }

  /* frase nacional: a voz editorial curta, derivada do ranking do bloco */
  function nacional(d: Modalidade, bl: Bloco, agoraI: number): { txt: string; corpo?: string; b: BandaK } {
    const R = ranking(d, bl, agoraI);
    const top = R[0];
    const ordem = spotsDe(d).map((s) => s.id);
    if (!top || top.n == null) return { txt: c.noiteNaCosta, b: 'noite' };
    const ht = top.sp.h[top.i];
    const bons = R.filter((r) => bandaRank(r.b) >= 3);
    const rot = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const zonaEm = (z: ZonaHome) => c.zonaEm(z);
    function onde(rs: Linha[]) {
      const idx = rs.map((r) => ordem.indexOf(r.sp.id)).sort((a, b) => a - b);
      const cont = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
      const sps = idx.map((k) => spots.find((s) => s.id === ordem[k])!);
      if (sps.length === 1) return c.em(sps[0]);
      if (cont && sps.length >= 3) return c.doAo(sps[0], sps[sps.length - 1]);
      if (sps.length <= 3) return c.lista(sps.map((s) => c.em(s)));
      const zs = [...new Set(sps.map((s) => s.zona))];
      if (zs.length >= 3) return zs.every((z) => ['norte', 'oeste', 'lisboa'].includes(z)) ? c.costaOesteToda : c.norteASul;
      return c.lista(zs.map(zonaEm));
    }
    function ate(rs: Linha[]) {
      const fim = Math.max(...rs.map((r) => r.fim));
      const r = rs.find((x) => x.fim === fim)!;
      const ini = Math.min(...rs.map((x) => (x.jn ? x.jn.a : x.i)));
      const fimTxt = acabaNoite(r.NS, fim) ? null : fimHora(fim);
      if (bl.atual) return c.quando('', fimTxt);
      return c.quando(c.das(hh(Math.max(ini, bl.a))), fimTxt);
    }
    const zonaDe = (rs: Linha[]) => {
      const zs = [...new Set(rs.map((r) => r.sp.zona))];
      return zs.length === 1 ? zonaEm(zs[0]) : zs.every((z) => ['norte', 'oeste', 'lisboa'].includes(z)) ? c.naCostaOeste : c.naCosta;
    };
    const palavra = (rs: Linha[]) => {
      const ks = [...new Set(rs.map((r) => bandaRank(r.b)))].sort();
      const ORD: BandaK[] = ['nao', 'fraco', 'da', 'bom', 'mb'];
      const nm = ks.map((k) => c.banda[ORD[k]].toLowerCase());
      return { txt: nm.length > 1 ? c.aA(nm[0], nm[nm.length - 1]) : nm[0], b: ORD[ks[ks.length - 1]] };
    };
    const nm = c.modNome[d];
    const pd = PD(d);
    if (d === 'kite') {
      const rumoTop = ventoNome(ht, top.sp).replace(/^(nortada|north wind) .*/, '$1');
      const w0 = top.sp.h[top.i].w;
      const w2 = top.sp.h[Math.min(top.i + 2, NH - 1)].w;
      const verbo = w2 - w0 >= 3 ? c.aApertar : w0 - w2 >= 3 ? c.aCair : '';
      if (bons.length) {
        const p = palavra(bons);
        const o = onde(bons);
        const z = c.ehCostaToda(o) ? '' : ' ' + zonaDe(bons);
        const corpo = `${nm} <em>${p.txt}</em> ${o}, ${ate(bons)}.`;
        return { txt: `${rot(rumoTop)}${verbo ? ' ' + verbo : ''}${z}: ${corpo}`, corpo, b: p.b };
      }
      if (bandaRank(top.b) === 2) return { txt: c.diaMornoKite(nm, c.oA(top.sp), quando(top, bl)), b: top.b };
      const chuva = R.filter((r) => chove(r.sp.h[r.i], pd as DefVento)).length > R.length / 2;
      const fraco = R.filter((r) => pouco(r.sp.h[r.i], pd as DefVento)).length > R.length / 2;
      return {
        txt: chuva ? c.frenteKite(nm) : fraco ? c.poucoVentoCosta(nm) : c.ventoTorto(nm, c.banda[top.b].toLowerCase()),
        b: top.b,
      };
    }
    // surf
    const sw = c.ondulacaoDe(rumo(ht.sd));
    if (bons.length) {
      const p = palavra(bons);
      const oeste = R.filter((r) => ['norte', 'oeste', 'lisboa'].includes(r.sp.zona));
      const ventoOeste = oeste.filter((r) => {
        const h = r.sp.h[r.i];
        return ventoEstraga(h, pd as DefOnda) && ventoRel(r.sp.sp, h.wd).k !== 'terra';
      }).length;
      const soSul = bons.every((r) => ['vicentina', 'sagres', 'algarve'].includes(r.sp.zona));
      const lead =
        soSul && ventoOeste > oeste.length / 2
          ? c.aEstragarOeste(rot(ventoNome(oeste[0].sp.h[oeste[0].i], oeste[0].sp).split(' ')[0]))
          : c.limpa(rot(sw));
      const corpo = `${nm} <em>${p.txt}</em> ${soSul ? c.soASul : ''}${onde(bons)}, ${ate(bons)}.`;
      return { txt: `${lead}${corpo}`, corpo, b: p.b };
    }
    if (bandaRank(top.b) === 2) return { txt: c.marMexido(nm, c.oA(top.sp), quando(top, bl)), b: top.b };
    const chuva = R.filter((r) => chove(r.sp.h[r.i], pd as unknown as DefVento)).length > R.length / 2;
    const grande = R.filter((r) => ondaGrandeDemais(r.sp.h[r.i], pd as DefOnda)).length > R.length / 2;
    return {
      txt: chuva
        ? c.frenteSurf(nm)
        : grande
          ? c.marGrande(nm, c.banda[top.b].toLowerCase())
          : top.b === 'nao'
            ? c.ventoEstragaNaoDa(nm)
            : c.ventoEstragaFraco(nm),
      b: top.b,
    };
  }

  return { NH, spots, t, hh, notas, avaliacoes, spotsDe, blocos, avalia, ranking, janela, quando, linha, nacional, ventoNome, copy: c };
}

/** Partes de uma frase com `<b>` e `<em>` (as únicas marcas que o motor escreve). */
export interface ParteFrase {
  t: string;
  b?: boolean;
  em?: boolean;
}
export function partesFrase(s: string): ParteFrase[] {
  const out: ParteFrase[] = [];
  const re = /<(b|em)>(.*?)<\/\1>/g;
  let k = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > k) out.push({ t: s.slice(k, m.index) });
    out.push(m[1] === 'b' ? { t: m[2], b: true } : { t: m[2], em: true });
    k = m.index + m[0].length;
  }
  if (k < s.length) out.push({ t: s.slice(k) });
  return out;
}
export const textoFrase = (s: string) => s.replace(/<[^>]+>/g, '');
