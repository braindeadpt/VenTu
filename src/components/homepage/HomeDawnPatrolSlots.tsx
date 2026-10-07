'use client';

import { useEffect, useState } from 'react';
import DawnPatrolBanner from '@/components/DawnPatrolBannerWrapper';
import WaveDivider from '@/components/ui/WaveDivider';
import { isDawnPatrolWindow } from '@/lib/dawnPatrolHours';

/** Atributo carimbado no <html> pelo bootstrap pré-paint (layout.tsx) quando
 *  a hora local está na janela do Dawn Patrol. Mesmo relógio que
 *  `isDawnPatrolWindow` (05h–12h, hora do browser). */
export const DAWN_WINDOW_ATTR = 'data-dawn-window';

/**
 * Slot de topo SEM layout shift.
 *
 * Antes renderizava `null` até ao mount (isMorning só existe no cliente) e o
 * banner aparecia depois da hidratação, empurrando o conteúdo (CLS de manhã).
 * Agora o SSR traz sempre o slot com o skeleton do banner (o espaço fica
 * reservado desde o primeiro paint) e o CSS esconde-o quando o bootstrap
 * pré-paint NÃO marcou a janela da manhã (`html:not([data-dawn-window])`).
 * Depois do mount, fora da janela, o slot sai da árvore — já estava escondido,
 * por isso não há salto visível em nenhum dos casos.
 */
export function DawnPatrolTopSlot({ locale }: { locale: string }) {
  const [isMorning, setIsMorning] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => {
      const morning = isDawnPatrolWindow();
      // Mantém o carimbo do <html> coerente em sessões longas / navegação SPA.
      document.documentElement.toggleAttribute(DAWN_WINDOW_ATTR, morning);
      setIsMorning(morning);
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (isMorning === false) return null;

  return (
    <div className="dawn-top-slot" data-dawn-slot="top">
      <WaveDivider flip />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-4">
        <DawnPatrolBanner locale={locale} />
      </div>
    </div>
  );
}

export function DawnPatrolBottomSlot({ locale }: { locale: string }) {
  const [isMorning, setIsMorning] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setIsMorning(isDawnPatrolWindow());
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (isMorning) return null;

  return (
    <div className="hydration-dawn-slot">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <DawnPatrolBanner locale={locale} />
      </div>
    </div>
  );
}
