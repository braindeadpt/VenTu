'use client';

import { DATE_LOCALE } from '@/lib/dataFreshness';
import { getTranslation } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { Waves } from 'lucide-react';
import { getAssetPath } from '@/lib/paths';
import {
  parseCoherenceTrend,
  type CoherencePairTrend,
  type CoherenceTrendData,
} from '@/lib/coherenceTrend';

/** Cor/tooltip por veredicto (nice-coloured mini segments numa barra empilhada). */
const VERDICT_STYLE: Record<
  string,
  { bar: string; label: string; key: string }
> = {
  coherent: { bar: 'bg-data-waves', label: 'Coherent', key: 'coherent' },
  review: { bar: 'bg-data-period', label: 'Review', key: 'review' },
  incoherent: { bar: 'bg-danger', label: 'Incoherent', key: 'incoherent' },
  insufficient: { bar: 'bg-divider/70', label: 'Insufficient', key: 'insufficient' },
};

const VERDICT_KEYS = ['coherent', 'review', 'incoherent', 'insufficient'] as const;

function dayLabel(day: string, locale: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
  });
}

/** Barra empilhada por par: cada segmento = um dia, largura ∝ horas desse dia. */
function PairTrendBars({ pair, locale }: { pair: CoherencePairTrend; locale: string }) {
  const totalHours = pair.days.reduce((s, d) => s + d.n, 0) || 1;
  const isPt = locale === 'pt';
  const t = getTranslation(locale).coherence;
  const firstDay = pair.days[0]?.day;
  const lastDay = pair.days[pair.days.length - 1]?.day;

  return (
    <div className="space-y-1.5" data-coherence-pair={pair.key}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-fg">
          {pair.pair}
          {pair.incoherent > 0 && (
            <span
              className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-danger/15 text-danger"
              title={isPt
                ? `${pair.incoherent} dias incoherent na janela`
                : `${pair.incoherent} incoherent days in the window`}
            >
              {pair.incoherent}
            </span>
          )}
        </p>
        <p className="text-meta-sm text-fg-subtle tabular-nums">
          {firstDay && lastDay
            ? `${dayLabel(firstDay, locale)}→${dayLabel(lastDay, locale)} · ${t.daysCount.replace('{n}', String(pair.days.length))}`
            : t.daysCount.replace('{n}', String(pair.days.length))}
        </p>
      </div>

      <div
        className="flex h-5 w-full max-w-[320px] overflow-hidden rounded-md border border-divider/60 bg-bg-base/60"
        role="img"
        aria-label={isPt
          ? `Tendência de coerência por dia para ${pair.pair}`
          : `Daily coherence trend for ${pair.pair}`}
        data-coherence-bar="true"
      >
        {pair.days.map((d) => (
          <div
            key={d.day}
            className={`${VERDICT_STYLE[d.verdict].bar} h-full transition-colors`}
            style={{ width: `${(d.n / totalHours) * 100}%`, minWidth: 1 }}
            title={isPt
              ? `${dayLabel(d.day, locale)} · n=${d.n} · mean|Δ| ${d.meanAbsDeltaM} m · ${d.verdict}`
              : `${dayLabel(d.day, locale)} · n=${d.n} · mean|Δ| ${d.meanAbsDeltaM} m · ${d.verdict}`}
          />
        ))}
      </div>

      {/* Legenda de veredictos presentes no par. */}
      <div className="flex flex-wrap items-center gap-3 text-meta-xs text-fg-muted">
        {VERDICT_KEYS.filter((k) => pair[k] > 0).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-sm ${VERDICT_STYLE[k].bar}`} aria-hidden />
            {VERDICT_STYLE[k].key} {pair[k]}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Secção «Tendência de coerência ES×PT» — gráfico de barras empilhadas por par
 * ao longo da janela, lido do buoy-coherence-archive.json (o arquivo horário
 * publicado pelo pipleine). Cliente de propósito (mesmo padrão da
 * WaveBiasSection): o About é estático, logo buscar em runtime permite testar
 * de forma determinística «archive com dados» vs «ficheiro em falta».
 *
 * Cada barra = um par; cada segmento = um dia, cor = veredicto derivado das
 * horas sobrepostas (coherent/review/incoherent/insufficient), largura ∝ nº de
 * horas — mostra SE e QUANDO cada par ES×PT divergiu na janela.
 */
export default function CoherenceTrendSection({ locale }: { locale: string }) {
  const t = getTranslation(locale).coherence;
  const [data, setData] = useState<CoherenceTrendData | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(getAssetPath('/data/buoy-coherence-archive.json'));
        const raw = res.ok ? ((await res.json()) as unknown) : null;
        if (active) setData(parseCoherenceTrend(raw));
      } catch {
        if (active) setData(parseCoherenceTrend(null));
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!data || !data.hasData) return null;

  return (
    <div className="card-1 p-8 space-y-4" data-coherence-trend-section="true">
      <div className="flex items-center gap-2">
        <Waves className="w-5 h-5 text-data-waves" aria-hidden />
        <h2 className="text-2xl font-bold text-fg">
          {t.trendTitle}
        </h2>
      </div>
      <p className="text-sm text-fg-muted leading-relaxed">
        <>
          {t.bodyA}
          <strong className="text-fg">
            {t.daysCount.replace('{n}', String(data.windowDays || 30))}
          </strong>
          {t.bodyB}
        </>
      </p>
      <div className="space-y-4">
        {data.pairs.map((pair) => (
          <PairTrendBars key={pair.key} pair={pair} locale={locale} />
        ))}
      </div>
      {/* Legenda global + braquete de dias. */}
      <div className="flex flex-wrap items-center gap-3 text-meta-xs text-fg-muted">
        {VERDICT_KEYS.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-sm ${VERDICT_STYLE[k].bar}`} aria-hidden />
            {k === 'coherent'
              ? t.verdictCoherent
              : k === 'review'
                ? t.verdictReview
                : k === 'incoherent'
                  ? t.verdictIncoherent
                  : t.verdictInsufficient}
          </span>
        ))}
      </div>
      <p className="text-xs text-fg-subtle">
        {t.updatedArchive.replace(
          '{date}',
          new Date(data.fetchedAt ?? '').toLocaleDateString(DATE_LOCALE[locale] ?? 'en-GB'),
        )}
      </p>
    </div>
  );
}