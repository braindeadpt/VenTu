#!/usr/bin/env node
/**
 * Analisador do varrimento visual em píxeis.
 *
 * Olha para as capturas de `_audit/visual-sweep/shots/` (JPEG da página
 * inteira) e para as medições que as acompanham em `records/`, e produz
 * três coisas:
 *
 *   1. `index.json` — métricas de píxel por captura (tinta, faixas, cor
 *      dominante, hashes perceptuais) e o essencial do registo;
 *   2. `findings.json` / `findings.md` — os achados, por tipo e por rota;
 *   3. o que não se vê no ecrã: comparações entre COMBINAÇÕES da mesma rota
 *      (tema claro vs escuro, 390 vs 1440, locale vs locale) — um capítulo que a
 *      auditoria de DOM não consegue fazer, porque compara píxeis.
 *
 * Uso: node scripts/visual-sweep-analyze.mjs [--dir DIR] [--concurrency N] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const DIR = path.resolve(flag('dir', '_audit/visual-sweep'));
const CONCURRENCY = Number(flag('concurrency', 3));

const LIMIT = Number(flag('limit', 0));
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const byRoute = new Map(manifest.routes.map((r) => [r.path, r]));

const comboDirs = fs.existsSync(path.join(DIR, 'records')) ? fs.readdirSync(path.join(DIR, 'records')).sort() : [];
const combos = comboDirs.map((c) => {
  const [theme, width] = c.split('-');
  return { combo: c, theme, width };
});

/** Forma da rota com o locale abstraído — para comparar locales entre si. */
function shapeOf(routePath) {
  const seg = routePath.split('/').filter(Boolean);
  if (['pt', 'en', 'es', 'de', 'fr'].includes(seg[0])) seg[0] = '{l}';
  return '/' + seg.join('/') + (routePath.endsWith('/') ? '/' : '');
}

// ── recorte de métricas de píxel ───────────────────────────────────────────

const GREY = 64;
const LABELS = 16;

function median(sorted) {
  return sorted[Math.floor(sorted.length / 2)];
}

/** Distância de Hamming entre dois hashes hex de 64 bits. */
function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

function hash64(values, len) {
  let sum = 0;
  for (let i = 0; i < len; i++) sum += values[i];
  const avg = sum / len;
  let bits = '';
  for (let i = 0; i + 4 <= len; i += 4) {
    let nib = 0;
    for (let j = 0; j < 4; j++) nib = (nib << 1) | (values[i + j] > avg ? 1 : 0);
    bits += nib.toString(16);
  }
  return bits;
}

/**
 * Uma descodificação por captura, e tudo o resto calculado em processo.
 *
 * Isto não é optimização por gosto: a primeira versão descodificava o mesmo
 * JPEG cinco vezes (3 reescalas + 4 recortes de contraste por captura), o que
 * num export inteiro são ~50 000 descodificações de imagens de 1440×4000. O
 * `sharp` não guarda cache entre pipelines, por isso a conta era minutos a mais
 * por cada canal. Aqui descodifica-se UMA vez para RGB cru e os recortes são
 * fatias com passo, o que também permite medir contraste sem reescalar nada.
 */
