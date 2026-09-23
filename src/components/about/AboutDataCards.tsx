'use client'

import { useEffect, useState } from 'react'
import { Anchor, AlertTriangle, CheckCircle2, KeyRound, XCircle } from 'lucide-react'
import { getAssetPath } from '@/lib/paths'
import {
  deriveIhKeyStatus,
  deriveWmoNazareCoverage,
  type IhBuoysHealthFile,
  type IhKeyStatusInfo,
  type WmoBuoysFileLike,
} from '@/lib/ihKeyStatusPure'
import {
  deriveTideLayerStatus,
  type TideFileLike,
  type TideLayerStatusInfo,
  type TideObservation,
} from '@/lib/tideLayerStatusPure'
import {
  deriveRadarLayerStatus,
  formatRadarAge,
  type RadarFileLike,
  type RadarLayerStatusInfo,
} from '@/lib/radarLayerStatusPure'
import { radarFrameFullClock } from '@/lib/ipmaRadar'
import {
  forecastSkillOriginLabel,
  forecastSkillOriginTag,
  parseForecastSkillBuoys,
  type ForecastSkillData,
} from '@/lib/forecastSkill'
import { parseCoastalWarningsArchive, type CoastalWarningsArchiveData } from '@/lib/coastalWarningsArchive'
import {
  deriveBuoyLayerDowntime,
  formatBuoyLayerDowntimeSuffix,
} from '@/lib/buoyLayerDowntime'
import CoastalDailyActiveChart from '@/components/CoastalDailyActiveChart'
import { getTranslation } from '@/lib/i18n'

// pipeline-meta.json shapes needed for the live re-derivation. Deliberately
// NOT imported from @/lib/pipelineMeta — that module reads fs at module scope,
// which would pull a server-only module into this client component's graph.
// status mirrors BuoyLayerStatus ('ok' | 'no-key' | 'down' | 'stale') so it
// stays assignable to the shared deriveBuoyLayerDowntime signature.
type BuoyLayerStatusLike = 'ok' | 'no-key' | 'down' | 'stale'
interface BuoyLayerMetaLike {
  status: BuoyLayerStatusLike
  streak?: number
  lastOkAt?: string
  streakUpdatedAt?: string
}
interface TideLayerMetaLike {
  streak?: number
  lastStatus?: string
  lastOkAt?: string
  streakUpdatedAt?: string
}
interface RadarLayerMetaLike {
  streak?: number
  lastStatus?: string
  lastOkAt?: string
  streakUpdatedAt?: string
}

