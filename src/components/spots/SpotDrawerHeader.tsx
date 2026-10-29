'use client';

import { getTranslation } from '@/lib/i18n';
import ScoreGauge from '@/components/ui/ScoreGauge';
import { Waves, Wind, Thermometer, Zap } from 'lucide-react';
import type { JanelaSeguinte } from '@/lib/noiteListas';
import { JanelaNoite, LuaNoite } from '@/components/ui/NoiteJanela';

interface SpotDrawerHeaderProps {
  name: string;
  region: string;
  score: number;
  waveHeight: string;
  windKnots: string;
  wavePowerKw: string;
  waterTemp: string | number;
  locale: string;
  /** De noite: a lua no lugar do medidor e a próxima janela (opção A, 28/10). */
  noite?: { janela: JanelaSeguinte | null } | null;
}

export default function SpotDrawerHeader({
  name,
  region,
  score,
  waveHeight,
  windKnots,
  wavePowerKw,
  waterTemp,
  locale,
  noite = null,
}: SpotDrawerHeaderProps) {
  const isPt = locale === 'pt';

  return (
    <div className="flex items-start gap-4 pb-4 border-b border-divider">
      {noite ? <LuaNoite size={56} locale={locale} /> : <ScoreGauge score={score} size="sm" />}
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold text-fg truncate">{name}</h3>
        <p className="text-xs text-fg-muted">{region}</p>

        <div className="flex items-center gap-3 mt-2 text-xs text-fg-subtle">
          <span className="inline-flex items-center gap-1">
            <Waves className="w-3 h-3" />
            {waveHeight}m
          </span>
          <span className="inline-flex items-center gap-1">
            <Wind className="w-3 h-3" />
            {windKnots}kt
          </span>
          <span className="inline-flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {wavePowerKw} kW/m
          </span>
          <span className="inline-flex items-center gap-1">
            <Thermometer className="w-3 h-3" />
            {waterTemp}°C
          </span>
        </div>

        {noite ? (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-meta-sm" data-noite="">
            {noite.janela ? <span className="text-fg-muted">{getTranslation(locale).noite.proximaJanela}</span> : null}
            <JanelaNoite janela={noite.janela} locale={locale} />
          </p>
        ) : (
          <p className="text-meta-sm text-fg-subtle/60 mt-1">
            {getTranslation(locale).spotsMap.scoreForSelectedSport}
          </p>
        )}
      </div>
    </div>
  );
}
