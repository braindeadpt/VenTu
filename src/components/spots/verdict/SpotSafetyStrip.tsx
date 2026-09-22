'use client';

import SeaStateSafetyBanner from '@/components/spots/SeaStateSafetyBanner';
import SpotSafetyCoastalWarnings from '@/components/spots/verdict/SpotSafetyCoastalWarnings';

/**
 * Secção 0 do contrato — faixa de segurança. Só aparece com aviso de
 * segurança REAL (S2A-fix2: avisos informativos criavam fadiga de alarme):
 *
 *  - SeaStateSafetyBanner: IPMA «Agitação Marítima» de amarelo para cima —
 *    «Mar perigoso — não surfar», role=alert, nunca dentro de accordion.
 *  - SpotSafetyCoastalWarnings: avisos IH só das categorias de perigo à
 *    navegação (isSafetyNavWarning) — os informativos (animais marinhos,
 *    editais, portarias, regulamentos) continuam na secção «No local».
 *
 * Os restantes avisos IPMA (vento, chuva, trovoada, nevoeiro) também ficam
 * na «No local» — a faixa é só para o que ameaça a sessão.
 */
export default function SpotSafetyStrip({
  spotId,
  locale,
}: {
  spotId: string;
  locale: string;
}) {
  return (
    <>
      <SeaStateSafetyBanner spotId={spotId} locale={locale} />
      <SpotSafetyCoastalWarnings spotId={spotId} locale={locale} />
    </>
  );
}
