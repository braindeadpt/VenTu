'use client';

import { AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buoyLayerCopy, useBuoyLayerNotice } from '@/lib/buoyLayerNotice';

/**
 * Honest notice when the measured-wave layer can't produce readings for a
 * spot: distinguishes "IH_API_KEY não configurada" from "IH em baixo", flags
 * stale readings, and names the WMO/Copernicus fallback state («WMO em baixo»)
 * when the cross-border fallback also has no fresh data. Renders nothing when
 * either source is healthy (IH or WMO fresh) or the spot already shows a
 * fresh buoy reading (parent gates on that).
 *
 * Dispensable: the «já vi» choice persists in localStorage (reason-specific)
 * until the layer heals — shared with the compact HUD chip via
 * `useBuoyLayerNotice`, so dismissing one surface hides both.
 *
 * `scope` adapts the copy: 'spot' (default) talks about "this page", 'home'
 * about "the map and cards" — the homepage has no single spot to point at.
 *
 * SEVERIDADE, na gramática de proveniência: só uma paragem real do serviço
 * (`down`) é `degraded`/vermelha. `stale` e `no-key` são `adjusted` — a altura
 * mostrada passou a ser previsão do modelo, o que é uma mudança de origem, não
 * uma avaria. Um painel vermelho para isso ensinava o utilizador a ler «isto
 * está partido» quando o produto está apenas a ser honesto — e, na homepage,
 * era a segunda coisa que uma visita nova lia.
 */
export default function BuoyLayerNotice({
  locale,
  scope = 'spot',
  overlay = false,
}: {
  locale: string;
  scope?: 'spot' | 'home';
  /** Over a map/image: give the card a solid backdrop + blur for readability. */
  overlay?: boolean;
}) {
  const isPt = locale === 'pt';
  const isHome = scope === 'home';
  const { status, wmo, dismissed, dismiss } = useBuoyLayerNotice();

  // O aviso só aparece quando NENHUMA fonte tem leituras frescas (se o WMO
  // cobre, o ObservedWaveCard renderiza e não há nada a avisar).
  if (!status) return null;
  // Dispensa persistida para EXACTAMENTE este estado: «já vi» → esconder.
  // Um estado diferente volta a avisar (ex. dispensou no-key, IH sobe e cai
  // depois → «down» é um problema novo).
  if (dismissed?.reason === status) return null;

  const dismissLabel = isPt ? 'Dispensar aviso das boias' : 'Dismiss buoy notice';
  const c = buoyLayerCopy(status, wmo, isPt, isHome);
  // Ver o bloco de SEVERIDADE acima: só `down` é uma avaria.
  const isDegraded = status === 'down';

  // Na homepage, um painel cheio acima da dobra grita. A mesma frase, com uma
  // régua de cor à esquerda em vez de fundo, informa sem alarmar. Sobre o mapa
  // (`overlay`) o fundo sólido volta, porque aí é legibilidade, não ênfase.
  const quiet = isHome && !overlay && !isDegraded;
  const Glyph = isDegraded ? AlertTriangle : Info;

  return (
    <div
      role="status"
      className={cn(
        'relative flex items-start gap-2.5 text-meta-sm pointer-events-auto text-fg',
        quiet
          ? 'border-l-2 border-score-fair/60 pl-3 pr-8 py-1'
          : cn(
              'rounded-card border p-3 pr-8',
              isDegraded ? 'border-score-poor/40' : 'border-score-fair/40',
              overlay
                ? 'bg-bg-elevated/95 backdrop-blur-sm shadow-card'
                : isDegraded
                  ? 'bg-score-poor/10'
                  : 'bg-score-fair/10',
            ),
      )}
    >
      <Glyph
        className={cn(
          'w-4 h-4 mt-0.5 shrink-0',
          isDegraded ? 'text-score-poor' : 'text-score-fair',
        )}
        aria-hidden
      />
      <p className={cn('leading-snug', quiet && 'text-fg-muted')}>
        <strong className={cn('font-semibold', quiet && 'text-fg')}>{c.title}: </strong>
        {c.body}
        {c.wmoNote}
      </p>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={dismiss}
        data-buoy-notice-dismiss="true"
        className="absolute top-1.5 right-1.5 rounded-full p-1 text-fg-muted transition-colors hover:text-fg hover:bg-bg-base/60"
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}
