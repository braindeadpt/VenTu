'use client';

/**
 * Avisos e radar de «No local» (v6): ciclone tropical cujo cone cobre o spot
 * (NHC), eco do radar IPMA medido sobre/perto do spot, avisos IPMA/MeteoAlarm
 * da área (ou o estado vazio com a fonte e a hora real do ficheiro) e o link
 * do radar. Os perigos à navegação vivem na faixa de segurança; aqui ficam os
 * avisos costeiros IH informativos (CoastalNavWarnings tone="info").
 * Markup v6 nativo (`.av*` em v6-atlantico.css).
 */
import { useEffect, useState } from 'react';
import { CloudLightning, CloudRain, ExternalLink } from 'lucide-react';
import { getAssetPath } from '@/lib/paths';
import { getTranslation } from '@/lib/i18n';
import { DATE_LOCALE } from '@/lib/dataFreshness';
import {
  ipmaRadarUrl,
  relevantWarningsForSpot,
  warningLevelLabel,
  warningTypeLabel,
  warningsSourceLabel,
  type IpmaWarningsData,
} from '@/lib/ipmaWarnings';
import { loadNhcStorms, stormsForSpot, stormsFresh, mphToKmh, movementCardinal, type NhcStormsFile } from '@/lib/nhcStorms';
import { loadStormState, stormStateForSpot, radarStateFresh, type StormStateFile } from '@/lib/stormState';
import { radarFrameClock } from '@/lib/ipmaRadar';
import CoastalNavWarnings from '@/components/spots/CoastalNavWarnings';

function ate(iso: string | undefined, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(DATE_LOCALE[locale] ?? 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  });
}

export default function AvisosV6({ spotId, locale }: { spotId: string; locale: string }) {
  const t = getTranslation(locale);
  const tc = t.spotPageContext;
  const tsu = t.spotsUi;
  const isPt = locale === 'pt';
  const [avisos, setAvisos] = useState<IpmaWarningsData | null | undefined>(undefined);
  const [nhc, setNhc] = useState<NhcStormsFile | null>(null);
  const [radar, setRadar] = useState<StormStateFile | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(getAssetPath('/data/warnings.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelado) setAvisos(d as IpmaWarningsData | null);
      })
      .catch(() => {
        if (!cancelado) setAvisos(null);
      });
    loadNhcStorms()
      .then((d) => {
        if (!cancelado) setNhc(d);
      })
      .catch(() => {});
    loadStormState()
      .then((d) => {
        if (!cancelado) setRadar(d);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const ciclones = nhc && stormsFresh(nhc) ? stormsForSpot(nhc, spotId) : [];
  const eco = radar && radarStateFresh(radar) ? stormStateForSpot(radar, spotId)?.radar : null;
  const lista = relevantWarningsForSpot(avisos, spotId);
  const hhmm = avisos?.fetchedAt
    ? new Date(avisos.fetchedAt).toLocaleTimeString(isPt ? 'pt-PT' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Lisbon',
      })
    : null;

  const ecoTxt = (() => {
    if (!eco || eco.state === 'clean') return null;
    const sobre = eco.state === 'over';
    const intens =
      eco.intensity === 'heavy' ? tc.stormIntensityHeavy : eco.intensity === 'moderate' ? tc.stormIntensityModerate : tc.stormIntensityLight;
    const titulo = sobre
      ? tc.stormRainOver
      : tc.stormRainNear.replace('{km}', String(eco.distKm ?? '—')).replace('{dir}', movementCardinal(eco.dirDeg, isPt) ?? '—');
    const partes: string[] = [intens];
    if (eco.approach?.state === 'approaching') {
      const de = eco.approach.deg != null ? (eco.approach.deg + 180) % 360 : null;
      partes.push(
        tc.stormRainApproach
          .replace('{dir}', movementCardinal(de, isPt) ?? '—')
          .replace('{kmh}', eco.approach.kmh != null ? String(eco.approach.kmh) : '—'),
      );
    } else if (eco.approach?.state === 'receding') {
      partes.push(tc.stormRainRecede);
    }
    const hora = radar ? radarFrameClock(radar.radar.frameTime) : null;
    if (hora) partes.push(tc.stormRadarSource.replace('{time}', hora));
    const nivel = sobre && eco.intensity === 'heavy' ? 'red' : sobre ? 'orange' : 'yellow';
    return { titulo, meta: partes.join(' · '), nivel };
  })();

  return (
    <div className="av" data-visual-dynamic>
      {ciclones.length ? (
        <ul className="av-lista">
          {ciclones.map((s) => (
            <li key={s.id ?? s.name ?? 'ciclone'} className="av-aviso" data-nivel={s.classification === 'HU' || s.classification === 'MH' ? 'red' : 'orange'}>
              <p className="av-t">
                <CloudLightning aria-hidden="true" />
                {tc.stormConeTitle.replace('{name}', s.name ?? s.id ?? '—')}
              </p>
              <p className="av-meta">
                {tc.stormConeMeta
                  .replace('{cls}', s.classificationLabel ?? s.classification)
                  .replace('{km}', String(Math.round(s.centerDistKm)))
                  .replace('{dir}', movementCardinal(s.movementDirDeg, isPt) ?? '—')
                  .replace('{kmh}', s.movementSpeedMph != null ? String(mphToKmh(s.movementSpeedMph)) : '—')}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {ecoTxt ? (
        <div className="av-aviso" data-nivel={ecoTxt.nivel} data-radar-eco="true">
          <p className="av-t">
            <CloudRain aria-hidden="true" />
            {ecoTxt.titulo}
          </p>
          <p className="av-meta">{ecoTxt.meta}</p>
        </div>
      ) : null}

      {avisos === undefined ? null : avisos === null ? (
        <p className="ctx-nota">{tsu.warningsUnavailable}</p>
      ) : lista.length === 0 ? (
        <p className="av-vazio" data-testid="on-site-no-warnings">
          {tc.noWarnings} · {warningsSourceLabel(avisos, locale)}
          {hhmm ? ` · ${hhmm}` : ''}
        </p>
      ) : (
        <ul className="av-lista" data-testid="on-site-warnings">
          {lista.map((w) => (
            <li key={`${w.areaCode}-${w.type}-${w.level}`} className="av-aviso" data-nivel={w.level}>
              <p className="av-t">
                {warningTypeLabel(w.type, locale)}
                <span className="av-nivel">{warningLevelLabel(w.level, locale)}</span>
              </p>
              {w.endTime ? <p className="av-meta">{tsu.untilWord.replace('{date}', ate(w.endTime, locale))}</p> : null}
              {w.text ? <p className="av-meta">{w.text}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {avisos && lista.length > 0 ? (
        <p className="ctx-nota">
          {(avisos.source === 'meteoalarm' ? t.ipmaWarnings.sourceByAreaEumetnet : t.ipmaWarnings.sourceByAreaDistrict).replace(
            '{source}',
            warningsSourceLabel(avisos, locale),
          )}
        </p>
      ) : null}

      <a className="ctx-link" href={ipmaRadarUrl(locale)} target="_blank" rel="noopener noreferrer">
        <CloudRain aria-hidden="true" />
        {tc.rainRadar}
        <ExternalLink aria-hidden="true" />
      </a>

      {/* Avisos costeiros IH: informação (avistamentos, editais), sem aspecto de
          alarme; os perigos reais estão na faixa de segurança (excludeSafety). */}
      <CoastalNavWarnings spotId={spotId} locale={locale} tone="info" excludeSafety />
    </div>
  );
}
