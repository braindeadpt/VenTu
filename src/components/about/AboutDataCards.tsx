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
  formatBuoyLayerDowntimeTitle,
} from '@/lib/buoyLayerDowntime'
import CoastalDailyActiveChart from '@/components/CoastalDailyActiveChart'

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
  isPt: boolean
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
  isPt,
  bakedKey,
  bakedTide,
  bakedRadar,
  bakedSkill,
  bakedArchive,
}: AboutDataCardsProps) {
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
      {keyInfo ? <IhKeyCard isPt={isPt} info={keyInfo} /> : null}
      {tide ? <TideCard isPt={isPt} tide={tide} /> : null}
      {radar ? <RadarCard isPt={isPt} radar={radar} /> : null}
      {skill?.hasData ? <SkillCard isPt={isPt} skill={skill} /> : null}      {archive?.hasData ? <ArchiveCard isPt={isPt} archive={archive} /> : null}
    </>
  )
}

function IhKeyCard({ isPt, info }: { isPt: boolean; info: IhKeyStatusInfo }) {
        const conf = {
          active: {
            label: isPt ? 'Activa' : 'Active',
            chipClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40',
            icon: CheckCircle2,
            line: isPt
              ? 'A IH_API_KEY está configurada e o serviço de ondas do IH devolve leituras das boias (onda observada no spot).'
              : 'The IH_API_KEY is configured and the IH wave service is returning buoy readings (observed wave on spot pages).',
          },
          'not-configured': {
            label: isPt ? 'Não configurada' : 'Not configured',
            chipClass: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
            icon: KeyRound,
            line: isPt
              ? 'Sem IH_API_KEY — as estações são carregadas (OGC, grátis), mas a camada observedWave fica desligada e o fallback WMO/Copernicus é usado onde houver.'
              : 'No IH_API_KEY — stations load (OGC, free), but the observed-wave layer stays off; the WMO/Copernicus fallback covers where available.',
          },
          rejected: {
            label: isPt ? 'Expirada / rejeitada' : 'Expired / rejected',
            chipClass: 'bg-red-500/15 text-red-500 border-red-500/40',
            icon: XCircle,
            line: isPt
              ? `A API rejeitou a key (HTTP ${info.rejectedStatus ?? '401'}) — a camada observedWave parou de ser servida e o workflow falha cedo de propósito até a key ser renovada.`
              : `The API rejected the key (HTTP ${info.rejectedStatus ?? '401'}) — the observed-wave layer stopped and the workflow fails early on purpose until the key is renewed.`,
          },
          down: {
            label: isPt ? 'Activa mas sem leituras' : 'Active but no readings',
            chipClass: 'bg-score-fair/15 text-score-fair border-score-fair/40',
            icon: AlertTriangle,
            line: isPt
              ? 'A key está configurada mas o serviço de ondas do IH não devolveu leituras neste run (outage transitória) — não é um problema da info.'
              : 'The key is configured but the IH wave service returned no readings this run (transient outage) — not a key problem.',
          },
        }[info.status]
        const Icon = conf.icon
        const metaLine =
          info.status === 'active'
            ? isPt
              ? `${info.buoyCount} boias · última leitura ${info.newestReadingAt ? new Date(info.newestReadingAt).toLocaleString('pt-PT') : '—'}`
              : `${info.buoyCount} buoys · newest reading ${info.newestReadingAt ? new Date(info.newestReadingAt).toLocaleString('en-GB') : '—'}`
            : info.status === 'rejected'
              ? isPt
                ? `rejeitada ${info.rejectedAt ? `em ${new Date(info.rejectedAt).toLocaleString('pt-PT')}` : ''} (HTTP ${info.rejectedStatus ?? '401'}) · ${info.buoyCount} boias catalogadas`
                : `rejected ${info.rejectedAt ? `at ${new Date(info.rejectedAt).toLocaleString('en-GB')}` : ''} (HTTP ${info.rejectedStatus ?? '401'}) · ${info.buoyCount} buoys catalogued`
              : isPt
                ? `${info.buoyCount} boias catalogadas (estações OGC, sem key)`
                : `${info.buoyCount} buoys catalogued (OGC stations, no key)`
        return (
          <div className="card-1 p-8 space-y-4" data-ih-key-status={info.status}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-fg">
                {isPt ? 'Camada de boias IH (IH_API_KEY)' : 'IH buoy layer (IH_API_KEY)'}
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
                const full = formatBuoyLayerDowntimeTitle(dt, isPt)
                return (
                  <p
                    className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border border-score-poor/25 bg-score-poor/10 px-2.5 py-1.5 text-xs text-score-poor"
                    data-ih-key-status-downtime="true"
                    title={`${full}${dt.lastOkAt ? ` · ${isPt ? 'última vez ok' : 'last OK'}: ${new Date(dt.lastOkAt).toLocaleString(isPt ? 'pt-PT' : 'en-GB')}` : ''}`}
                  >
                    <span aria-hidden>⏱</span>
                    <span className="tabular-nums">
                      {isPt ? <>Degradada {formatBuoyLayerDowntimeSuffix(dt, isPt).replace(/^· /, '')} ({dt.runs} {dt.runs === 1 ? 'run' : 'runs'})</> : <>Degraded {formatBuoyLayerDowntimeSuffix(dt, isPt).replace(/^· /, '')} ({dt.runs} {dt.runs === 1 ? 'run' : 'runs'})</>}
                    </span>
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
                  {isPt
                    ? <>Costa central coberta <strong className="font-semibold">sem chave</strong> pela boia WMO Nazaré Costeira (via Copernicus){info.wmoNazare.waveHeightM != null ? ` · ${info.wmoNazare.waveHeightM} m` : ''} · leitura {info.wmoNazare.readingAt ? new Date(info.wmoNazare.readingAt).toLocaleString('pt-PT') : '—'}</>
                    : <>Central coast covered <strong className="font-semibold">keyless</strong> by the WMO Nazaré Costeira buoy (Copernicus route){info.wmoNazare.waveHeightM != null ? ` · ${info.wmoNazare.waveHeightM} m` : ''} · reading {info.wmoNazare.readingAt ? new Date(info.wmoNazare.readingAt).toLocaleString('en-GB') : '—'}</>}
                </p>
              ) : null
            }
            <div className="space-y-2 text-sm text-fg-muted leading-relaxed">
              <p className="font-medium text-fg">
                {isPt ? 'Como obter e configurar a chave' : 'How to get and configure the key'}
              </p>
              <ol className="list-decimal pl-5 space-y-1.5">
                <li>
                  {isPt ? (
                    <>Pedir a chave gratuita por e-mail a{' '}
                      <a href="mailto:cedencia.dados@hidrografico.pt" className="underline hover:text-fg transition-colors">
                        cedencia.dados@hidrografico.pt
                      </a>{' '}
                      (Instituto Hidrográfico) — acesso à série <code className="text-fg">getDatawellData</code> (altura/período/direcção de onda em tempo real).</>
                  ) : (
                    <>Request the free key by e-mail to{' '}
                      <a href="mailto:cedencia.dados@hidrografico.pt" className="underline hover:text-fg transition-colors">
                        cedencia.dados@hidrografico.pt
                      </a>{' '}
                      (Instituto Hidrográfico) — access to the{' '}
                      <code className="text-fg">getDatawellData</code> series (real-time wave height/period/direction).</>
                  )}
                </li>
                <li>
                  {isPt ? 'Criar o secret no GitHub: Settings → Secrets and variables → Actions → New secret → `IH_API_KEY`.' : 'Create the GitHub secret: Settings → Secrets and variables → Actions → New secret → `IH_API_KEY`.'}
                </li>
                <li>
                  {isPt ? 'Local: `cp .env.example .env.local` e preencher `IH_API_KEY=…` (o ficheiro já está no .gitignore).' : 'Locally: `cp .env.example .env.local` and set `IH_API_KEY=…` (the file is already gitignored).'}
                </li>
                <li>
                  {isPt ? 'Verificar: `npm run buoys:test-key` (teste e2e da key) e `npm run buoys:fetch`.' : 'Verify: `npm run buoys:test-key` (key e2e test) and `npm run buoys:fetch`.'}
                </li>
              </ol>
              <p className="text-xs text-fg-subtle">
                {isPt ? (
                  <>Guia completo em{' '}
                    <a href="https://github.com/braindeadpt/VenTu/blob/main/docs/IH_API_KEY.md" className="underline hover:text-fg transition-colors" target="_blank" rel="noopener noreferrer">
                      docs/IH_API_KEY.md
                    </a>{' '}
                    · quando houver leituras, a onda observada aparece no card de cada spot (com rótulo «boia X a Y km»).</>
                ) : (
                  <>Full guide in{' '}
                    <a href="https://github.com/braindeadpt/VenTu/blob/main/docs/IH_API_KEY.md" className="underline hover:text-fg transition-colors" target="_blank" rel="noopener noreferrer">
                      docs/IH_API_KEY.md
                    </a>{' '}
                    · when readings exist, the observed wave shows on each spot’s card (labelled «buoy X at Y km»).</>
                )}
              </p>
            </div>
          </div>
        )
}

