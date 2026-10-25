/**
 * Avaliação das modalidades (#184): porta TS de
 * `docs/design/maquetes/modalidades-avalia.js`, SEM mudar a lógica.
 *
 * Lê só a definição (`modalidades-def.json`, cópia de
 * `docs/design/maquetes/modalidades-def.json`). Aqui não há limiares: só a
 * maneira de ler curvas e degraus. Um só motor para a home (#183) e o spot
 * (#184); a paridade com a maquete v6 é testada em
 * `src/lib/modalidades/__tests__/paridade-guincho.test.ts` (0 diferenças).
 *
 * Diferenças face ao JS original (só de forma, nenhuma de lógica):
 * - tipos explícitos; `lado()` e os textos de relação ficam iguais (PT), a UI
 *   traduz pela chave `k`;
 * - as horas sem `rain` (os forecasts do pipeline não a têm) passam por
 *   `degrau(p.chuva, undefined)` → 0, exactamente como no JS: sem penalização.
 */

/** Uma hora de um spot: o objecto único de que tudo o resto lê (regra de ouro). */
export interface HoraModalidade {
  /** Hora local do spot, `YYYY-MM-DDTHH:mm`. */
  t: string;
  /** Vento médio (nós, inteiro). */
  w: number;
  /** Rajadas (nós, inteiro). */
  g: number;
  /** Direcção de onde vem o vento (graus). */
  wd: number;
  /** Altura significativa da onda (m). */
  hs: number;
  /** Período (s). */
  tp: number;
  /** Direcção de onde vem a ondulação (graus). */
  sd: number;
  /** Altura da maré acima do zero hidrográfico (m). */
  tide: number;
  /** A maré está a encher. */
  tideUp: boolean;
  /** Nebulosidade (%); `null` quando a fonte não a tem. */
  cloud?: number | null;
  /** Precipitação (mm/h); `null` quando a fonte não a tem (sem penalização). */
  rain?: number | null;
  /** Elevação do sol (graus). */
  sunEl: number;
  /** Azimute do sol (graus, a partir do norte). */
  sunAz: number;
  /** A fonte não traz vento / onda nesta hora (`null` no forecast): a lógica que precisa deles não avalia. */
  semDados?: ReadonlyArray<'vento' | 'onda'>;
}

export type Ponto = readonly [number, number];
export type Curva = ReadonlyArray<Ponto>;
export type Degraus = ReadonlyArray<Ponto>;

export type VentoRelK = 'mar' | 'lat-mar' | 'lat' | 'lat-terra' | 'terra';

/** Faixa do vento forte (kite): 30–34 forte, 35–39 muito forte, 40+ tempestade (nós, vento médio). */
export type FaixaForte = 'forte' | 'muito-forte' | 'tempestade';

/**
 * Vento forte (decisão do Pedro, 25/10): acima de `desde` nós de vento MÉDIO,
 * nas direcções `dir`, a hora é «Só profissionais». A nota (para os outros
 * níveis) fica baixa, mas não cai a 0/1: nunca abaixo de `piso`; e a rajada
 * absoluta (`tectoDegraus`) deixa de descontar, porque o vento médio já é forte.
 */
export interface DefForte {
  desde: number;
  piso: number;
  dir: ReadonlyArray<VentoRelK>;
  /** [[desde (nós), faixa], …] por ordem crescente. */
  faixas: ReadonlyArray<readonly [number, FaixaForte]>;
}

export interface DefVento {
  nome: string;
  frase?: string;
  dica?: string;
  logica: 'vento';
  vento: Curva;
  dir: Record<VentoRelK, number>;
  rajada: Degraus;
  tecto: Ponto;
  /** Degraus pela rajada absoluta (nós); quando existe, substitui `tecto`. */
  tectoDegraus?: Degraus;
  /** Vento forte: estado «Só profissionais» (só o kite o tem). */
  forte?: DefForte;
  chuva: Degraus;
  onda: { acima: number; pen: number; calma: number };
  mare: { acima: number; pen: number };
  favor: number;
}

