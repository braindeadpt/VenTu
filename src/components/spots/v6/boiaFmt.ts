/**
 * Formatação da leitura da boia na página de spot v6 (#184): idade e
 * distância compactas do chip IH vs WMO, a razão da escolha da fonte e o
 * separador decimal da v6 (vírgula em PT, como o Porquê e a tabela).
 */
import type { ObservedWaveMeta } from '@/lib/observedWave';
import type { getTranslation } from '@/lib/i18n';

/** Idade em horas, compacta: 1 → "1h", 0.3 → "0.3h", 5.2 → "5.2h". */
export function fmtAgeHours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h) || h < 0) return 'n/d';
  const v = Math.round(h * 10) / 10;
  return `${String(v).replace(/\.0$/, '')}h`;
}

/** Distância, compacta: 56.4 → "56 km". */
export function fmtDistanceKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  return `${Math.round(km)} km`;
}

/**
 * Separador decimal da v6: em PT os números de texto saem com vírgula
 * («medido 2,3 m»), como o resto da página. Só troca o ponto ENTRE dígitos
 * (nunca «E.U.» nem «CSA92/D»).
 */
export function decimalV6(s: string, locale: string): string {
  return locale === 'pt' ? s.replace(/(\d)\.(\d)/g, '$1,$2') : s;
}

type Tv = ReturnType<typeof getTranslation>['spotVerify'];

/** Porque é que a fonte vencedora ganhou (frescura e distância), em linguagem simples. */
export function razaoDaFonte(meta: ObservedWaveMeta | null | undefined, tv: Tv): string {
  if (!meta) return tv.reasonNoMeta;
  const wmoFresher =
    meta.wmoAgeHours != null && meta.ihAgeHours != null && meta.wmoAgeHours < meta.ihAgeHours;
  const wmoCloser =
    meta.wmoDistanceKm != null && meta.ihDistanceKm != null && meta.wmoDistanceKm < meta.ihDistanceKm;
  if (meta.reason === 'wmo-only') return tv.reasonWmoOnly;
  if (meta.reason === 'ih-only') return tv.reasonIhOnly;
  if (wmoFresher && wmoCloser) return tv.reasonFresherCloser;
  if (wmoFresher) return tv.reasonFresher;
  if (wmoCloser) return tv.reasonCloser;
  return tv.reasonIhFresh;
}

/** A WMO está mais fresca que o IH, mas o IH ainda ganha por ser a fonte primária. */
export function ihAEnvelhecer(meta: ObservedWaveMeta | null | undefined): boolean {
  if (!meta || meta.reason !== 'ih-fresh') return false;
  if (meta.wmoAgeHours == null || meta.ihAgeHours == null) return false;
  return meta.wmoAgeHours < meta.ihAgeHours;
}

type Ms = ReturnType<typeof getTranslation>['spotMedeSabe'];

const TZ = 'Europe/Lisbon';
const LANG: Record<string, string> = { pt: 'pt-PT', en: 'en-GB', es: 'es-ES', de: 'de-DE', fr: 'fr-FR' };

/** Dia civil em Lisboa (YYYY-MM-DD) de um instante. */
function diaLisboa(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** Hora curta de Lisboa: PT «18h» / «18h05», as outras línguas «18:05». */
export function horaCurta(ms: number, locale: string): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms))
    .reduce<Record<string, string>>((a, x) => ({ ...a, [x.type]: x.value }), {});
  const h = p.hour ?? '00';
  const m = p.minute ?? '00';
  if (locale === 'pt') return `${Number(h)}h${m === '00' ? '' : m}`;
  return `${h}:${m}`;
}

export interface IdadeLeitura {
  /** O texto do selo («agora», «há 9 h», «leitura de ontem 18h»…). */
  txt: string;
  /** `true` só quando a leitura passa o gate de frescura da fonte (selo activo). */
  fresca: boolean;
}

/**
 * Selo de frescura honesto da leitura da boia (v6): «agora» SÓ quando a leitura
 * é fresca (gate por fonte: IH 3 h, WMO 6 h); antiga, a idade verdadeira —
 * «há 40 min», «há 9 h» (até 12 h), «leitura de ontem 18h», «leitura de seg
 * 18h» (até 6 dias) ou «leitura de 12 out». Hora e dia civis de Lisboa.
 * `null` sem hora válida ou com hora no futuro (não se inventa idade).
 */
