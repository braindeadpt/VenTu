/**
 * Fixture do wave-bias.json para validar o badge do score de onda no TopNow.
 *
 * Dois caminhos alimentam o badge (ver docs/CONTEXT.md — secção E2E core):
 *   1. PRIMEIRO PAINT (SSG — o que este fixture valida): `buildSpotData` lê
 *      conditions.json + wave-bias.json em build-time; o badge «Corrigido
 *      (viés regional)» só sai baked no out/ se o wave-bias.json existir em
 *      public/data/ durante o `npm run build` (o spec `leitura de boia BAKED
 *      no build` faz skip honesto quando não existe).
 *   2. RE-HIDRATAÇÃO (sem rebuild): o `HomepageTopNow` usa `useLiveGridSpotData`
 *      (mount + 15 min + tab visível) — o refresh aplica o viés regional em
 *      runtime e os testes positivos do spec interceptam client-side.
 *
 * Uso (local, só validação do caminho baked):
 *   node tests/e2e/fixtures/write-wave-bias-fixture.mjs
 *   npm run build
 *   npx playwright test topnow-wave-badge
 *
 * public/data/ é gitignored — o fixture nunca é commitado nem chega à
 * produção; a pipeline regenera o ficheiro a cada run (fetch-wave-bias.js).
 * O ME +0.3 m / n=120 passa os gates do resolveRegionBias (n≥30, |ME| em
 * [0.15, 1.5]) e o deltaM ≥ 0.05, por isso TODAS as rows do build ficam
 * corrigidas e o badge aparece em todos os cards do TopNow.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const index = JSON.parse(readFileSync(join(root, 'public/data/spots-index.json'), 'utf-8'));
const spots = Array.isArray(index) ? index : index.spots ?? index.spot ?? Object.values(index);
const regions = [...new Set(spots.map((s) => s?.region).filter((r) => typeof r === 'string'))];

const out = {
  fetchedAt: new Date().toISOString(),
  regions: Object.fromEntries(
    regions.map((r) => [r, { n: 120, me: 0.3, mae: 0.4, rmse: 0.5 }]),
  ),
};

writeFileSync(join(root, 'public/data/wave-bias.json'), JSON.stringify(out, null, 2) + '\n');
console.log(
  `wave-bias.json com ${regions.length} regiões (ME +0.3 m, n=120) — só para builds de validação`,
);
