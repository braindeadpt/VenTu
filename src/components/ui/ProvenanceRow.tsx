import { cn } from '@/lib/cn';

interface ProvenanceRowProps {
  /**
   * Chips de proveniência, já pela ordem canónica de PROVENANCE_AXIS_ORDER:
   * onda → vento → calibração → confiança → frescura.
   */
  children: React.ReactNode;
  align?: 'start' | 'center';
  className?: string;
}

/**
 * A fila de proveniência.
 *
 * Existe para uma coisa só: garantir que o espaçamento e o alinhamento dos
 * chips são os mesmos no hero, na sticky bar e nos cards. Uma fila com `gap-1`
 * num sítio e `gap-1.5` noutro parece dois sistemas diferentes ao olho, mesmo
 * quando os chips são idênticos.
 *
 * A ORDEM é responsabilidade de quem compõe (PROVENANCE_AXIS_ORDER): mantê-la
 * fixa é o que permite ao utilizador procurar sempre no mesmo sítio.
 */
export default function ProvenanceRow({
  children,
  align = 'start',
  className,
}: ProvenanceRowProps) {
  return (
    <div
      data-provenance-row
      className={cn(
        'flex flex-wrap items-center gap-1',
        align === 'center' ? 'justify-center' : 'justify-start',
        className,
      )}
    >
      {children}
    </div>
  );
}
