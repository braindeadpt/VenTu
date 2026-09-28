#!/usr/bin/env node
/**
 * Servidor estático para os varrimentos longos do export.
 *
 * Porque não o `serve`: em duas corridas do varrimento visual ele morreu a meio
 * — a primeira vez com `EMFILE: too many open files`, a segunda em silêncio —
 * e todas as capturas seguintes saíram «ERR_CONNECTION_REFUSED» (578 e 535
 * registos corrompidos, apagados e repetidos). O `serve-handler` abre um
 * `ReadStream` por pedido e não o destrói quando o cliente aborta — e este
 * cliente aborta muito: o Playwright cancela prefetches a cada navegação.
 *
 * Aqui o stream é destruído no `close` da resposta, o ficheiro só se abre
 * depois do `stat`, e o processo diz quanto tempo viveu ao sair.
 *
 * Uso: node scripts/visual-sweep-server.mjs [DIR] [PORT]
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] ?? 'out');
const PORT = Number(process.argv[3] ?? 4321);
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const started = Date.now();
let served = 0;
let notFound = 0;

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let file = path.join(ROOT, clean);
  if (!file.startsWith(ROOT)) return null;
  if (clean.endsWith('/')) file = path.join(file, 'index.html');
  else if (!path.extname(file)) file = path.join(file, 'index.html');
  return file;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url ?? '/');
  if (!file) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('403');
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      notFound++;
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      fs.createReadStream(path.join(ROOT, '404.html'))
        .on('error', () => res.end('<h1>404</h1>'))
        .pipe(res);
      return;
    }
    served++;
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(st.size),
      'cache-control': 'no-store',
    });
    const stream = fs.createReadStream(file);
    // O ponto todo: quando o cliente aborta (prefetch cancelado), o descritor
    // fecha. Sem isto, ~250 pedidos abortados chegavam para esgotar o limite.
    res.on('close', () => stream.destroy());
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('500');
    });
    stream.pipe(res);
  });
});

server.on('clientError', (_err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, HOST, () => {
  console.error(`[serve-vsweep] ${ROOT} em http://${HOST}:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.error(
      `[serve-vsweep] a sair após ${((Date.now() - started) / 1000).toFixed(0)} s · ${served} ficheiros · ${notFound} 404`,
    );
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000);
  });
}
