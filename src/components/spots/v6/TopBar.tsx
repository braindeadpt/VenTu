'use client';

/** Barra de topo sobre a foto (#184): «‹ Costa» (volta à home) + ModalidadeToggle. */
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import ModalidadeToggle from '@/components/v6/ModalidadeToggle';
import type { Modalidade } from '@/lib/modalidades';
import type { SpotPageV6Copy } from '@/lib/translations/spotPage/v6';

export default function TopBar({
  locale,
  copy,
  d,
  onModalidade,
}: {
  locale: string;
  copy: SpotPageV6Copy;
  d: Modalidade;
  onModalidade: (d: Modalidade) => void;
}) {
  return (
    <header className="top">
      <Link className="voltar" href={`/${locale}/`} aria-label={copy.voltarAria}>
        <ChevronLeft size={22} strokeWidth={2.6} aria-hidden="true" />
        <span aria-hidden="true">{copy.voltar}</span>
      </Link>
      <span className="esp" />
      <ModalidadeToggle valor={d} onChange={onModalidade} rotulos={copy.modalidades} ariaLabel={copy.modalidadeAria} />
    </header>
  );
}
