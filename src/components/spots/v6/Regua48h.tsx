'use client';

/**
 * Régua de 48 horas (#184): uma barra por hora na cor da banda, noite baixa,
 * agulha na hora escolhida, eixo com 6h (só desktop) / 12h / 18h e os dias.
 * `role="slider"` operável por teclado (← → PageUp PageDown Home End) e por
 * arrasto; setas ‹ › de 44 × 44 px. Fixa em baixo no telemóvel, sticky no
 * topo no desktop (CSS).
 */
import { useRef, useState, type CSSProperties, type ReactNode, type KeyboardEvent, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { V6_BANDAS } from '@/lib/v6Tokens';
import type { BandaK } from '@/lib/modalidades';
import type { SpotPageV6Copy } from '@/lib/translations/spotPage/v6';
import { diaCurto, diaSemana, horaDe, horaTxt } from '@/lib/spotVeredicto';

export interface Regua48hProps {
  horas: ReadonlyArray<{ t: string; banda: BandaK; n: number | null; semDados?: boolean }>;
  i: number;
  onEscolhe: (i: number) => void;
  copy: SpotPageV6Copy;
  /** «Agora» fora da cobertura: nenhuma hora é rotulada «Agora». */
  semAgora?: boolean;
  /** Chip do aviso activo (acompanha a régua no scroll). */
  aviso?: ReactNode;
}

export default function Regua48h({ horas, i, onEscolhe, copy, semAgora = false, aviso }: Regua48hProps) {
  const faixa = useRef<HTMLDivElement>(null);
  const arrasta = useRef(false);
  // Desktop: pairar com o rato mostra hora e nota sem mudar a hora escolhida.
  const [paira, setPaira] = useState<number | null>(null);
  const N = horas.length;
  const h = horas[i];
  if (!h) return null;
  const idxDe = (e: PointerEvent) => {
    const r = faixa.current?.getBoundingClientRect();
    if (!r || !r.width) return i;
    return Math.floor(Math.max(0, Math.min(0.9999, (e.clientX - r.left) / r.width)) * N);
  };
  const tecla = (e: KeyboardEvent) => {
    const k = ({ ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageUp: -6, PageDown: 6 } as Record<string, number>)[e.key];
    if (k) {
      onEscolhe(Math.max(0, Math.min(N - 1, i + k)));
      e.preventDefault();
    } else if (e.key === 'Home') {
      onEscolhe(0);
      e.preventDefault();
    } else if (e.key === 'End') {
      onEscolhe(N - 1);
      e.preventDefault();
    }
  };
  const horaLbl = horaTxt(copy, horaDe(h.t));
  const out = `${i === 0 && !semAgora ? copy.agoraCap + ' · ' : ''}${diaCurto(copy, h.t)}, ${horaLbl}`;
  const valueText = (h.n != null ? copy.reguaValorNota : copy.reguaValor)
    .replace('{dia}', diaCurto(copy, h.t))
    .replace('{h}', horaLbl)
    .replace('{banda}', h.semDados ? copy.semDadosPal : copy.bandas[h.banda])
    .replace('{n}', String(h.n));
  return (
    <section className="regua" id="quando" aria-labelledby="regua-t" data-testid="regua-48h">
      <div className="r-cab">
        <h2 id="regua-t">{copy.regua}</h2>
        {aviso}
        <button type="button" aria-label={copy.horaAnterior} disabled={i === 0} onClick={() => onEscolhe(i - 1)}>
          <ChevronLeft strokeWidth={2.6} aria-hidden="true" />
        </button>
        <output className="num" aria-live="off" data-testid="regua-hora">
          {out}
        </output>
        <button type="button" aria-label={copy.horaSeguinte} disabled={i === N - 1} onClick={() => onEscolhe(i + 1)}>
          <ChevronRight strokeWidth={2.6} aria-hidden="true" />
        </button>
      </div>
      <div
        className="faixa-wrap"
        role="slider"
        tabIndex={0}
        aria-label={copy.reguaAria}
        aria-valuemin={0}
        aria-valuemax={N - 1}
        aria-valuenow={i}
        aria-valuetext={valueText}
        onKeyDown={tecla}
        onPointerDown={(e) => {
          arrasta.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          onEscolhe(idxDe(e));
        }}
        onPointerMove={(e) => {
          if (arrasta.current) {
            const j = idxDe(e);
            if (j !== i) onEscolhe(j);
          } else if (e.pointerType === 'mouse') {
            const j = idxDe(e);
            if (j !== paira) setPaira(j);
          }
        }}
        onPointerLeave={() => setPaira(null)}
        onPointerUp={() => (arrasta.current = false)}
        onPointerCancel={() => (arrasta.current = false)}
      >
        <div className="faixa" ref={faixa}>
          {horas.map((x, j) => (
            <i
              key={x.t}
              className={`${x.banda === 'noite' ? 'noite' : ''}${horaDe(x.t) === 0 && j ? ' d0' : ''}`}
              style={{ '--c': V6_BANDAS[x.banda].c } as CSSProperties}
              data-banda={x.banda}
              data-sem-dados={x.semDados ? '' : undefined}
            />
          ))}
        </div>
        <div className="agulha" style={{ left: `${((i + 0.5) / N) * 100}%` }} />
        {paira != null && horas[paira] ? (
          <div
            className="r-tip num"
            role="tooltip"
            data-testid="spot-rail-tooltip"
            style={{ left: `${(((paira + 0.5) / N) * 100).toFixed(2)}%` }}
          >
            {diaCurto(copy, horas[paira].t)}, {horaTxt(copy, horaDe(horas[paira].t))} ·{' '}
            {horas[paira].n != null ? `${horas[paira].n}/10` : horas[paira].semDados ? copy.semDadosPal : copy.bandas[horas[paira].banda]}
          </div>
        ) : null}
      </div>
      <div className="eixo" aria-hidden="true">
        {horas.map((x, j) => {
          const k = horaDe(x.t);
          if (k === 0)
            return (
              <span key={x.t} className="dia" style={{ left: `${((j / N) * 100).toFixed(2)}%` }}>
                {copy.dias[diaSemana(x.t)].toUpperCase()} {+x.t.slice(8, 10)}
              </span>
            );
          if ((k === 12 || k === 18 || k === 6) && j > 1)
            return (
              <span key={x.t} className={k === 6 ? 'so-d' : undefined} style={{ left: `${(((j + 0.5) / N) * 100).toFixed(2)}%` }}>
                {horaTxt(copy, k)}
              </span>
            );
          return null;
        })}
      </div>
    </section>
  );
}
