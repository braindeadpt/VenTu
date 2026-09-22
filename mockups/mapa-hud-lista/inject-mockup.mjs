// Mockup do HUD mobile + lista sincronizada — auditoria do mapa (prompt 9).
//
// SÓ MOCKUP: injeta DOM/CSS por cima de /pt/mapa/ servida do build e2e.
// Não toca em src/ nem tests/. Serve os shots de mockups/mapa-hud-lista/shots/.
//
// Uso:
//   npm run build:e2e            (se out/ não existir)
//   npx serve out -l 4189        (num terminal)
//   node mockups/mapa-hud-lista/inject-mockup.mjs
//
// O mockup usa SÓ tokens do design system (rgb(var(--token))) — os dois temas
// saem de graça: escuro = default, claro = .theme-ocean no <html>.

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.MOCKUP_BASE ?? 'http://127.0.0.1:4189';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

// ─── CSS do mockup (tokens da casa; sem cores novas) ───────────────────────
const CSS = /* css */ `
  #mk-root * { box-sizing: border-box; font-family: inherit; }
  #mk-root { position: fixed; inset: 0; z-index: 2100; pointer-events: none;
    color: rgb(var(--fg)); font-size: 14px; }

  /* ── Sheet mobile ── */
  #mk-sheet { position: absolute; left: 8px; right: 8px; bottom: 8px;
    pointer-events: auto; display: flex; flex-direction: column;
    background: rgb(var(--bg-elevated)); border: 1px solid rgb(var(--divider-strong));
    border-radius: 16px; box-shadow: 0 12px 32px rgb(0 0 0 / .45); overflow: hidden; }
  .mk-grabber { display: flex; align-items: center; justify-content: center;
    min-height: 32px; width: 100%; border: 0; background: transparent; cursor: grab; }
  .mk-handle { width: 40px; height: 4px; border-radius: 2px; background: rgb(var(--fg-disabled)); }
  .mk-body { padding: 0 12px 10px; display: flex; flex-direction: column; gap: 8px; }

  .mk-best { display: flex; align-items: center; gap: 10px; min-height: 48px;
    padding: 6px 8px; border-radius: 10px; background: rgb(var(--surface-1-rgb) / .05);
    border: 1px solid rgb(var(--divider)); cursor: pointer; }
  .mk-best-kicker { font-size: 10px; font-weight: 600; letter-spacing: .04em;
    text-transform: uppercase; color: rgb(var(--fg-subtle)); }
  .mk-best-name { font-family: var(--font-display, inherit); font-weight: 700; font-size: 15px; }
  .mk-best-region { font-size: 12px; color: rgb(var(--fg-muted)); }
  .mk-best-factors { margin-left: auto; font-family: var(--font-mono, monospace);
    font-size: 12px; text-align: right; color: rgb(var(--fg-muted)); line-height: 1.35; }

  .mk-score { display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
    width: 44px; height: 44px; border-radius: 10px; font-family: var(--font-mono, monospace);
    font-weight: 700; font-size: 17px; line-height: 1; flex-shrink: 0; }
  .mk-score small { font-size: 7px; font-weight: 600; letter-spacing: .05em; margin-top: 2px; }
  .mk-score-epic  { background: rgb(var(--score-epic)  / .18); color: rgb(var(--score-epic)); }
  .mk-score-good  { background: rgb(var(--score-good)  / .18); color: rgb(var(--score-good)); }
  .mk-score-fair  { background: rgb(var(--score-fair)  / .18); color: rgb(var(--score-fair)); }
  .mk-score-poor  { background: rgb(var(--score-poor)  / .18); color: rgb(var(--score-poor)); }
  .mk-score-closed{ background: rgb(var(--score-closed)/ .18); color: rgb(var(--fg-subtle)); }

  .mk-pillrow { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
  .mk-pillrow::-webkit-scrollbar { display: none; }
  .mk-pill { flex-shrink: 0; min-height: 36px; padding: 0 12px; border-radius: 999px;
    border: 1px solid rgb(var(--divider)); background: rgb(var(--surface-1-rgb) / .05);
    color: rgb(var(--fg-muted)); font-size: 12.5px; font-weight: 600;
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .mk-pill.mk-on { border-color: rgb(var(--score-good) / .5); color: rgb(var(--score-good));
    background: rgb(var(--score-good) / .12); }
  .mk-pill .mk-dot { width: 6px; height: 6px; border-radius: 3px; background: currentColor; }

  .mk-warn { display: flex; align-items: center; gap: 8px; min-height: 40px;
    padding: 6px 10px; border-radius: 10px; font-size: 12px;
    background: rgb(var(--score-fair) / .12); border: 1px solid rgb(var(--score-fair) / .35);
    color: rgb(var(--fg)); }
  .mk-warn button { margin-left: auto; font-size: 11px; font-weight: 600;
    color: rgb(var(--fg-muted)); border: 1px solid rgb(var(--divider));
    border-radius: 6px; padding: 4px 8px; background: transparent; cursor: pointer; }

  .mk-sec { display: flex; flex-direction: column; gap: 6px; }
  .mk-sec-label { font-size: 10.5px; font-weight: 700; letter-spacing: .05em;
    text-transform: uppercase; color: rgb(var(--fg-subtle)); }
  .mk-layers { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .mk-layer { display: flex; align-items: center; gap: 8px; min-height: 40px;
    padding: 6px 10px; border-radius: 10px; border: 1px solid rgb(var(--divider));
    background: rgb(var(--surface-1-rgb) / .04); font-size: 12.5px; font-weight: 600;
    color: rgb(var(--fg-muted)); cursor: pointer; }
  .mk-layer .mk-tick { width: 14px; height: 14px; border-radius: 4px; flex-shrink: 0;
    border: 1.5px solid rgb(var(--fg-subtle)); }
  .mk-layer.mk-on { color: rgb(var(--fg)); border-color: rgb(var(--divider-strong)); }
  .mk-layer.mk-on .mk-tick { background: rgb(var(--accent-rgb) / .9); border-color: transparent; }

  /* ── Lista sincronizada ── */
  .mk-list-head { display: flex; align-items: baseline; gap: 8px; padding: 2px 2px 6px; }
  .mk-list-title { font-family: var(--font-display, inherit); font-weight: 700; font-size: 15px; }
  .mk-list-count { font-family: var(--font-mono, monospace); font-size: 12px; color: rgb(var(--fg-subtle)); }
  .mk-list-sort { margin-left: auto; font-size: 11.5px; color: rgb(var(--fg-muted)); }
  .mk-rows { display: flex; flex-direction: column; overflow-y: auto; }
  .mk-row { display: flex; align-items: center; gap: 10px; min-height: 52px;
    padding: 5px 6px; border-radius: 10px; border: 0; background: transparent;
    text-align: left; cursor: pointer; color: inherit; }
  .mk-row:hover, .mk-row:focus-visible { background: rgb(var(--surface-1-rgb) / .06); }
  .mk-row .mk-score { width: 38px; height: 38px; font-size: 14px; border-radius: 8px; }
  .mk-row-name { font-weight: 600; font-size: 13.5px; }
  .mk-row-meta { font-size: 11.5px; color: rgb(var(--fg-muted)); }
  .mk-row-factors { margin-left: auto; font-family: var(--font-mono, monospace);
    font-size: 11.5px; color: rgb(var(--fg-muted)); text-align: right; }
  .mk-list-hint { font-size: 11px; color: rgb(var(--fg-subtle)); padding: 8px 2px 2px; }

  /* ── Painel desktop ── */
  #mk-panel { position: absolute; top: 84px; bottom: 12px; left: 12px; width: 348px;
    pointer-events: auto; display: flex; flex-direction: column;
    background: rgb(var(--bg-elevated) / .96); backdrop-filter: blur(10px);
    border: 1px solid rgb(var(--divider-strong)); border-radius: 16px;
    box-shadow: 0 12px 32px rgb(0 0 0 / .35); overflow: hidden; }
  #mk-panel .mk-body { padding: 10px 12px; }
  #mk-panel .mk-rows { flex: 1; }
  .mk-panel-foot { border-top: 1px solid rgb(var(--divider)); padding: 8px 12px;
    font-size: 10.5px; color: rgb(var(--fg-subtle)); display: flex; gap: 8px; align-items: center; }
  .mk-legend-mini { display: flex; gap: 3px; }
  .mk-legend-mini i { width: 18px; height: 6px; border-radius: 3px; display: block; }

  #mk-rail { position: absolute; top: 84px; left: 12px; width: 48px; padding: 6px 0;
    pointer-events: auto; display: flex; flex-direction: column; align-items: center; gap: 8px;
    background: rgb(var(--bg-elevated) / .96); border: 1px solid rgb(var(--divider-strong));
    border-radius: 12px; }
  #mk-rail .mk-count { writing-mode: vertical-rl; font-family: var(--font-mono, monospace);
    font-size: 11px; color: rgb(var(--fg-subtle)); }
  #mk-rail button { width: 36px; height: 36px; border-radius: 8px; border: 0;
    background: transparent; color: rgb(var(--fg-muted)); font-size: 16px; cursor: pointer; }
`;