function RadarCard({ isPt, radar }: { isPt: boolean; radar: RadarLayerStatusInfo }) {
        if (!radar) return null
        const conf = {
          ok: {
            label: isPt ? 'Activo' : 'Active',
            chipClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40',
            icon: CheckCircle2,
            line: isPt
              ? 'O IPMA está a publicar frames de radar novos (5 em 5 min) — a precipitação observada aparece no mapa.'
              : 'IPMA is publishing new radar frames (every 5 min) — observed precipitation shows on the map.',
          },
          stale: {
            label: isPt ? 'Atrasado' : 'Delayed',
            chipClass: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
            icon: AlertTriangle,
            line: isPt
              ? 'O último frame válido já não é actualizado há mais de 25 min — o IPMA não está a servir PNGs novos (o fetch mantém o último ficheiro conhecido e o pipeline de previsões continua).'
              : 'The latest valid frame has not been refreshed for over 25 min — IPMA is not serving new PNGs (the fetch keeps the last known file and the forecast pipeline keeps running).',
          },
          down: {
            label: isPt ? 'Sem dados' : 'No data',
            chipClass: 'bg-score-fair/15 text-score-fair border-score-fair/40',
            icon: XCircle,
            line: isPt
              ? 'Sem radar.json — a camada de radar não tem dados.'
              : 'No radar.json — the radar layer has no data.',
          },
        }[radar.status]
        const Icon = conf.icon
        const frameLabel = radar.frameTime ? radarFrameFullClock(radar.frameTime) : null
        const metaLine = isPt
          ? `último frame ${frameLabel ?? '—'}${typeof radar.ageMin === 'number' ? ` · há ${formatRadarAge(radar.ageMin)}` : ''} · ${radar.frames} ${radar.frames === 1 ? 'frame' : 'frames'}`
          : `last frame ${frameLabel ?? '—'}${typeof radar.ageMin === 'number' ? ` · ${formatRadarAge(radar.ageMin)} ago` : ''} · ${radar.frames} ${radar.frames === 1 ? 'frame' : 'frames'}`
        return (
          <div className="card-1 p-8 space-y-4" data-radar-layer-status={radar.status}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-fg">
                {isPt ? 'Radar IPMA (precipitação)' : 'IPMA radar (precipitation)'}
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
                      ? `${isPt ? 'última vez ok' : 'last OK'}: ${new Date(radar.lastOkAt).toLocaleString(isPt ? 'pt-PT' : 'en-GB')}`
                      : undefined
                  }
                >
                  <span aria-hidden>⏱</span>
                  <span className="tabular-nums">
                    {isPt
                      ? <>Sem frames novos há {radar.streak} {radar.streak === 1 ? 'run' : 'runs'} consecutivas</>
                      : <>No new frames for {radar.streak} consecutive {radar.streak === 1 ? 'run' : 'runs'}</>}
                  </span>
                </p>
              ) : null
            }
            <p className="text-xs text-fg-subtle leading-relaxed">
              {isPt
                ? 'Esta camada nunca bloqueia o pipeline (uma outage do radar IPMA não pára as previsões) — é aqui e nos logs do workflow que a falta de dados fica visível. O badge do radar no mapa mostra também a idade do último frame válido.'
                : 'This layer never blocks the pipeline (an IPMA radar outage does not stop forecasts) — this card and the workflow logs are where missing data becomes visible. The radar badge on the map also shows the age of the latest valid frame.'}
            </p>
          </div>
        )
}

