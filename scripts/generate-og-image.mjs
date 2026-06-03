/**
 * Renders public/og-image.svg → public/og-image.png (1200×630)
 * WhatsApp / Facebook / X require PNG/JPG — not SVG.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'public', 'og-image.svg');
const pngPath = path.join(root, 'public', 'og-image.png');

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('❌ sharp not installed. Run: npm install --save-dev sharp');
    process.exit(1);
  }

  const svg = fs.readFileSync(svgPath);
  await sharp(svg, { density: 144 })
    .resize(1200, 630, { fit: 'fill' })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(pngPath);

  const stat = fs.statSync(pngPath);
  const kb = Math.round(stat.size / 1024);
  console.log(`✅ OG image: ${pngPath} (${kb} KB)`);
  if (kb > 300) {
    console.warn('⚠️  File > 300 KB — WhatsApp may skip. Consider simplifying SVG.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