const sign = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`
const two = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(2))

interface AboutDataCardsProps {
  locale: string
  /** Build-time baked snapshots (production default — no fetch, no CLS). */
  bakedKey: IhKeyStatusInfo | null
  bakedTide: TideLayerStatusInfo | null
  bakedRadar: RadarLayerStatusInfo | null
  bakedSkill: ForecastSkillData | null
  bakedArchive: CoastalWarningsArchiveData | null
}

/**
 * The four data cards of the About page as a client component.
 *
 * Production (no `ventu_live` cookie): renders the build-time baked props
 * verbatim — identical SSR output, zero extra fetches, no hydration drift.
 *
 * E2E (`ventu_live=1`, set by the hermetic visual helpers whenever they
 * intercept /data/*): the cards must be driven by the FIXTURE, not by the
 * baked HTML — but the page is statically generated, so the bake can never
 * be alternated by page.route. Under the cookie we seed null and re-derive
 * from the fetched JSON client-side (the same pure functions the loaders
 * use server-side), so the visual gate measures layout, not data drift.
 * The fetches go through getAssetPath and are intercepted like every other
 * /data/** file. On failure we keep the baked snapshot (best-effort).
 */
export default function AboutDataCards({
  locale,
  bakedKey,
  bakedTide,
  bakedRadar,
  bakedSkill,
  bakedArchive,
}: AboutDataCardsProps) {
  // Migração i18n bloco a bloco (M5): o bloco `about` já serve o TideCard; os
  // restantes sub-cards ainda usam isPt e vão sendo migrados por commit.
  const isPt = locale === 'pt'
  const t = getTranslation(locale).about
  const [forceLive] = useState(() =>
    typeof document !== 'undefined' &&
    document.cookie.split(';').some((c) => c.trim() === 'ventu_live=1'),
  );
  const [keyInfo, setKeyInfo] = useState<IhKeyStatusInfo | null>(
    forceLive ? null : bakedKey,
  );
  const [tide, setTide] = useState<TideLayerStatusInfo | null>(
    forceLive ? null : bakedTide,
  );
  const [radar, setRadar] = useState<RadarLayerStatusInfo | null>(
    forceLive ? null : bakedRadar,
  );
  const [skill, setSkill] = useState<ForecastSkillData | null>(
    forceLive ? null : bakedSkill,
  );
  const [archive, setArchive] = useState<CoastalWarningsArchiveData | null>(
    forceLive ? null : bakedArchive,
  );

  useEffect(() => {
    if (!forceLive) return;
    let cancelled = false;
    (async () => {
      try {
        const [ihRes, wmoRes, metaRes, tideRes, radarRes, skillRes, archiveRes] = await Promise.all([
          fetch(getAssetPath('/data/ih-buoys.json')).then((r) => (r.ok ? r.json() : null)),
          fetch(getAssetPath('/data/wmo-buoys.json')).then((r) => (r.ok ? r.json() : null)),
          fetch(getAssetPath('/data/pipeline-meta.json')).then((r) => (r.ok ? r.json() : null)),
          fetch(getAssetPath('/data/ih-tides.json')).then((r) => (r.ok ? r.json() : null)),
          fetch(getAssetPath('/data/radar.json')).then((r) => (r.ok ? r.json() : null)),
          fetch(getAssetPath('/data/forecast-skill.json')).then((r) => (r.ok ? r.json() : null)),
          fetch(getAssetPath('/data/ih-coastal-warnings-archive.json')).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (cancelled) return;
        // Replicate loadIhKeyStatus's three-source merge (ih-buoys + wmo-buoys
        // keyless sub-state + pipeline-meta buoyLayer streak).
        let info = deriveIhKeyStatus(ihRes as IhBuoysHealthFile | null);
        if (wmoRes) info = { ...info, wmoNazare: deriveWmoNazareCoverage(wmoRes as WmoBuoysFileLike | null) };
        const buoyLayer = (metaRes as { buoyLayer?: BuoyLayerMetaLike | null } | null)?.buoyLayer;
        info = {
          ...info,
          layer: buoyLayer
            ? {
                status: buoyLayer.status,
                streak: buoyLayer.streak,
                lastOkAt: buoyLayer.lastOkAt,
                streakUpdatedAt: buoyLayer.streakUpdatedAt,
              }
            : null,
        };
        setKeyInfo(info);
        const tideLayer = (metaRes as { tideLayer?: TideLayerMetaLike | null } | null)?.tideLayer;
        setTide(
          deriveTideLayerStatus(
            tideRes as TideFileLike | null,
            Date.now(),
            tideLayer
              ? {
                  streak: tideLayer.streak,
                  lastStatus: tideLayer.lastStatus,
                  lastOkAt: tideLayer.lastOkAt,
                  streakUpdatedAt: tideLayer.streakUpdatedAt,
                }
              : null,
          ),
        );
        const radarLayer = (metaRes as { radarLayer?: RadarLayerMetaLike | null } | null)?.radarLayer;
        setRadar(
          deriveRadarLayerStatus(
            radarRes as RadarFileLike | null,
            Date.now(),
            radarLayer
              ? {
                  streak: radarLayer.streak,
                  lastStatus: radarLayer.lastStatus,
                  lastOkAt: radarLayer.lastOkAt,
                  streakUpdatedAt: radarLayer.streakUpdatedAt,
                }
              : null,
          ),
        );
        setSkill(parseForecastSkillBuoys(skillRes));
        setArchive(parseCoastalWarningsArchive(archiveRes));
      } catch (e) {
        console.warn('AboutDataCards live load failed — keeping baked snapshot:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forceLive]);

  return (
    <>
      {keyInfo ? <IhKeyCard t={t} isPt={isPt} info={keyInfo} /> : null}
      {tide ? <TideCard t={t} isPt={isPt} tide={tide} /> : null}
      {radar ? <RadarCard t={t} isPt={isPt} radar={radar} /> : null}
      {skill?.hasData ? <SkillCard t={t} isPt={isPt} skill={skill} /> : null}      {archive?.hasData ? <ArchiveCard t={t} isPt={isPt} archive={archive} /> : null}
    </>
  )
}

function IhKeyCard({
  t,
  isPt,
  info,
}: {
  t: ReturnType<typeof getTranslation>['about']
  isPt: boolean
  info: IhKeyStatusInfo
}) {
        const conf = {
          active: {
            label: t.ihLabelActive,
            chipClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40',
            icon: CheckCircle2,
            line: t.ihLineActive,
          },
          'not-configured': {
            label: t.ihLabelNotConfigured,
            chipClass: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
            icon: KeyRound,
            line: t.ihLineNotConfigured,
          },
          rejected: {
            label: t.ihLabelRejected,
            chipClass: 'bg-red-500/15 text-red-500 border-red-500/40',
            icon: XCircle,
            line: t.ihLineRejected.replace('{status}', String(info.rejectedStatus ?? '401')),
          },
          down: {
            label: t.ihLabelDown,
            chipClass: 'bg-score-fair/15 text-score-fair border-score-fair/40',
            icon: AlertTriangle,
            line: t.ihLineDown,
          },
        }[info.status]
        const Icon = conf.icon
        const fmtDate = (v: string) => new Date(v).toLocaleString(isPt ? 'pt-PT' : 'en-GB')
        const metaLine =
          info.status === 'active'
            ? t.ihMetaActive
                .replace('{n}', String(info.buoyCount))
                .replace('{date}', info.newestReadingAt ? fmtDate(info.newestReadingAt) : '—')
            : info.status === 'rejected'
              ? (info.rejectedAt
                  ? t.ihMetaRejected.replace('{date}', fmtDate(info.rejectedAt))
                  : t.ihMetaRejectedNoDate)
                  .replace('{status}', String(info.rejectedStatus ?? '401'))
                  .replace('{n}', String(info.buoyCount))
              : t.ihMetaCatalogued.replace('{n}', String(info.buoyCount))
        return (
          <div className="card-1 p-8 space-y-4" data-ih-key-status={info.status}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-fg">
                {t.ihTitle}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-card border px-3 py-1 text-sm font-medium ${conf.chipClass}`}
                data-ih-key-status-badge={info.status}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {conf.label}
              </span>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed">{conf.line}</p>
            <p className="text-xs text-fg-subtle tabular-nums">{metaLine}</p>
            {
              // Streak down/stale (pipeline-meta buoyLayer): «há quantas horas a
              // onda observada está degradada» — só quando efectivamente degradada
              // com streak > 0 (no-key nunca conta). O tooltip mostra runs+horas.
              (() => {
                const dt = deriveBuoyLayerDowntime(info.layer ?? null)
                if (!dt) return null
                const unit = dt.runs === 1 ? t.ihRunOne : t.ihRunMany
                const full =
                  dt.hours !== null
                    ? t.ihDowntime.replace('{hours}', String(dt.hours))
                    : t.ihDowntimeRuns.replace('{runs}', String(dt.runs)).replace('{unit}', unit)
                const suffix = formatBuoyLayerDowntimeSuffix(dt, isPt).replace(/^· /, '')
                const degraded = (dt.runs === 1 ? t.ihDegradedOne : t.ihDegradedMany)
                  .replace('{suffix}', suffix)
                  .replace('{runs}', String(dt.runs))
                return (
                  <p
                    className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-score-poor/25 bg-score-poor/10 px-2.5 py-1.5 text-xs text-score-poor"
                    data-ih-key-status-downtime="true"
                    title={`${full} (${dt.runs} ${unit})${dt.lastOkAt ? ` · ${t.lastOk}: ${new Date(dt.lastOkAt).toLocaleString(isPt ? 'pt-PT' : 'en-GB')}` : ''}`}
                  >
                    <span aria-hidden>⏱</span>
                    <span className="tabular-nums">{degraded}</span>
                  </p>
                )
              })()
            }
            {
              // Sub-estado keyless: mesmo sem IH_API_KEY, a boia WMO Nazaré
              // Costeira (6200199, via Copernicus) cobre a costa central com uma
              // leitura fresca — para o clone perceber que a camada observada
              // não está TODA desligada (Costa de Prata/Lisboa continuam servidas).
              info.wmoNazare?.fresh ? (
                <p
                  className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-600"
                  data-ih-key-status-wmo="nazare-fresh"
                >
                  <span aria-hidden>🇵🇹</span>
                  <>{t.ihWmoA} <strong className="font-semibold">{t.ihWmoEm}</strong> {t.ihWmoB}
                  {info.wmoNazare.waveHeightM != null ? ` · ${info.wmoNazare.waveHeightM} m` : ''}
                  {t.ihWmoReading.replace('{date}', info.wmoNazare.readingAt ? new Date(info.wmoNazare.readingAt).toLocaleString(isPt ? 'pt-PT' : 'en-GB') : '—')}</>
                </p>
              ) : null
            }
            <div className="space-y-2 text-sm text-fg-muted leading-relaxed">
              <p className="font-medium text-fg">{t.ihHowTo}</p>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>
                  <>{t.ihStep1A}{' '}
                    <a href="mailto:cedencia.dados@hidrografico.pt" className="underline hover:text-fg transition-colors">
                      cedencia.dados@hidrografico.pt
                    </a>{' '}
                    {t.ihStep1B} <code className="text-fg">getDatawellData</code> {t.ihStep1C}</>
                </li>
                <li>{t.ihStep2}</li>
                <li>{t.ihStep3}</li>
                <li>{t.ihStep4}</li>
              </ol>
              <p className="text-xs text-fg-subtle">
                <>{t.ihDocsA}{' '}
                  <a href="https://github.com/braindeadpt/VenTu/blob/main/docs/IH_API_KEY.md" className="underline hover:text-fg transition-colors" target="_blank" rel="noopener noreferrer">
                    docs/IH_API_KEY.md
                  </a>{' '}
                  {t.ihDocsB}</>
              </p>
            </div>
          </div>
        )
}