async function scan(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;
  const greyAt = (x, y) => {
    const i = (y * W + x) * ch;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  // Grelha de amostragem (64×64 no máximo): suficiente para média, tinta,
  // faixas e hashes, e independente do tamanho da página.
  const gx = Math.min(GREY, W);
  const gy = Math.min(GREY, H);
  const grid = new Float64Array(gx * gy);
  for (let y = 0; y < gy; y++) {
    const sy = Math.min(H - 1, Math.floor(((y + 0.5) * H) / gy));
    for (let x = 0; x < gx; x++) {
      const sx = Math.min(W - 1, Math.floor(((x + 0.5) * W) / gx));
      grid[y * gx + x] = greyAt(sx, sy);
    }
  }

  let sum = 0;
  for (let i = 0; i < grid.length; i++) sum += grid[i];
  const mean = sum / grid.length;
  let varSum = 0;
  for (let i = 0; i < grid.length; i++) varSum += (grid[i] - mean) ** 2;
  const stdev = Math.sqrt(varSum / grid.length);
  const med = median([...grid].sort((a, b) => a - b));
  let inkCount = 0;
  for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - med) > 12) inkCount++;

  const bands = [];
  for (let b = 0; b < LABELS; b++) {
    const y0 = Math.floor((b * gy) / LABELS);
    const y1 = Math.max(y0 + 1, Math.floor(((b + 1) * gy) / LABELS));
    let s = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < gx; x++) {
      s += grid[y * gx + x];
      n++;
    }
    bands.push(Number((s / n).toFixed(1)));
  }

  const dvals = [];
  for (let y = 0; y < 8; y++) {
    const sy = Math.floor(((y + 0.5) * gy) / 8);
    for (let x = 0; x < 8; x++) {
      const x0 = Math.floor(((x + 0.25) * gx) / 9);
      const x1 = Math.floor(((x + 1.25) * gx) / 9);
      dvals.push(grid[sy * gx + Math.min(gx - 1, x0)] > grid[sy * gx + Math.min(gx - 1, x1)] ? 1 : 0);
    }
  }

  // Paleta por amostragem directa do RGB cru (quantizada a passos de 32).
  const counts = new Map();
  const stepX = Math.max(1, Math.floor(W / 64));
  const stepY = Math.max(1, Math.floor(H / 64));
  let nPix = 0;
  for (let y = 0; y < H; y += stepY) {
    for (let x = 0; x < W; x += stepX) {
      const i = (y * W + x) * ch;
      const key = `${data[i] >> 5}-${data[i + 1] >> 5}-${data[i + 2] >> 5}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      nPix++;
    }
  }
  const palette = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, n]) => {
      const [r, g, b] = k.split('-').map((v) => Number(v) * 32 + 16);
      return { rgb: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`, pct: Number(((n / nPix) * 100).toFixed(1)) };
    });

  return {
    width: W,
    height: H,
    bytes: fs.statSync(file).size,
    mean: Number(mean.toFixed(1)),
    stdev: Number(stdev.toFixed(1)),
    median: med,
    ink: Number(((inkCount / grid.length) * 100).toFixed(2)),
    bands,
    ahash: hash64(grid, grid.length),
    dhashBits: dvals.join(''),
    palette,
    // Guardado só durante a captura (a memória é libertada a seguir).
    _raw: { data, W, H, ch },
  };
}

