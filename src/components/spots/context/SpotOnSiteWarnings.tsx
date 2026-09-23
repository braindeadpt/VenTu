'use client';

import { useEffect, useState } from 'react';
import { CloudRain, ExternalLink } from 'lucide-react';
import { getAssetPath } from '@/lib/paths';
import { getTranslation } from '@/lib/i18n';
import {
  relevantWarningsForSpot,
  ipmaRadarUrl,
  warningsSourceLabel,
  type IpmaWarningsData,
} from '@/lib/ipmaWarnings';
import SpotWarningsSection from '@/components/spots/SpotWarningsSection';
import CoastalNavWarnings from '@/components/spots/CoastalNavWarnings';

interface SpotOnSiteWarningsProps {
  spotId: string;
  locale: string;
}

/**
 * Bloco «avisos» da coluna «No local» (SPOT-PAGE.md §6). Composição sem
 * tocar no SpotWarningsSection:
 *  - a carregar / com avisos IPMA → o componente existente, completo (lista,
 *    fonte, radar, avisos costeiros IH incluídos por dentro);
 *  - zero avisos IPMA → estado vazio da spec («Sem avisos activos · fonte,
 *    hh:mm» — fetchedAt real do ficheiro) + CoastalNavWarnings directo (o
 *    componente auto-esconde-se quando não há cobertura) + link do radar.
 * O fetch duplica o do SpotWarningsSection no ramo com avisos — mesmo URL,
 * cache HTTP do browser cobre-o (ficheiro pequeno, ~dezenas de KB).
 */
export default function SpotOnSiteWarnings({ spotId, locale }: SpotOnSiteWarningsProps) {
  const tc = getTranslation(locale).spotPageContext;
  const isPt = locale === 'pt';
  const [data, setData] = useState<IpmaWarningsData | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(getAssetPath('/data/warnings.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setData(d as IpmaWarningsData | null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Só o ramo «zero avisos com fetch OK» usa o estado vazio da spec; em
  // carga/erro delega-se ao componente (que mostra os seus próprios estados).
  // excludeSafetyNavWarnings: os perigos à navegação já estão na faixa §0 —
  // «No local» lista só os informativos (decisão de integração S3).
  if (data == null || relevantWarningsForSpot(data, spotId).length > 0) {
    return (
      <SpotWarningsSection
        embedded
        spotId={spotId}
        locale={locale}
        excludeSafetyNavWarnings
      />
    );
  }

  const hhmm = data?.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString(isPt ? 'pt-PT' : 'en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-meta-sm text-fg-muted" data-testid="on-site-no-warnings">
          {tc.noWarnings} · {warningsSourceLabel(data, isPt)}
          {hhmm ? ` · ${hhmm}` : ''}
        </p>
        <a
          href={ipmaRadarUrl(locale)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 min-h-[44px] -my-2 text-meta-sm font-medium text-data-waves hover:text-data-waves/80 transition-colors"
        >
          <CloudRain className="w-4 h-4 shrink-0" aria-hidden />
          {tc.rainRadar}
          <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </a>
      </div>
      {/* Sem avisos IPMA a camada costeira IH continua a poder estar em
          vigor — o componente decide sozinho se renderiza. Em «No local»
          estes avisos são informação (avistamentos, editais): tone="info"
          tira o aspecto de alarme; os perigos reais vivem na faixa §0 e
          são excluídos aqui (excludeSafety) para não duplicar. */}
      <CoastalNavWarnings spotId={spotId} locale={locale} tone="info" excludeSafety />
    </>
  );
}