// ─── Dados fictícios realistas (PT) ─────────────────────────────────────────
const SPOTS = [
  { name: 'Nazaré', region: 'Norte', score: 84, tier: 'epic',  tierLabel: 'ÉPICO', factors: '2.4 m · 14 s · NW 8 kt' },
  { name: 'Coxos', region: 'Centro', score: 72, tier: 'good',  tierLabel: 'BOM',   factors: '1.6 m · 11 s · N 12 kt' },
  { name: 'Supertubos', region: 'Centro', score: 68, tier: 'good', tierLabel: 'BOM', factors: '1.4 m · 10 s · NW 14 kt' },
  { name: 'Moledo', region: 'Norte', score: 61, tier: 'good',  tierLabel: 'BOM',   factors: '1.2 m · 9 s · N 10 kt' },
  { name: 'Carcavelos', region: 'Lisboa', score: 55, tier: 'fair', tierLabel: 'FUN', factors: '1.1 m · 8 s · NW 16 kt' },
  { name: 'Costa da Caparica', region: 'Lisboa', score: 48, tier: 'fair', tierLabel: 'FUN', factors: '1.0 m · 8 s · W 12 kt' },
  { name: 'São Torpes', region: 'Alentejo', score: 33, tier: 'poor', tierLabel: 'FLAT', factors: '0.7 m · 6 s · SW 18 kt' },
  { name: 'Praia da Rocha', region: 'Algarve', score: 22, tier: 'poor', tierLabel: 'FLAT', factors: '0.5 m · 5 s · S 9 kt' },
];

