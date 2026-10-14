// Paridade da maquete v6 «Atlântico» com as maquetes v5 (mesmos dados, mesma lógica; só muda o visual).
//  - spot: v6-atlantico/guincho.html vs ../spot/index.html (v5): nota e frase nas 48 horas, kite e surf.
//  - home: v6-atlantico/index.html vs ../home/index.html (v5): ranking completo (ids + notas), frase nacional e linhas do top 3 de cada bloco, kite e surf.
// uso: npm i playwright-core && CHROMIUM=/caminho/para/chromium node docs/design/maquetes/v6-atlantico/verifica-paridade.js
// (sem CHROMIUM usa o browser do playwright instalado). Resultado esperado: «PARIDADE OK».
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('playwright')); }
const path = require('path');
const V6 = __dirname, V5 = path.join(__dirname, '..');
const txt = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
  let falhas = 0;
  const p6 = await b.newPage(), p5 = await b.newPage();
  for (const d of ['kite', 'surf']) {
    await p6.goto(`file://${V6}/guincho.html?webgl=0&d=${d}`);
    const v6 = await p6.evaluate(() => window.__NS().map((n, i) => [n, window.__frase(i)]));
    let nd = 0, fd = 0;
    for (let h = 0; h < 48; h++) {
      await p5.goto(`file://${V5}/spot/index.html?webgl=0&d=${d}${d === 'surf' ? '&v=normal' : ''}&h=${h}`);
      const [n5, l1, l2] = await p5.evaluate(() => [document.querySelector('#tab tr.sel td.n').textContent.trim(), document.querySelector('#frase .l1').innerHTML, document.querySelector('#frase .l2').innerHTML]);
      const n6 = v6[h][0] == null ? '–' : String(v6[h][0]);
      if (n6 !== n5) { nd++; console.log(`  spot ${d} h${h}: nota ${n6} ≠ ${n5}`); }
      if (txt(v6[h][1].l1) !== txt(l1) || txt(v6[h][1].l2) !== txt(l2)) { fd++; console.log(`  spot ${d} h${h}: «${txt(v6[h][1].l1)} | ${txt(v6[h][1].l2)}» ≠ «${txt(l1)} | ${txt(l2)}»`); }
    }
    console.log(`spot ${d}: 48 horas, notas diferentes ${nd}, frases diferentes ${fd}`); falhas += nd + fd;
  }
  const modelo = async (url) => { const p = await b.newPage(); await p.goto(url + '?webgl=0');
    const r = await p.evaluate(() => { const D = JSON.parse(document.getElementById('dados').textContent), M = Nucleo.Modelo(D), ag = M.idxDe(D.meta.agora), o = {};
      for (const d of ['kite', 'surf']) for (const bl of M.blocos(ag)) { if (bl.passado) continue; o[d + '|' + bl.id] = { r: M.ranking(d, bl, ag).map(x => x.sp.id + ':' + x.n).join(' '), f: M.nacional(d, bl, ag).txt, l: M.ranking(d, bl, ag).slice(0, 3).map(x => { const l = M.linha(x, d, bl); return l.l1 + '|' + l.l2; }).join(' / ') }; }
      return o; }); await p.close(); return r; };
  const a = await modelo(`file://${V6}/index.html`), c = await modelo(`file://${V5}/home/index.html`);
  let hd = 0; for (const k of Object.keys(c)) { if (!a[k] || a[k].r !== c[k].r || a[k].f !== c[k].f || a[k].l !== c[k].l) { hd++; console.log('  home', k, 'difere'); } }
  console.log(`home: ${Object.keys(c).length} blocos×modalidades, diferenças ${hd}`); falhas += hd;
  console.log(falhas ? 'FALHAS: ' + falhas : 'PARIDADE OK');
  await b.close(); process.exitCode = falhas ? 1 : 0;
})();
