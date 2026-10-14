/**
 * «Estudar o spot» (#184): `<details>` fechado com a tabela hora a hora (as
 * mesmas horas e notas da régua) e a praia (orientação, janela de ondulação,
 * terral, regra da modalidade, maré, água, atenção, sol).
 */
import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  MOTOR,
  defDe,
  type AvaliacaoHora,
  type DefOnda,
  type DefVento,
  type Modalidade,
} from '@/lib/modalidades';
import type { HoraSpot } from '@/lib/horaSpot';
import type { EditorialSpot } from '@/lib/spotEditorial';
import { bandaR, diaCurto, fmtNum, horaDe, horaTxt, rumo } from '@/lib/spotVeredicto';
import { bandaVars } from '@/lib/v6Tokens';
import { fmtCopy, type SpotPageV6Copy } from '@/lib/translations/spotPage/v6';

export interface EstudarSpotProps {
  horas: readonly HoraSpot[];
  NS: readonly AvaliacaoHora[];
  i: number;
  d: Modalidade;
  ed: EditorialSpot;
  sol: Record<string, { nascer: string; por: string }>;
  atencao: string | null;
  melhorMare: string | null;
  copy: SpotPageV6Copy;
  locale: string;
  abertoInicial?: boolean;
}

function regraTxt(d: Modalidade, c: SpotPageV6Copy, locale: string): string {
  const P = defDe(d);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  if (P.logica === 'vento') {
    const pv = P as DefVento;
    const [lo, hi] = MOTOR.intervaloDa(pv.vento);
    return fmtCopy(c.regraVento, {
      lo: Math.ceil(lo ?? 0),
      hi: hi == null ? '' : fmtCopy(c.regraVentoHi, { hi: Math.floor(hi) }),
      tecto: pv.tecto[0],
    });
  }
  const po = P as DefOnda;
  const [lo, hi] = MOTOR.intervaloDa(po.tamanho);
  return fmtCopy(c.regraOnda, {
    lo: fmtNum(r1(lo ?? 0), locale),
    hi: hi == null ? '' : fmtCopy(c.regraOndaHi, { hi: fmtNum(r1(hi), locale) }),
    bom: po.periodo.bom,
  });
}

export default function EstudarSpot({ horas, NS, i, d, ed, sol, atencao, melhorMare, copy: c, locale, abertoInicial }: EstudarSpotProps) {
  const nf = (x: number) => (Number.isFinite(x) ? `${fmtNum(x, locale)} m` : '–');
  const agua = horas.find((h) => typeof h.agua === 'number')?.agua;
  return (
    <details className="estudo" id="estudo" open={abertoInicial || undefined} data-testid="estudar-spot">
      <summary>
        <h2>{c.estudar}</h2>
        <span className="mais">{c.horaAHora}</span>
        <ChevronDown strokeWidth={2.4} aria-hidden="true" />
      </summary>
      <div className="corpo">
        <div className="tabela" tabIndex={0} aria-label={c.horaAHora}>
          <table>
            <thead>
              <tr>
                <th scope="col">{c.colHora}</th>
                <th scope="col">{c.colNota}</th>
                <th scope="col">{c.colVento}</th>
                <th scope="col">{c.colRajadas}</th>
                <th scope="col">{c.colDir}</th>
                <th scope="col">{c.colOnda}</th>
                <th scope="col">{c.colPeriodo}</th>
                <th scope="col">{c.colMare}</th>
              </tr>
            </thead>
            <tbody>
              {horas.map((h, j) => {
                const r = NS[j];
                const b = bandaR(r);
                return (
                  <tr key={h.t} className={`${j === i ? 'sel' : ''}${horaDe(h.t) === 0 ? ' dia' : ''}`} data-hora={j}>
                    <td>
                      {diaCurto(c, h.t)}, {horaTxt(c, horaDe(h.t))}
                    </td>
                    <td className="n" style={bandaVars(b) as CSSProperties}>
                      <span>{r.n == null ? '–' : r.n}</span>
                    </td>
                    <td>{h.w}</td>
                    <td>{h.g}</td>
                    <td>{rumo(h.wd)}</td>
                    <td>{nf(h.hs)}</td>
                    <td>{h.tp} s</td>
                    <td>{nf(h.tide)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="praia">
          <dt>{c.viradaA}</dt>
          <dd>
            {rumo(ed.praiaVirada)} ({ed.praiaVirada}°)
          </dd>
          <dt>{c.ventoBom}</dt>
          <dd>
            {fmtCopy(c.ventoBomTxt, { a: rumo(ed.kite.bom[0]), b: rumo(ed.kite.bom[1]) })}
            {ed.kite.ideal ? fmtCopy(c.ventoIdeal, { a: rumo(ed.kite.ideal[0]), b: rumo(ed.kite.ideal[1]) }) : ''}
          </dd>
          <dt>{c.ondulacao}</dt>
          <dd>
            {fmtCopy(c.ondulacaoTxt, {
              a: rumo(ed.surf.janela[0]),
              b: rumo(ed.surf.janela[1]),
              c: rumo(ed.surf.terral[0]),
              d: rumo(ed.surf.terral[1]),
            })}
          </dd>
          <dt>{c.modalidades[d]}</dt>
          <dd>{regraTxt(d, c, locale)}</dd>
          {melhorMare ? (
            <>
              <dt>{c.melhorMare}</dt>
              <dd>{melhorMare}</dd>
            </>
          ) : null}
          <dt>{c.agua}</dt>
          <dd>
            {agua != null ? fmtCopy(c.aguaTxt, { tipo: c.tipoAgua[ed.tipoAgua], t: Math.round(agua) }) : c.tipoAgua[ed.tipoAgua]}
          </dd>
          {atencao ? (
            <>
              <dt>{c.atencao}</dt>
              <dd>{atencao}</dd>
            </>
          ) : null}
          <dt>{c.sol}</dt>
          <dd>
            {Object.entries(sol)
              .map(([dia, s]) => `${diaCurto(c, dia)}: ${s.nascer}–${s.por}`)
              .join(' · ')}
          </dd>
        </dl>
        {ed.estimado ? <p className="estimado">{fmtCopy(c.regraDefaults, { graus: ed.praiaVirada })}</p> : null}
      </div>
    </details>
  );
}
