'use client';

import { DATE_LOCALE } from '@/lib/dataFreshness';
import { getTranslation } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { AlertTriangle, CloudRain, ExternalLink } from 'lucide-react';
import { getAssetPath } from '@/lib/paths';
import {
  relevantWarningsForSpot,
  ipmaRadarUrl,
  warningLevelLabel,
  warningTypeLabel,
  warningsSourceLabel,
  WARNING_LEVEL_META,
  type IpmaWarningsData,
} from '@/lib/ipmaWarnings';
import CoastalNavWarnings from '@/components/spots/CoastalNavWarnings';

function formatEndDate(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(DATE_LOCALE[locale] ?? 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SpotWarningsSection({
  spotId,
  locale,
  embedded,
  excludeSafetyNavWarnings = false,
}: {
  spotId: string;
  locale: string;
  /** Sem card nem título próprios — o hospedeiro (rail/accordion) fornece-os. */
  embedded?: boolean;
  /** «No local»: os perigos à navegação já aparecem na faixa §0 — exclui-os
   *  do bloco costeiro para não duplicar (passa a CoastalNavWarnings). */
  excludeSafetyNavWarnings?: boolean;
}) {
  const [data, setData] = useState<IpmaWarningsData | null>(null);
  const isPt = locale === 'pt';
  const t = getTranslation(locale).spotsUi;

  useEffect(() => {
    // Optional layer — never break the spot page on failure.
    fetch(getAssetPath('/data/warnings.json'))
      .then((r) => {
        if (!r.ok) throw new Error('warnings fetch failed');
        return r.json();
      })
      .then((d) => setData(d as IpmaWarningsData))
      .catch(() => {});
  }, []);

  const warnings = relevantWarningsForSpot(data, spotId);

  const body = (
    <>
      <div className={`flex flex-wrap items-center gap-2 mb-2.5 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {!embedded && (
          <h2 className="text-h3 text-fg flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-score-poor shrink-0" aria-hidden />
            {t.warningsRadar}
          </h2>
        )}
        <a
          href={ipmaRadarUrl(locale)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 min-h-[44px] -my-2 text-meta-sm font-medium text-data-waves hover:text-data-waves/80 transition-colors"
        >
          <CloudRain className="w-4 h-4 shrink-0" aria-hidden />
          {t.rainRadarIpma}
          <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </a>
      </div>

      {data === null ? (
        <p className="text-meta-sm text-fg-muted">
          {t.warningsUnavailable}
        </p>
      ) : warnings.length === 0 ? (
        <p className="text-meta-sm text-fg-muted">
          {t.noActiveWarnings}
        </p>
      ) : (
        <ul className="space-y-2 list-none p-0 m-0" data-visual-dynamic>
          {warnings.map((w) => (
            <li
              key={`${w.areaCode}-${w.type}-${w.level}`}
              className={`rounded-card border px-3 py-2 ${WARNING_LEVEL_META[w.level]?.chipClass ?? 'bg-surface-2/[0.06] border-divider'}`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold text-fg">
                  {warningTypeLabel(w.type, locale)}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide">
                  {warningLevelLabel(w.level, locale)}
                </span>
                <span className="text-meta-sm text-fg-muted">
                  {w.endTime ? t.untilWord.replace('{date}', formatEndDate(w.endTime, locale)) : ''}
                </span>
              </div>
              {w.text ? (
                <p className="text-meta-sm text-fg-muted mt-1 leading-snug">{w.text}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="text-meta-sm text-fg-subtle mt-2.5">
        {(data?.source === 'meteoalarm'
          ? getTranslation(locale).ipmaWarnings.sourceByAreaEumetnet
          : getTranslation(locale).ipmaWarnings.sourceByAreaDistrict
        ).replace('{source}', warningsSourceLabel(data, locale))}
      </p>

      {/* Avisos à Navegação Costeiros (IH) — camada de segurança marítima
          complementar ao IPMA/MeteoAlarm. Renderiza só quando o spot está
          coberto por um aviso em vigor (nunca a secção vazia). */}
      <CoastalNavWarnings
        spotId={spotId}
        locale={locale}
        excludeSafety={excludeSafetyNavWarnings}
      />
    </>
  );

  if (embedded) return body;

  return (
    <section className="card-1 rounded-card border border-divider p-3 md:p-4">
      {body}
    </section>
  );
}