/** Contraste real dentro da caixa de um elemento, medido nos píxeis já em RAM. */
function cropContrast(scanResult, box) {
  const { data, W: metaW, H: metaH, ch } = scanResult._raw;
  const meta = { width: metaW, height: metaH };
  const left = Math.max(0, Math.min(box.x, meta.width - 2));
  const width = Math.max(2, Math.min(box.w, meta.width - left));
  // Banda central: uma caixa de várias linhas não precisa de ser medida toda
  // (e medir 416×600 de um <p> custava mais do que dizia). 150 px de altura
  // apanham as linhas do meio, que é onde o texto está.
  const bandH = Math.min(box.h, 150);
  const top = Math.max(0, Math.min(box.y + Math.floor((box.h - bandH) / 2), meta.height - 2));
  const height = Math.max(2, Math.min(bandH, meta.height - top));
  if (width < 4 || height < 4) return null;
  // SEM reescala: reduzir uma caixa de 416×24 para 48×24 (o que a primeira
  // versão fazia) mistura as hastes de um texto de 14 px com o fundo, e o
  // «texto» passa a medir 1,8:1 quando o DOM promete 6,45:1 — 441 falsos
  // positivos. Só se reduz quando a caixa é grande (um <p> de vários parágrafos)
  // e mesmo aí por factor inteiro, que preserva as hastes.
  // Amostragem da caixa com passo: nunca mais de ~400 colunas × ~60 linhas, e
  // SEM reescala (reduzir 416 px para 48 px mistura as hastes de um texto de
  // 14 px com o fundo — foi a origem de 441 falsos positivos de «contraste»).
  const stepX = Math.max(1, Math.floor(width / 400));
  const stepY = Math.max(1, Math.floor(height / 60));
  const vals = new Uint8Array(Math.ceil(width / stepX) * Math.ceil(height / stepY));
  let n = 0;
  for (let y = top; y < top + height; y += stepY) {
    for (let x = left; x < left + width; x += stepX) {
      const i = (y * metaW + x) * ch;
      vals[n++] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    }
  }
  if (n < 16) return null;
  // DUAS populações, não «fundo + resto». Duas tentativas anteriores falharam
  // de formas opostas: percentis globais (p05/p95) ficavam cegos a texto
  // esparso numa caixa larga (o `<h1>` de 736×24 dava «1,03:1» com o texto
  // pintado a 240), e «mediana da caixa = fundo» fica ao contrário quando o
  // texto ocupa a maior parte da caixa (o `<h1>` do 404 dava «1,24:1» com
  // 95,7% de tinta — a mediana ERA o texto). Otsu responde às duas: acha o
  // limiar que separa as duas populações de luminância, sejam quais forem as
  // proporções. `separacao` diz se sequer existem duas populações.
  // Histograma em laço simples sobre o Buffer: `[...buf]` de 250 000 números
  // era o que fazia o analisador arrastar-se (e estourar o tempo do terminal).
  const hist = new Int32Array(256);
  for (let i = 0; i < n; i++) hist[vals[i]]++;
  const total = n;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let thr = 0;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const between = wB * wF * (sumB / wB - (sumAll - sumB) / wF) ** 2;
    if (between > best) {
      best = between;
      thr = i;
    }
  }
  let nB = 0;
  let sB = 0;
  let nF = 0;
  let sF = 0;
  for (let i = 0; i < 256; i++) {
    if (i <= thr) {
      nB += hist[i];
      sB += i * hist[i];
    } else {
      nF += hist[i];
      sF += i * hist[i];
    }
  }
  const dark = nB ? sB / nB : 0;
  const light = nF ? sF / nF : 0;
  const separation = Math.abs(light - dark);
  const minorityPct = Number(((Math.min(nB, nF) / total) * 100).toFixed(1));
  const lum = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l1 = lum(light);
  const l2 = lum(dark);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return {
    ratio: Number(ratio.toFixed(2)),
    inkPct: minorityPct,
    separation: Number(separation.toFixed(1)),
    pxBg: Number(dark.toFixed(1)),
    pxFg: Number(light.toFixed(1)),
  };
}

// ── leitura de todos os registos + imagens ─────────────────────────────────

const captures = [];
for (const { combo, theme, width } of combos) {
  const dir = path.join(DIR, 'records', combo);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) {
    const rec = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const shot = path.join(DIR, 'shots', combo, `${rec.slug}.jpg`);
    captures.push({ combo, theme, width, record: rec, shot, exists: fs.existsSync(shot) });
  }
}
console.error(`capturas: ${captures.length} em ${combos.length} combinações (${combos.map((c) => c.combo).join(', ')})`);

let done = 0;
// `--limit N`: analisar só N capturas (iterar no analisador sem esperar 10 min).
if (LIMIT > 0) captures.splice(LIMIT);
async function pool(items, worker, size) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await worker(item);
        done++;
        if (done % 500 === 0) console.error(`  … ${done}/${items.length}`);
      }
    }),
  );
}

await pool(
  captures.filter((c) => c.exists),
  async (c) => {
    try {
      const px = await scan(c.shot);
      // Os recortes de contraste saem da MESMA descodificação (é para isso que
      // o buffer cru fica vivo até aqui) e são libertados logo a seguir.
      const crops = [];
      for (const sample of (c.record.measure?.contrast ?? []).slice(0, 4)) {
        if (sample.y > px.height - 8) continue;
        const cc = cropContrast(px, sample);
        if (cc) {
          crops.push({
            ...cc,
            ...sample,
            path: c.record.path,
            combo: c.combo,
            theme: c.theme,
            width: c.width,
            family: c.record.family,
          });
        }
      }
      delete px._raw;
      c.px = px;
      c.crops = crops;
    } catch (err) {
      c.pxError = err instanceof Error ? err.message : String(err);
    }
  },
  CONCURRENCY,
);

