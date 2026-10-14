// compara notas e frases de Kite/Surf entre a maquete aprovada (template/data .pre-modalidades) e a actual
// uso: LD_LIBRARY_PATH=... node verifica-paridade.js
const fs = require('fs'), B = __dirname;
const { chromium } = require('/tmp/pw/node_modules/playwright-core');
const velho = fs.readFileSync(B + '/template.pre-modalidades.html', 'utf8').replace('__DATA__', fs.readFileSync(B + '/data.pre-modalidades.json', 'utf8')).replace('__GEO__', fs.readFileSync(B + '/geo/geo.json', 'utf8')).replace('__POSTER__', 'data:,');
fs.writeFileSync('/tmp/velho.html', velho);
(async () => {
  const b = await chromium.launch({ executablePath: '/tmp/cr/root/usr/lib/chromium/chromium-headless-shell', args: ['--no-sandbox'] });
  const res = {};
  for (const [nm, url] of [['velho', 'file:///tmp/velho.html'], ['novo', 'file://' + B + '/../index.html']]) {
    const p = await b.newPage(); p.on('pageerror', e => console.log(nm, 'PAGEERROR', e.message));
    for (const d of ['kite', 'surf']) {
      res[nm + d] = [];
      for (let h = 0; h < 48; h++) { await p.goto(url + '?webgl=0&d=' + d + '&h=' + h); res[nm + d].push(await p.evaluate(() => [document.querySelector('#tab tr.sel td.n').textContent, document.querySelector('#frase').innerText.replace(/\n/g, ' | ').replace(/\u00a0/g, ' ').replace(/rajadas até/g, 'rajadas')])); }
    }
  }
  for (const d of ['kite', 'surf']) {
    const nd = res['velho' + d].filter((v, h) => v[0] !== res['novo' + d][h][0]).length;
    const fd = res['velho' + d].map((v, h) => v[1] !== res['novo' + d][h][1] ? h + ': ' + v[1] + ' ==> ' + res['novo' + d][h][1] : null).filter(Boolean);
    console.log(d, 'notas diferentes:', nd, '| frases diferentes (ignorando «até» nas rajadas):', fd.length); fd.forEach(x => console.log('  ' + x));
  }
  await b.close();
})();
