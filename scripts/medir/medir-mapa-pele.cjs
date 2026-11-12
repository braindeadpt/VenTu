/**
 * Medição D1/D2 da pele v6 do /mapa (só no ramo medir/*; não entra na main).
 * Lighthouse ao /mapa em três variantes (mapa anterior, pele com a base de hoje,
 * pele com a base escura v6), móvel e desktop. Imprime a mediana de cada uma.
 */
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const PORT = '4181';
const BASE = `http://127.0.0.1:${PORT}/pt/mapa/`;
const RUNS = Number(process.env.RUNS || 3);
const VARIANTES = [
  ['anterior (?pele=0)', '?pele=0'],
  ['pele, base de hoje', ''],
  ['pele + base v6 (?pelebase=v6)', '?pelebase=v6'],
];
const PRESETS = [['móvel', []], ['desktop', ['--preset=desktop']]];

const espera = (url, n = 60) =>
  new Promise((ok, ko) => {
    const t = () => http.get(url, (r) => { r.resume(); ok(); }).on('error', () => (--n ? setTimeout(t, 1000) : ko(new Error('serve'))));
    t();
  });

function lh(url, extra) {
  const out = `/tmp/lh-${Date.now()}.json`;
  spawnSync('npx', ['lighthouse', url, ...extra, '--output=json', `--output-path=${out}`, '--quiet',
    '--chrome-flags=--headless=new', '--only-categories=performance', '--max-wait-for-load=120000'], { stdio: 'inherit' });
  try { return JSON.parse(fs.readFileSync(out, 'utf8')); } catch { return null; }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

(async () => {
  const srv = spawn('npx', ['serve', 'out', '-l', PORT], { stdio: 'ignore', detached: true });
  await espera(BASE);
  const linhas = ['| Variante | Perfil | Perf | TBT | LCP | CLS | Corridas |', '|---|---|---|---|---|---|---|'];
  for (const [pn, pa] of PRESETS) {
    for (const [vn, q] of VARIANTES) {
      lh(BASE + q, pa); // aquecimento
      const r = [];
      for (let i = 0; i < RUNS; i++) {
        const j = lh(BASE + q, pa);
        if (!j) continue;
        const a = j.audits;
        r.push({ p: Math.round(j.categories.performance.score * 100), tbt: a['total-blocking-time'].numericValue,
          lcp: a['largest-contentful-paint'].numericValue, cls: a['cumulative-layout-shift'].numericValue });
        console.log(`[${pn}] ${vn} run ${i + 1}: Perf ${r.at(-1).p} TBT ${Math.round(r.at(-1).tbt)} LCP ${Math.round(r.at(-1).lcp)}`);
      }
      if (!r.length) { linhas.push(`| ${vn} | ${pn} | falhou | | | | 0 |`); continue; }
      linhas.push(`| ${vn} | ${pn} | ${med(r.map((x) => x.p))} | ${Math.round(med(r.map((x) => x.tbt)))} ms | ${Math.round(med(r.map((x) => x.lcp)))} ms | ${med(r.map((x) => x.cls)).toFixed(3)} | ${r.length} |`);
    }
  }
  const md = `### Lighthouse /pt/mapa/ (mediana)\n\n${linhas.join('\n')}\n`;
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  fs.writeFileSync('medir-lighthouse.md', md);
  try { process.kill(-srv.pid); } catch {}
  process.exit(0);
})();
