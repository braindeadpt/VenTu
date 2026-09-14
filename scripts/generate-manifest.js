#!/usr/bin/env node
/**
 * public/manifest.json — regenerado no build (depois de spots:lite).
 *
 * A descrição menciona a contagem de spots — quando spots.ts cresce o PWA
 * manifest ficava stale (visto 2026-09-14: dizia «174 spots» com 185 reais).
 * Só o número muda; o resto do manifesto é hand-curated e fica intacto.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'public/manifest.json');
const spotsLitePath = path.join(root, 'public/data/spots-lite.json');

const spots = JSON.parse(fs.readFileSync(spotsLitePath, 'utf-8'));
const count = Array.isArray(spots) ? spots.length : Object.keys(spots).length;
if (!count) {
  console.error('generate-manifest: spots-lite.json vazio — manifesto não tocado');
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const next = manifest.description.replace(/\d+ spots em Portugal/, `${count} spots em Portugal`);

if (next === manifest.description) {
  console.log(`generate-manifest: já correcto (${count} spots)`);
  process.exit(0);
}
manifest.description = next;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
console.log(`generate-manifest: descrição actualizada para ${count} spots`);