export interface DefOnda {
  nome: string;
  frase?: string;
  dica?: string;
  logica: 'onda';
  tamanho: Curva;
  periodo: { bom: number; bonus: number; curto: number; pen: number };
  foraJanela: number;
  favorOnda: Ponto;
  vento: { desde: number; k: number; max: number; terra: Ponto; latTerra: number; contra: number };
  mare: { alta: Ponto; baixa: number };
  chuva: Degraus;
  modos?: string[];
  requer?: string;
  mostraDesde?: number;
}

export interface DefPlana {
  nome: string;
  frase?: string;
  dica?: string;
  logica: 'plana';
  vento: Curva;
  chuva: Degraus;
  requer?: string;
  requerTxt?: string;
}

export type DefModalidade = DefVento | DefOnda | DefPlana;

export interface ModalidadesDef {
  principais: string[];
  mais: string[];
  comum: { noite: number; solBaixo: Ponto; rajadaNaFrase: number; estragaAcimaDe: number };
  def: Record<string, DefModalidade | { nome: string; [k: string]: unknown }>;
  aguaPlana?: unknown[];
}

/** O que o motor precisa de saber de um spot. */
export interface SpotModalidade {
  /** Para onde a praia olha (graus). */
  praiaVirada: number;
  surf: { janela: readonly [number, number]; tol?: number };
  aguaPlana?: boolean;
}

export type Efeito = -2 | -1 | 0 | 1;
export interface Fatores {
  vento: number;
  onda: number;
  mare: number;
}
export type Motivo =
  | 'pouco'
  | 'muito'
  | 'terra'
  | 'rajado'
  | 'banda'
  | 'pouca'
  | 'vento'
  | 'grande'
  | 'picada'
  | 'fora'
  | 'pro';

export interface Avaliacao {
  /** Nota inteira 0–10, ou `null` de noite / fora da modalidade. */
  n: number | null;
  f: Fatores;
  motivo?: Motivo;
  fora?: boolean;
  /** Vento forte (≥ `forte.desde` nós de vento médio, lateral ou lateral de mar): só para profissionais. */
  soProfissionais?: true;
  /** Faixa do vento forte, quando `soProfissionais`. */
  forte?: FaixaForte;
}

export interface VentoRel {
  k: VentoRelK;
  txt: string;
  a: number;
  rel: number;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** a − b em −180..180. */
export const dif = (a: number, b: number) => (((a - b) % 360) + 540) % 360 - 180;
const lado = (rel: number) => (rel > 0 ? 'pelo norte' : 'pelo sul');

/** Relação do vento com a praia (`sp.praiaVirada` = para onde a praia olha). */
export function ventoRel(sp: Pick<SpotModalidade, 'praiaVirada'>, wd: number): VentoRel {
  const rel = dif(wd, sp.praiaVirada);
  const a = Math.abs(rel);
  if (a <= 30) return { k: 'mar', txt: 'de mar, de frente para a praia', a, rel };
  if (a <= 65) return { k: 'lat-mar', txt: 'lateral de mar, ' + lado(rel), a, rel };
  if (a <= 110) return { k: 'lat', txt: 'lateral, paralelo à praia, ' + lado(rel), a, rel };
  if (a <= 150) return { k: 'lat-terra', txt: 'lateral de terra, ' + lado(rel), a, rel };
  return { k: 'terra', txt: 'de terra, a soprar para o mar', a, rel };
}

/** Curva por pontos [x, y]: interpola; x repetido = degrau; fora dos extremos vale a ponta. */
export const curva = (pts: Curva, x: number): number => {
  if (x < pts[0][0]) return pts[0][1];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k];
    const [x1, y1] = pts[k + 1];
    if (x1 > x0 && x >= x0 && x < x1) return lerp(y0, y1, (x - x0) / (x1 - x0));
  }
  return pts[pts.length - 1][1];
};

