/**
 * Generate public/manifest.json from product SoT (spot count + pipeline schedule).
 * Run from CI/build or manually when spots/schedule change.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'manifest.json');

function spotCount() {
  const out = execFileSync(
    'npx',
    ['tsx', '-e', "import { spots } from './src/lib/spots'; console.log(spots.length)"],
    { cwd: ROOT, encoding: 'utf8' },
  ).trim();
  const n = Number(out.split('\n').filter(Boolean).pop());
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`generate-manifest: invalid spot count from spots.ts (${out})`);
  }
  return n;
}

function main() {
  const count = spotCount();
  // Keep in sync with pipelineSchedule('pt') / PIPELINE_SCHEDULE.pt.medium
  const schedule = 'actualizadas de 2h em 2h (dia) e de 4h em 4h (noite)';
  const manifest = {
    name: 'VenTu — Condições Náuticas',
    short_name: 'VenTu',
    description: `${count} spots em Portugal — surf, kitesurf, windsurf. Scores, mapa e previsão ${schedule}. Grátis e open source.`,
    start_url: '/pt/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0F172A',
    orientation: 'any',
    lang: 'pt-PT',
    categories: ['sports', 'weather', 'navigation'],
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/og-image.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };

  fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`generate-manifest: wrote ${count} spots → ${path.relative(ROOT, OUT)}`);
}

main();
