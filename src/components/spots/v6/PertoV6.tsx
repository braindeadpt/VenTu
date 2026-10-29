'use client';

/**
 * «Perto daqui» (v6): os spots vizinhos com a distância e a nota /10 da
 * MESMA modalidade à hora escolhida na régua (map-hours.json, passo de 3 h,
 * pedido só quando o bloco se aproxima do ecrã), e o diretório (escolas,
 * lojas, centros de kite) num raio de 12 km. Markup v6 nativo (`.pt*`).
 * As notas são as dos vizinhos: nenhum número deste spot se repete aqui.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { getTranslation } from '@/lib/i18n';
import { spots } from '@/lib/spots';
import { fetchMapHours, type MapHoursFile } from '@/lib/mapHours';
import { nearbySpotHour, nearestSpots, pickMapHourStep } from '@/lib/context/nearbySpots';
import { formatDistance } from '@/lib/geolocation';
import { scoreToNota } from '@/lib/nota';
import { bandaDe } from '@/lib/modalidades';
import { bandaVars } from '@/lib/v6Tokens';
import { getScoreTokens } from '@/lib/sportScore';
import type { SportType } from '@/lib/sportRatings';
import type { DirectoryEntry, DirectoryFile } from '@/types/directory';
import { entriesNearSpot, kindLabel, sortDirectoryEntries } from '@/lib/directoryClient';
import {
  applyDirectoryProfiles,
  fetchDirectoryListings,
  fetchDirectoryProfiles,
  mergeDirectoryEntries,
  type DirectoryProfileOverlay,
} from '@/lib/directoryListings';
import { getSupabaseClient } from '@/lib/supabase';
import { safeExternalUrl } from '@/lib/safeUrl';
import type { SpotPageV6Copy } from '@/lib/translations/spotPage/v6';
import type { Spot } from '@/types';
import { decimalV6 } from './boiaFmt';
import { nivelDoSpot, spotDentroDoNivel, type NivelUtilizador } from '@/lib/mapDifficulty';
import { vizinhosDoNivel } from '@/lib/vizinhosNivel';
import { nivelCopyV6 } from '@/lib/translations/nivel';
import { PERTO_NIVEL_ID, porqueNivel } from './NivelAviso';

type Perto = DirectoryEntry & { distanceKm: number };

function useDiretorio(spotId: string, lat: number, lon: number): Perto[] {
  const [perto, setPerto] = useState<Perto[]>([]);
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      let base: DirectoryEntry[] = [];
      try {
        const r = await fetch('/data/directory.json');
        if (r.ok) base = ((await r.json()) as DirectoryFile).entries || [];
      } catch {
        /* sem diretório: o bloco não aparece */
      }
      let vivo: DirectoryEntry[] = [];
      let perfis = new Map<string, DirectoryProfileOverlay>();
      try {
        const sb = getSupabaseClient();
        if (sb) [vivo, perfis] = await Promise.all([fetchDirectoryListings(sb), fetchDirectoryProfiles(sb)]);
      } catch {
        /* só a semente estática */
      }
      if (cancelado) return;
      const todos = applyDirectoryProfiles(mergeDirectoryEntries(base, vivo), perfis);
      const near = entriesNearSpot(todos, spotId, lat, lon, { maxKm: 12, limit: 24 });
      const dist = new Map(near.map((n) => [n.id, n.distanceKm]));
      setPerto(
        sortDirectoryEntries(near)
          .slice(0, 6)
          .map((e) => ({ ...e, distanceKm: dist.get(e.id) ?? 0 })),
      );
    })();
    return () => {
      cancelado = true;
    };
  }, [spotId, lat, lon]);
  return perto;
}

export interface PertoV6Props {
  spot: Spot;
  locale: string;
  copy: SpotPageV6Copy;
  /** Hora escolhida na régua (ISO local) e modalidade da página. */
  t?: string;
  sport: SportType;
  /** #nivel-ui: com o spot acima do nível escolhido, abre com «Do teu nível, perto daqui». */
  nivel?: NivelUtilizador | null;
}

