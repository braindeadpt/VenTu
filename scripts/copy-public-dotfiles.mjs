/**
 * Copy dotfiles from public/ into out/ after `next build`.
 *
 * Next 16 (output: 'export') copies public/ to out/ during the build but
 * silently skips entries whose name starts with '.', so `public/.nojekyll`
 * and `public/.well-known/assetlinks.json` never reach the deploy artifact.
 * GitHub Pages then 404s the Digital Asset Links file and Android refuses
 * to verify the TWA (app opens with a URL bar).
 *
 * Idempotent: re-running just rewrites the same files.
 * Run after `next build`; wired into the "build" npm script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const outDir = path.join(root, 'out');

if (!fs.existsSync(outDir)) {
  console.error('copy-public-dotfiles: out/ não existe — corre depois de `next build`.');
  process.exit(1);
}

let copied = 0;
for (const entry of fs.readdirSync(publicDir, { withFileTypes: true })) {
  if (!entry.name.startsWith('.')) continue;
  const src = path.join(publicDir, entry.name);
  const dst = path.join(outDir, entry.name);
  fs.cpSync(src, dst, { recursive: true });
  console.log(`copiado ${entry.name}${entry.isDirectory() ? '/' : ''} → out/`);
  copied++;
}
console.log(`copy-public-dotfiles: ${copied} dotfile(s)`);
