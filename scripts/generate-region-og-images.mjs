/**
 * Imagens Open Graph por macro-região (1200×630) — foto da região + overlay
 * da marca, no mesmo estilo das imagens por spot.
 *
 * Serve as landings `/explorar/{desporto}-{região}/`, que partilham muito
 * (WhatsApp/X/Facebook) e antes não tinham `og:image` nenhuma: o `openGraph`
 * era montado à mão sem imagem, substituindo o do layout.
 *
 *   node scripts/generate-region-og-images.mjs
 *   node scripts/generate-region-og-images.mjs --force
 *
 * O destino (`public/images/og/`) é gerado no build (`npm run og:generate`) e
 * não é versionado.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const SRC_DIR = path.join(root, 'public', 'images', 'regions');
const OUT_DIR = path.join(root, 'public', 'images', 'og', 'regions');

/** Slugs das fotos de região (espelha `REGION_IMAGE_SLUGS` de src/lib/regionImage.ts). */
const REGIONS = [
  { slug: 'norte', label: 'Norte' },
  { slug: 'centro', label: 'Centro' },
  { slug: 'lisboa', label: 'Lisboa' },
  { slug: 'alentejo', label: 'Alentejo' },
  { slug: 'algarve', label: 'Algarve' },
  { slug: 'acores', label: 'Açores' },
  { slug: 'madeira', label: 'Madeira' },
];

const FORCE = process.argv.includes('--force');

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function overlaySvg(label) {
  const title = escapeXml(label);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.50"/>
      <stop offset="45%" stop-color="#0f172a" stop-opacity="0.70"/>
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
  <text x="96" y="252" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="600" fill="#cbd5e1">Spots, condições e scores</text>
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

  if (!fs.existsSync(SRC_DIR)) {
    console.error('❌ Sem public/images/regions — nada a gerar.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let pending = REGIONS.filter((r) => fs.existsSync(path.join(SRC_DIR, `${r.slug}.jpg`)));
  if (!FORCE) {
    pending = pending.filter((r) => !fs.existsSync(path.join(OUT_DIR, `${r.slug}.jpg`)));
  }

  console.log(`[region-og] ${pending.length} a gerar (${REGIONS.length} regiões)`);
  let made = 0;
  for (const region of pending) {
    const src = path.join(SRC_DIR, `${region.slug}.jpg`);
    const out = path.join(OUT_DIR, `${region.slug}.jpg`);
    await sharp(src)
      .resize(1200, 630, { fit: 'cover', position: 'centre' })
      .composite([{ input: overlaySvg(region.label), top: 0, left: 0 }])
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toFile(out);
    made += 1;
  }
  if (made > 0) console.log(`✅ ${made} imagens OG de região em public/images/og/regions/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