function RadarCard({
  t,
  isPt,
  radar,
}: {
  t: ReturnType<typeof getTranslation>['about']
  isPt: boolean
  radar: RadarLayerStatusInfo
}) {
        if (!radar) return null
        const conf = {
          ok: {
            label: t.radarStatusActive,
            chipClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40',
            icon: CheckCircle2,
            line: t.radarLineActive,
          },
          stale: {
            label: t.radarStatusStale,
            chipClass: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
            icon: AlertTriangle,
            line: t.radarLineStale,
          },
          down: {
            label: t.radarStatusDown,
            chipClass: 'bg-score-fair/15 text-score-fair border-score-fair/40',
            icon: XCircle,
            line: t.radarLineDown,
          },
        }[radar.status]
        const Icon = conf.icon
        const frameLabel = radar.frameTime ? radarFrameFullClock(radar.frameTime) : null
        const metaLine =
          t.radarMetaBase.replace('{frame}', frameLabel ?? '—') +
          (typeof radar.ageMin === 'number' ? t.radarMetaAge.replace('{age}', formatRadarAge(radar.ageMin)) : '') +
          (radar.frames === 1 ? t.radarFramesOne : t.radarFramesMany).replace('{n}', String(radar.frames))
        return (
          <div className="card-1 p-8 space-y-4" data-radar-layer-status={radar.status}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-fg">
                {t.radarTitle}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-card border px-3 py-1 text-sm font-medium ${conf.chipClass}`}
                data-radar-layer-status-badge={radar.status}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {conf.label}
              </span>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed">{conf.line}</p>
            <p className="text-xs text-fg-subtle tabular-nums">{metaLine}</p>
            {
              // Streak down/stale (pipeline-meta radarLayer) — «há quantas runs a
              // camada está sem frames novos». A camada é warn-only (decisão
              // f92cf42ea): este badge + os logs são onde a falha vive.
              radar.status !== 'ok' && typeof radar.streak === 'number' && radar.streak > 0 ? (
                <p
                  className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-score-poor/25 bg-score-poor/10 px-2.5 py-1.5 text-xs text-score-poor"
                  data-radar-layer-downtime="true"
                  title={
                    radar.lastOkAt
                      ? `${t.lastOk}: ${new Date(radar.lastOkAt).toLocaleString(isPt ? 'pt-PT' : 'en-GB')}`
                      : undefined
                  }
                >
                  <span aria-hidden>⏱</span>
                  <span className="tabular-nums">
                    {(radar.streak === 1 ? t.radarStreakOne : t.radarStreakMany).replace(
                      '{runs}',
                      String(radar.streak),
                    )}
                  </span>
                </p>
              ) : null
            }
            <p className="text-xs text-fg-subtle leading-relaxed">{t.radarNote}</p>
          </div>
        )
}

function TideCard({
  t,
  isPt,
  tide,
}: {
  t: ReturnType<typeof getTranslation>['about']
  isPt: boolean
  tide: TideLayerStatusInfo
}) {
        if (!tide) return null
        const conf = {
          ok: {
            label: t.tideStatusActive,
            chipClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40',
            icon: CheckCircle2,
            line: t.tideLineActive,
          },
          stale: {
            label: t.tideStatusStale,
            chipClass: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
            icon: AlertTriangle,
            line: t.tideLineStale,
          },
          down: {
            label: t.tideStatusDown,
            chipClass: 'bg-score-fair/15 text-score-fair border-score-fair/40',
            icon: XCircle,
            line: t.tideLineDown,
          },
        }[tide.status]
        const Icon = conf.icon
        const metaLine = t.tideMeta
          .replace('{date}', tide.fetchedAt ? new Date(tide.fetchedAt).toLocaleString(isPt ? 'pt-PT' : 'en-GB') : '—')
          .replace('{stations}', String(tide.stations))
          .replace('{spots}', String(tide.mappedSpots))
        return (
          <div className="card-1 p-8 space-y-4" data-tide-layer-status={tide.status}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-fg">
                {t.tideTitle}
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-card border px-3 py-1 text-sm font-medium ${conf.chipClass}`}
                data-tide-layer-status-badge={tide.status}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {conf.label}
              </span>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed">{conf.line}</p>
            <p className="text-xs text-fg-subtle tabular-nums">{metaLine}</p>
            {tide.observations && tide.observations.length > 0 ? (
              <TideObservationsList t={t} isPt={isPt} observations={tide.observations} />
            ) : null}
            {
              // Streak down/stale (pipeline-meta tideLayer) — «há quantas runs a
              // camada está sem leituras novas». O fetch nunca bloqueia o
              // pipeline, por isso este badge + os logs são onde a falha vive.
              tide.status !== 'ok' && typeof tide.streak === 'number' && tide.streak > 0 ? (
                <p
                  className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-score-poor/25 bg-score-poor/10 px-2.5 py-1.5 text-xs text-score-poor"
                  data-tide-layer-downtime="true"
                  title={
                    tide.lastOkAt
                      ? `${t.lastOk}: ${new Date(tide.lastOkAt).toLocaleString(isPt ? 'pt-PT' : 'en-GB')}`
                      : undefined
                  }
                >
                  <span aria-hidden>⏱</span>
                  <span className="tabular-nums">
                    {(tide.streak === 1 ? t.tideStreakOne : t.tideStreakMany).replace(
                      '{runs}',
                      String(tide.streak),
                    )}
                  </span>
                </p>
              ) : null
            }
            <p className="text-xs text-fg-subtle leading-relaxed">{t.tideNote}</p>
          </div>
        )
}

