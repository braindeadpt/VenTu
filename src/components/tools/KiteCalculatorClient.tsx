'use client';

import { useMemo, useState } from 'react';
import { Wind } from 'lucide-react';
import {
  recommendKite,
  KITE_WEIGHT_KG_MIN,
  KITE_WEIGHT_KG_MAX,
  KITE_WIND_KT_MIN,
  KITE_WIND_KT_MAX,
  type KiteDiscipline,
} from '@/lib/gearCalc';
import { TOOL_SPOT_OPTIONS, useSpotConditions } from './useSpotConditions';

const DISCIPLINES: { id: KiteDiscipline; pt: string; en: string }[] = [
  { id: 'twintip', pt: 'Twintip', en: 'Twintip' },
  { id: 'strapless', pt: 'Strapless / onda', en: 'Strapless / surf' },
  { id: 'foil', pt: 'Foil', en: 'Foil' },
];

export default function KiteCalculatorClient({ locale }: { locale: string }) {
  const isPt = locale === 'pt';
  const [weightKg, setWeightKg] = useState(75);
  const [windKt, setWindKt] = useState(18);
  const [discipline, setDiscipline] = useState<KiteDiscipline>('twintip');
  const [spotId, setSpotId] = useState<string | null>(null);

  const { pick, loading } = useSpotConditions(spotId);
  const effectiveWindKt = pick?.windKt ?? windKt;

  const rec = useMemo(
    () => recommendKite(weightKg, effectiveWindKt, discipline),
    [weightKg, effectiveWindKt, discipline],
  );

  return (
    <div className="card-1 p-4 md:p-6 space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="kite-weight" className="text-meta-sm font-semibold text-fg-muted">
          {isPt ? 'O teu peso' : 'Your weight'}
        </label>
        <div className="flex items-center gap-3">
          <input
            id="kite-weight"
            type="range"
            min={KITE_WEIGHT_KG_MIN}
            max={KITE_WEIGHT_KG_MAX}
            step={1}
            value={weightKg}
            onChange={(e) => setWeightKg(Number(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="font-mono tabular-nums text-num text-fg w-20 text-right">
            {weightKg} kg
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="kite-wind" className="text-meta-sm font-semibold text-fg-muted">
          {isPt ? 'Vento' : 'Wind'}
        </label>
        <div className="flex items-center gap-3">
          <input
            id="kite-wind"
            type="range"
            min={KITE_WIND_KT_MIN}
            max={KITE_WIND_KT_MAX}
            step={1}
            value={effectiveWindKt}
            onChange={(e) => {
              setSpotId(null);
              setWindKt(Number(e.target.value));
            }}
            className="flex-1 accent-accent"
          />
          <span className="font-mono tabular-nums text-num text-fg w-20 text-right">
            {effectiveWindKt} kt
          </span>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Wind className="w-3.5 h-3.5 text-data-wind shrink-0" aria-hidden />
          <select
            value={spotId ?? ''}
            onChange={(e) => setSpotId(e.target.value || null)}
            className="flex-1 min-w-0 rounded-input border border-divider bg-bg-elevated text-fg text-body-sm px-2 py-1.5"
            aria-label={isPt ? 'Usar vento atual de um spot' : 'Use current wind at a spot'}
          >
            <option value="">
              {isPt ? 'Usar vento de um spot (agora)…' : 'Use live wind at a spot…'}
            </option>
            {TOOL_SPOT_OPTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {isPt ? s.name : s.nameEn}
              </option>
            ))}
          </select>
        </div>
        {spotId && loading && (
          <p className="text-meta-sm text-fg-subtle">{isPt ? 'A carregar…' : 'Loading…'}</p>
        )}
        {spotId && !loading && pick?.windKt == null && (
          <p className="text-meta-sm text-score-fair">
            {isPt ? 'Sem dados de vento para este spot.' : 'No wind data for this spot.'}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="text-meta-sm font-semibold text-fg-muted">
          {isPt ? 'Disciplina' : 'Discipline'}
        </span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup">
          {DISCIPLINES.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={discipline === d.id}
              onClick={() => setDiscipline(d.id)}
              className={`px-3 py-1.5 rounded-pill text-meta-sm font-medium border transition-colors duration-150 ${
                discipline === d.id
                  ? 'bg-accent/15 text-accent border-accent/40'
                  : 'bg-surface-1/[0.04] text-fg-muted border-divider hover:text-fg'
              }`}
            >
              {isPt ? d.pt : d.en}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-divider" aria-live="polite">
        {rec ? (
          <div className="space-y-3">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-mono tabular-nums text-num-xl text-accent font-semibold">
                {rec.primaryM2} m²
              </span>
              <span className="text-body-sm text-fg-muted">
                {isPt
                  ? `janela confortável ${rec.primaryWindow.fromKt}–${rec.primaryWindow.toKt} kt`
                  : `comfortable window ${rec.primaryWindow.fromKt}–${rec.primaryWindow.toKt} kt`}
              </span>
            </div>
            {rec.secondaryM2 != null && rec.secondaryWindow != null && (
              <p className="text-body-sm text-fg-muted">
                {isPt ? 'Alternativa: ' : 'Alternative: '}
                <span className="font-mono tabular-nums text-fg font-medium">
                  {rec.secondaryM2} m²
                </span>{' '}
                ({rec.secondaryWindow.fromKt}–{rec.secondaryWindow.toKt} kt
                {isPt
                  ? rec.secondaryM2 > rec.primaryM2
                    ? ' — se o vento cair'
                    : ' — se o vento subir'
                  : rec.secondaryM2 > rec.primaryM2
                    ? ' — if the wind drops'
                    : ' — if the wind picks up'}
                )
              </p>
            )}
          </div>
        ) : (
          <p className="text-body-sm text-fg-muted">
            {isPt
              ? `Com menos de ${KITE_WIND_KT_MIN} kt não há kite que te salve — dia de SUP.`
              : `Below ${KITE_WIND_KT_MIN} kt no kite will save you — SUP day.`}
          </p>
        )}
        <p className="text-meta-sm text-fg-subtle mt-3">
          {isPt
            ? 'Estimativa pela regra peso × fator ÷ vento. Ajusta ao teu nível, à marca do kite e ao estado do mar.'
            : 'Estimate from the weight × factor ÷ wind rule. Adjust for skill, kite brand and sea state.'}
        </p>
      </div>
    </div>
  );
}