/** Degraus [[limiar, penalização], …]: vale o maior limiar ultrapassado (x > limiar). */
export const degrau = (lista: Degraus, x: number | null | undefined): number =>
  lista.reduce((p, [lim, pen]) => ((x as number) > lim ? pen : p), 0);

/** Faixa do vento forte para um vento médio `w` (a última com `w` ≥ limiar). */
export const faixaForte = (fx: DefForte['faixas'], w: number): FaixaForte =>
  fx.reduce<FaixaForte>((a, [lim, k]) => (w >= lim ? k : a), fx[0][1]);

/** x do ponto mais alto da curva. */
export const pico = (pts: Curva): number => pts.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

export interface Logicas {
  vento(h: HoraModalidade, p: DefVento): Avaliacao;
  onda(h: HoraModalidade, p: DefOnda): Avaliacao;
  plana(h: HoraModalidade, p: DefPlana): Avaliacao;
  /** k: chave em `def` (kite, surf, wing…). */
  avalia(k: string, h: HoraModalidade): Avaliacao;
}

export interface Motor {
  MD: ModalidadesDef['def'];
  CM: ModalidadesDef['comum'];
  DA: number;
  curva: typeof curva;
  degrau: typeof degrau;
  pico: typeof pico;
  faixaForte: typeof faixaForte;
  intervaloDa(pts: Curva): [number | null, number | null];
  ventoRel: typeof ventoRel;
  dif: typeof dif;
  para(sp: SpotModalidade): Logicas;
  janelaDe(sp: SpotModalidade): { centro: number; tol: number };
}

