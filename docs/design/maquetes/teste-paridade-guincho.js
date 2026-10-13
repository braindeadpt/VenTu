// Paridade do Guincho entre as duas maquetes do VenTu: a mesma nota em cada modalidade e em cada uma das 48 horas.
// Lê as duas páginas geradas (index.html), não os ficheiros-fonte:
//  - spot (maquete-v2/index.html): a nota que a tabela hora a hora mostra (#tab td.n), uma carga por modalidade;
//  - home (maquete-home-v1/index.html): o modelo embutido na página (Nucleo + ModAvalia + dados), spot «guincho».
// As 48 horas são as do spot (qua 14 out 14h -> sex 16 out 13h); na home são os índices 14..61.
// Também confirma que as entradas de cada hora (vento, rajada, onda, maré, sol…) são iguais nos dois dados embutidos.
// uso: bash maquete-v2/_build/setup-chromium.sh && LD_LIBRARY_PATH=/tmp/cr/root/usr/lib/aarch64-linux-gnu:/tmp/cr/root/usr/lib/chromium node teste-paridade-guincho.js
const path = require('path');
const { chromium } = require('/tmp/pw/node_modules/playwright-core');
const W = __dirname;
const SPOT = 'file://' + path.join(W, 'maquete-v2/index.html');
const HOME = 'file://' + path.join(W, 'maquete-home-v1/index.html');
// [nome, parâmetros do spot, chave da home]
const MODS = [
  ['Kite', 'd=kite', 'kite'],
  ['Surf', 'd=surf&v=normal', 'surf'],
  ['Windsurf', 'd=windsurf', 'windsurf'],
  ['Wing', 'd=foil&v=wing', 'wing'],
  ['Kite foil', 'd=foil&v=kitefoil', 'kitefoil'],
  ['Surf foil', 'd=foil&v=surffoil', 'surffoil'],
  ['Bodyboard', 'd=bodyboard', 'bodyboard'],
  ['Wakeboard', 'd=wakeboard', 'wake'],
];
const CAMPOS = ['w', 'g', 'wd', 'hs', 'tp', 'sd', 'tide', 'tideUp', 'cloud', 'rain', 'sunEl', 'sunAz'];
(async () => {
  const b = await chromium.launch({ executablePath: '/tmp/cr/root/usr/lib/chromium/chromium-headless-shell', args: ['--no-sandbox'] });
  const erros = [];
  let falhas = 0, total = 0;

  // home: modelo embutido
  const ph = await b.newPage(); ph.on('pageerror', e => erros.push('home: ' + e.message));
  await ph.goto(HOME + '?webgl=0');
  const home = await ph.evaluate(keys => {
    const D = JSON.parse(document.getElementById('dados').textContent);
    const M = Nucleo.Modelo(D), g = D.spots.find(s => s.id === 'guincho');
    const out = { horas: [], notas: {}, emLista: {}, inicio: D.meta.inicio, NH: M.NH, defIgual: null };
    for (let i = 0; i < M.NH; i++) out.horas.push(M.hora(g, i));
    for (const k of keys) { out.notas[k] = M.notas(k).guincho; out.emLista[k] = M.spotsDe(k).some(s => s.id === 'guincho'); }
    out.emLista.bigwave = M.spotsDe('bigwave').some(s => s.id === 'guincho');
    out.def = D.modalidades.def;
    return out;
  }, MODS.map(m => m[2]));

  // spot: dados embutidos + a tabela de cada modalidade
  const ps = await b.newPage(); ps.on('pageerror', e => erros.push('spot: ' + e.message));
  await ps.goto(SPOT + '?webgl=0');
  const spot = await ps.evaluate(() => { const D = JSON.parse(document.getElementById('dados').textContent); return { horas: D.horas, ondaGrande: D.spot.ondaGrande, aguaPlana: D.spot.aguaPlana, def: D.modalidades.def }; });
  const off = home.horas.findIndex(h => h.t === spot.horas[0].t);
  if (off < 0 || off + spot.horas.length > home.NH) { console.log('ERRO: a home não cobre as 48 horas do spot', off, home.NH); process.exit(1); }

  // 0) a mesma definição nas duas páginas
  const defIgual = JSON.stringify(spot.def) === JSON.stringify(home.def);
  console.log(`definição das modalidades embutida nas duas páginas: ${defIgual ? 'igual' : 'DIFERENTE'}`);
  if (!defIgual) falhas++;

  // 1) entradas iguais
  let difE = 0;
  spot.horas.forEach((h, j) => CAMPOS.forEach(c => { if (h[c] !== home.horas[off + j][c]) { difE++; if (difE <= 5) console.log('  entrada diferente', h.t, c, h[c], home.horas[off + j][c]); } }));
  console.log(`entradas do Guincho (${spot.horas.length} horas × ${CAMPOS.length} campos): ${difE ? difE + ' diferentes' : 'iguais'}`);
  if (difE) falhas++;

  // 2) notas
  console.log('\nmodalidade   horas  iguais  com nota  noite/sem nota');
  for (const [nome, q, hk] of MODS) {
    await ps.goto(SPOT + '?webgl=0&' + q);
    const t = await ps.evaluate(() => ({ n: [...document.querySelectorAll('#tab td.n')].map(td => td.textContent.trim()), frase: document.querySelector('#frase').innerText }));
    const hs = home.notas[hk].slice(off, off + spot.horas.length).map(n => n == null ? '–' : String(n));
    let ig = 0, com = 0;
    const dif = [];
    t.n.forEach((v, j) => {
      total++;
      // wakeboard: a home só dá nota aos spots da lista de água plana; o Guincho não está lá, logo «sem nota», como o spot («Não é spot»)
      const h = hk === 'wake' && !home.emLista.wake ? '–' : hs[j];
      if (v === h) ig++; else dif.push(`${spot.horas[j].t}: spot ${v} / home ${h}`);
      if (v !== '–') com++;
    });
    if (hk === 'wake') {
      const ok = !home.emLista.wake && !spot.aguaPlana && /Não é spot/.test(t.frase);
      console.log(`  (wakeboard: Guincho fora da lista de água plana nas duas páginas: ${ok ? 'sim' : 'NÃO'})`);
      if (!ok) falhas++;
    }
    falhas += dif.length;
    console.log(`${nome.padEnd(12)} ${String(t.n.length).padStart(5)}  ${String(ig).padStart(6)}  ${String(com).padStart(8)}  ${String(t.n.length - com).padStart(14)}`);
    dif.slice(0, 8).forEach(x => console.log('    ' + x));
  }
  // 3) onda grande: modo que nenhuma das páginas dá ao Guincho
  const og = !spot.ondaGrande && !home.emLista.bigwave;
  console.log(`\nOnda grande (modo do surf): o Guincho não a tem em nenhuma das páginas: ${og ? 'sim' : 'NÃO'}`);
  if (!og) falhas++;
  erros.forEach(e => console.log('ERRO de página:', e));
  console.log(`\n${falhas || erros.length ? 'FALHOU' : 'OK'}: ${total} comparações (${MODS.length} modalidades × ${spot.horas.length} horas), ${falhas} diferenças`);
  await b.close();
  process.exitCode = falhas || erros.length ? 1 : 0;
})();