// ── achados por captura ────────────────────────────────────────────────────

/**
 * O que é POR DESENHO numa família deixa de ser acusado como defeito — mas
 * continua registado, com a razão ao lado. Verificado ao vivo (sonda de
 * 2026-09-27), não presumido:
 *  · `/embed/spot/*` é o widget B2B: layout próprio (sem HydrationBeacon nem
 *    <main>), fundo `rgba(0,0,0,0)` para herdar o do iframe que o hospeda, e
 *    tamanho fixo — por isso é igual a 390 e a 1440 e «claro» em ambos os temas.
 *  · `/404` usa um shell mínimo: mostra a mensagem e dois links, sem header,
 *    rodapé, navegação, troca de tema ou de idioma.
 */
const EXPECTED = {
  'embed-spot': {
    'sem-hidratacao': 'widget B2B: layout próprio, sem HydrationBeacon (por desenho)',
    'sem-main': 'widget B2B: não é um documento (por desenho)',
    'tema-ao-contrario': 'widget B2B: fundo transparente — herda o do iframe hospedeiro (por desenho)',
    'largura-igual-em-pixéis': 'widget B2B: tamanho fixo, feito para iframes (por desenho)',
    'altura-anomala': 'widget B2B: altura = viewport (é um iframe) (por desenho)',
    // 66 provas, todas em light-390: o widget a 390 px é um painel quase todo
    // branco (tinta 0.68–0.93 % contra mediana 255). Verificado na grelha
    // `embed-spot-all-01`: o conteúdo está lá, é a caixa que sobra.
    'pagina-sem-tinta': 'widget B2B a 390 px: painel quase todo branco (por desenho)',
  },
  'erro-404': {
    'sem-main': 'shell de 404: só a mensagem e dois links, sem <main>',
  },
  // Rotas que dependem de sessão: no export estático mostram a casca
  // (≤25 caracteres visíveis). Não se podem VERIFICAR sem sessão — é o limite
  // declarado do varrimento, não um defeito do export.
  admin: {
    'pagina-sem-texto': 'rota de administração: casca sem sessão (por desenho no export)',
  },
  'auth-callback': {
    'pagina-sem-texto': 'callback de autenticação: casca de redireccionamento (por desenho)',
  },
};

const findings = [];
const add = (kind, severity, detail, c, extra = {}) => {
  const expected = EXPECTED[c.record.family]?.[kind];
  findings.push({
    kind,
    expected: expected ?? null,
    severity: expected ? 'info' : severity,
    detail: expected ? `${detail} — ${expected}` : detail,
    path: c.record.path,
    family: c.record.family,
    combo: c.combo,
    theme: c.theme,
    width: c.width,
    ...extra,
  });
};

