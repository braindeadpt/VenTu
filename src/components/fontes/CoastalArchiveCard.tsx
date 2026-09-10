'use client'

import { useEffect, useState } from 'react'
import { Anchor } from 'lucide-react'
import { getAssetPath } from '@/lib/paths'
import {
  parseCoastalWarningsArchive,
  type CoastalWarningsArchiveData,
} from '@/lib/coastalWarningsArchive'
import CoastalDailyActiveChart from '@/components/CoastalDailyActiveChart'

interface CoastalArchiveCardProps {
  locale: string
  /** Build-time baked snapshot (production default — identical SSR, no fetch). */
  baked: CoastalWarningsArchiveData | null
}

/**
 * The /fontes coastal-warnings history card as a client component.
 *
 * WHY a client component (visual-regression fix): the card is data-derived
 * (dayCount, windowDays, per-day bars, warning windows) and was previously
 * rendered straight from `loadCoastalWarningsArchive()` in the server
 * component — i.e. BAKED from public/data at build time, which the visual
 * suite's committed fixture cannot pin (the fixture only intercepts client
 * /data/** fetches). So every build whose archive gained a day flipped the
 * "N dias · janela 90" chip width — and because that chip is a masked
 * `data-visual-dynamic` leaf, the Playwright mask RECTANGLE itself moved,
 * failing the pixel gate with no layout change at all.
 *
 * Production (no `ventu_live` cookie): renders `baked` verbatim — byte-
 * identical SSR, zero fetches, no hydration drift.
 *
 * E2E (`ventu_live=1`, set by the visual helpers whenever they intercept
 * /data/*): the card re-derives client-side from the fetched fixture (the
 * same pure `parseCoastalWarningsArchive` the server loader uses), so the
 * fixture — not the day's build data — drives the pixels. This is the same
 * seam the About data cards already use; keeping both surfaces on it is what
 * makes their captures data-independent.
 */
export default function CoastalArchiveCard({ locale, baked }: CoastalArchiveCardProps) {
  const isPt = locale === 'pt'
  const [forceLive] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.cookie.split(';').some((c) => c.trim() === 'ventu_live=1'),
  )
  const [archive, setArchive] = useState<CoastalWarningsArchiveData | null>(
    forceLive ? null : baked,
  )

  useEffect(() => {
    if (!forceLive) return
    let cancelled = false
    fetch(getAssetPath('/data/ih-coastal-warnings-archive.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (!cancelled) setArchive(parseCoastalWarningsArchive(res))
      })
      .catch((e) => {
        // Best-effort: keep the baked snapshot if the fixture cannot be read.
        console.warn('CoastalArchiveCard live load failed — keeping baked snapshot:', e)
      })
    return () => {
      cancelled = true
    }
  }, [forceLive])

  if (!archive?.hasData) return null

  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB')

  return (
    <div className="card-1 p-6 space-y-4" data-coastal-archive-fontes>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-fg">
          {isPt
            ? 'Histórico — Avisos à Navegação Costeiros (IH)'
            : 'History — IH coastal navigation warnings'}
        </h2>
        <span
          className="inline-flex items-center gap-1.5 rounded-card border border-divider px-2.5 py-0.5 text-xs font-medium text-fg-muted"
          data-visual-dynamic
        >
          <Anchor className="w-3.5 h-3.5 text-score-poor" aria-hidden />
          {isPt
            ? `${archive.dayCount} ${archive.dayCount === 1 ? 'dia' : 'dias'} · janela ${archive.windowDays}`
            : `${archive.dayCount} ${archive.dayCount === 1 ? 'day' : 'days'} · ${archive.windowDays}-day window`}
        </span>
      </div>
      <p className="text-sm text-fg-muted leading-relaxed">
        {isPt
          ? 'Registo diário dos avisos em vigor na costa portuguesa (e cross-border ES), arquivado pelo fetch — histórico auditable da camada de segurança, lado a lado com a atribuição do IH acima.'
          : 'Daily record of warnings in force on the Portuguese coast (and cross-border ES), archived by the pipeline — an auditable history of the safety layer, next to the IH attribution above.'}
      </p>

      <CoastalDailyActiveChart dailyActive={archive.dailyActive} isPt={isPt} />

      <div className="space-y-1.5">
        <p className="text-xs uppercase tracking-wide text-fg-subtle">
          {isPt ? 'Mais recentes' : 'Most recent'}
        </p>
        {archive.refs.slice(0, 6).map((r) => (
          <div
            key={r.ref}
            data-coastal-ref={r.ref}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-meta"
          >
            <span className="font-medium text-fg">
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-fg transition-colors"
                >
                  {r.ref}
                </a>
              ) : (
                r.ref
              )}
            </span>
            <span className="text-fg-muted tabular-nums">
              {fmt(r.firstSeen)} → {fmt(r.lastSeen)} · {r.nDays}d · {r.source === 'es' ? 'ES' : 'IH'}
            </span>
          </div>
        ))}
        <p className="pt-1 text-xs text-fg-subtle">
          {isPt ? (
            <>
              Tabela completa (janela de cada aviso) na página{' '}
              <a href={`/${locale}/about/`} className="underline hover:text-fg transition-colors">
                Sobre
              </a>
              .
            </>
          ) : (
            <>
              Full per-warning window table on the{' '}
              <a href={`/${locale}/about/`} className="underline hover:text-fg transition-colors">
                About
              </a>{' '}
              page.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