const LAYERS = [
  ['Radar IPMA', true], ['Ondulação (Hs)', false], ['Temperatura', false], ['Correntes', false],
  ['Isobáticas', true], ['Batimetria', false], ['Sinalização', false], ['Avisos costeiros', false], ['Boias', true],
];

const row = (s) => `
  <button class="mk-row" type="button">
    <span class="mk-score mk-score-${s.tier}">${s.score}</span>
    <span><span class="mk-row-name">${s.name}</span><br>
      <span class="mk-row-meta">${s.region}</span></span>
    <span class="mk-row-factors">${s.factors}</span>
  </button>`;

const grabber = (label) =>
  `<button class="mk-grabber" type="button" aria-label="${label}"><span class="mk-handle"></span></button>`;

const bestSpot = SPOTS[0];

// ─── Estados do sheet mobile ───────────────────────────────────────────────
const sheetPeek = () => `
  <div id="mk-sheet" data-state="peek" role="region" aria-label="Painel do mapa">
    ${grabber('Abrir filtros e lista de spots')}
    <div class="mk-body">
      <button class="mk-best" type="button" aria-label="Melhor spot agora: ${bestSpot.name}, score ${bestSpot.score}">
        <span class="mk-score mk-score-${bestSpot.tier}">${bestSpot.score}<small>${bestSpot.tierLabel}</small></span>
        <span>
          <span class="mk-best-kicker">Melhor agora</span><br>
          <span class="mk-best-name">${bestSpot.name}</span>
          <span class="mk-best-region">· ${bestSpot.region}</span>
        </span>
        <span class="mk-best-factors">${bestSpot.factors}</span>
      </button>
      <div class="mk-pillrow" role="group" aria-label="Filtros essenciais">
        <button class="mk-pill" type="button">Surf ▾</button>
        <button class="mk-pill" type="button">Região ▾</button>
        <button class="mk-pill mk-on" type="button" aria-pressed="true">⚡ A bombar</button>
      </div>
    </div>
  </div>`;

// Variante B do peek: sem «Melhor agora» — contagem + filtros numa só linha.
const sheetPeekB = () => `
  <div id="mk-sheet" data-state="peek" role="region" aria-label="Painel do mapa">
    ${grabber('Abrir filtros e lista de spots')}
    <div class="mk-body">
      <div class="mk-pillrow" role="group" aria-label="Filtros essenciais">
        <button class="mk-pill" type="button"><span class="mk-dot"></span>32 spots</button>
        <button class="mk-pill" type="button">Surf ▾</button>
        <button class="mk-pill" type="button">Região ▾</button>
        <button class="mk-pill mk-on" type="button" aria-pressed="true">⚡ A bombar</button>
      </div>
    </div>
  </div>`;

