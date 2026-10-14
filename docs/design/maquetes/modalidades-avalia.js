/* VenTu: avaliação das modalidades, partilhada pelas duas maquetes (spot e home).
   Lê só a definição (modalidades-def.json, embutida no data.json de cada maquete em `modalidades`).
   Aqui não há limiares: só a maneira de ler curvas e degraus. A lógica é a da maquete do spot, revista com o Pedro.
   Corre no browser (window.ModAvalia) e em node (require). */
(function (root) {
'use strict';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const dif = (a, b) => ((a - b) % 360 + 540) % 360 - 180;           // a-b em -180..180
const lado = rel => rel > 0 ? 'pelo norte' : 'pelo sul';
/* relação do vento com a praia (sp.praiaVirada = para onde a praia olha) */
function ventoRel(sp, wd) {
  const rel = dif(wd, sp.praiaVirada), a = Math.abs(rel);
  if (a <= 30) return { k: 'mar', txt: 'de mar, de frente para a praia', a, rel };
  if (a <= 65) return { k: 'lat-mar', txt: 'lateral de mar, ' + lado(rel), a, rel };
  if (a <= 110) return { k: 'lat', txt: 'lateral, paralelo à praia, ' + lado(rel), a, rel };
  if (a <= 150) return { k: 'lat-terra', txt: 'lateral de terra, ' + lado(rel), a, rel };
  return { k: 'terra', txt: 'de terra, a soprar para o mar', a, rel };
}
// curva por pontos [x, y]: interpola; x repetido = degrau; fora dos extremos vale a ponta
const curva = (pts, x) => {
  if (x < pts[0][0]) return pts[0][1];
  for (let k = 0; k < pts.length - 1; k++) { const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; if (x1 > x0 && x >= x0 && x < x1) return lerp(y0, y1, (x - x0) / (x1 - x0)); }
  return pts[pts.length - 1][1];
};
const degrau = (lista, x) => lista.reduce((p, [lim, pen]) => x > lim ? pen : p, 0);
const pico = pts => pts.reduce((a, b) => b[1] > a[1] ? b : a)[0];

function ModAvalia(MOD, opc) {
  const MD = MOD.def, CM = MOD.comum;
  const DA = (opc && opc.DA) != null ? opc.DA : 5;                   // a partir daqui «dá» (banda «Dá» das duas páginas)
  // intervalo de x onde a curva dá pelo menos «Dá»
  function intervaloDa(pts) {
    let lo = null, hi = null;
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; if (x1 === x0) continue;
      if (y0 >= DA && lo == null) lo = x0;
      if ((y0 < DA) !== (y1 < DA)) { const x = x0 + (DA - y0) / (y1 - y0) * (x1 - x0); if (y1 >= DA) lo = lo ?? x; else hi = x; }
    }
    return [lo, hi];
  }
  const noiteH = h => h.sunEl < CM.noite;
  const solBaixo = h => h.sunEl < CM.solBaixo[0] ? CM.solBaixo[1] : 0;
  /* janela de ondulação do spot: centro e tolerância (meia largura, ou sp.surf.tol quando o spot a fixa) */
  const janelaDe = sp => { const [a, z] = sp.surf.janela, w = dif(z, a); return { centro: (a + w / 2 + 360) % 360, tol: sp.surf.tol != null ? sp.surf.tol : Math.abs(w) / 2 }; };

  /* as três lógicas, para um spot: { praiaVirada, surf: { janela }, aguaPlana } */
  function para(sp) {
    const JAN = janelaDe(sp);
    const L = {
      vento(h, p) {
        const f = { vento: 0, onda: 0, mare: 0 };
        if (noiteH(h)) return { n: null, f };
        const vr = ventoRel(sp, h.wd), s = Math.min(curva(p.vento, h.w), 10), dirF = p.dir[vr.k], raj = h.g - h.w;
        const pr = degrau(p.rajada, raj), pt = h.g > p.tecto[0] ? p.tecto[1] : 0;
        const po = h.hs > p.onda.acima ? p.onda.pen : 0, pm = h.tide > p.mare.acima ? p.mare.pen : 0;
        const n = s * dirF - pr - pt - degrau(p.chuva, h.rain) - solBaixo(h) - po - pm;
        f.vento = (s * dirF >= p.favor && !pr && !pt) ? 1 : -1;
        f.onda = po ? -1 : (h.hs < p.onda.calma ? 1 : 0);
        f.mare = pm ? -1 : 0;
        const motivo = s < DA ? (h.w < pico(p.vento) ? 'pouco' : 'muito') : (vr.k === 'terra' || vr.k === 'lat-terra') ? 'terra' : (pr || pt) ? 'rajado' : 'banda';
        return { n: clamp(Math.round(n), 0, 10), f, motivo };
      },
      onda(h, p) {
        const f = { vento: 0, onda: 0, mare: 0 };
        if (noiteH(h)) return { n: null, f };
        const t = curva(p.tamanho, h.hs); let s = t;
        if (h.tp >= p.periodo.bom) s += p.periodo.bonus; else if (h.tp < p.periodo.curto) s -= p.periodo.pen;
        if (Math.abs(dif(h.sd, JAN.centro)) > JAN.tol) s -= p.foraJanela;
        f.onda = s >= p.favorOnda[0] ? 1 : s < p.favorOnda[1] ? -1 : 0;
        const vr = ventoRel(sp, h.wd), pvv = p.vento; let pv = 0;
        if (h.w >= pvv.desde) {
          pv = Math.min(pvv.max, (h.w - pvv.desde) * pvv.k);
          if (vr.k === 'terra') pv = h.w > pvv.terra[0] ? pvv.terra[1] : 0;
          else if (vr.k === 'lat-terra') pv *= pvv.latTerra;
        }
        f.vento = pv === 0 ? 1 : pv > pvv.contra ? -1 : 0;
        const pm = h.tide > p.mare.alta[0] ? p.mare.alta[1] : 0;
        f.mare = pm ? -1 : (h.tide < p.mare.baixa ? 1 : 0);
        const n = s - pv - pm - degrau(p.chuva, h.rain) - solBaixo(h);
        const motivo = t < DA - 2 ? 'pouca' : pv > pvv.contra ? 'vento' : t < DA ? (h.hs < pico(p.tamanho) ? 'pouca' : 'grande') : 'banda';
        return { n: clamp(Math.round(n), 0, 10), f, motivo };
      },
      plana(h, p) {
        if (!sp.aguaPlana) return { n: null, fora: true, f: { vento: 0, onda: -2, mare: 0 }, motivo: 'fora' };
        const f = { vento: 0, onda: 0, mare: 0 };
        if (noiteH(h)) return { n: null, f };
        const s = curva(p.vento, h.w); f.vento = s >= DA ? 1 : -1;
        return { n: clamp(Math.round(s - degrau(p.chuva, h.rain) - solBaixo(h)), 0, 10), f, motivo: s < DA ? 'picada' : 'banda' };
      },
    };
    L.avalia = (k, h) => L[MD[k].logica](h, MD[k]);                 // k: chave em def (kite, wing, surffoil, ondaGrande, wakeboard…)
    return L;
  }
  return { MD, CM, DA, curva, degrau, pico, intervaloDa, ventoRel, dif, para, janelaDe };
}
ModAvalia.curva = curva; ModAvalia.degrau = degrau; ModAvalia.pico = pico; ModAvalia.ventoRel = ventoRel;
if (typeof module !== 'undefined') module.exports = ModAvalia; else root.ModAvalia = ModAvalia;
})(this);
