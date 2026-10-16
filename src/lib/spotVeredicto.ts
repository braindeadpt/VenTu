/**
 * Veredicto da página de spot v6 (#184): a frase de cada hora, a janela e as
 * horas por extenso. Gramática da maquete aprovada (`guincho.html`, função
 * `frase`), partilhada com a home (#183). Não há limiares aqui: as bandas
 * vêm de `src/lib/modalidades` (escala da #210) e os números do objecto da
 * hora.
 *
 * Paridade: `src/lib/modalidades/__tests__/paridade-guincho.test.ts` compara
 * nota + frase com a maquete nas 48 horas, kite e surf (0 diferenças).
 */
import {
  bandaDe,
  bandaRank,
  defDe,
  dif,
  MODALIDADES_DEF,
  ventoRel,
  type AvaliacaoHora,
  type BandaK,
  type DefOnda,
  type HoraModalidade,
  type Modalidade,
  type SpotModalidade,
} from '@/lib/modalidades';
import { fmtCopy, type SpotPageV6Copy } from '@/lib/translations/spotPage/v6';

export interface Parte {
  t: string;
  b?: boolean;
}
export interface Frase {
  l1: string;
  l2: Parte[];
}

export interface ContextoVeredicto {
  sp: SpotModalidade;
  d: Modalidade;
  H: readonly HoraModalidade[];
  NS: readonly AvaliacaoHora[];
  /** Pôr do sol por dia (`YYYY-MM-DD` → `HH:mm`). */
  sol: Record<string, { nascer: string; por: string }>;
  copy: SpotPageV6Copy;
  locale: string;
}

const ROSA = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** Rumo de 16 pontos. */
export const rumo = (d: number) => ROSA[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];

/** Número com casas decimais no locale. */
export function fmtNum(x: number, locale: string, d = 1): string {
  return x.toLocaleString(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

/** Hora (0–23) de `YYYY-MM-DDTHH:mm`. */
export const horaDe = (t: string) => +t.slice(11, 13);
/** Dia da semana (0 = domingo) de `YYYY-MM-DD…`. */
export const diaSemana = (t: string) =>
  new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10))).getUTCDay();
const diaSeguinte = (t: string) => {
  const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10) + 1));
  return d.toISOString().slice(0, 10);
};

export const horaTxt = (c: SpotPageV6Copy, h: number) => fmtCopy(c.hora, { h });
/** «qua 14» */
export const diaCurto = (c: SpotPageV6Copy, t: string) => `${c.dias[diaSemana(t)]} ${+t.slice(8, 10)}`;
/** «16h50» / «16:50» */
export function hmTxt(c: SpotPageV6Copy, t: string, locale: string): string {
  const hh = +t.slice(11, 13);
  const mm = t.slice(14, 16);
  if (locale === 'pt') return mm === '00' ? `${hh}h` : `${hh}h${mm}`;
  return `${hh}:${mm}`;
}

export const bandaR = (r: AvaliacaoHora): BandaK => bandaDe(r.n);
const rankDe = (r: AvaliacaoHora) => bandaRank(bandaR(r));

/** Janela à volta da hora i com banda ≥ a da hora (só a partir de «Dá»). */
export function janela(NS: readonly AvaliacaoHora[], i: number) {
  const rk = rankDe(NS[i]);
  if (rk < 2) return null;
  let a = i;
  let z = i;
  while (z + 1 < NS.length && rankDe(NS[z + 1]) >= rk) z++;
  while (a - 1 >= 0 && rankDe(NS[a - 1]) >= rk) a--;
  return { a, z, b: bandaR(NS[i]) };
}

/** Próxima janela depois de i com banda ≥ minRank (Bom; senão Dá). */
export function proxJanela(
  NS: readonly AvaliacaoHora[],
  i: number,
  minRank = 3,
): { a: number; z: number } | null {
  for (let j = i + 1; j < NS.length; j++)
    if (rankDe(NS[j]) >= minRank) {
      let z = j;
      while (z + 1 < NS.length && rankDe(NS[z + 1]) >= minRank) z++;
      return { a: j, z };
    }
  if (minRank > 2) return proxJanela(NS, i, 2);
  return null;
}

