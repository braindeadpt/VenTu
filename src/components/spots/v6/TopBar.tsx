'use client';

/** Barra de topo sobre a foto (#184): «‹ Costa» (volta à home) + nível (#nivel-ui) + ModalidadeToggle. */
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import ModalidadeToggle from '@/components/v6/ModalidadeToggle';
import NivelControl from '@/components/v6/NivelControl';
import type { MapDifficultyFilter, NivelUtilizador } from '@/lib/mapDifficulty';
import type { NivelCopy } from '@/lib/translations/nivel';
import type { Modalidade } from '@/lib/modalidades';
import type { SpotPageV6Copy } from '@/lib/translations/spotPage/v6';

export default function TopBar({
  locale,
  copy,
  d,
  onModalidade,
  nivel,
  onNivel,
  cn,
  menuNivel,
  onMenuNivel,
}: {
  locale: string;
  copy: SpotPageV6Copy;
  d: Modalidade;
  onModalidade: (d: Modalidade) => void;
  nivel: NivelUtilizador | null;
  onNivel: (v: MapDifficultyFilter) => void;
  cn: NivelCopy;
  /** O menu do nível abre também pela dica do hero («Qual é o teu nível?»). */
  menuNivel: boolean;
  onMenuNivel: (v: boolean) => void;
}) {
  return (
    <header className="top">
      <Link className="voltar" href={`/${locale}/`} aria-label={copy.voltarAria}>
        <ChevronLeft size={22} strokeWidth={2.6} aria-hidden="true" />
        <span aria-hidden="true">{copy.voltar}</span>
      </Link>
      <span className="esp" />
      <NivelControl nivel={nivel} onEscolhe={onNivel} copy={cn} aberto={menuNivel} onAberto={onMenuNivel} />
      <ModalidadeToggle valor={d} onChange={onModalidade} rotulos={copy.modalidades} ariaLabel={copy.modalidadeAria} />
    </header>
  );
}
