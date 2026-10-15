/** Frase do motor da home (#183) com as únicas marcas que ele escreve: `<b>` e `<em>` (a banda, em chip). */
import type { CSSProperties } from 'react';
import { partesFrase } from '@/lib/home/homeV6';
import { bandaVars } from '@/lib/v6Tokens';
import type { BandaK } from '@/lib/modalidades';

export default function Frase({ txt, banda, pal }: { txt: string; banda: BandaK; pal?: string | null }) {
  const partes = partesFrase(txt);
  return (
    <>
      {partes.map((p, k) => {
        if (p.em)
          return (
            <em key={k} className="chip" style={bandaVars(banda) as CSSProperties}>
              {p.t}
            </em>
          );
        if (p.b) return <b key={k}>{p.t}</b>;
        if (pal && p.t.startsWith(pal))
          return (
            <span key={k}>
              <em className="chip" style={bandaVars(banda) as CSSProperties}>
                {pal}
              </em>
              {p.t.slice(pal.length)}
            </span>
          );
        return <span key={k}>{p.t}</span>;
      })}
    </>
  );
}