function intervalo(H: readonly HoraModalidade[], a: number, z: number, k: 'w' | 'g'): [number, number] {
  let lo = 1e9;
  let hi = -1e9;
  for (let j = a; j <= z; j++) {
    lo = Math.min(lo, H[j][k]);
    hi = Math.max(hi, H[j][k]);
  }
  return [lo, hi];
}
const faixaN = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);

/** Relação do vento com a praia, por extenso no locale. */
export function ventoRelTxt(c: SpotPageV6Copy, sp: SpotModalidade, wd: number): string {
  const vr = ventoRel(sp, wd);
  return fmtCopy(c.ventoRel[vr.k], { lado: vr.rel > 0 ? c.peloNorte : c.peloSul });
}

/** Como a ondulação entra na praia. */
export function ondaRelTxt(c: SpotPageV6Copy, sp: SpotModalidade, sd: number): string {
  const rel = dif(sd, sp.praiaVirada);
  const a = Math.abs(rel);
  if (a <= 12) return c.ondaFrente;
  return fmtCopy(c.ondaLado, { lado: rel > 0 ? c.peloNorte : c.peloSul, a: Math.round(a / 5) * 5 });
}

export function construirFrase(ctx: ContextoVeredicto) {
  const { sp, d, H, NS, sol, copy: c, locale } = ctx;
  const P = defDe(d);
  const CM = MODALIDADES_DEF.comum;
  const nomeD = c.frases[d] ?? d;
  const bandaNome = (b: BandaK) => c.bandas[b];
  const fimHora = (j: number) => horaTxt(c, (horaDe(H[j].t) + 1) % 24);
  const quandoTxt = (j: number, ref: number) => {
    const tj = H[j].t;
    const tr = H[ref].t;
    const mesmoDia = tj.slice(0, 10) === tr.slice(0, 10);
    const amanha = diaSeguinte(tr) === tj.slice(0, 10);
    return (mesmoDia ? '' : amanha ? c.amanha + ' ' : c.dias[diaSemana(tj)] + ' ') + horaTxt(c, horaDe(tj));
  };
  const ventoNome = (h: HoraModalidade) => {
    const v = h.wd;
    const k = horaDe(h.t);
    const tarde = k >= 11 && k <= 21;
    return dif(v, 345) >= -25 && dif(v, 345) <= 25 && tarde
      ? fmtCopy(c.nortada, { r: rumo(v) })
      : fmtCopy(c.ventoDe, { r: rumo(v) });
  };
  const nf = (x: number) => fmtNum(x, locale);

  return function frase(i: number): Frase {
    const h = H[i];
    const r = NS[i];
    const b = bandaR(r);
    if (r.semDados) {
      // a fonte não traz o dado desta hora (auditoria 16/10, M2): nem nota nem «noite»
      return { l1: `${c.semDadosPal}. ${P.logica === 'vento' ? c.semDadosVento : c.semDadosOnda}`, l2: [] };
    }
    if (r.n == null) {
      const p = proxJanela(NS, i);
      if (!p) return { l1: c.noite, l2: [{ t: c.noiteSemJanela }] };
      const hp = H[p.a];
      const l1 = fmtCopy(c.noiteJanela, { q: quandoTxt(p.a, i), fim: fimHora(p.z) });
      const l2: Parte[] =
        P.logica === 'onda'
          ? [
              { t: fmtCopy(c.ondaMaTsDe, { hs: nf(hp.hs), tp: hp.tp, r: rumo(hp.sd) }), b: true },
              { t: ' · ' + fmtCopy(c.ventoRN, { r: rumo(hp.wd), w: hp.w }) },
            ]
          : [
              { t: `${ventoNome(hp)} ${faixaN(intervalo(H, p.a, p.z, 'w'))} ${c.nos}`, b: true },
              { t: ' · ' + fmtCopy(c.rajadasAte, { g: intervalo(H, p.a, p.z, 'g')[1] }) },
            ];
      return { l1, l2 };
    }
    const jn = janela(NS, i);
    let l1: string;
    let l2: Parte[];
    if (jn) {
      const acabaNoite = jn.z + 1 < H.length && NS[jn.z + 1].n == null;
      const s = sol[h.t.slice(0, 10)];
      const ate =
        acabaNoite && s
          ? fmtCopy(c.ateAoPor, { por: locale === 'pt' ? s.por.replace(':', 'h') : s.por })
          : fmtCopy(c.ateAs, { fim: fimHora(jn.z) });
      l1 = `${fmtCopy(c.bandaPara, { banda: bandaNome(b), d: nomeD })} ${ate}`;
      if (P.logica === 'vento') {
        const [lo, hi] = intervalo(H, i, jn.z, 'w');
        l2 = [{ t: `${ventoNome(h)} ${faixaN([lo, hi])} ${c.nos}`, b: true }];
        const gmax = intervalo(H, i, jn.z, 'g')[1];
        if (gmax - hi >= CM.rajadaNaFrase) l2.push({ t: ', ' + fmtCopy(c.rajadasAte, { g: gmax }) });
        else l2.push({ t: ', ' + c.ventoRelCurto[ventoRel(sp, h.wd).k] });
      } else {
        const po = P as DefOnda;
        const vk = ventoRel(sp, h.wd).k;
        l2 = [
          { t: fmtCopy(c.ondaMaTsDe, { hs: nf(h.hs), tp: h.tp, r: rumo(h.sd) }), b: true },
          {
            t:
              ' · ' +
              (h.w < po.vento.desde
                ? c.quaseSemVento
                : vk === 'terra'
                  ? fmtCopy(c.terralFraco, { r: rumo(h.wd) })
                  : fmtCopy(c.ventoRN, { r: rumo(h.wd), w: h.w })),
          },
        ];
      }
    } else {
      const chove = (h.rain ?? 0) > P.chuva[0][0];
      if (P.logica === 'vento') {
        const tpl = c.motivoVento[r.motivo ?? 'banda'] ?? c.motivoVento.banda;
        l1 = fmtCopy(tpl, { d: nomeD, banda: bandaNome(b), r: rumo(h.wd), chuva: chove ? c.eChuva : '' });
        l2 = [{ t: `${h.w} ${c.nos}`, b: true }, { t: ', ' + fmtCopy(c.rajadasAte, { g: h.g }) }];
      } else {
        const tpl = c.motivoOnda[r.motivo ?? 'banda'] ?? c.motivoOnda.banda;
        l1 = fmtCopy(tpl, { d: nomeD, banda: bandaNome(b) });
        l2 = [
          { t: fmtCopy(c.ondaMaTs, { hs: nf(h.hs), tp: h.tp }), b: true },
          { t: ' · ' + fmtCopy(c.ventoRN, { r: rumo(h.wd), w: h.w }) + (chove ? ' · ' + c.chuva : '') },
        ];
      }
      const p = proxJanela(NS, i);
      if (p) {
        const q = quandoTxt(p.a, i);
        const k = q.lastIndexOf(' ');
        const qq = k < 0 ? fmtCopy(c.melhoraAs, { h: q }) : q.slice(0, k) + ' ' + fmtCopy(c.melhoraAs, { h: q.slice(k + 1) });
        l2.push({ t: ' · ' + fmtCopy(c.melhora, { q: qq }) });
      }
    }
    return { l1, l2 };
  };
}

/** Texto corrido das partes (testes, títulos, aria). */
export const parteTxt = (p: Parte[]) => p.map((x) => x.t).join('');

/** A palavra da banda em grande e o resto da frase sem a repetir (como na maquete). */
export function palavraEResto(c: SpotPageV6Copy, f: Frase, b: BandaK, semDados = false): { palavra: string; resto: string } {
  const nome = semDados ? c.semDadosPal : c.bandas[b];
  const resto = f.l1.startsWith(nome) ? f.l1.slice(nome.length).replace(/^[.:\s]+/, '') : f.l1;
  return { palavra: nome, resto: resto.replace(/^./, (x) => x.toUpperCase()) };
}
