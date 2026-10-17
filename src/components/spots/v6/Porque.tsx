/**
 * Porquê (#184): três cartões vento, onda e maré, com o efeito na nota
 * («a favor», «pesa contra», «impede»), o número grande e a relação com a
 * praia. A modalidade decide a ordem (kite → vento primeiro; surf → onda).
 * Os números são os do objecto da hora; os efeitos são os `f` do motor.
 */
import type { AvaliacaoHora, Modalidade, SpotModalidade } from '@/lib/modalidades';
import type { HoraSpot, MareExtremo } from '@/lib/horaSpot';
import { fmtNum, hmTxt, ondaRelTxt, rumo, ventoRelTxt } from '@/lib/spotVeredicto';
import { fmtCopy, type SpotPageV6Copy } from '@/lib/translations/spotPage/v6';

function seta(cx: number, cy: number, dirTo: number, L: number, w: number) {
  const r = (dirTo * Math.PI) / 180;
  const ux = Math.sin(r);
  const uy = -Math.cos(r);
  const x1 = cx - (ux * L) / 2;
  const y1 = cy - (uy * L) / 2;
  const x2 = cx + (ux * L) / 2;
  const y2 = cy + (uy * L) / 2;
  const a = Math.atan2(y2 - y1, x2 - x1);
  const k = 8;
  const p = (t: number) => `${(x2 - k * Math.cos(a + t)).toFixed(1)} ${(y2 - k * Math.sin(a + t)).toFixed(1)}`;
  return (
    <path
      d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}M${p(-0.5)}L${x2.toFixed(1)} ${y2.toFixed(1)}L${p(0.5)}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={w}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
const Costa = () => <path d="M44 0 L42 58 L64 58 L64 0Z" fill="#C9B07A" opacity=".85" />;

/** Glifo do vento: a costa à direita (terra), a seta a soprar no rumo relativo. */
function GlifoVento({ wd, praia }: { wd: number; praia: number }) {
  // a praia do glifo olha para W (270): roda-se o vento para o referencial da praia
  const rel = (wd - praia + 270 + 360) % 360;
  return (
    <svg className="g" viewBox="0 0 58 58" aria-hidden="true">
      <Costa />
      {seta(22, 29, (rel + 180) % 360, 36, 3.4)}
    </svg>
  );
}
function GlifoOnda({ sd, praia }: { sd: number; praia: number }) {
  const rel = (sd - praia + 270 + 360) % 360;
  const a = (rel + 180) % 360;
  const r = (a * Math.PI) / 180;
  const ux = Math.sin(r);
  const uy = -Math.cos(r);
  const px = -uy;
  const py = ux;
  return (
    <svg className="g" viewBox="0 0 58 58" aria-hidden="true">
      <Costa />
      {[-14, -5, 4].map((k, j) => {
        const cx = 22 + ux * k;
        const cy = 29 + uy * k;
        return (
          <path
            key={k}
            d={`M${(cx - px * 12).toFixed(1)} ${(cy - py * 12).toFixed(1)}Q${(cx + ux * 4).toFixed(1)} ${(cy + uy * 4).toFixed(1)} ${(cx + px * 12).toFixed(1)} ${(cy + py * 12).toFixed(1)}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2 + j * 0.8}
            opacity={0.45 + j * 0.27}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
function GlifoMare({ tide, up }: { tide: number; up: boolean }) {
  const t = Number.isFinite(tide) ? tide : 1.6;
  const y = 50 - (Math.max(0, Math.min(3.3, t)) / 3.3) * 34;
  const xs = 4 + ((50 - y) / 34) * 50;
  return (
    <svg className="g" viewBox="0 0 58 58" aria-hidden="true">
      <path d={`M0 ${y.toFixed(1)} L${xs.toFixed(1)} ${y.toFixed(1)} L4 50 L0 50Z`} fill="#7FE7FF" opacity=".3" />
      <path d="M4 50 L54 16 L58 16 L58 58 L0 58 L0 50Z" fill="#C9B07A" opacity=".85" />
      <path d={`M0 ${y.toFixed(1)} L${xs.toFixed(1)} ${y.toFixed(1)}`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      {Number.isFinite(tide) ? seta(Math.max(10, xs - 12), y + (up ? -9 : 9), up ? 0 : 180, 11, 2.4) : null}
    </svg>
  );
}

const efeito = (v: number, c: SpotPageV6Copy): [string, string] =>
  v > 0 ? ['pro', c.aFavor] : v < -1 ? ['contra', c.impede] : v < 0 ? ['contra', c.pesaContra] : ['', ''];

export interface PorqueProps {
  h: HoraSpot;
  r: AvaliacaoHora;
  d: Modalidade;
  sp: SpotModalidade;
  mares: readonly MareExtremo[];
  quando: string;
  copy: SpotPageV6Copy;
  locale: string;
}

export default function Porque({ h, r, d, sp, mares, quando, copy: c, locale }: PorqueProps) {
  const noite = r.n == null;
  const ef = (v: number, k: string) => {
    const [cls, txt] = efeito(v, c);
    return noite || !txt ? null : (
      <span className={`efeito ${cls}`} data-testid={`efeito-${k}`}>
        {txt}
      </span>
    );
  };
  const nf = (x: number) => fmtNum(x, locale);
  const temMare = Number.isFinite(h.tide);
  const pm = temMare ? mares.find((m) => m.t > h.t) : undefined;
  const pmTxt = pm
    ? fmtCopy(pm.tipo === 'PM' ? c.preiaMar : c.baixaMar, { t: hmTxt(c, pm.t, locale), h: Number.isFinite(pm.h) ? nf(pm.h) : '–' })
    : '';
  const vento = (
    <div className="fator" key="vento" data-fator="vento">
      <GlifoVento wd={h.wd} praia={sp.praiaVirada} />
      <div className="rot">
        <span>{c.vento}</span>
        {ef(r.f.vento, 'vento')}
      </div>
      <div className="val num">
        {h.semDados?.includes('vento') ? (
          <small>{c.semDados}</small>
        ) : (
          <>
            {h.w}
            <small>{fmtCopy(c.nosRajadas, { g: h.g })}</small>
          </>
        )}
      </div>
      <div className="rel">
        {fmtCopy(c.deRumo, { r: '\u0000', graus: h.wd, rel: ventoRelTxt(c, sp, h.wd) })
          .split('\u0000')
          .map((s, k, a) => (k < a.length - 1 ? [s, <b key={k}>{rumo(h.wd)}</b>] : s))}
      </div>
    </div>
  );
  const onda = (
    <div className="fator" key="onda" data-fator="onda">
      <GlifoOnda sd={h.sd} praia={sp.praiaVirada} />
      <div className="rot">
        <span>{c.onda}</span>
        {ef(r.f.onda, 'onda')}
      </div>
      <div className="val num">
        {h.semDados?.includes('onda') ? (
          <small>{c.semDados}</small>
        ) : (
          <>
            {nf(h.hs)}
            <small>{fmtCopy(c.mPeriodo, { tp: h.tp })}</small>
          </>
        )}
      </div>
      <div className="rel">
        {fmtCopy(c.deRumo, { r: '\u0000', graus: h.sd, rel: ondaRelTxt(c, sp, h.sd) })
          .split('\u0000')
          .map((s, k, a) => (k < a.length - 1 ? [s, <b key={k}>{rumo(h.sd)}</b>] : s))}
      </div>
    </div>
  );
  const mare = (
    <div className="fator" key="mare" data-fator="mare">
      <GlifoMare tide={h.tide} up={h.tideUp} />
      <div className="rot">
        <span>{c.mare}</span>
        {ef(r.f.mare, 'mare')}
      </div>
      <div className="val num">
        {temMare ? nf(h.tide) : '–'}
        <small>{temMare ? (h.tideUp ? c.mEncher : c.mVazar) : c.semDados}</small>
      </div>
      <div className="rel">
        {temMare ? `${pmTxt ? pmTxt + '; ' : ''}${h.tideUp ? c.areiaEstreita : c.areiaAlarga}` : c.semDados}
      </div>
    </div>
  );
  return (
    <section className="porque" aria-labelledby="porque-t" data-testid="spot-porque">
      <h2 className="sec" id="porque-t">
        {c.porque} <span>· {quando}</span>
      </h2>
      <div className="fatores">{d === 'kite' ? [vento, onda, mare] : [onda, vento, mare]}</div>
    </section>
  );
}
