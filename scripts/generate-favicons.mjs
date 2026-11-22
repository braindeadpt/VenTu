#!/usr/bin/env node
/**
 * Gera os favicons PNG (16/32) e o apple-touch-icon (180) a partir dos SVG em
 * public/, para crawlers/social previews e browsers que não usam o SVG
 * (auditoria de design, item estrutural #5).
 *
 * Corre no `npm run og:generate` (primeiro passo do build), como o og-image:
 * são artefactos GERADOS, não ficheiros trackeados — o .gitignore cobre-os e
 * cada build reproduz o resultado a partir dos SVG.
 *
 * Uso: node scripts/generate-favicons.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const targets = [
  { src: 'favicon.svg', out: 'favicon-16x16.png', size: 16 },
  { src: 'favicon.svg', out: 'favicon-32x32.png', size: 32 },
  { src: 'apple-touch-icon.svg', out: 'apple-touch-icon.png', size: 180 },
  // Android/TWA + Play Store — PNGs reais (og-image.png é 1200×630, não serve)
  { src: 'apple-touch-icon.svg', out: 'icon-192.png', size: 192 },
  { src: 'apple-touch-icon.svg', out: 'icon-512.png', size: 512 },
];

for (const t of targets) {
  const svgPath = path.join(publicDir, t.src);
  if (!fs.existsSync(svgPath)) {
    console.warn(`⚠️  ${t.src} em falta — favicon ${t.out} saltado`);
    continue;
  }
  await sharp(fs.readFileSync(svgPath), { density: 384 })
    .resize(t.size, t.size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, t.out));
  console.log(`✅ ${t.out} (${t.size}×${t.size})`);
}

// Ícone maskable (Android 8+): o sistema pode cortar a imagem em círculo/
// squircle — o conteúdo tem de ficar dentro da «safe zone» central (~80%).
// Fundo full-bleed na theme_color + marca a 62% centrada.
const maskSrc = path.join(publicDir, 'apple-touch-icon.svg');
if (fs.existsSync(maskSrc)) {
  const inner = await sharp(fs.readFileSync(maskSrc), { density: 384 })
    .resize(318, 318, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(publicDir, 'icon-maskable-512.png'));
  console.log('✅ icon-maskable-512.png (512×512, safe zone)');
}
