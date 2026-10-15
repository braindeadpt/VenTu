'use client';

/**
 * Régua de blocos da home v6 (#183): «HOJE · 14H» / «AMANHÃ», um botão por
 * bloco com a melhor nota da costa nesse período no fill da banda (o nº 1 da
 * lista desse bloco); o escolhido com anel e `aria-pressed`; ≥ 44 px. Fixa em
 * baixo no telemóvel, estática por baixo do topo no desktop. Botões nativos:
 * Tab + Enter/Espaço; ← → movem entre blocos.
 */
import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { bandaVars } from '@/lib/v6Tokens';
import type { EstadoHome } from '@/lib/home/estadoHome';
import type { HomeV6Copy } from '@/lib/translations/homeV6';

export default function ReguaBlocos({ E, copy: c, onEscolhe }: { E: EstadoHome; copy: HomeV6Copy; onEscolhe: (id: string) => void }) {
  const raiz = useRef<HTMLDivElement>(null);
  const teclas = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const bs = Array.from(raiz.current?.querySelectorAll<HTMLButtonElement>('button.bloco') ?? []);
    const k = bs.indexOf(e.currentTarget);
    const n = bs[k + (e.key === 'ArrowRight' ? 1 : -1)];
    if (n) {
      e.preventDefault();
      n.focus();
      n.click();
    }
  };
  return (
    <section className="regua" aria-labelledby="regua-t" data-testid="home-regua">
      <h2 className="sr" id="regua-t">
        {c.reguaT}
      </h2>
      <div className="dias" role="group" aria-label={c.reguaAria} ref={raiz}>
        {E.regua.map((dia) => (
          <div key={dia.dia} className="dia" style={{ ['--n' as string]: dia.celulas.length } as CSSProperties}>
            <span className="dia-n">{dia.rot}</span>
            <div className="cels">
              {dia.celulas.map((cel) => (
                <button
                  key={cel.id}
                  type="button"
                  className="bloco"
                  data-b={cel.id}
                  data-spot={cel.spot}
                  data-nota={cel.n ?? ''}
                  aria-pressed={E.bId === cel.id}
                  aria-label={cel.aria}
                  style={bandaVars(cel.b) as CSSProperties}
                  onClick={() => onEscolhe(cel.id)}
                  onKeyDown={teclas}
                >
                  <span className="bar">
                    {cel.n ?? '–'}
                    {cel.marca != null ? <u style={{ left: `${cel.marca}%` }} /> : null}
                  </span>
                  <span className="bl">
                    {cel.rotulo === cel.rotuloCurto ? (
                      cel.rotulo
                    ) : (
                      <>
                        <span className="lg">{cel.rotulo}</span>
                        <span className="ct">{cel.rotuloCurto}</span>
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
