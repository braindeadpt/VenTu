/**
 * Mini-gráfico «avisos em vigor por dia» — barras CSS puras (sem lib), altura
 * ∝ contagem diária. Componente partilhado entre o About e a página /fontes
 * para a apresentação do histórico costeiro nunca divergir.
 *
 * Server-safe (sem hooks): recebe a série `dailyActive` já normalizada pelo
 * parser (coastalWarningsArchive) e o locale.
 */
export default function CoastalDailyActiveChart({
  dailyActive,
  locale,
}: {
  dailyActive: { date: string; count: number }[];
  locale: string;
}) {
  if (dailyActive.length === 0) return null;

  const maxCount = Math.max(1, ...dailyActive.map((d) => d.count));
  const t = getTranslation(locale).spotsUi;

  return (
    <div className="space-y-1.5" data-daily-active-chart>
      <p className="text-xs uppercase tracking-wide text-fg-subtle">
        {dailyActive.length === 1
          ? t.warningsPerDayOne
          : t.warningsPerDayMany.replace('{count}', String(dailyActive.length))}
      </p>
      <div
        className="flex h-24 items-end gap-[3px] overflow-x-auto pb-0.5"
        role="img"
        aria-label={t.dailyChartAria}
      >
        {dailyActive.map((d) => {
          const dt = new Date(`${d.date}T12:00:00`);
          const hpx = d.count > 0 ? Math.max(8, Math.round((d.count / maxCount) * 72)) : 3;
          const full = dt.toLocaleDateString(DATE_LOCALE[locale] ?? 'en-GB');
          const short = dt.toLocaleDateString(DATE_LOCALE[locale] ?? 'en-GB', {
            day: '2-digit',
            month: '2-digit',
          });
          return (
            <div
              key={d.date}
              data-day={d.date}
              className="group flex h-full flex-col items-center justify-end gap-1"
              title={`${full} · ${(d.count === 1 ? t.warningsOne : t.warningsMany).replace('{count}', String(d.count))}`}
            >
              <div
                className={`w-2.5 rounded-t transition-colors ${
                  d.count > 0
                    ? 'bg-warning group-hover:bg-warning/80'
                    : 'bg-divider/40 group-hover:bg-divider/70'
                }`}
                style={{ height: `${hpx}px` }}
              />
              <span className="text-[8px] leading-none tabular-nums text-fg-subtle">{short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}import { getTranslation } from '@/lib/i18n';
import { DATE_LOCALE } from '@/lib/dataFreshness';

