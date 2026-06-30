/**
 * Branded Open Graph images per spot (1200×630).
 * Composites aerial thumbnail + dark overlay + spot name — not raw satellite crops.
 *
 *   node scripts/generate-spot-og-images.mjs
 *   node scripts/generate-spot-og-images.mjs --only guincho,peniche
 *   node scripts/generate-spot-og-images.mjs --force
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const INDEX = path.join(root, 'public', 'data', 'spots-index.json');
const AERIAL_DIR = path.join(root, 'public', 'images', 'spots');
const OUT_DIR = path.join(root, 'public', 'images', 'og');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const onlyArg = args.find((a) => a.startsWith('--only'));
const ONLY = onlyArg
  ? new Set(onlyArg.split('=')[1]?.split(',').map((s) => s.trim()).filter(Boolean))
  : null;

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function overlaySvg(name, region) {
  const title = escapeXml(truncate(name, 42));
  const sub = escapeXml(truncate(region, 36));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.55"/>
      <stop offset="45%" stop-color="#0f172a" stop-opacity="0.72"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.92"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fb923c"/>
      <stop offset="50%" stop-color="#f472b6"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <rect x="72" y="72" width="5" height="72" rx="2.5" fill="url(#accent)"/>
  <text x="96" y="118" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" fill="#94a3b8">VenTu</text>
  <text x="96" y="198" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#f8fafc" letter-spacing="-1">${title}</text>
  <text x="96" y="252" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600" fill="#cbd5e1">${sub}</text>
  <text x="96" y="310" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#94a3b8">Condições · vento · ondas · score</text>
  <text x="96" y="572" font-family="Courier New, monospace" font-size="24" font-weight="700" fill="#38bdf8">ventu.surf</text>
</svg>`);
}

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('❌ sharp required. Run: npm install --save-dev sharp');
    process.exit(1);
  }

  if (!fs.existsSync(INDEX)) {
    console.error('❌ Missing spots-index.json — run npm run spots:index first');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const spots = (Array.isArray(raw) ? raw : raw.spots ?? []).filter((s) => s.slug);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let list = spots;
  if (ONLY) list = list.filter((s) => ONLY.has(s.slug));
  if (!FORCE) list = list.filter((s) => !fs.existsSync(path.join(OUT_DIR, `${s.slug}.jpg`)));

  console.log(`[spot-og] ${list.length} to generate (${spots.length} spots total)`);
  if (list.length === 0) return;

  const fallbackBg = await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 3,
      background: { r: 15, g: 23, b: 42 },
    },
  })
    .png()
    .toBuffer();

  let ok = 0;
  const failed = [];

  for (const spot of list) {
    const dest = path.join(OUT_DIR, `${spot.slug}.jpg`);
    const aerialPath = path.join(AERIAL_DIR, `${spot.slug}.jpg`);
    try {
      let base;
      if (fs.existsSync(aerialPath)) {
        base = await sharp(aerialPath)
          .resize(1200, 630, { fit: 'cover', position: 'centre' })
          .modulate({ brightness: 0.72, saturation: 0.85 })
          .blur(1.2)
          .toBuffer();
      } else {
        base = fallbackBg;
      }

      const overlay = overlaySvg(spot.name ?? spot.slug, spot.region ?? 'Portugal');
      await sharp(base)
        .composite([{ input: overlay, top: 0, left: 0 }])
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(dest);
      ok++;
      if (ok % 25 === 0) console.log(`  … ${ok}/${list.length}`);
    } catch (err) {
      failed.push(spot.slug);
      console.log(`✗ ${spot.slug} — ${err.message}`);
    }
  }

  console.log(`[spot-og] Done: ${ok} ok, ${failed.length} failed`);
  if (failed.length) console.log('Failed:', failed.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