export function idadeLeitura(
  observedAt: string | null | undefined,
  nowMs: number,
  fresca: boolean,
  locale: string,
  ms: Ms,
): IdadeLeitura | null {
  const t = observedAt ? new Date(observedAt).getTime() : Number.NaN;
  if (!Number.isFinite(t) || !Number.isFinite(nowMs)) return null;
  const idadeMin = (nowMs - t) / 60_000;
  if (idadeMin < -5) return null;
  if (fresca) return { txt: ms.agora, fresca: true };
  if (idadeMin < 60) return { txt: ms.haMin.replace('{m}', String(Math.max(1, Math.round(idadeMin)))), fresca: false };
  if (idadeMin < 12 * 60) return { txt: ms.haH.replace('{h}', String(Math.round(idadeMin / 60))), fresca: false };
  const hora = horaCurta(t, locale);
  const ontem = diaLisboa(nowMs - 86_400_000);
  if (diaLisboa(t) === diaLisboa(nowMs)) return { txt: ms.haH.replace('{h}', String(Math.round(idadeMin / 60))), fresca: false };
  if (diaLisboa(t) === ontem) return { txt: ms.ontem.replace('{hora}', hora), fresca: false };
  const lang = LANG[locale] ?? 'en-GB';
  if (idadeMin < 6 * 24 * 60) {
    const dia = new Intl.DateTimeFormat(lang, { timeZone: TZ, weekday: 'short' }).format(new Date(t)).replace('.', '');
    return { txt: ms.diaHora.replace('{dia}', dia).replace('{hora}', hora), fresca: false };
  }
  const data = new Intl.DateTimeFormat(lang, { timeZone: TZ, day: 'numeric', month: 'short' }).format(new Date(t)).replace('.', '');
  return { txt: ms.data.replace('{data}', data), fresca: false };
}

/** Centímetros arredondados aos 5 (0,12 m → 10; 0,13 m → 15). */
export function cm5(m: number): number {
  return Math.round(Math.abs(m) * 20) * 5;
}

export interface SkillSimples {
  /** A frase para quem surfa: quão bem a previsão bate nesta boia e para que lado tende. */
  frase: string;
  /** O viés (ME) é sempre dito na frase (em cm, ou «sem tendência»): nunca se repete nos detalhes. */
  disseVies: true;
  /** O erro (MAE) já foi dito na frase? Idem. */
  disseErro: boolean;
}

/**
 * O skill da previsão nesta boia numa frase simples. ME = média(observado −
 * previsto): positivo = o mar vem ACIMA da previsão. `dentro05` = fracção de
 * pares com |erro| ≤ 0,5 m (forecast-skill.json withinHalfM); sem ela, o erro
 * médio (MAE) em cm. Sem nenhum dos dois: só a tendência.
 */
export function skillSimples(
  s: { me: number; mae?: number | null; dentro05?: number | null },
  ms: Ms,
): SkillSimples | null {
  if (!Number.isFinite(s.me)) return null;
  const partes: string[] = [];
  let disseErro = false;
  const pct = typeof s.dentro05 === 'number' && Number.isFinite(s.dentro05) ? Math.round(s.dentro05 * 100) : null;
  if (pct != null) {
    const base = pct >= 80 ? ms.skillBate : pct >= 60 ? ms.skillMeio : ms.skillFalha;
    partes.push(base.replace('{pct}', String(pct)));
  } else if (typeof s.mae === 'number' && Number.isFinite(s.mae) && cm5(s.mae) > 0) {
    partes.push(ms.skillErro.replace('{cm}', String(cm5(s.mae))));
    disseErro = true;
  }
  const cm = cm5(s.me);
  partes.push(cm === 0 ? ms.skillCerto : (s.me > 0 ? ms.skillAcima : ms.skillAbaixo).replace('{cm}', String(cm)));
  return { frase: partes.join(' '), disseVies: true, disseErro };
}
