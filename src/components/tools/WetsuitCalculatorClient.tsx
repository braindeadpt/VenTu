'use client';

import { useMemo, useState } from 'react';
import { Droplets, Check, Minus } from 'lucide-react';
import {
  recommendWetsuit,
  WETSUIT_TEMP_C_MIN,
  WETSUIT_TEMP_C_MAX,
} from '@/lib/gearCalc';
import { getTranslation } from '@/lib/i18n';
import { TOOL_SPOT_OPTIONS, useSpotConditions } from './useSpotConditions';

export default function WetsuitCalculatorClient({ locale }: { locale: string }) {
  const isPt = locale === 'pt';
  const t = getTranslation(locale);
  const [tempC, setTempC] = useState(17);
  const [windy, setWindy] = useState(false);
  const [spotId, setSpotId] = useState<string | null>(null);

  const { pick, loading } = useSpotConditions(spotId);
  const effectiveTempC = pick?.waterTempC ?? tempC;

  const rec = useMemo(
    () => recommendWetsuit(effectiveTempC, windy),
    [effectiveTempC, windy],
  );

  const extras = rec
    ? [
        { on: rec.boots, pt: 'Botas', en: 'Boots' },
        { on: rec.gloves, pt: 'Luvas', en: 'Gloves' },
        { on: rec.hood, pt: 'Capuz', en: 'Hood' },
      ]
    : [];

  return (
    <div className="card-1 p-4 md:p-6 space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="wetsuit-temp" className="text-meta-sm font-semibold text-fg-muted">
          {t.tools.waterTempLabel}
        </label>
        <div className="flex items-center gap-3">
          <input
            id="wetsuit-temp"
            type="range"
            min={WETSUIT_TEMP_C_MIN}
            max={WETSUIT_TEMP_C_MAX}
            step={0.5}
            value={effectiveTempC}
            onChange={(e) => {
              setSpotId(null);
              setTempC(Number(e.target.value));
            }}
            className="flex-1 accent-accent"
          />
          <span className="font-mono tabular-nums text-num text-fg w-20 text-right">
            {effectiveTempC.toFixed(1)}°C
          </span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Droplets className="w-3.5 h-3.5 text-data-water shrink-0" aria-hidden />
          <select
            value={spotId ?? ''}
            onChange={(e) => setSpotId(e.target.value || null)}
            className="flex-1 min-w-0 rounded-input border border-divider bg-bg-elevated text-fg text-body-sm px-2 py-1.5"
            aria-label={t.tools.liveWaterAria}
          >
            <option value="">{t.tools.liveWaterLabel}</option>
            {TOOL_SPOT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {isPt ? s.name : s.nameEn}
              </option>
            ))}
          </select>
        </div>
        {spotId && loading && (
          <p className="text-meta-sm text-fg-subtle">{t.common.loading}</p>
        )}
        {spotId && !loading && pick?.waterTempC == null && (
          <p className="text-meta-sm text-score-fair">{t.tools.noWaterData}</p>
        )}
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={windy}
          onChange={(e) => setWindy(e.target.checked)}
          className="accent-accent w-4 h-4"
        />
        <span className="text-body-sm text-fg">{t.tools.windyDay}</span>
      </label>

      <div className="pt-4 border-t border-divider" aria-live="polite">
        {rec ? (
          <div className="space-y-3">
            <p className="font-mono tabular-nums text-num-lg text-accent font-semibold">
              {isPt ? rec.suit.pt : rec.suit.en}
            </p>
            <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
              {extras.map((x) => (
                <li
                  key={x.en}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill border text-meta-sm font-medium ${
                    x.on
                      ? 'bg-accent/10 text-fg border-accent/30'
                      : 'bg-surface-1/[0.03] text-fg-subtle border-divider line-through'
                  }`}
                >
                  {x.on ? (
                    <Check className="w-3 h-3 text-accent" aria-hidden />
                  ) : (
                    <Minus className="w-3 h-3" aria-hidden />
                  )}
                  {isPt ? x.pt : x.en}
                </li>
              ))}
            </ul>
            <p className="text-body-sm text-fg-muted">{isPt ? rec.note.pt : rec.note.en}</p>
          </div>
        ) : (
          <p className="text-body-sm text-fg-muted">{t.tools.outOfRange}</p>
        )}
        <p className="text-meta-sm text-fg-subtle mt-3">{t.tools.disclaimer}</p>
      </div>
    </div>
  );
}
