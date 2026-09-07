'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Shield, SlidersHorizontal, Waves, Wind } from 'lucide-react';
import {
  PROVENANCE_ICON_CLASS,
  PROVENANCE_SIZE_CLASS,
  PROVENANCE_TIER_CLASS,
  provenanceAxisAria,
  type ProvenanceAxis,
  type ProvenanceSize,
  type ProvenanceTier,
} from '@/lib/provenance';
import { cn } from '@/lib/cn';

/** Glifo por eixo — o mesmo símbolo diz sempre a mesma grandeza. */
const AXIS_ICON: Record<ProvenanceAxis, typeof Waves> = {
  wave: Waves,
  wind: Wind,
  calibration: SlidersHorizontal,
  confidence: Shield,
  freshness: Clock,
};

export interface ProvenanceChipProps {
  axis: ProvenanceAxis;
  tier: ProvenanceTier;
  /** Texto visível. É o `textContent` exacto do chip — sem sufixos escondidos. */
  label: string;
  /**
   * Explicação longa: tooltip nativo no hover E corpo do popover no clique.
   * Sem `detail` o chip é estático (nada para revelar).
   */
  detail?: string | null;
  locale?: string;
  size?: ProvenanceSize;
  /** Substitui o glifo do eixo (a confiança varia o escudo com o tier). */
  icon?: ReactNode;
  /**
   * `false` força um `<span>` estático. Necessário dentro de cards que são
   * um `<a>` inteiro: um `<button>` dentro de um link é HTML inválido e
   * rouba o alvo de toque ao card.
   */
  interactive?: boolean;
  /**
   * Papel semântico do chip (só os dois usados pelo domínio). Sem `role`, o
   * chip estático com detalhe é uma `note`. A confiança passa `'status'`: é
   * uma live region — o leitor de ecrã anuncia quando o valor muda.
   */
  role?: 'note' | 'status';
  /** Substitui o nome acessível (quando o detalhe não deve virar tooltip). */
  ariaLabel?: string;
  className?: string;
  /** `data-*` extra no chip (contratos de selector já existentes). */
  chipAttrs?: Record<string, string>;
  /** `data-*` extra no popover (idem). */
  popoverAttrs?: Record<string, string>;
}

/**
 * O único chip de proveniência do VenTu.
 *
 * Um chip = uma afirmação sobre a origem de um número. Todos partilham forma
 * (pill), peso de borda, escala de texto, glifo por eixo e — o que mais falta
 * fazia — UM mecanismo de detalhe: `title` para o hover no rato e um popover
 * real (portalizado, fechável com Escape ou clique fora) para toque e teclado.
 * Antes, cinco destes seis chips só tinham `title`, que no telemóvel é
 * simplesmente invisível: a explicação existia e ninguém lhe chegava.
 *
 * Este componente não escreve copy. As frases vêm do domínio, que é quem sabe
 * se a onda foi medida, corrigida ou prevista.
 */
export default function ProvenanceChip({
  axis,
  tier,
  label,
  detail,
  locale = 'pt',
  size = 'sm',
  icon,
  interactive = true,
  role: roleProp,
  ariaLabel: ariaLabelProp,
  className,
  chipAttrs,
  popoverAttrs,
}: ProvenanceChipProps) {
  const isPt = locale === 'pt' || locale.startsWith('pt');
  const Icon = AXIS_ICON[axis];
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const id = useId();

  const disclosable = interactive && Boolean(detail);

  // Posiciona (e reposiciona em scroll/resize — os chips vivem em barras
  // sticky e heros com scroll próprio) o popover junto do chip: por baixo, ou
  // por cima quando não há espaço.
  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    if (!button) return;
    let raf = 0;
    const update = () => {
      const rect = button.getBoundingClientRect();
      const pop = popoverRef.current;
      const width = pop?.offsetWidth ?? 0;
      const height = pop?.offsetHeight ?? 120;
      const flip =
        rect.bottom + 6 + height > window.innerHeight && rect.top - 6 - height > 0;
      setPos({
        top: flip ? rect.top - 6 - height : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      });
    };
    update();
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    // Captura: apanha scroll em contentores internos, não só na janela.
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shape = cn(
    'inline-flex items-center rounded-pill border font-medium whitespace-nowrap',
    PROVENANCE_TIER_CLASS[tier],
    PROVENANCE_SIZE_CLASS[size],
    className,
  );

  const ariaLabel =
    ariaLabelProp ??
    `${provenanceAxisAria(axis, isPt)}: ${label}${detail ? `. ${detail}` : ''}`;

  // O texto do rótulo vive DIRECTO no elemento-raiz (com o title), não num
  // span aninhado: era essa a forma do DOM antes da unificação, e é o que
  // mantém selectores de texto (getByText), de atributo ([title*=]) e de papel
  // a resolverem todos para O MESMO elemento com title. Um span interno
  // partiria getByText (achava um nó sem title) ou, com title, duplicava o nó
  // acessível dentro do <button> (getByRole strict mode). O espaçamento
  // ícone↔texto vem do `gap` do flex na raiz.
  const body = (
    <>
      {icon ?? <Icon className={PROVENANCE_ICON_CLASS[size]} aria-hidden />}
      {label}
    </>
  );

  const dataAttrs = {
    'data-provenance-axis': axis,
    'data-provenance-tier': tier,
    ...chipAttrs,
  };

  if (!disclosable) {
    return (
      <span
        {...dataAttrs}
        className={shape}
        title={detail ?? undefined}
        aria-label={ariaLabel}
        role={roleProp ?? (detail ? 'note' : undefined)}
      >
        {body}
      </span>
    );
  }

  // O chip vive dentro de superfícies clicáveis: o clique revela o detalhe e
  // nunca navega no pai.
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        {...dataAttrs}
        type="button"
        ref={buttonRef}
        role={roleProp ?? undefined}
        aria-expanded={open}
        aria-controls={`${id}-popover`}
        aria-label={ariaLabel}
        onClick={toggle}
        title={detail ?? undefined}
        className={cn(shape, 'cursor-pointer')}
      >
        {body}
      </button>
      {typeof document !== 'undefined' &&
        open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            id={`${id}-popover`}
            role="tooltip"
            data-provenance-popover="true"
            {...popoverAttrs}
            className="fixed z-[5000] w-max max-w-[min(320px,calc(100vw-16px))] rounded-lg border border-divider bg-bg-elevated px-3 py-2 text-xs leading-relaxed text-fg shadow-card"
            style={{ top: pos.top, left: pos.left }}
          >
            {detail}
          </div>,
          document.body,
        )}
    </>
  );
}
