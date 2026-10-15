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
