/* Núcleo de dados da home do VenTu: tudo o que a página mostra é derivado do data.json aqui.
   As notas por hora vêm de ../../modalidades-avalia.js (o MESMO código da página de spot) sobre a definição única
   work/modalidades-def.json (embutida em D.modalidades). Aqui não há limiares de nota.
   Corre no browser (window.Nucleo) e em node (testes: node teste.js). */
(function (root) {
'use strict';
const MA = typeof module !== 'undefined' ? require('../../modalidades-avalia.js') : root.ModAvalia;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = (x, d = 1) => x.toLocaleString('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d });
const ROSA = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
const rumo = d => ROSA[Math.round(((d % 360) + 360) % 360 / 22.5) % 16];
const dif = (a, b) => ((a - b) % 360 + 540) % 360 - 180;
const DIAS = ['dom','seg','ter','qua','qui','sex','sáb'];
const dt = s => new Date(s + ':00');

/* ---------- escala do veredicto (igual ao spot) ---------- */
const BANDAS = [
  { k: 'nao',   nome: 'Não dá',    min: 0, c: '#A8432A', cd: '#E07A5B' },
  { k: 'fraco', nome: 'Fraco',     min: 3, c: '#A26C12', cd: '#DCA343' },
  { k: 'da',    nome: 'Dá',        min: 5, c: '#6B7728', cd: '#B4C062' },
  { k: 'bom',   nome: 'Bom',       min: 7, c: '#1C7F6C', cd: '#48C0A5' },
  { k: 'mb',    nome: 'Muito bom', min: 9, c: '#0D5E8C', cd: '#5BB0E2' },
];
const NOITE = { k: 'noite', nome: 'Noite', c: '#465364', cd: '#7F8EA2', rank: -1 };
BANDAS.forEach((b, i) => b.rank = i);
const banda = n => n == null ? NOITE : [...BANDAS].reverse().find(b => n >= b.min);

/* ---------- relação com a praia (igual ao spot, com a praia como parâmetro) ---------- */
const ventoRel = MA.ventoRel;                                          // relação vento/praia: a mesma do spot
const { curva, degrau, pico } = MA;
const centro = ([a, z]) => (a + ((z - a + 360) % 360) / 2) % 360;   // centro da janela de ondulação

/* ---------- modalidades (mesmo JSON, mesmas horas) ----------
   Família = de onde vêm os parâmetros da praia e os troços do mapa: kite (vento), surf (onda), wake (água plana).
   def = a chave das regras em D.modalidades.def (a definição única, a mesma do spot). */
const MODS = {
  kite:      { fam: 'kite', def: 'kite',       nome: 'kite',      rot: 'Kite' },
  surf:      { fam: 'surf', def: 'surf',       nome: 'surf',      rot: 'Surf' },
  windsurf:  { fam: 'kite', def: 'windsurf',   nome: 'windsurf',  rot: 'Windsurf' },
  wing:      { fam: 'kite', def: 'wing',       nome: 'wing',      rot: 'Wing',      foil: true },
  kitefoil:  { fam: 'kite', def: 'kitefoil',   nome: 'kite foil', rot: 'Kite foil', foil: true },
  surffoil:  { fam: 'surf', def: 'surffoil',   nome: 'surf foil', rot: 'Surf foil', foil: true },
  bodyboard: { fam: 'surf', def: 'bodyboard',  nome: 'bodyboard', rot: 'Bodyboard' },
  wake:      { fam: 'wake', def: 'wakeboard',  nome: 'wakeboard', rot: 'Wakeboard' },
  bigwave:   { fam: 'surf', def: 'ondaGrande', nome: 'big wave',  rot: 'Big wave', modo: 'surf', limiar: null },   // modo do surf, só na Nazaré; limiar = def.ondaGrande.mostraDesde
};
const MAIS = ['windsurf', 'foil', 'bodyboard', 'wake'];          // o menu «Mais» (foil abre as vertentes)
const FOIL = ['wing', 'kitefoil', 'surffoil'];
const fam = d => (MODS[d] || MODS.kite).fam;
/* água plana: só os spots da lista única (modalidades-def.json, «aguaPlana»; o build marca sp.aguaPlana) */
const aguaPlana = sp => !!sp.aguaPlana;

/* ---------- artigos (frases em PT-PT: «do Guincho à Lagoa») ---------- */
const ART = { moledo: '', viana: '', esposende: '', matosinhos: '', espinho: '', 'lagoa-obidos': 'a', nazare: 'a', baleal: 'o', supertubos: '',
  'ribeira-ilhas': 'a', guincho: 'o', carcavelos: '', caparica: 'a', 'fonte-telha': 'a', 'lagoa-albufeira': 'a', arrifana: 'a',
  tonel: 'o', martinhal: 'o', 'meia-praia': 'a' };
const oA = sp => ({ o: 'o ', a: 'a ', '': '' })[ART[sp.id]] + nomeC(sp);
const de = sp => ({ o: 'do ', a: 'da ', '': 'de ' })[ART[sp.id]] + nomeC(sp);
const a_ = sp => ({ o: 'ao ', a: 'à ', '': 'a ' })[ART[sp.id]] + nomeC(sp);
const em = sp => ({ o: 'no ', a: 'na ', '': 'em ' })[ART[sp.id]] + nomeC(sp);
const nomeC = sp => sp.curto || sp.nome;
const emL = sp => ({ o: 'no ', a: 'na ', '': 'em ' })[ART[sp.id]] + sp.nome;   // nome inteiro (há duas lagoas)
const lista = arr => arr.length < 2 ? arr.join('') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];

/* ---------- modelo ---------- */
function Modelo(D) {
  const T0 = dt(D.meta.inicio);
  const NH = D.spots[0].h.w.length;
  const tAt = i => { const t = new Date(T0); t.setHours(t.getHours() + i); return t; };
  const iso = t => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T${String(t.getHours()).padStart(2, '0')}:00`;
  const hora = (sp, i) => { const o = { t: iso(tAt(i)) }; for (const k in sp.h) o[k] = sp.h[k][i]; return o; };
  const hh = i => tAt(i).getHours();
  const diaDe = i => Math.floor(i / 24);
  const idxDe = s => Math.round((dt(s) - T0) / 36e5);

  /* avaliação partilhada com o spot: a mesma definição, o mesmo código */
  const MOD = D.modalidades, AV = MA(MOD, { DA: BANDAS.find(b => b.k === 'da').min }), CM = MOD.comum, DA = AV.DA;
  MODS.bigwave.limiar = MOD.def.ondaGrande.mostraDesde;
  const PD = desp => MOD.def[MODS[desp].def];
  const evs = {}, ev = sp => evs[sp.id] || (evs[sp.id] = AV.para(sp));
  const res = {};
  function resultados(desp) {
    if (res[desp]) return res[desp];
    const m = {};
    D.spots.forEach(sp => { m[sp.id] = Array.from({ length: NH }, (_, i) => ev(sp).avalia(MODS[desp].def, hora(sp, i))); });
    return res[desp] = m;
  }
  const cache = {};
  function notas(desp) {
    if (cache[desp]) return cache[desp];
    const m = {}, R = resultados(desp);
    D.spots.forEach(sp => { m[sp.id] = R[sp.id].map(r => r.n); });
    return cache[desp] = m;
  }
  /* leituras das mesmas curvas para as frases (nenhum número novo) */
  const pouco = (h, p) => curva(p.vento, h.w) === 0 && h.w < pico(p.vento);              // a curva de vento ainda não saiu do zero
  const rajado = (h, p) => degrau(p.rajada, h.g - h.w) > 0 || h.g > p.tecto[0];
  const chove = (h, p) => degrau(p.chuva, h.rain) > 0;
  const ondaPouca = (h, p) => curva(p.tamanho, h.hs) < DA && h.hs < pico(p.tamanho);
  const ondaGrandeDemais = (h, p) => curva(p.tamanho, h.hs) < DA && h.hs > pico(p.tamanho);
  const ventoEstraga = (h, p) => h.w >= p.vento.desde + CM.estragaAcimaDe;
  const spotsDe = desp => desp === 'bigwave' ? D.spots.filter(sp => sp.id === 'nazare')
    : desp === 'wake' ? D.spots.filter(aguaPlana)            // a lista única de água plana
    : D.spots.filter(sp => sp.desportos.includes(fam(desp)));
  /* big wave: só existe como modo do surf quando a Nazaré tem onda ≥ limiar no bloco (agora, ou numa hora de sol do bloco) */
  function bigWave(bl, agoraI) {
    const sp = D.spots.find(s => s.id === 'nazare'); if (!sp || !bl) return null;
    const hs = bl.atual ? [agoraI] : Array.from({ length: bl.z - bl.a + 1 }, (_, k) => bl.a + k).filter(j => sp.h.sunEl[j] >= 2);
    if (!hs.length) return null;
    const i = hs.reduce((a, j) => sp.h.hs[j] > sp.h.hs[a] ? j : a, hs[0]);
    return sp.h.hs[i] >= MODS.bigwave.limiar ? { sp, i, hs: sp.h.hs[i], tp: sp.h.tp[i] } : null;
  }

  function janela(NS, i) {
    const b = banda(NS[i]); let a = i, z = i;
    if (b.rank < 2) return null;
    while (z + 1 < NH && banda(NS[z + 1]).rank >= b.rank) z++;
    while (a - 1 >= 0 && banda(NS[a - 1]).rank >= b.rank) a--;
    return { a, z, b };
  }
  const fimHora = j => (hh(j) + 1) % 24 + 'h';
  const acabaNoite = (NS, z) => z + 1 < NH && NS[z + 1] == null;
  function ventoNome(h, sp) {
    const v = h.wd, k = dt(h.t).getHours(), tarde = k >= 11 && k <= 21;
    if (Math.abs(dif(v, 345)) <= 25 && tarde && sp.zona !== 'algarve') return 'nortada ' + rumo(v);
    if (sp.zona === 'algarve' && tarde && Math.abs(dif(v, 245)) <= 35) return 'brisa de ' + rumo(v);
    return 'vento de ' + rumo(v);
  }
  function intervalo(sp, a, z, k) { let lo = 1e9, hi = -1e9; for (let j = a; j <= z; j++) { lo = Math.min(lo, sp.h[k][j]); hi = Math.max(hi, sp.h[k][j]); } return [lo, hi]; }
  const faixaN = ([a, b]) => a === b ? `${a}` : `${a}–${b}`;
  const porSol = (sp, i) => sp.sol[iso(tAt(i)).slice(0, 10)].por.replace(':', 'h');

  /* blocos: hoje e amanhã × manhã, tarde, fim de tarde */
  function blocos(agoraI) {
    const out = [];
    for (let d = 0; d < 2; d++) D.blocos.forEach(b => {
      const a = d * 24 + b.de, z = d * 24 + b.ate;
      out.push({ id: `${d}-${b.id}`, dia: d, nome: b.nome, a, z, luz: d * 24 + b.luz, passado: z < agoraI, atual: agoraI >= a && agoraI <= z });
    });
    return out;
  }

  /* avaliação de um spot num bloco: no bloco actual, a hora de agora; nos outros, a melhor hora do bloco */
  function avalia(sp, desp, bl, agoraI) {
    const NS = notas(desp)[sp.id];
    let i = bl.atual ? agoraI : bl.a;
    // fora do bloco actual, a melhor hora com o sol acima do horizonte (uma hora de crepúsculo não é uma sessão)
    if (!bl.atual) { let best = -2; for (let j = bl.a; j <= bl.z; j++) if (sp.h.sunEl[j] >= 2 && (NS[j] ?? -1) > best) { best = NS[j] ?? -1; i = j; } }
    const n = NS[i], b = banda(n), jn = janela(NS, i);
    return { sp, i, n, b, jn, fim: jn ? jn.z : i, NS };
  }
  function ranking(desp, bl, agoraI) {
    const ordem = D.spots.map(s => s.id);
    return spotsDe(desp).map(sp => avalia(sp, desp, bl, agoraI))
      .sort((x, y) => (y.n ?? -1) - (x.n ?? -1) || (y.fim - y.i) - (x.fim - x.i) || ordem.indexOf(x.sp.id) - ordem.indexOf(y.sp.id));
  }

  /* frase de cada linha do top 3 (a mesma gramática da página de spot) */
  function quando(r, bl) {
    const { NS, jn, i, sp } = r;
    if (!jn) return '';
    const desde = bl.atual ? '' : `das ${hh(Math.max(jn.a, bl.a))}h `;
    const ate = acabaNoite(NS, jn.z) ? (desde ? 'ao pôr do sol' : 'até ao pôr do sol') : (desde ? `às ${fimHora(jn.z)}` : `até às ${fimHora(jn.z)}`);
    return desde + ate;
  }
  function linha(r, desp, bl) {
    const { sp, i, n, b, jn } = r, h = hora(sp, i), p = PD(desp);
    let l1, l2;
    if (n == null) return { l1: 'Noite', l2: '' };
    if (jn) {
      l1 = `${b.nome} ${quando(r, bl)}`;
      if (fam(desp) === 'wake') {
        l2 = `<b>${banda(curva(p.vento, h.w)).k === 'mb' ? 'água espelhada' : 'água a encrespar'}</b> · ${ventoNome(h, sp)} ${faixaN(intervalo(sp, i, jn.z, 'w'))} nós`;
      } else if (fam(desp) === 'kite') {
        const [lo, hi] = intervalo(sp, i, jn.z, 'w');
        l2 = `<b>${ventoNome(h, sp)} ${faixaN([lo, hi])} nós</b>`;
        const gmax = intervalo(sp, i, jn.z, 'g')[1];
        if (gmax - hi >= CM.rajadaNaFrase) l2 += `, rajadas até ${gmax}`;
        else { const vr = ventoRel(sp, h.wd); l2 += `, ${vr.k === 'lat-mar' ? 'lateral de mar' : vr.txt.split(',')[0]}`; }
      } else {
        const vr = ventoRel(sp, h.wd);
        l2 = `<b>${fmt(h.hs)} m a ${h.tp} s de ${rumo(h.sd)}</b> · ${h.w < 6 ? 'quase sem vento' : vr.k === 'terra' ? 'terral de ' + rumo(h.wd) + ' ' + h.w + ' nós' : 'vento ' + rumo(h.wd) + ' ' + h.w + ' nós'}`;
      }
    } else {
      if (fam(desp) === 'wake') {
        l1 = resultados(desp)[sp.id][i].motivo === 'picada' ? 'Vento a encrespar a água' : b.nome;
        l2 = `<b>${ventoNome(h, sp)} ${h.w} nós</b>, rajadas ${h.g}${chove(h, p) ? ' · chuva' : ''}`;
      } else if (fam(desp) === 'kite') {
        const vr = ventoRel(sp, h.wd);
        if (pouco(h, p)) l1 = 'Pouco vento';
        else if (vr.k === 'terra' || vr.k === 'lat-terra') l1 = 'Vento de terra';
        else if (rajado(h, p)) l1 = `${b.nome}: rajado${chove(h, p) ? ' e com chuva' : ''}`;
        else l1 = b.nome;
        l2 = `<b>${ventoNome(h, sp)} ${h.w} nós</b>, rajadas ${h.g}`;
      } else {
        if (desp === 'bigwave' && h.hs < MODS.bigwave.limiar) l1 = 'Sem onda grande';
        else if (ondaGrandeDemais(h, p)) l1 = desp === 'surffoil' ? 'Onda grande para foil' : 'Onda grande demais';
        else if (ventoEstraga(h, p) && ventoRel(sp, h.wd).k !== 'terra') l1 = 'Vento a estragar o mar';
        else if (ondaPouca(h, p)) l1 = 'Pouca onda';
        else l1 = b.nome;
        l2 = `<b>${fmt(h.hs)} m a ${h.tp} s</b> · vento ${rumo(h.wd)} ${h.w} nós${chove(h, p) ? ' · chuva' : ''}`;
      }
    }
    return { l1, l2, pal: jn ? b.nome : null };
  }

  const quandoTxt = (r, bl) => quando(r, bl);
  /* frase nacional: uma voz editorial curta, derivada do ranking do bloco */
  function nacional(desp, bl, agoraI) {
    const R = ranking(desp, bl, agoraI), top = R[0];
    const ordem = spotsDe(desp).map(s => s.id);
    if (!top || top.n == null) return { txt: 'Noite na costa.', b: NOITE };
    const ht = hora(top.sp, top.i);
    const bons = R.filter(r => r.b.rank >= 3);
    const rot = s => s.charAt(0).toUpperCase() + s.slice(1);
    // onde: contínuo na costa -> «do A à B»; senão lista
    function onde(rs) {
      const idx = rs.map(r => ordem.indexOf(r.sp.id)).sort((a, b) => a - b);
      const cont = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
      const sp = idx.map(k => D.spots.find(s => s.id === ordem[k]));
      if (sp.length === 1) return em(sp[0]);
      if (cont && sp.length >= 3) return `${de(sp[0])} ${a_(sp[sp.length - 1])}`;
      if (sp.length <= 3) return lista(sp.map(em));
      const zs = [...new Set(sp.map(s => s.zona))];
      if (zs.length >= 3) return zs.every(z => ['norte', 'oeste', 'lisboa'].includes(z)) ? 'em toda a costa oeste' : 'de norte a sul';
      return lista(zs.map(z => D.zonas[z].em));
    }
    function ate(rs) {
      // a janela mais longa entre os bons; um máximo é sempre «até»
      const fim = Math.max(...rs.map(r => r.fim));
      const r = rs.find(x => x.fim === fim);
      const ini = Math.min(...rs.map(r => r.jn ? r.jn.a : r.i));
      const fimTxt = acabaNoite(r.NS, fim) ? 'ao pôr do sol' : `às ${fimHora(fim)}`;
      if (bl.atual) return 'até ' + (fimTxt.startsWith('às') ? fimTxt : fimTxt);
      return `das ${hh(Math.max(ini, bl.a))}h ${fimTxt.startsWith('às') ? fimTxt : 'ao pôr do sol'}`;
    }
    const zonaDe = rs => { const zs = [...new Set(rs.map(r => r.sp.zona))]; return zs.length === 1 ? D.zonas[zs[0]].em : zs.every(z => ['norte', 'oeste', 'lisboa'].includes(z)) ? 'na costa oeste' : 'na costa'; };
    const palavra = rs => { const ks = [...new Set(rs.map(r => r.b.rank))].sort(); const nm = ks.map(k => BANDAS[k].nome.toLowerCase()); return { txt: nm.length > 1 ? `${nm[0]} a ${nm[nm.length - 1]}` : nm[0], b: BANDAS[ks[ks.length - 1]] }; };
    const nm = MODS[desp].nome, pd = PD(desp);
    if (desp === 'wake') {
      const vn = ventoNome(ht, top.sp).replace(/^nortada .*/, 'nortada');
      if (top.b.rank >= 3) return { txt: `Água plana ${emL(top.sp)}: wakeboard <em>${top.b.nome.toLowerCase()}</em> ${quandoTxt(top, bl)}.`, corpo: `wakeboard <em>${top.b.nome.toLowerCase()}</em> ${emL(top.sp)}, ${quandoTxt(top, bl)}.`, b: top.b };
      if (top.b.rank === 2) return { txt: `Água quase plana ${emL(top.sp)}: wakeboard <em>dá</em> ${quandoTxt(top, bl)}.`, corpo: `wakeboard <em>dá</em> ${emL(top.sp)}, ${quandoTxt(top, bl)}.`, b: top.b };
      return { txt: `${rot(vn)} a encrespar a água ${emL(top.sp)}: wakeboard <em>${top.b.nome.toLowerCase()}</em>.`, b: top.b };
    }
    if (desp === 'bigwave') {
      const mar = `${fmt(ht.hs)}\u00a0m a ${ht.tp}\u00a0s de ${rumo(ht.sd)}`;
      if (top.b.rank >= 2) { const corpo = `big wave <em>${top.b.nome.toLowerCase()}</em> na Nazaré, ${quandoTxt(top, bl)}, ${mar}.`; return { txt: `Nazaré grande: ${corpo}`, corpo, b: top.b }; }
      return { txt: `Nazaré grande (${mar}), mas o vento estraga: big wave <em>${top.b.nome.toLowerCase()}</em>.`, b: top.b };
    }
    if (fam(desp) === 'kite') {
      const rumoTop = ventoNome(ht, top.sp).replace(/^nortada .*/, 'nortada');
      const w0 = top.sp.h.w[top.i], w2 = top.sp.h.w[Math.min(top.i + 2, top.sp.h.w.length - 1)];
      const verbo = w2 - w0 >= 3 ? 'a apertar' : w0 - w2 >= 3 ? 'a cair' : '';
      if (bons.length) {
        const p = palavra(bons);
        const o = onde(bons), z = /costa|norte a sul/.test(o) ? '' : ' ' + zonaDe(bons);
        const corpo = `${nm} <em>${p.txt}</em> ${o}, ${ate(bons)}.`;
        return { txt: `${rot(rumoTop)}${verbo ? ' ' + verbo : ''}${z}: ${corpo}`, corpo, b: p.b };
      }
      if (top.b.rank === 2) return { txt: `Dia morno para ${nm}. O melhor é ${oA(top.sp)}: <em>dá</em> ${quandoTxt(top, bl)}.`, b: top.b };
      const chuva = R.filter(r => chove(hora(r.sp, r.i), pd)).length > R.length / 2;
      const fraco = R.filter(r => pouco(hora(r.sp, r.i), pd)).length > R.length / 2;
      return { txt: chuva ? `Frente com chuva e rajadas: ${nm} <em>não dá</em> em lado nenhum.` : fraco ? `Pouco vento na costa: ${nm} <em>não dá</em>.` : `Vento torto para ${nm}: <em>${top.b.nome.toLowerCase()}</em> em toda a costa.`, b: top.b };
    }
    // surf
    const sw = `ondulação de ${rumo(ht.sd)}`;
    if (bons.length) {
      const p = palavra(bons);
      const oeste = R.filter(r => ['norte', 'oeste', 'lisboa'].includes(r.sp.zona));
      const ventoOeste = oeste.filter(r => { const h = hora(r.sp, r.i); return ventoEstraga(h, pd) && ventoRel(r.sp, h.wd).k !== 'terra'; }).length;
      const soSul = bons.every(r => ['vicentina', 'sagres', 'algarve'].includes(r.sp.zona));
      const lead = soSul && ventoOeste > oeste.length / 2 ? `${rot(ventoNome(hora(oeste[0].sp, oeste[0].i), oeste[0].sp).split(' ')[0])} a estragar o oeste; ` : `${rot(sw)} limpa; `;
      const corpo = `${nm} <em>${p.txt}</em> ${soSul ? 'só a sul, ' : ''}${onde(bons)}, ${ate(bons)}.`;
      return { txt: `${lead}${corpo}`, corpo, b: p.b };
    }
    if (top.b.rank === 2) return { txt: `${desp === 'surffoil' ? 'Pouca onda boa' : 'Mar mexido'} para ${nm}. O melhor é ${oA(top.sp)}: <em>dá</em> ${quandoTxt(top, bl)}.`, b: top.b };
    const chuva = R.filter(r => chove(hora(r.sp, r.i), pd)).length > R.length / 2;
    const grande = R.filter(r => ondaGrandeDemais(hora(r.sp, r.i), pd)).length > R.length / 2;
    return { txt: chuva ? `Frente com chuva e vento de mar: ${nm} <em>não dá</em> em lado nenhum.` : grande ? `Mar grande demais para ${nm}: <em>${top.b.nome.toLowerCase()}</em> em toda a costa.` : top.b.rank === 0 ? `Vento a estragar o mar: ${nm} <em>não dá</em> em lado nenhum.` : `Vento a estragar o mar: ${nm} <em>fraco</em> em toda a costa.`, b: top.b };
  }

  return { NH, tAt, iso, hora, hh, diaDe, idxDe, notas, resultados, spotsDe, bigWave, janela, blocos, avalia, ranking, linha, nacional, porSol, ventoNome };
}

const API = { BANDAS, NOITE, banda, rumo, dif, fmt, clamp, lerp, DIAS, dt, ventoRel, Modelo, em, de, a_, MODS, MAIS, FOIL, fam, aguaPlana };
if (typeof module !== 'undefined') module.exports = API; else root.Nucleo = API;
})(this);
