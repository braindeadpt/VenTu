'use client';

import { useEffect, useState } from 'react';
import { getLegendLabels } from '@/lib/map-constants';
import { ChevronDown } from 'lucide-react';
import IsobathLegend from './IsobathLegend';

interface MapLegendProps {
  locale: string;
  /** Extra bottom offset when fullscreen filter bar is visible. */
  reserveHudSpace?: boolean;
  /** Measured HUD height (px). Legend sits just above it in fullscreen. */
  hudLift?: number;
  /**
   * `hero` = under the homepage isobaths chip (top-right), clear of the
   * heading and ticker. `map` = bottom-right (fullscreen / embed).
   */
  placement?: 'map' | 'hero';
  /** Legenda de profundidade das isóbatas quando a camada está activa. */
  isobathsTitle?: string;
  isobathsVisible?: boolean;
  hsTitle?: string;
  hsVisible?: boolean;
  sstTitle?: string;
  sstVisible?: boolean;
  currentsTitle?: string;
  currentsVisible?: boolean;
  windTitle?: string;
  windVisible?: boolean;
  bathymetryTitle?: string;
  bathymetryVisible?: boolean;
  seamarksTitle?: string;
  seamarksVisible?: boolean;
  seamarksMarksLabel?: string;
  warningsTitle?: string;
  warningsVisible?: boolean;
  warningsZoneLabel?: string;
  warningsOrcaLabel?: string;
}