const sheetHalf = () => `
  <div id="mk-sheet" data-state="half" role="region" aria-label="Filtros e camadas do mapa">
    ${grabber('Abrir lista de spots')}
    <div class="mk-body" style="overflow-y:auto; max-height:56vh">
      <div class="mk-warn">⚠ 2 boias sem dados há 5 h
        <button type="button">Dispensar</button></div>
      <div class="mk-sec"><span class="mk-sec-label">Modalidade</span>
        <div class="mk-pillrow">
          ${['Todas','Surf','Bodyboard','Kitesurf','Windsurf','SUP'].map((s,i)=>`<button class="mk-pill${i===1?' mk-on':''}" type="button">${s}</button>`).join('')}
        </div></div>
      <div class="mk-sec"><span class="mk-sec-label">Nível</span>
        <div class="mk-pillrow">
          ${['Todos','Iniciante','Intermédio','Avançado'].map((s,i)=>`<button class="mk-pill${i===0?' mk-on':''}" type="button">${s}</button>`).join('')}
        </div></div>
      <div class="mk-sec"><span class="mk-sec-label">Região</span>
        <div class="mk-pillrow">
          ${['Todas','Norte','Centro','Lisboa','Alentejo','Algarve'].map((s,i)=>`<button class="mk-pill${i===0?' mk-on':''}" type="button">${s}</button>`).join('')}
        </div></div>
      <div class="mk-sec"><span class="mk-sec-label">Camadas</span>
        <div class="mk-layers">
          ${LAYERS.map(([l,on])=>`<button class="mk-layer${on?' mk-on':''}" type="button" aria-pressed="${on}"><span class="mk-tick"></span>${l}</button>`).join('')}
        </div></div>
      <div class="mk-sec"><span class="mk-sec-label">Ver também</span>
        <div class="mk-layers">
          <button class="mk-layer mk-on" type="button" aria-pressed="true"><span class="mk-tick"></span>Agrupar marcadores</button>
          <button class="mk-layer" type="button" aria-pressed="false"><span class="mk-tick"></span>Vento</button>
          <button class="mk-layer" type="button" aria-pressed="false"><span class="mk-tick"></span>Previsão 48 h</button>
          <button class="mk-layer" type="button" aria-pressed="false"><span class="mk-tick"></span>Satélite</button>
          <button class="mk-layer" type="button"><span class="mk-tick"></span>Legenda do score</button>
          <button class="mk-layer" type="button"><span class="mk-tick"></span>Sair do ecrã cheio</button>
        </div></div>
    </div>
  </div>`;

const sheetOpen = () => `
  <div id="mk-sheet" data-state="open" role="region" aria-label="Lista de spots na vista" style="height:78vh">
    ${grabber('Fechar lista')}
    <div class="mk-body" style="flex:1; min-height:0">
      <div class="mk-list-head">
        <span class="mk-list-title">Nesta vista</span>
        <span class="mk-list-count">32 spots</span>
        <span class="mk-list-sort">por score ▾</span>
      </div>
      <div class="mk-rows" role="listbox" aria-label="Spots visíveis no mapa">
        ${SPOTS.map(row).join('')}
      </div>
      <p class="mk-list-hint">A lista segue o pan/zoom do mapa. Tocar num spot aproxima e abre o detalhe — com teclado: ↑ ↓ navegam, Enter abre.</p>
    </div>
  </div>`;

// ─── Painel desktop ─────────────────────────────────────────────────────────
const panelOpen = () => `
  <div id="mk-panel" role="complementary" aria-label="Spots na vista actual">
    <div class="mk-body" style="flex:1; min-height:0; display:flex; flex-direction:column; gap:8px">
      <div class="mk-list-head" style="padding-top:0">
        <span class="mk-list-title">Nesta vista</span>
        <span class="mk-list-count">32 spots</span>
        <span class="mk-list-sort">por score ▾</span>
        <button type="button" aria-label="Recolher painel" style="border:0;background:transparent;color:rgb(var(--fg-muted));font-size:16px;cursor:pointer">«</button>
      </div>
      <div class="mk-pillrow">
        <button class="mk-pill" type="button">Surf ▾</button>
        <button class="mk-pill" type="button">Região ▾</button>
        <button class="mk-pill mk-on" type="button" aria-pressed="true">⚡ A bombar</button>
      </div>
      <div class="mk-warn">⚠ 2 boias sem dados há 5 h
        <button type="button">Dispensar</button></div>
      <div class="mk-rows" role="listbox" aria-label="Spots visíveis no mapa">
        ${SPOTS.map(row).join('')}
      </div>
      <div class="mk-panel-foot">
        <span>Score</span>
        <span class="mk-legend-mini">
          <i style="background:rgb(var(--score-epic))"></i><i style="background:rgb(var(--score-good))"></i>
          <i style="background:rgb(var(--score-fair))"></i><i style="background:rgb(var(--score-poor))"></i>
          <i style="background:rgb(var(--score-closed))"></i>
        </span>
        <span>épico → fechado</span>
      </div>
    </div>
  </div>`;