const contrastChecks = [];
for (const c of captures) {
  const rec = c.record;
  const m = rec.measure;
  if (!c.exists || c.pxError) {
    add('captura-em-falta', 'error', c.pxError ?? 'sem JPEG no disco', c);
    continue;
  }
  if (rec.navError) add('captura-falhada', 'error', rec.navError, c);
  if (rec.status >= 400) add('http-erro', 'error', `status ${rec.status}`, c);
  if (rec.pageErrors.length) add('js-uncaught', 'error', rec.pageErrors.join(' | ').slice(0, 200), c);
  if (!m) {
    add('sem-medicao', 'error', 'a captura não chegou a medir a página', c);
    continue;
  }
  if (!m.htmlClass.includes('is-hydrated')) {
    add('sem-hidratacao', 'error', `html sem is-hydrated após 20 s (${m.maps.length} mapa(s), ${m.imgs.total} imagens)`, c);
  }
  if (!rec.settle.ok) {
    add('nao-assentou', 'warn', `quiescência não atingida (${rec.settle.ms} ms, ${rec.settle.samples} leituras) · ${rec.settle.signature}`, c);
  }
  const unsettled = m.maps.filter((x) => x.settled !== 'true');
  if (unsettled.length) {
    add(
      'mapa-nunca-assenta',
      'info',
      `${unsettled.length} de ${m.maps.length} mapas sem data-map-settled (${unsettled[0].w}×${unsettled[0].h} · ${unsettled[0].ancestor.slice(0, 90)})`,
      c,
    );
  }
  if (m.imgs.broken) add('imagem-quebrada', 'error', `${m.imgs.broken} imagem(ns) com naturalWidth 0`, c);
  if (m.imgs.incomplete) add('imagem-pendente', 'warn', `${m.imgs.incomplete} imagem(ns) por carregar no momento da captura`, c);
  // `skeletonBig` só existe nas capturas depois da correcção: a versão anterior
  // contava qualquer `.animate-pulse` e acusou 97 rotas de spot por causa de um
  // ponto de estado de 8×8 px (forense ao vivo em nazare/guincho).
  if (m.skeletonBig > 0) {
    add('esqueleto-congelado', 'warn', `${m.skeletonBig} elemento(s) em estado de carregamento com área ≥2000 px²`, c);
  } else if (m.skeletonBig === undefined && m.skeleton > 0) {
    // Capturas anteriores ao filtro de área: o número inclui `.animate-pulse`
    // decorativo. A amostra ao vivo (nazare, guincho) mostrou um ponto de
    // estado de 8×8 px — não é esqueleto. Fica registado, sem acusar.
    add(
      'elementos-com-pulso',
      'info',
      `${m.skeleton} elemento(s) com animate-pulse/aria-busy (captura anterior ao filtro de área; verificado ao vivo: ponto de estado de 8×8 px)`,
      c,
    );
  }
  if (m.docW > m.vw + 1) add('overflow-x', 'error', `documento ${m.docW}px > viewport ${m.vw}px`, c);
  if (m.mainCount === 0) add('sem-main', 'warn', 'sem landmark <main>', c);
  if (m.mainCount > 1) add('main-multiplo', 'warn', `${m.mainCount} elementos <main>`, c);
  if (m.textLen < 40) add('pagina-sem-texto', 'error', `${m.textLen} caracteres visíveis`, c);
  if (rec.failedRequests.length) add('pedido-falhado', 'warn', rec.failedRequests.join(' | ').slice(0, 220), c);
  if (c.px.stdev < 4) add('pagina-plana', 'error', `stdev ${c.px.stdev} — a página é uma cor só`, c);
  if (c.px.ink < 1) add('pagina-sem-tinta', 'error', `tinta ${c.px.ink}% (mediana ${c.px.median})`, c);
  // Tema: a classe tem de bater com o tema pedido, e os píxeis têm de ser coerentes.
  const wantOcean = c.theme === 'light';
  if (m.themeOcean !== wantOcean) {
    add('tema-nao-aplicado', 'error', `pedido ${c.theme}, html ${m.themeOcean ? 'theme-ocean' : 'sem classe'}`, c);
  }
  if (c.theme === 'dark' && c.px.mean > 150) add('tema-ao-contrario', 'warn', `tema escuro com média de luminância ${c.px.mean}`, c);
  if (c.theme === 'light' && c.px.mean < 80) add('tema-ao-contrario', 'warn', `tema claro com média de luminância ${c.px.mean}`, c);

  // Recortes de contraste (texto que o humano lê primeiro).
  for (const cc of c.crops ?? []) contrastChecks.push(cc);
}

// ── comparações entre combinações da MESMA rota ────────────────────────────

const byRouteCombo = new Map();
for (const c of captures) {
  if (!byRouteCombo.has(c.record.path)) byRouteCombo.set(c.record.path, new Map());
  byRouteCombo.get(c.record.path).set(c.combo, c);
}

/** Captura da página 404 de cada combinação — serve de referência para
 *  detectar qualquer rota que esteja a pintar o shell do 404. */
const ref404ByThemeWidth = new Map();
for (const c of captures) {
  if (c.px && ['/404/', '/_not-found/'].includes(c.record.path)) ref404ByThemeWidth.set(c.combo, c);
}