export default function MapLegend({
  locale,
  reserveHudSpace = false,
  hudLift = 0,
  placement = 'map',
  isobathsTitle,
  isobathsVisible = false,
  hsTitle,
  hsVisible = false,
  sstTitle,
  sstVisible = false,
  currentsTitle,
  currentsVisible = false,
  windTitle,
  windVisible = false,
  bathymetryTitle,
  bathymetryVisible = false,
  seamarksTitle,
  seamarksVisible = false,
  seamarksMarksLabel,
  warningsTitle,
  warningsVisible = false,
  warningsZoneLabel,
  warningsOrcaLabel,
}: MapLegendProps) {
  const isPt = locale === 'pt';
  const labels = getLegendLabels(locale);
  const [collapsed, setCollapsed] = useState(true);

  // Auto-expand when a data layer activates — except the homepage hero:
  // there the expanded box (≈156px tall) lands on the sport filter chips and
  // CTA on mobile. Desktop (lg+) is unaffected either way (`lg:block` keeps
  // the content visible regardless of `collapsed`); below lg the user taps
  // the header to expand it.
  useEffect(() => {
    if (placement !== 'hero' && (isobathsVisible || hsVisible || sstVisible || currentsVisible || windVisible || bathymetryVisible || seamarksVisible || warningsVisible)) {
      setCollapsed(false);
    }
  }, [placement, isobathsVisible, hsVisible, sstVisible, currentsVisible, windVisible, bathymetryVisible, seamarksVisible, warningsVisible]);

  const isHero = placement === 'hero';
  const bottomPx = !isHero && reserveHudSpace
    ? (hudLift > 0 ? hudLift + 12 : 220)
    : undefined;

  return (
    <div
      className={
        // Hero mobile: o canto sup. direito já leva radar+isóbatas e a fila de
        // pills de desporto passa por baixo — a legenda (mesmo colapsada)
        // sobrepunha-se-lhes. Em <md fica escondida; o /mapa/ mostra-a sempre.
        isHero
          ? 'absolute top-[7.5rem] right-3 z-[1000] max-md:hidden'
          : `absolute z-[1000] right-0 mr-3 ${bottomPx == null ? 'bottom-0 mb-3' : ''}`
      }
      style={bottomPx != null ? { bottom: bottomPx } : undefined}
      role="region"
      aria-label={isPt ? 'Legenda do mapa' : 'Map legend'}
    >
      <div className="bg-bg-elevated border border-divider rounded-lg px-3 py-2 shadow-lg min-w-[130px] sm:min-w-[140px]">
        {/* Alvo de toque ≥44px abaixo de `lg` (WCAG 2.5.8) — em mobile/tablet
            touch é o único controlo para abrir a legenda. Desktop (≥lg, rato)
            mantém o cabeçalho compacto, onde o conteúdo está sempre visível. */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-between w-full min-h-[44px] mb-1 lg:min-h-0 lg:mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted lg:cursor-default lg:hover:opacity-100"
          aria-expanded={!collapsed}
        >
          <span>{isPt ? 'Score Náutico' : 'Nautical Score'}</span>
          <ChevronDown
            className={`w-3 h-3 lg:hidden transition-transform ${collapsed ? '' : 'rotate-180'}`}
          />
        </button>

        <div className={`${collapsed ? 'hidden' : 'block'} lg:block`}>
          <div
            className="h-2 rounded mb-1.5"
            style={{
              // Amostra da escala — usa sempre as variantes vívidas. Em tema
              // claro os tokens --score-* trocam para variantes AA escuras
              // (pensadas para texto), que na barra ficam lamacentas.
              background: `linear-gradient(to right,
                rgb(107 114 128) 0%,
                rgb(248 113 113) 25%,
                rgb(245 158 11) 50%,
                rgb(16 185 129) 75%,
                rgb(14 165 233) 100%
              )`,
            }}
          />

          <div className="grid grid-cols-5 gap-0.5 text-center text-[8px] leading-tight text-fg-subtle">
            {labels.map((l) => (
              <span key={l.label}>{l.label}</span>
            ))}
          </div>

          {isobathsVisible && isobathsTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-testid="isobaths-legend-inline">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {isobathsTitle}
              </p>
              <IsobathLegend bare title={isobathsTitle} />
            </div>
          )}
          {hsVisible && hsTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-hs-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {hsTitle}
              </p>
              <div
                className="h-2 rounded mb-1"
                style={{
                  background:
                    'linear-gradient(to right, rgb(3 105 161 / 0.48), rgb(14 165 233 / 0.78) 42%, rgb(14 165 233 / 0.92) 70%, rgb(241 245 249 / 0.88))',
                }}
              />
              <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
                <span>0.5</span>
                <span>0.9</span>
                <span>2.4+</span>
              </div>
            </div>
          )}
          {sstVisible && sstTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-sst-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {sstTitle}
              </p>
              <div
                className="h-2 rounded mb-1"
                style={{
                  background:
                    'linear-gradient(to right, rgb(var(--data-water) / 0.55), rgb(var(--data-water) / 0.8) 48%, rgb(var(--data-period) / 0.92))',
                }}
              />
              <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
                <span>14</span>
                <span>18</span>
                <span>22+</span>
              </div>
            </div>
          )}
          {currentsVisible && currentsTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-currents-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {currentsTitle}
              </p>
              <div className="flex items-end justify-between h-6 mb-1 px-0.5" aria-hidden>
                {[
                  { len: 7, op: 0.5 },
                  { len: 11, op: 0.72 },
                  { len: 15, op: 0.96 },
                ].map((s) => (
                  <svg
                    key={s.len}
                    width={22}
                    height={22}
                    viewBox="0 0 22 22"
                    className="text-data-water"
                  >
                    <line
                      x1="5"
                      y1="16.5"
                      x2={5 + s.len * 0.62}
                      y2={16.5 - s.len * 0.62}
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      opacity={s.op}
                    />
                    <circle
                      cx={5 + s.len * 0.62}
                      cy={16.5 - s.len * 0.62}
                      r="1.55"
                      fill="currentColor"
                      opacity={s.op}
                    />
                  </svg>
                ))}
              </div>
              <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
                <span>0.1</span>
                <span>0.2</span>
                <span>0.4+</span>
              </div>
            </div>
          )}
          {windVisible && windTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-wind-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {windTitle}
              </p>
              <div className="flex items-end justify-between h-6 mb-1 px-0.5" aria-hidden>
                {[
                  { len: 6, w: 1.15, op: 0.42 },
                  { len: 11, w: 1.15, op: 0.6 },
                  { len: 16, w: 1.7, op: 0.78 },
                ].map((s) => (
                  <svg
                    key={s.len}
                    width={22}
                    height={22}
                    viewBox="0 0 22 22"
                    className="text-data-wind"
                  >
                    <line
                      x1="3"
                      y1="16"
                      x2={3 + s.len}
                      y2={16}
                      stroke="currentColor"
                      strokeWidth={s.w}
                      strokeLinecap="round"
                      opacity={s.op}
                    />
                  </svg>
                ))}
              </div>
              <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
                <span>5</span>
                <span>15</span>
                <span>25+</span>
              </div>
            </div>
          )}
          {bathymetryVisible && bathymetryTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-bathymetry-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {bathymetryTitle}
              </p>
              {/* Escala EMODnet mean_multicolour real: rebentação em vermelho
                  (0 m) → amarelo na plataforma → verde/ciano → azul → navy
                  nos canhões/talude (aproximação não-linear, como nos tiles). */}
              <div
                className="h-2 rounded mb-1"
                style={{
                  background:
                    'linear-gradient(to right, #ef4444 0%, #fbbf24 12%, #4ade80 30%, #22d3ee 52%, #1d4ed8 75%, #081c3f 100%)',
                }}
              />
              <div className="flex justify-between text-[9px] font-mono tabular-nums text-fg-subtle">
                <span>0</span>
                <span>500</span>
                <span>4000+</span>
              </div>
            </div>
          )}
          {seamarksVisible && seamarksTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-seamarks-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1">
                {seamarksTitle}
              </p>
              <div className="flex items-center gap-1.5 text-[9px] text-fg-subtle">
                {/* Marcas IALA simplificadas: baliza lateral (cilindro),
                    cardinal (duplo cone) e perigo isolado (esferas). */}
                <svg width="46" height="14" viewBox="0 0 46 14" aria-hidden>
                  <rect x="2" y="3" width="6" height="8" rx="1" fill="none" stroke="#ef4444" strokeWidth="1.3" />
                  <path d="M16 11 L20 3 L24 11 Z M16 8 L24 8" fill="none" stroke="#eab308" strokeWidth="1.3" strokeLinejoin="round" />
                  <circle cx="34" cy="5" r="2.4" fill="none" stroke="#334155" strokeWidth="1.3" />
                  <circle cx="34" cy="11" r="2.4" fill="#334155" />
                </svg>
                <span>{seamarksMarksLabel}</span>
              </div>
            </div>
          )}
          {warningsVisible && warningsTitle && (
            <div className="mt-2 pt-2 border-t border-divider" data-map-warnings-legend>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle mb-1.5">
                {warningsTitle}
              </p>
              <div className="flex flex-col gap-1 text-[9px] text-fg-subtle">
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <rect x="1.5" y="1.5" width="11" height="11" fill="rgb(239 68 68 / 0.18)" stroke="#ef4444" strokeWidth="1.4" />
                  </svg>
                  {warningsZoneLabel}
                </span>
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 28 28" aria-hidden>
                    <circle cx="14" cy="16" r="10" fill="none" stroke="#f59e0b" strokeWidth="1.4" strokeDasharray="2.5 4" opacity="0.7" />
                    <path d="M14.2 6.5 C17.2 10.6 18.1 15.5 17.2 21.5 L10.2 21.5 C10.1 15.2 11.2 10.4 14.2 6.5 Z" fill="rgb(15 23 42)" stroke="rgb(226 232 240)" strokeWidth="1" strokeLinejoin="round" />
                  </svg>
                  {warningsOrcaLabel}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