const panelRail = () => `
  <div id="mk-rail">
    <button type="button" aria-label="Abrir lista de spots">»</button>
    <span class="mk-count">32 spots</span>
  </div>`;

// ─── Matrix de shots ────────────────────────────────────────────────────────
const SHOTS = [
  { name: 'm-peek-a-dark',   vp: { width: 390, height: 844 },  theme: 'dark',  dom: sheetPeek,  hide: ['hud', 'legend'] },
  { name: 'm-peek-a-light',  vp: { width: 390, height: 844 },  theme: 'light', dom: sheetPeek,  hide: ['hud', 'legend'] },
  { name: 'm-peek-b-dark',   vp: { width: 390, height: 844 },  theme: 'dark',  dom: sheetPeekB, hide: ['hud', 'legend'] },
  { name: 'm-half-dark',     vp: { width: 390, height: 844 },  theme: 'dark',  dom: sheetHalf,  hide: ['hud', 'legend'] },
  { name: 'm-half-light',    vp: { width: 390, height: 844 },  theme: 'light', dom: sheetHalf,  hide: ['hud', 'legend'] },
  { name: 'm-open-dark',     vp: { width: 390, height: 844 },  theme: 'dark',  dom: sheetOpen,  hide: ['hud', 'legend'] },
  { name: 'm-open-light',    vp: { width: 390, height: 844 },  theme: 'light', dom: sheetOpen,  hide: ['hud', 'legend'] },
  { name: 'd-panel-dark',    vp: { width: 1440, height: 900 }, theme: 'dark',  dom: panelOpen,  hide: ['hud'] },
  { name: 'd-panel-light',   vp: { width: 1440, height: 900 }, theme: 'light', dom: panelOpen,  hide: ['hud'] },
  { name: 'd-rail-dark',     vp: { width: 1440, height: 900 }, theme: 'dark',  dom: panelRail,  hide: ['hud'] },
];

const hideChrome = (what) => {
  if (what.includes('hud')) {
    // O cartão «Modo Explorar» (não o wrapper [data-map-hud], que é o mapa todo).
    document
      .querySelectorAll('[role="region"][aria-label="Modo explorar"], [role="region"][aria-label="Explore mode"]')
      .forEach((el) => { el.style.display = 'none'; });
  }
  if (what.includes('legend')) {
    // Legenda flutuante «SCORE NÁUTICO» — no mockup vive dentro do sheet/painel.
    const cand = [...document.querySelectorAll('div')]
      .filter((d) => d.children.length && /SCORE N[AÁ]UTICO|Score náutico|Nautical score/i.test(d.textContent ?? '') && d.textContent.length < 900);
    for (const el of cand) {
      const box = el.closest('div[class*="absolute"]') ?? el;
      box.style.display = 'none';
      break;
    }
  }
};

const only = process.argv[2]; // opcional: prefixo do nome para correr um subset

const browser = await chromium.launch();
for (const shot of SHOTS) {
  if (only && !shot.name.startsWith(only)) continue;
  const ctx = await browser.newContext({
    viewport: shot.vp,
    reducedMotion: 'reduce',
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  if (shot.theme === 'light') {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('windspot:theme', 'light');
        document.cookie = 'ventu-theme=light;path=/;max-age=31536000;samesite=lax';
      } catch { /* noop */ }
    });
  }
  await page.goto(`${BASE}/pt/mapa/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('.leaflet-container', { timeout: 30_000 });
  await page.waitForSelector('.spot-marker', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1500); // tiles + marcadores assentam

  await page.evaluate(hideChrome, shot.hide);
  await page.evaluate(
    ({ css, dom }) => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      const root = document.createElement('div');
      root.id = 'mk-root';
      root.innerHTML = dom;
      document.body.appendChild(root);
    },
    { css: CSS, dom: shot.dom() },
  );
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, `${shot.name}.png`) });
  console.log(`✓ ${shot.name}.png`);
  await ctx.close();
}
await browser.close();
console.log(`shots → ${OUT}`);