function TideCard({ isPt, tide }: { isPt: boolean; tide: TideLayerStatusInfo }) {
        if (!tide) return null
        const conf = {
          ok: {
            label: isPt ? 'Activa' : 'Active',
            chipClass: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40',
            icon: CheckCircle2,
            line: isPt
              ? 'O IH devolveu observações de maré nas últimas 24 h — a altura observada e a estação aparecem no card de cada spot.'
              : 'IH returned observed tide readings within the last 24 h — the observed height and station show on each spot’s card.',
          },
          stale: {
            label: isPt ? 'Sem leituras recentes' : 'No recent readings',
            chipClass: 'bg-amber-500/15 text-amber-500 border-amber-500/40',
            icon: AlertTriangle,
            line: isPt
              ? 'O ficheiro de marés não é actualizado há mais de 24 h — o IH não devolveu observações novas e o fetch reutiliza o último ficheiro conhecido (o pipeline de previsões continua).'
              : 'The tide file has not been refreshed for over 24 h — IH returned no new observations and the fetch reuses the last known file (the forecast pipeline keeps running).',
          },
          down: {
            label: isPt ? 'Sem dados' : 'No data',
            chipClass: 'bg-score-fair/15 text-score-fair border-score-fair/40',
            icon: XCircle,
            line: isPt
              ? 'Sem ih-tides.json — a camada de marés observadas não tem dados.'
              : 'No ih-tides.json — the observed-tide layer has no data.',
          },
        }[tide.status]
        const Icon = conf.icon
        const metaLine = isPt
          ? `última fetch ${tide.fetchedAt ? new Date(tide.fetchedAt).toLocaleString('pt-PT') : '—'} · ${tide.stations} estações · ${tide.mappedSpots} spots`
          : `last fetch ${tide.fetchedAt ? new Date(tide.fetchedAt).toLocaleString('en-GB') : '—'} · ${tide.stations} stations · ${tide.mappedSpots} spots`
        return (
          <div className="card-1 p-8 space-y-4" data-tide-layer-status={tide.status}>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-fg">
                {isPt ? 'Camada de marés IH (observadas)' : 'IH tide layer (observed)'}
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
              <TideObservationsList isPt={isPt} observations={tide.observations} />
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
                      ? `${isPt ? 'última vez ok' : 'last OK'}: ${new Date(tide.lastOkAt).toLocaleString(isPt ? 'pt-PT' : 'en-GB')}`
                      : undefined
                  }
                >
                  <span aria-hidden>⏱</span>
                  <span className="tabular-nums">
                    {isPt
                      ? <>Sem observações novas há {tide.streak} {tide.streak === 1 ? 'run' : 'runs'} consecutivas</>
                      : <>No new observations for {tide.streak} consecutive {tide.streak === 1 ? 'run' : 'runs'}</>}
                  </span>
                </p>
              ) : null
            }
            <p className="text-xs text-fg-subtle leading-relaxed">
              {isPt
                ? 'Esta camada nunca bloqueia o pipeline (uma outage do IH não pára as previsões) — é aqui e nos logs do workflow que a falta de dados fica visível. Quando o IH voltar a servir observações, a próxima fetch restaura o estado.'
                : 'This layer never blocks the pipeline (an IH outage does not stop forecasts) — this card and the workflow logs are where the missing data becomes visible. When IH serves observations again, the next fetch restores the layer.'}
            </p>
          </div>
        )
}