for (const [routePath, map] of byRouteCombo) {
  const shape = shapeOf(routePath);
  const route = byRoute.get(routePath);
  const pairs = [...map.values()].filter((c) => c.px);
  for (const a of pairs) {
    for (const b of pairs) {
      if (a === b) continue;
      const sameWidth = a.width === b.width;
      const sameTheme = a.theme === b.theme;
      const d = hamming(a.px.ahash, b.px.ahash);
      const dd = hamming(a.px.dhashBits, b.px.dhashBits);
      const dMean = Math.abs(a.px.mean - b.px.mean);
      if (sameWidth && !sameTheme && d <= 8 && dd <= 8 && dMean < 10) {
        add('tema-igual-em-pixéis', 'error', `«${a.combo}» e «${b.combo}» são praticamente a mesma imagem (aHash ${d}, dHash ${dd}, Δmédia ${dMean.toFixed(1)})`, a, {
          contra: b.combo,
        });
      }
      if (sameTheme && !sameWidth && d <= 8 && dd <= 8) {
        add('largura-igual-em-pixéis', 'warn', `«${a.combo}» e «${b.combo}» ficaram iguais (aHash ${d}, dHash ${dd}) — o layout não respondeu à largura`, a, {
          contra: b.combo,
        });
      }
    }
  }
  // Parece-404?
  if (!['/404', '/404/', '/_not-found/'].includes(routePath) && pairs.length) {
    for (const c of pairs) {
      const ref = ref404ByThemeWidth.get(c.combo);
      if (!ref) continue;
      const d = hamming(c.px.ahash, ref.px.ahash);
      const dd = hamming(c.px.dhashBits, ref.px.dhashBits);
      if (d <= 6 && dd <= 10) add('parece-404', 'error', `os píxeis batem com a página 404 (aHash ${d}, dHash ${dd})`, c);
    }
  }
  // Locales da mesma forma de rota.
  if (route && route.locale !== '—') {
    const others = [...map.values()].filter((c) => c.px && c.theme === pairs[0]?.theme && c.width === pairs[0]?.width);
    if (others.length >= 2) {
      const [first, ...rest] = others;
      for (const o of rest) {
        if (first.record.locale === o.record.locale) continue;
        const d = hamming(first.px.ahash, o.px.ahash);
        if (d <= 4) {
          add('locale-igual-em-píxeis', 'info', `«${first.record.locale}» e «${o.record.locale}» da ${shape} quase idênticos (aHash ${d})`, first, {
            contra: `${o.combo} ${o.record.locale}`,
          });
        }
      }
    }
  }
}

// Estatística por família, para separar o que é anómalo do que é a norma.
const familyStats = new Map();
for (const c of captures) {
  if (!c.px) continue;
  const key = `${c.record.family}|${c.combo}`;
  if (!familyStats.has(key)) familyStats.set(key, []);
  familyStats.get(key).push(c);
}
for (const [key, list] of familyStats) {
  const [family, combo] = key.split('|');
  if (list.length < 4) continue;
  const heights = list.map((c) => c.record.measure?.docH ?? c.px.height).sort((a, b) => a - b);
  const inks = list.map((c) => c.px.ink).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)];
  const medInk = inks[Math.floor(inks.length / 2)];
  for (const c of list) {
    const h = c.record.measure?.docH ?? c.px.height;
    if (h > medH * 2.5 && h - medH > 1_500) {
      add('altura-anomala', 'warn', `${family}: ${h} px contra mediana ${medH} px (${(h / medH).toFixed(1)}×)`, c);
    } else if (h < medH * 0.35 && medH - h > 1_200) {
      add('altura-anomala', 'warn', `${family}: ${h} px contra mediana ${medH} px (${(h / medH).toFixed(2)}×)`, c);
    }
    if (medInk > 1 && c.px.ink < medInk * 0.4) {
      add('tinta-anomala', 'warn', `${family}: tinta ${c.px.ink}% contra mediana ${medInk}%`, c);
    }
  }
}

// ── contraste: o que o DOM promete contra o que os píxeis mostram ──────────
//
// Uma medida crua de contraste em píxeis acusa tudo o que é texto discreto
// (o cinza secundário do tema dá ~3:1 e está CERTO por desenho) e tudo o que
// tem foto por baixo. O que interessa é a CONTRADIÇÃO: o DOM garante tinta
// clara sobre fundo escuro (ou vice-versa) e os píxeis não mostram nada — texto
// pintado por baixo de um overlay, cortado a zero, com `opacity` perdida ou
// com uma cor de token que não existe.