/** Leituras observadas mais recentes (top 5 por recência) — a prova visível
 * de que a camada está viva, e o que falta quando está down. Formata a hora
 * local da leitura sem segundos; título vazio (EDR sem title) cai no genérico. */
function TideObservationsList({
  t,
  isPt,
  observations,
}: {
  t: ReturnType<typeof getTranslation>['about']
  isPt: boolean
  observations: TideObservation[]
}) {
  const fmt = (at: string) =>
    new Date(at).toLocaleString(isPt ? 'pt-PT' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  return (
    <ul
      className="grid grid-cols-1 sm:grid-cols-2 gap-1.5"
      data-tide-observations="true"
      aria-label={t.tideObsAria}
    >
      {observations.map((o, i) => (
        <li
          key={`${o.at}-${o.title || i}`}
          className="flex items-baseline justify-between gap-2 rounded-card border border-fg/10 px-2.5 py-1.5 text-xs"
        >
          <span className="truncate text-fg-muted">
            {o.title || t.tideStation}
          </span>
          <span className="tabular-nums text-fg whitespace-nowrap">
            {o.heightM.toFixed(2)} m
            <span className="ml-1.5 text-fg-subtle">{fmt(o.at)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function SkillCard({
  t,
  isPt,
  skill,
}: {
  t: ReturnType<typeof getTranslation>['about']
  isPt: boolean
  skill: ForecastSkillData
}) {
        if (!skill.hasData) return null
        const byOrigin = skill.byOrigin ?? { ih: null, 'wmo-pt': null, 'wmo-es': null }
        const originLabel = (o: string | undefined) => forecastSkillOriginTag(o as never)
        return (
          <div className="card-1 p-8 space-y-4">
            <h2 className="text-2xl font-bold text-fg">{t.skillTitle}</h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              <>{t.skillBodyLead} {t.skillBodyRest}{' '}
              <code className="text-fg">forecast-skill.json</code>.{' '}
              <strong className="text-fg">{t.skillBodyMe}</strong>
              {t.skillBodyAfterMe}{' '}
              <strong className="text-fg">IH</strong> {t.skillBodyIhDesc}{' '}
              <strong className="text-fg">WMO-PT</strong> {t.skillBodyWmoPtDesc}{' '}
              <strong className="text-fg">WMO-ES</strong> {t.skillBodyTail}</>
            </p>
            {byOrigin.ih || byOrigin['wmo-pt'] || byOrigin['wmo-es'] ? (
              <div className="flex flex-col sm:flex-row gap-3">
                {(['ih', 'wmo-pt', 'wmo-es'] as const).map((origin) => {
                  const s = byOrigin[origin]
                  if (!s) return null
                  const originName =
                    origin === 'ih'
                      ? t.skillOriginIh
                      : origin === 'wmo-pt'
                        ? t.skillOriginWmoPt
                        : t.skillOriginWmoEs
                  return (
                    <div
                      key={origin}
                      className="flex-1 rounded-lg border border-divider bg-surface-1/[0.03] px-4 py-3"
                      data-skill-origin={origin}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        {originName}
                      </p>
                      <p className="mt-1 text-sm text-fg tabular-nums">
                        n={s.n} · ME <span className="font-medium">{sign(s.me)}</span> m · MAE {two(s.mae)} m · RMSE {two(s.rmse)} m
                        {s.corr != null ? ` · r ${s.corr.toFixed(2)}` : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-meta">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="py-1.5 pr-3 font-semibold">{t.skillColBuoy}</th>
                    <th className="py-1.5 pr-3 font-semibold">{t.skillColOrigin}</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">n</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">ME (m)</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">MAE (m)</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">RMSE (m)</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">r</th>
                    <th className="py-1.5 text-right font-semibold">
                      {t.skillColLead}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {skill.buoys.map((b) => (
                    <tr key={b.id} className="border-b border-divider last:border-0">
                      <td className="py-1.5 pr-3 font-medium text-fg">{b.name}</td>
                      <td
                        className="py-1.5 pr-3 text-fg-muted whitespace-nowrap"
                        title={forecastSkillOriginLabel(b.origin, isPt, t.skillOriginEsCountry)}
                        data-skill-buoy-origin={b.origin}
                      >
                        {originLabel(b.origin)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{b.n}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{sign(b.me)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{two(b.mae)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{two(b.rmse)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-fg-muted">{two(b.corr)}</td>
                      <td className="py-1.5 text-right tabular-nums text-fg-muted">{two(b.meanLeadHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-fg-subtle" data-visual-dynamic>
              {(() => {
                const byOrigin = skill.pairCountByOrigin ?? { ih: 0, 'wmo-pt': 0, 'wmo-es': 0 }
                const calib = skill.calibratedPairCount ?? 0
                const base = t.skillMeta
                  .replace('{date}', new Date(skill.fetchedAt ?? '').toLocaleDateString(isPt ? 'pt-PT' : 'en-GB'))
                  .replace('{pairs}', String(skill.pairCount))
                if (byOrigin.ih === 0 && byOrigin['wmo-pt'] === 0 && byOrigin['wmo-es'] === 0) return base
                const perOrigin = t.skillPerOrigin
                  .replace('{ih}', String(byOrigin.ih))
                  .replace('{pt}', String(byOrigin['wmo-pt']))
                  .replace('{es}', String(byOrigin['wmo-es']))
                const calibNote = calib > 0 ? t.skillCalibNote.replace('{n}', String(calib)) : ''
                return `${base} · ${perOrigin}${calibNote}`
              })()}
              {(() => {
                if (!skill.byOrigin?.['wmo-es']) return null
                return t.skillNwNote
              })()}
            </p>
          </div>
        )
}

function ArchiveCard({
  t,
  isPt,
  archive,
}: {
  t: ReturnType<typeof getTranslation>['about']
  isPt: boolean
  archive: CoastalWarningsArchiveData
}) {
        if (!archive.hasData) return null
        return (
          <div className="card-1 p-8 space-y-4" data-coastal-archive>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-fg">{t.archiveTitle}</h2>
              <span
                className="inline-flex items-center gap-1.5 rounded-card border border-divider px-2.5 py-0.5 text-xs font-medium text-fg-muted"
                data-visual-dynamic
              >
                <Anchor className="w-3.5 h-3.5 text-score-poor" aria-hidden />
                {(archive.dayCount === 1 ? t.archiveChipOne : t.archiveChipMany).replace(
                  '{n}',
                  String(archive.dayCount),
                )}
              </span>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed">
              <>{t.archiveBodyA} <em className="not-italic text-fg">{t.archiveBodyEm}</em>{' '}
              {t.archiveBodyB.replace('{days}', String(archive.windowDays))}</>
            </p>

            {/* Mini-gráfico — avisos em vigor por dia na janela do arquivo.
                Componente partilhado com a página /fontes (nunca divergir). */}
            <CoastalDailyActiveChart dailyActive={archive.dailyActive} isPt={isPt} />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-meta">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="py-1.5 pr-3 font-semibold">{t.archiveColRef}</th>
                    <th className="py-1.5 pr-3 font-semibold">{t.archiveColCategory}</th>
                    <th className="py-1.5 pr-3 font-semibold">{t.archiveColSource}</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">{t.archiveColDays}</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">{t.archiveColSince}</th>
                    <th className="py-1.5 text-right font-semibold">{t.archiveColUntil}</th>
                  </tr>
                </thead>
                <tbody data-visual-dynamic>
                  {archive.refs.map((r) => (
                    <tr key={r.ref} className="border-b border-divider last:border-0">
                      <td className="py-1.5 pr-3 font-medium text-fg whitespace-nowrap">
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
                      </td>
                      <td className="py-1.5 pr-3 text-fg-muted">{r.category || '—'}</td>
                      <td className="py-1.5 pr-3 text-fg-muted">
                        {r.source === 'es' ? 'ES' : 'IH'}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.nDays}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-fg-muted">
                        {new Date(`${r.firstSeen}T12:00:00`).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB')}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-fg-muted">
                        {new Date(`${r.lastSeen}T12:00:00`).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-fg-subtle">
              {t.archiveFooter.replace(
                '{date}',
                archive.fetchedAt ? new Date(archive.fetchedAt).toLocaleDateString(isPt ? 'pt-PT' : 'en-GB') : '—',
              )}
            </p>
          </div>
        )
}

