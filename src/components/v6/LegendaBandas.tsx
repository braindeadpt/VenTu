/** Legenda das bandas (escala da #210) com a frase da cena (#184). */
import { BANDAS_ORDEM } from '@/lib/modalidades';
import { bandaVars } from '@/lib/v6Tokens';
import type { CSSProperties } from 'react';

export default function LegendaBandas({ nomes, texto }: { nomes: Record<string, string>; texto?: string }) {
  return (
    <div className="leg" data-testid="legenda-bandas">
      {BANDAS_ORDEM.map((b) => (
        <span key={b} className="chip" style={bandaVars(b) as CSSProperties}>
          {nomes[b]}
        </span>
      ))}
      {texto ? <span className="txt">{texto}</span> : null}
    </div>
  );
}