export default function PertoV6({ spot, locale, copy: c, t, sport, nivel = null }: PertoV6Props) {
  const tr = getTranslation(locale);
  const tc = tr.spotPageContext;
  const dir = tr.directory;
  const isPt = locale === 'pt';
  const raiz = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<MapHoursFile | null>(null);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const carrega = () => {
      void fetchMapHours().then((f) => {
        setFile(f);
        setCarregado(true);
      });
    };
    if (!('IntersectionObserver' in window)) {
      carrega();
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          carrega();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const vizinhos = useMemo(() => nearestSpots(spot, spots, { limit: 5 }), [spot]);
  const passo = pickMapHourStep(file?.times ?? [], t);
  const diretorio = useDiretorio(spot.id, spot.lat, spot.lon);
  const cn = nivelCopyV6(locale);
  const acima = !!nivel && !spotDentroDoNivel(nivelDoSpot(spot, sport), nivel);
  const doNivel = useMemo(
    () => (acima && nivel ? vizinhosDoNivel(spot, spots, sport, nivel, file, passo) : []),
    [acima, nivel, spot, sport, file, passo],
  );
  const mod = sport === 'kitesurf' ? 'kite' : 'surf';

  return (
    <div className="ctx-bloco" id="perto" role="group" aria-labelledby="perto-t" ref={raiz}>
      <h2 className="ctx-t" id="perto-t">
        {c.perto}
      </h2>
      {acima && nivel ? (
        <div className="ctx-item nv-perto" id={PERTO_NIVEL_ID} data-ctx="nivel" data-testid="perto-nivel">
          <h3>{cn.pertoT}</h3>
          <p>
            {porqueNivel(spot, mod, cn)}{' '}
            {doNivel.length
              ? cn.pertoSub(nivel, Math.max(1, Math.ceil(Math.max(...doNivel.map((v) => v.distanceKm)))))
              : cn.nenhumPerto(nivel)}
          </p>
          {doNivel.length ? (
            <ul>
              {doNivel.map((v) => (
                <li key={v.spot.id}>
                  <a href={`/${locale}/spots/${v.spot.slug}/?d=${mod}`} data-spot={v.spot.id}>
                    <span className="nm">
                      <b>{isPt ? v.spot.name : v.spot.nameEn || v.spot.name}</b>
                      <span className="km">{cn.pertoKm(decimalV6(formatDistance(v.distanceKm, locale), locale), v.nivel)}</span>
                    </span>
                    {typeof v.nota === 'number' && v.score != null ? (
                      <span className="pt-nota" style={bandaVars(bandaDe(v.nota)) as React.CSSProperties} data-score-tier={getScoreTokens(v.score).tier}>
                        {v.nota}
                      </span>
                    ) : v.nota === 'noite' ? (
                      <span className="pt-nota noite" style={bandaVars('noite') as React.CSSProperties} role="img" aria-label={c.pertoNoiteAria}>
                        {c.pertoNoite}
                      </span>
                    ) : (
                      <span className="pt-nota vazio">–</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <a className="ctx-link" href={`/${locale}/`}>
              {cn.verCosta}
            </a>
          )}
        </div>
      ) : null}
      <div className="ctx-item" data-ctx="vizinhos">
        <h3 className="ctx-rot">{tc.nearbySpots}</h3>
        {vizinhos.length ? (
          <>
            <ul className="pt-lista" data-testid="nearby-spots">
              {vizinhos.map((e) => {
                const s = e.spot;
                const pratica = !s.compatibleSports?.length || s.compatibleSports.includes(sport);
                const hora = file && pratica ? nearbySpotHour(file, e, sport, passo) : null;
                const score = typeof hora === 'number' ? hora : null;
                const nota = score != null ? scoreToNota(score) : null;
                return (
                  <li key={s.id}>
                    <a href={`/${locale}/spots/${s.slug}/?sport=${sport}`} className="pt-spot" data-nearby-spot={s.id}>
                      {nota != null && score != null ? (
                        <span
                          className="pt-nota"
                          style={bandaVars(bandaDe(nota)) as React.CSSProperties}
                          data-nearby-score={s.id}
                          data-score-tier={getScoreTokens(score).tier}
                        >
                          {nota}
                        </span>
                      ) : hora === 'noite' ? (
                        /* Noite (#218 D3): chip v6 `noite` em vez de «–». */
                        <span
                          className="pt-nota noite"
                          style={bandaVars('noite') as React.CSSProperties}
                          role="img"
                          aria-label={c.pertoNoiteAria}
                          data-nearby-score={s.id}
                          data-nearby-night=""
                        >
                          {c.pertoNoite}
                        </span>
                      ) : (
                        <span
                          className="pt-nota vazio"
                          aria-label={carregado && !pratica ? tc.notPracticedHere : undefined}
                          data-nearby-score={s.id}
                        >
                          –
                        </span>
                      )}
                      <span className="pt-nome">
                        <b data-nearby-name={s.id}>{isPt ? s.name : s.nameEn}</b>
                        <small>
                          {isPt ? s.region : s.regionEn} · {decimalV6(formatDistance(e.distanceKm, locale), locale)}
                        </small>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <p className="ctx-nota">{c.pertoNota}</p>
          </>
        ) : (
          <p className="ctx-nota">{tc.noNearbySpots}</p>
        )}
      </div>

      {diretorio.length ? (
        <div className="ctx-item" data-ctx="diretorio" aria-labelledby="spot-nearby-directory">
          <h3 className="ctx-rot" id="spot-nearby-directory">
            {dir.nearbySchoolsTitle}
          </h3>
          <ul className="pt-lista">
            {diretorio.map((e) => {
              const site = e.website ? safeExternalUrl(e.website) : null;
              return (
                <li key={e.id} className="pt-dir" data-directory-entry={e.id}>
                  {e.source !== 'submitted' ? (
                    <Link href={`/${locale}/diretorio/${e.slug}/`} className="pt-dir-n">
                      {isPt ? e.name : e.nameEn || e.name}
                    </Link>
                  ) : (
                    <b className="pt-dir-n">{isPt ? e.name : e.nameEn || e.name}</b>
                  )}
                  <small>
                    {kindLabel(e.kind, locale)} · {decimalV6(formatDistance(e.distanceKm, locale), locale)}
                    {e.verified ? ` · ${dir.verified}` : ''}
                  </small>
                  {site ? (
                    <a className="ctx-link" href={site} target="_blank" rel="noopener noreferrer">
                      {c.site}
                      <ExternalLink aria-hidden="true" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <Link className="ctx-link" href={`/${locale}/diretorio/`}>
            {dir.directoryArrow}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
