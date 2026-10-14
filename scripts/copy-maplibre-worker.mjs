#!/usr/bin/env node
/**
 * Copia o worker do MapLibre GL (v6, ES module) para `public/vendor/` antes do
 * build e do dev (#184). Com o bundler, o `import.meta.url` do MapLibre deixa
 * de apontar para a pasta `dist/`, por isso a página de spot chama
 * `setWorkerUrl('/vendor/maplibre-gl-worker-<versão>.mjs')`: o worker é servido
 * da mesma origem e a CSP fica `worker-src 'self' blob:` (sem CDN nem
 * `unsafe-eval`). O nome leva a versão para o cache nunca servir um worker de
 * outra versão. Ficheiro gerado: ignorado no git (.gitignore).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = path.join(raiz, 'node_modules', 'maplibre-gl');
const { version } = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
const origem = path.join(pkg, 'dist', 'maplibre-gl-worker.mjs');
const destDir = path.join(raiz, 'public', 'vendor');
const destino = path.join(destDir, `maplibre-gl-worker-${version}.mjs`);

fs.mkdirSync(destDir, { recursive: true });
for (const f of fs.readdirSync(destDir))
  if (/^maplibre-gl-worker-.*\.mjs$/.test(f) && path.join(destDir, f) !== destino) fs.rmSync(path.join(destDir, f));
fs.copyFileSync(origem, destino);
console.log(`maplibre-gl ${version}: worker → ${path.relative(raiz, destino)}`);
