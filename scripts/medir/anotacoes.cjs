// Junta as anotações (p95 de frames, long tasks) do relatório JSON do Playwright.
const fs = require('fs');
const j = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = ['### e2e de medição (CPU 4×)', '', '| Teste | Estado | Medição |', '|---|---|---|'];
const anda = (s) => {
  for (const sp of s.specs || []) for (const t of sp.tests || []) for (const r of t.results || []) {
    const an = [...(t.annotations || []), ...(r.annotations || [])].filter((a) => /p95|long/.test(a.type));
    if (an.length) out.push(`| ${sp.title} | ${r.status} | ${an.map((a) => a.description).join(' ; ')} |`);
  }
  for (const c of s.suites || []) anda(c);
};
for (const s of j.suites || []) anda(s);
const md = out.join('\n') + '\n';
console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