function parseRgb(value) {
  const m = String(value).match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((v) => Number(v.trim()));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}
function relLum({ r, g, b }) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** Contraste teórico (WCAG) entre a cor do texto e o fundo, com alpha composto. */
function theoreticalRatio(fgRaw, bgRaw) {
  const fg = parseRgb(fgRaw);
  const bg = parseRgb(bgRaw);
  if (!fg || !bg) return null;
  const over = {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  };
  const l1 = relLum(over);
  const l2 = relLum(bg);
  return Number((((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2));
}

let invisiveis = 0;
let teoricosBaixos = 0;
for (const cc of contrastChecks) {
  const teorico = theoreticalRatio(cc.color, cc.bg);
  const sujo = cc.bgImage === true || cc.hasImg === true;
  const desconhecido = cc.bgImage === undefined; // capturas anteriores à versão 2 do colector
  if (teorico !== null && teorico < 4.5) teoricosBaixos++;
  // `fontSize >= 16`: abaixo disso o Otsu mente. Nas provas a 100% de
  // `zoom-texto-invisivel-01.jpg` o «Register» (14 px) e o «Ver no mapa»
  // (11 px) são PERFEITAMENTE legíveis, mas os glifos finos anti-aliasados
  // dão uma população de tinta tão misturada com o fundo que a razão medida
  // cai a ~2.4:1 com qualquer cor. Os 6 achados anteriores a este guarda eram
  // todos deste tipo; o que interessa apanhar é texto GRANDE pintado por baixo
  // de um overlay, e aí a medida é fiável.
  if (
    !desconhecido &&
    !sujo &&
    cc.fontSize >= 16 &&
    cc.ratio !== null &&
    cc.inkPct >= 2 &&
    cc.separation >= 25 &&
    teorico !== null &&
    teorico >= 4.5 &&
    cc.ratio < 2.5
  ) {
    invisiveis++;
    findings.push({
      kind: 'texto-invisivel',
      severity: 'error',
      detail: `o DOM promete ${teorico}:1 (${cc.color} sobre ${cc.bg}) e os píxeis medem ${cc.ratio}:1 — «${cc.text.slice(0, 40)}» (${cc.sel.slice(0, 50)})`,
      path: cc.path,
      family: cc.family,
      combo: cc.combo,
      theme: cc.theme,
      width: cc.width,
    });
  }
  // Caixa com texto no DOM e NENHUMA segunda população de luminância: ou o
  // texto não é pintado, ou é pintado da cor do fundo. É o sinal mais directo
  // de «texto invisível» que existe — não depende de a cor computada mentir.
  //
  // A separação é um indicador GROSSEIRO: mede a distância entre as duas
  // populações de luminância da caixa. Em texto de 10-14 px sobre fotografia
  // (o crédito do Open-Meteo) ela anda nos 12–16 mesmo quando o texto se lê, e
  // nos 3–6 quando não se lê. Por isso o limiar é baixo (18) e o achado vale
  // pelo par: o recorte a 100% (`zoom-caixa-sem-tinta-*`) é que decide.
  if (!desconhecido && !sujo && cc.text.length >= 12 && cc.separation !== undefined && cc.separation < 18 && cc.w >= 40 && cc.h >= 12) {
    findings.push({
      kind: 'caixa-sem-tinta',
      severity: 'error',
      detail: `«${cc.text.slice(0, 50)}» — caixa de ${cc.w}×${cc.h} sem duas populações de luminância (separação ${cc.separation}, pxBg ${cc.pxBg}, DOM promete ${teorico}:1)`,
      path: cc.path,
      family: cc.family,
      combo: cc.combo,
      theme: cc.theme,
      width: cc.width,
    });
  }
}
console.error(
  `contraste: ${contrastChecks.length} caixas medidas · ${invisiveis} contradições DOM/píxeis · ` +
    `${teoricosBaixos} com contraste teórico abaixo de AA (informativo)`,
);

// Um canal rápido para o relatório: tamanho de letra dos <h1> por família — o
// único sítio onde uma classe de tipografia em falta aparece (16 px onde as
// outras famílias têm 24 ou 40).
const h1Sizes = {};
for (const cc of contrastChecks.filter((x) => x.tag === 'h1')) {
  h1Sizes[cc.family] ??= {};
  h1Sizes[cc.family][cc.fontSize] = (h1Sizes[cc.family][cc.fontSize] ?? 0) + 1;
}

// ── saída ──────────────────────────────────────────────────────────────────

const index = captures.map((c) => ({
  path: c.record.path,
  family: c.record.family,
  locale: c.record.locale,
  combo: c.combo,
  theme: c.theme,
  width: c.width,
  status: c.record.status,
  ms: c.record.ms,
  docH: c.record.measure?.docH ?? null,
  docW: c.record.measure?.docW ?? null,
  textLen: c.record.measure?.textLen ?? null,
  maps: c.record.measure?.maps?.length ?? null,
  settled: c.record.settle?.ok ?? null,
  px: c.px
    ? {
        w: c.px.width,
        h: c.px.height,
        bytes: c.px.bytes,
        mean: c.px.mean,
        stdev: c.px.stdev,
        ink: c.px.ink,
        bands: c.px.bands,
        ahash: c.px.ahash,
        dhash: c.px.dhashBits,
        palette: c.px.palette,
      }
    : null,
}));

const byKind = {};
for (const f of findings) {
  byKind[f.kind] ??= { severity: f.severity, total: 0, paths: new Set(), families: new Set(), examples: [] };
  const k = byKind[f.kind];
  k.total++;
  k.paths.add(f.path);
  k.families.add(f.family);
  if (k.examples.length < 6) k.examples.push(`${f.combo} ${f.path} — ${f.detail}`);
}

const summary = Object.fromEntries(
  Object.entries(byKind)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([kind, v]) => [
      kind,
      { severity: v.severity, provas: v.total, rotas: v.paths.size, familias: [...v.families], exemplos: v.examples },
    ]),
);

fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ captures: index.length, combos: combos.map((c) => c.combo), entries: index }));
fs.writeFileSync(path.join(DIR, 'findings.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary, findings }, null, 1));
fs.writeFileSync(
  path.join(DIR, 'contrast.json'),
  JSON.stringify(
    contrastChecks.map((c) => ({ ...c, teorico: theoreticalRatio(c.color, c.bg) })),
    null,
    1,
  ),
);
fs.writeFileSync(path.join(DIR, 'h1-sizes.json'), JSON.stringify(h1Sizes, null, 1));

const sevOrder = { error: 0, warn: 1, info: 2 };
const lines = [
  `# Achados do varrimento visual em píxeis`,
  '',
  `Capturas analisadas: **${captures.length}** · combinações: ${combos.map((c) => c.combo).join(', ')}`,
  '',
  '| tipo | gravidade | provas | rotas |',
  '| --- | --- | --- | --- |',
];
for (const [kind, v] of Object.entries(summary).sort((a, b) => sevOrder[a[1].severity] - sevOrder[b[1].severity] || b[1].provas - a[1].provas)) {
  lines.push(`| \`${kind}\` | ${v.severity} | ${v.provas} | ${v.rotas} |`);
}
for (const [kind, v] of Object.entries(summary)) {
  lines.push('', `## ${kind} (${v.severity}) — ${v.provas} provas em ${v.rotas} rotas`, '');
  for (const e of v.exemplos) lines.push(`- ${e}`);
}
fs.writeFileSync(path.join(DIR, 'findings.md'), lines.join('\n') + '\n');

console.error(`\nfindings: ${findings.length}`);
for (const [kind, v] of Object.entries(summary).sort((a, b) => sevOrder[a[1].severity] - sevOrder[b[1].severity] || b[1].provas - a[1].provas)) {
  console.error(`  ${v.severity.padEnd(5)} ${kind.padEnd(24)} ${String(v.provas).padStart(6)} provas  ${String(v.rotas).padStart(5)} rotas`);
}
if (args.includes('--json')) console.log(JSON.stringify(summary, null, 1));