export function modAvalia(MOD: ModalidadesDef, opc?: { DA?: number }): Motor {
  const MD = MOD.def;
  const CM = MOD.comum;
  // a partir daqui «dá» (banda «Dá» das duas páginas)
  const DA = opc?.DA != null ? opc.DA : 5;

  /** Intervalo de x onde a curva dá pelo menos «Dá». */
  function intervaloDa(pts: Curva): [number | null, number | null] {
    let lo: number | null = null;
    let hi: number | null = null;
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k];
      const [x1, y1] = pts[k + 1];
      if (x1 === x0) continue;
      if (y0 >= DA && lo == null) lo = x0;
      if (y0 < DA !== y1 < DA) {
        const x = x0 + ((DA - y0) / (y1 - y0)) * (x1 - x0);
        if (y1 >= DA) lo = lo ?? x;
        else hi = x;
      }
    }
    return [lo, hi];
  }
  const noiteH = (h: HoraModalidade) => h.sunEl < CM.noite;
  const solBaixo = (h: HoraModalidade) => (h.sunEl < CM.solBaixo[0] ? CM.solBaixo[1] : 0);
  /** Janela de ondulação do spot: centro e tolerância (meia largura, ou sp.surf.tol). */
  const janelaDe = (sp: SpotModalidade) => {
    const [a, z] = sp.surf.janela;
    const w = dif(z, a);
    return {
      centro: (a + w / 2 + 360) % 360,
      tol: sp.surf.tol != null ? sp.surf.tol : Math.abs(w) / 2,
    };
  };

  /** As três lógicas, para um spot. */
  function para(sp: SpotModalidade): Logicas {
    const JAN = janelaDe(sp);
    const L: Logicas = {
      vento(h, p) {
        const f: Fatores = { vento: 0, onda: 0, mare: 0 };
        if (noiteH(h)) return { n: null, f };
        const vr = ventoRel(sp, h.wd);
        const s = Math.min(curva(p.vento, h.w), 10);
        const dirF = p.dir[vr.k];
        const raj = h.g - h.w;
        const forte = p.forte && h.w >= p.forte.desde && p.forte.dir.includes(vr.k) ? p.forte : null;
        const pr = degrau(p.rajada, raj);
        const pt = forte ? 0 : p.tectoDegraus ? degrau(p.tectoDegraus, h.g) : h.g > p.tecto[0] ? p.tecto[1] : 0;
        const po = h.hs > p.onda.acima ? p.onda.pen : 0;
        const pm = h.tide > p.mare.acima ? p.mare.pen : 0;
        const n0 = s * dirF - pr - pt - degrau(p.chuva, h.rain) - solBaixo(h) - po - pm;
        const n = forte ? Math.max(n0, forte.piso) : n0;
        f.vento = s * dirF >= p.favor && !pr && !pt ? 1 : -1;
        f.onda = po ? -1 : h.hs < p.onda.calma ? 1 : 0;
        f.mare = pm ? -1 : 0;
        if (forte)
          return {
            n: clamp(Math.round(n), 0, 10),
            f,
            motivo: 'pro',
            soProfissionais: true,
            forte: faixaForte(forte.faixas, h.w),
          };
        const motivo: Motivo =
          s < DA
            ? h.w < pico(p.vento)
              ? 'pouco'
              : 'muito'
            : vr.k === 'terra' || vr.k === 'lat-terra'
              ? 'terra'
              : pr || pt
                ? 'rajado'
                : 'banda';
        return { n: clamp(Math.round(n), 0, 10), f, motivo };
      },
      onda(h, p) {
        const f: Fatores = { vento: 0, onda: 0, mare: 0 };
        if (noiteH(h)) return { n: null, f };
        const t = curva(p.tamanho, h.hs);
        let s = t;
        if (h.tp >= p.periodo.bom) s += p.periodo.bonus;
        else if (h.tp < p.periodo.curto) s -= p.periodo.pen;
        if (Math.abs(dif(h.sd, JAN.centro)) > JAN.tol) s -= p.foraJanela;
        f.onda = s >= p.favorOnda[0] ? 1 : s < p.favorOnda[1] ? -1 : 0;
        const vr = ventoRel(sp, h.wd);
        const pvv = p.vento;
        let pv = 0;
        if (h.w >= pvv.desde) {
          pv = Math.min(pvv.max, (h.w - pvv.desde) * pvv.k);
          if (vr.k === 'terra') pv = h.w > pvv.terra[0] ? pvv.terra[1] : 0;
          else if (vr.k === 'lat-terra') pv *= pvv.latTerra;
        }
        f.vento = pv === 0 ? 1 : pv > pvv.contra ? -1 : 0;
        const pm = h.tide > p.mare.alta[0] ? p.mare.alta[1] : 0;
        f.mare = pm ? -1 : h.tide < p.mare.baixa ? 1 : 0;
        const n = s - pv - pm - degrau(p.chuva, h.rain) - solBaixo(h);
        const motivo: Motivo =
          t < DA - 2
            ? 'pouca'
            : pv > pvv.contra
              ? 'vento'
              : t < DA
                ? h.hs < pico(p.tamanho)
                  ? 'pouca'
                  : 'grande'
                : 'banda';
        return { n: clamp(Math.round(n), 0, 10), f, motivo };
      },
      plana(h, p) {
        if (!sp.aguaPlana)
          return { n: null, fora: true, f: { vento: 0, onda: -2, mare: 0 }, motivo: 'fora' };
        const f: Fatores = { vento: 0, onda: 0, mare: 0 };
        if (noiteH(h)) return { n: null, f };
        const s = curva(p.vento, h.w);
        f.vento = s >= DA ? 1 : -1;
        return {
          n: clamp(Math.round(s - degrau(p.chuva, h.rain) - solBaixo(h)), 0, 10),
          f,
          motivo: s < DA ? 'picada' : 'banda',
        };
      },
      avalia(k, h) {
        const d = MD[k] as DefModalidade;
        if (d.logica === 'vento') return L.vento(h, d);
        if (d.logica === 'onda') return L.onda(h, d);
        return L.plana(h, d);
      },
    };
    return L;
  }
  return { MD, CM, DA, curva, degrau, pico, faixaForte, intervaloDa, ventoRel, dif, para, janelaDe };
}