/** Leituras observadas mais recentes (top 5 por recência) — a prova visível
 * de que a camada está viva, e o que falta quando está down. Formata a hora
 * local da leitura sem segundos; título vazio (EDR sem title) cai no genérico. */
function TideObservationsList({
  isPt,
  observations,
}: {
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
      aria-label={isPt ? 'Leituras observadas recentes' : 'Recent observed readings'}
    >
      {observations.map((o, i) => (
        <li
          key={`${o.at}-${o.title || i}`}
          className="flex items-baseline justify-between gap-2 rounded-card border border-fg/10 px-2.5 py-1.5 text-xs"
        >
          <span className="truncate text-fg-muted">
            {o.title || (isPt ? 'Estação' : 'Station')}
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

function SkillCard({ isPt, skill }: { isPt: boolean; skill: ForecastSkillData }) {
        if (!skill.hasData) return null
        const byOrigin = skill.byOrigin ?? { ih: null, 'wmo-pt': null, 'wmo-es': null }
        const originLabel = (o: string | undefined) => forecastSkillOriginTag(o as never)
        return (
          <div className="card-1 p-8 space-y-4">
            <h2 className="text-2xl font-bold text-fg">
              {isPt ? 'Skill real do forecast por boia' : 'Real forecast skill per buoy'}
            </h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              {isPt ? (
                <>Skill <em className="not-italic text-fg">real</em> do forecast — a previsão best_match feita no run N para a hora H é comparada com a leitura da boia para H quando chega (lead time &gt; 0), acumulado run a run em <code className="text-fg">forecast-skill.json</code>. <strong className="text-fg">ME = média(observado − previsão)</strong>: positivo significa que o modelo subestima a onda. Distinto do viés ERA5 acima — isto é o quão bom o forecast é, não o quão enviesado o modelo de reanálise está. As stats são separadas por plataforma: <strong className="text-fg">IH</strong> (boias Datawell, com chave) vs <strong className="text-fg">WMO-PT</strong> (Nazaré Costeira, Copernicus sem chave) vs <strong className="text-fg">WMO-ES</strong> (Copernicus sem chave, cross-border) — o total misto esconde como cada uma se comporta.</>
              ) : (
                <>Real forecast skill — the best_match forecast made in run N for hour H is compared with the buoy reading for H once it arrives (lead time &gt; 0), accumulated run after run in <code className="text-fg">forecast-skill.json</code>. <strong className="text-fg">ME = mean(observed − forecast)</strong>: positive means the model underestimates the wave. Distinct from the ERA5 bias above — this is how good the forecast is, not how biased the reanalysis model is. Stats are split by platform: <strong className="text-fg">IH</strong> (Datawell buoys, keyed) vs <strong className="text-fg">WMO-PT</strong> (Nazaré Costeira, Copernicus keyless) vs <strong className="text-fg">WMO-ES</strong> (Copernicus keyless, cross-border) — the mixed total alone hides how each behaves.</>
              )}
            </p>
            {byOrigin.ih || byOrigin['wmo-pt'] || byOrigin['wmo-es'] ? (
              <div className="flex flex-col sm:flex-row gap-3">
                {(['ih', 'wmo-pt', 'wmo-es'] as const).map((origin) => {
                  const s = byOrigin[origin]
                  if (!s) return null
                  const originName = isPt
                    ? origin === 'ih'
                      ? 'Boias IH (Datawell)'
                      : origin === 'wmo-pt'
                        ? 'Boia PT (Copernicus WMO · Nazaré)'
                        : 'Boias ES (Copernicus WMO)'
                    : origin === 'ih'
                      ? 'IH buoys (Datawell)'
                      : origin === 'wmo-pt'
                        ? 'PT buoy (Copernicus WMO · Nazaré)'
                        : 'ES buoys (Copernicus WMO)'
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
                    <th className="py-1.5 pr-3 font-semibold">{isPt ? 'Boia' : 'Buoy'}</th>
                    <th className="py-1.5 pr-3 font-semibold">{isPt ? 'Origem' : 'Origin'}</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">n</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">ME (m)</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">MAE (m)</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">RMSE (m)</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">r</th>
                    <th className="py-1.5 text-right font-semibold">
                      {isPt ? 'Lead médio (h)' : 'Mean lead (h)'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {skill.buoys.map((b) => (
                    <tr key={b.id} className="border-b border-divider last:border-0">
                      <td className="py-1.5 pr-3 font-medium text-fg">{b.name}</td>
                      <td
                        className="py-1.5 pr-3 text-fg-muted whitespace-nowrap"
                        title={forecastSkillOriginLabel(b.origin, isPt)}
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
                const base = isPt
                  ? `Actualizado ${new Date(skill.fetchedAt ?? '').toLocaleDateString('pt-PT')} · ${skill.pairCount} pares previsto×medido acumulados · só boias com n≥10`
                  : `Updated ${new Date(skill.fetchedAt ?? '').toLocaleDateString('en-GB')} · ${skill.pairCount} accumulated forecast×observed pairs · buoys with n≥10 only`
                if (byOrigin.ih === 0 && byOrigin['wmo-pt'] === 0 && byOrigin['wmo-es'] === 0) return base
                const perOrigin = isPt
                  ? `IH ${byOrigin.ih} · WMO-PT ${byOrigin['wmo-pt']} · WMO-ES ${byOrigin['wmo-es']} pares`
                  : `IH ${byOrigin.ih} · WMO-PT ${byOrigin['wmo-pt']} · WMO-ES ${byOrigin['wmo-es']} pairs`
                const calibNote =
                  calib > 0
                    ? isPt
                      ? ` · ${calib} da camada calibrada ES→PT (referência PT)`
                      : ` · ${calib} from the ES→PT calibrated layer (PT reference)`
                    : ''
                return `${base} · ${perOrigin}${calibNote}`
              })()}
              {(() => {
                if (!skill.byOrigin?.['wmo-es']) return null
                return isPt
                  ? ' • O Noroeste é coberto pelas boias espanholas (Copernicus-ES) mesmo sem IH_API_KEY — o skill de Cabo Silleiro/Villano não depende da chave do IH.'
                  : ' • The northwest is covered by the Spanish buoys (Copernicus-ES) even without an IH_API_KEY — Cabo Silleiro/Villano skill does not depend on the IH key.'
              })()}
            </p>
          </div>
        )
}

function ArchiveCard({ isPt, archive }: { isPt: boolean; archive: CoastalWarningsArchiveData }) {
        if (!archive.hasData) return null
        return (
          <div className="card-1 p-8 space-y-4" data-coastal-archive>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold text-fg">
                {isPt
                  ? 'Arquivo — Avisos à Navegação Costeiros (IH)'
                  : 'Archive — IH coastal navigation warnings'}
              </h2>
              <span
                className="inline-flex items-center gap-1.5 rounded-card border border-divider px-2.5 py-0.5 text-xs font-medium text-fg-muted"
                data-visual-dynamic
              >
                <Anchor className="w-3.5 h-3.5 text-score-poor" aria-hidden />
                {isPt
                  ? `${archive.dayCount} ${archive.dayCount === 1 ? 'dia' : 'dias'} de snapshots`
                  : `${archive.dayCount} ${archive.dayCount === 1 ? 'day' : 'days'} of snapshots`}
              </span>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed">
              {isPt ? (
                <>Histórico diário dos avisos <em className="not-italic text-fg">em vigor</em> — o fetch arquiva um snapshot por dia e deriva a janela de cada aviso (primeiro/último dia em que foi visto). O ficheiro principal só guarda os de hoje; este arquivo lembra os que já expiraram, dentro da janela de {archive.windowDays} dias.</>
              ) : (
                <>Daily history of warnings <em className="not-italic text-fg">in force</em> — the fetch archives one snapshot per day and derives each warning’s window (first/last day it was seen). The live file only keeps today’s; this archive remembers expired ones, within the {archive.windowDays}-day window.</>
              )}
            </p>

            {/* Mini-gráfico — avisos em vigor por dia na janela do arquivo.
                Componente partilhado com a página /fontes (nunca divergir). */}
            <CoastalDailyActiveChart dailyActive={archive.dailyActive} isPt={isPt} />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-meta">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-fg-subtle">
                    <th className="py-1.5 pr-3 font-semibold">{isPt ? 'Referência' : 'Reference'}</th>
                    <th className="py-1.5 pr-3 font-semibold">{isPt ? 'Categoria' : 'Category'}</th>
                    <th className="py-1.5 pr-3 font-semibold">Fonte</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">{isPt ? 'Dias' : 'Days'}</th>
                    <th className="py-1.5 pr-3 text-right font-semibold">{isPt ? 'Desde' : 'Since'}</th>
                    <th className="py-1.5 text-right font-semibold">{isPt ? 'Até' : 'Until'}</th>
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
              {isPt
                ? `Actualizado ${archive.fetchedAt ? new Date(archive.fetchedAt).toLocaleDateString('pt-PT') : '—'} · Instituto Hidrográfico · Avisos à Navegação Costeiros (CC-BY 4.0)`
                : `Updated ${archive.fetchedAt ? new Date(archive.fetchedAt).toLocaleDateString('en-GB') : '—'} · Instituto Hidrográfico · Coastal Navigation Warnings (CC-BY 4.0)`}
            </p>
          </div>
        )
}

