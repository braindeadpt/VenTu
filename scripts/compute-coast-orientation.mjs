#!/usr/bin/env node
/**
 * compute-coast-orientation.mjs (#178)
 *
 * Calcula, para cada spot de `src/lib/spots.ts`, a orientação da costa (a
 * normal virada para o MAR, ver `scripts/lib/coastOrientation.mjs`) a partir da
 * linha de costa do OpenStreetMap, e escreve o ficheiro de revisão
 * `data/coast-orientation-review.json` (antes → depois, evidência e motivos de
 * revisão). Com `--apply`, aplica a coluna `final` a `src/lib/spots.ts`.
 *
 * Corre offline, à mão (não faz parte do pipeline nem do build; o browser não
 * faz nenhum pedido a terceiros). Documentação: docs/COAST-ORIENTATION.md.
 *
 * Uso:
 *   node scripts/compute-coast-orientation.mjs --fetch      # descarrega o que falta para .cache/coast-orientation/
 *   node scripts/compute-coast-orientation.mjs              # recalcula a revisão a partir da cache (idempotente)
 *   node scripts/compute-coast-orientation.mjs --apply      # recalcula e aplica a src/lib/spots.ts
 *   opções: --raio=2000 (m, pedido Overpass)  --max-s=100 (tempo máx. de --fetch)
 *
 * Regras do valor final (`origem`):
 *  - `curado`: os spots da maquete v6 (`src/lib/spotEditorial.json`) ficam com o
 *    `praiaVirada` revisto à mão, para o motor antigo e o v6 dizerem o mesmo;
 *  - `osm`: o valor calculado (arredondado a 5°), quando a geometria é limpa;
 *  - `manual`: valor fixado à mão (`VALOR_MANUAL`, spots da lista de revisão manual);
 *  - `agua-interior`: spots com `aguaInterior: true` em `src/lib/spots.ts` (albufeiras,
 *    lagoas e rios interiores, cable parks): o vento não se classifica em
 *    onshore/offshore; o valor fica como está e não se usa para o vento;
 *  - `mantido`: estuários, lagoas, rios e albufeiras (lista explícita abaixo),
 *    spots sem costa a < raio ou com geometria ambígua: NÃO se adivinha; o valor
 *    actual fica e o spot vai para revisão manual, com o calculado ao lado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orientacaoCosta, viasDeOverpass, difAng, n360 } from './lib/coastOrientation.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPOTS_TS = path.join(raiz, 'src/lib/spots.ts');
const EDITORIAL = path.join(raiz, 'src/lib/spotEditorial.json');
const CACHE = path.join(raiz, '.cache', 'coast-orientation');
const OUT = path.join(raiz, 'data', 'coast-orientation-review.json');

const args = process.argv.slice(2);
const opt = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? Number(a.split('=')[1]) : d;
};
const RAIO = opt('raio', 2000);
const MAX_S = opt('max-s', 100);
const FETCH = args.includes('--fetch');
const APPLY = args.includes('--apply');

const OVERPASS = [
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  // 22/10: os três acima falharam (502/timeout); o espelho francês respondeu e deu o mesmo resultado nos spots de controlo
  'https://overpass.openstreetmap.fr/api/interpreter',
];
const UA = 'VenTu-coast-orientation/1.0 (+https://ventu.surf; github.com/braindeadpt/VenTu #178)';

/** Água interior ou abrigada: a «normal da costa» não diz de onde vem o vento de mar. Revisão manual. */
export const REVISAO_MANUAL = {
  // rios
  'foil-cabedelo': 'rio Lima (barra)',
  'cabedelo-wakepark': 'rio Lima (wake park)',
  esposende: 'foz do Cávado (rio/mar)',
  'marina-afurada-foil': 'rio Douro (marina)',
  'praia-da-lomba': 'rio Douro (interior)',
  // albufeiras e lagos interiores
  'castelo-bode': 'albufeira (interior)',
  alqueva: 'albufeira (interior)',
  'ilha-do-ermal': 'albufeira (interior)',
  'lagos-wakepark': 'lago de wake park (interior)',
  // lagoas costeiras e rias
  'barrinha-esmoriz': 'lagoa (Barrinha de Esmoriz)',
  murtosa: 'Ria de Aveiro',
  'ria-torreira': 'Ria de Aveiro',
  'foz-arelho': 'Lagoa de Óbidos',
  'foil-foz-arelho': 'Lagoa de Óbidos',
  'obidos-lagoon': 'Lagoa de Óbidos',
  'obidos-lagoon-sul': 'Lagoa de Óbidos',
  'lagoa-albufeira': 'Lagoa de Albufeira',
  'foil-lagoa-albufeira': 'Lagoa de Albufeira',
  'lagoa-santo-andre': 'Lagoa de Santo André',
  'lagoa-sancha': 'Lagoa da Sancha',
  alvor: 'Ria de Alvor',
  'foil-alvor': 'Ria de Alvor',
  // estuários
  'seixal-bay': 'estuário do Tejo (Baía do Seixal)',
  'ponta-dos-corvos': 'estuário do Tejo (Seixal)',
  trafaria: 'estuário do Tejo (Trafaria)',
  troia: 'estuário do Sado (Tróia)',
  // Ria Formosa (lado da ria)
  'barrinha-faro': 'Ria Formosa',
  fuseta: 'Ria Formosa',
  'cabanas-tavira': 'Ria Formosa',
  'cacela-velha': 'Ria Formosa',
  // baía fechada
  'sao-martinho-porto': 'baía fechada (concha de São Martinho): 315° fixado à mão',
  'vila-nova-milfontes': 'foz do rio Mira',
  'cova-do-vapor': 'foz do Tejo (ponta da Cova do Vapor)',
  // enseada com geometria ambígua: valor fixado à mão (VALOR_MANUAL)
  beliche: 'enseada do Beliche (Sagres): 230° fixado à mão',
  coxos: 'baía dos Coxos (Ericeira): 280° fixado à mão (a costa local dá 230°, a 1 km 257°)',
  lagide: 'reef do Lagide (Baleal): 345° fixado à mão (332° no pico, 353° na praia)',
  'baleal-sul': 'baía do Baleal: 345° fixado à mão (areal da baía 344–346°)',
  'molhe-leste': 'molhe leste do porto de Peniche: 250° fixado à mão (a costa local segue o molhe)',
  consolacao: 'Consolação (ponta do forte): 260° fixado à mão (geometria ambígua no pin)',
  'figueira-foz': 'Cabedelo (Figueira da Foz): 270° fixado à mão (areal N–S; a 400 m a geometria segue o molhe sul do Mondego)',
  leirosa: 'Leirosa (esporão): 285° fixado à mão (283° a 400 m, 288° a 1 km)',
  'foz-sizandro': 'foz do Sizandro: 300° fixado à mão (a geometria junto à foz oscila 299–310°)',
  'sao-pedro-moel': 'São Pedro de Moel: 290° fixado à mão (areal 285–295° entre as lajes das pontas)',
  'porto-novo': 'Porto Novo (concha na foz do Alcabrichel): 275° fixado à mão (geometria ambígua no pin)',
  // revisão v2 da orientação (25/10): valores fixados à mão em VALOR_MANUAL
  'vila-praia-ancora': 'Vila Praia de Âncora',
  'canide-sul': 'Canide Sul (esporões)',
  'bairro-piscatorio': 'Espinho (esporões)',
  'pescadores-ericeira': 'Pescadores (Ericeira)',
  comporta: 'Comporta',
  carvalhal: 'Carvalhal (enseada)',
  'vila-real-santo-antonio': 'Vila Real de Santo António',
  ferragudo: 'Praia Grande de Ferragudo (estuário do Arade)',
  'praia-vitoria': 'Praia da Vitória (baía)',
  'santa-catarina-terceira': 'Santa Catarina (Terceira)',
  'porto-martins': 'Porto Martins (enseada)',
  mosteiros: 'Mosteiros (ponta)',
  'ponta-pargo': 'Ponta do Pargo',
  'ponta-sao-lourenco': 'Ponta de São Lourenço',
  machico: 'Machico (baía)',
  'seixal-madeira': 'Seixal (ponta)',
  'ribeira-brava': 'Ribeira Brava',
};

/**
 * Valor final fixado à mão para spots da lista acima (aprovado pelo Pedro).
 * O recálculo mantém-no (`origem: manual`) em vez de voltar ao valor antigo.
 */
export const VALOR_MANUAL = {
  beliche: 230, // 23/10: pin novo numa enseada (calculado 230°, geometria ambígua); aprovado pelo Pedro
  coxos: 280, // 24/10: a baía abre a W-NW e trabalha com ondulação N/NW; o calculado (230°) segue a falésia local; aprovado pelo Pedro
  'sao-martinho-porto': 315, // 24/10: a baía abre a NW e o areal principal (margem E/SE) está virado a NW; os 180° antigos não tinham base; aprovado pelo Pedro
  'foil-foz-arelho': 300, // 24/10: spot interior da Lagoa de Óbidos (Escola de Vela), alinhado com os pins curados da lagoa; aprovado pelo Pedro
  lagide: 345, // 24/10: reef entre o pico (332°) e a Praia do Lagido (353°); aprovado pelo Pedro
  'baleal-sul': 345, // 24/10: areal da baía do Baleal (344–346°; o pin dá 340°); aprovado pelo Pedro
  'molhe-leste': 250, // 24/10: a onda abre para WSW; o calculado (215°) segue a face do molhe; aprovado pelo Pedro
  consolacao: 260, // 24/10: pin a sul do forte, numa ponta (geometria ambígua → voltaria aos 270° antigos); 261° na costa; aprovado pelo Pedro
  leirosa: 285, // 25/10: pin junto ao esporão; 283° a 400 m e 288° a 1 km (o recálculo dá 295°); aprovado pelo Pedro
  'foz-sizandro': 300, // 25/10: pin na foz (fora da zona interdita); costa 300° (o recálculo dá 310°, 1 km 299°); aprovado pelo Pedro
  'sao-pedro-moel': 290, // 25/10: spot novo; costa 285–289° na proposta (o recálculo dá 295°, 1 km 287°); aprovado pelo Pedro
  'porto-novo': 275, // 25/10: spot novo numa concha (267° local, 286° a 1 km); aprovado pelo Pedro
  // revisão v2 da orientação (25/10, «tudo de uma vez»)
  'vila-praia-ancora': 240, // 25/10: pin da #295; OSM 232–238°; aprovado pelo Pedro
  'foil-cabedelo': 210, // 25/10: margem sul da foz do Lima; OSM 199–210°; aprovado pelo Pedro
  'canide-sul': 265, // 25/10: entre esporões; OSM 256–268°; aprovado pelo Pedro
  'bairro-piscatorio': 275, // 25/10: esporões de Espinho; 1–2 km dão 243–273°; aprovado pelo Pedro
  'marina-afurada-foil': 330, // 25/10: margem sul do Douro na marina (polígono do estuário, corda ±250/500 m: 330°/327°); os 255° eram a costa do mar a 1,3 km; aprovado pelo Pedro
  'barrinha-esmoriz': 290, // 25/10: praia do mar, costa recta; OSM 285–290°; aprovado pelo Pedro
  'ria-torreira': 90, // 25/10: margem da ria virada a nascente (sem costa OSM na ria); aprovado pelo Pedro
  trafaria: 295, // 25/10: foz do Tejo; OSM 295–305°; aprovado pelo Pedro
  'ponta-dos-corvos': 10, // 25/10: virada a norte, para Lisboa; OSM 10–21°; aprovado pelo Pedro
  'pescadores-ericeira': 245, // 25/10: pin da #301; OSM 228–253°; aprovado pelo Pedro
  'seixal-bay': 40, // 25/10: pin da #295; margem virada a NE, OSM 41–54°; aprovado pelo Pedro
  'cova-do-vapor': 290, // 25/10: ponta da restinga; OSM 285–316° conforme a escala; aprovado pelo Pedro
  troia: 25, // 25/10: margem virada ao Sado e a Setúbal; OSM 23–24°; aprovado pelo Pedro
  'lagoa-santo-andre': 285, // 25/10: pin na lagoa junto à barra; praia do mar ao lado, OSM 285°; aprovado pelo Pedro
  'vila-nova-milfontes': 175, // 25/10: foz do Mira; OSM 162–177°; aprovado pelo Pedro
  comporta: 250, // 25/10: pin na Praia da Comporta; OSM 250° em todas as escalas (a proposta de 285° era do pin antigo); aprovado pelo Pedro
  carvalhal: 300, // 25/10: enseada; OSM 297–324° conforme a escala; aprovado pelo Pedro
  'cacela-velha': 165, // 25/10: OSM 158–170°; aprovado pelo Pedro
  'cabanas-tavira': 150, // 25/10: costa recta; OSM 147–150°; aprovado pelo Pedro
  'vila-real-santo-antonio': 195, // 25/10: pin na Praia de Santo António; OSM 195°; aprovado pelo Pedro
  alvor: 185, // 25/10: a praia vira a sul; o cálculo (285°) apanha a ria; aprovado pelo Pedro
  ferragudo: 235, // 25/10: pin na Praia Grande, no estuário do Arade: margem da praia 233–244° (a costa OSM a 800 m dava 200°, ambígua); aprovado pelo Pedro
  'barrinha-faro': 215, // 25/10: pin da #296; lado do mar a SSW, OSM 211–217°; aprovado pelo Pedro
  fuseta: 325, // 25/10: margem interior da ilha (pin), virada à vila e à laguna do kite; OSM 324–339°; aprovado pelo Pedro
  'praia-vitoria': 110, // 25/10: baía virada a nascente; OSM 102–119°; aprovado pelo Pedro
  'santa-catarina-terceira': 105, // 25/10: costa leste da Terceira; OSM 95–111°; aprovado pelo Pedro
  'porto-martins': 150, // 25/10: enseada virada a SE; OSM 126–189° conforme a escala; aprovado pelo Pedro
  mosteiros: 310, // 25/10: ponta; o areal vira a W/NW; aprovado pelo Pedro
  'ponta-pargo': 300, // 25/10: extremo oeste da Madeira; OSM 286–309°; aprovado pelo Pedro
  'ponta-sao-lourenco': 190, // 25/10: lado sul da ponta; OSM 188–197°; aprovado pelo Pedro
  machico: 135, // 25/10: baía virada a SE; OSM 98–139°; aprovado pelo Pedro
  'seixal-madeira': 45, // 25/10: ponta da costa norte, virada a NE; OSM 44–112°; aprovado pelo Pedro
  'ribeira-brava': 220, // 25/10: pin na praia; eixo da praia 132°/312° → 222°, OSM 220–247°; aprovado pelo Pedro
};

/**
 * Referências conhecidas (o pedido do Pedro e a #178), tolerância ±20°.
 * Um calculado fora disto vai para revisão (não muda o valor final sozinho).
 */
export const REFERENCIAS = {
  guincho: [270, 290],
  carcavelos: [195, 195],
  'costa-caparica': [250, 250],
  nazare: [290, 290],
  'ribeira-ilhas': [280, 280],
  supertubos: [220, 220],
  tonel: [200, 200],
  lagos: [150, 150],
};
const TOL_REF = 20;
/** spot longe da costa: revisão a > 1 km; não se aplica a > 1,5 km (a costa mais próxima pode ser outro troço). */
const DIST_REVISAO = 1000;
const DIST_BLOQUEIA = 1500;
/** corda de 1 km aceite como 2.º nível quando corda/arco ≥ 0,85 */
const RETIDAO_1KM = 0.85;

/** Divide spots.ts em blocos, um por spot (do `id:` ao `id:` seguinte). */
function blocos(src) {
  const ini = [...src.matchAll(/^\s*id: '([^']+)'/gm)];
  return ini.map((m, i) => ({ id: m[1], a: m.index, b: i + 1 < ini.length ? ini[i + 1].index : src.length }));
}

function lerSpots() {
  const src = fs.readFileSync(SPOTS_TS, 'utf8');
  return blocos(src).map(({ id, a, b }) => {
    const t = src.slice(a, b);
    const nome = t.match(/\bname: (['"])((?:\\.|(?!\1).)*)\1/);
    const ll = t.match(/\blat: (-?[\d.]+), lon: (-?[\d.]+)/);
    const co = t.match(/\bcoastOrientation: (\d+)/);
    if (!ll || !co) throw new Error(`spot ${id} sem lat/lon/coastOrientation`);
    const interior = /\baguaInterior: true\b/.test(t);
    return { id, nome: nome ? nome[2].replace(/\\'/g, "'") : id, lat: +ll[1], lon: +ll[2], atual: +co[1], interior };
  });
}

const cacheDe = (id) => path.join(CACHE, `${id}.json`);
/** A cache só vale para as coordenadas e o raio com que foi descarregada. */
function cacheValida(s) {
  if (!fs.existsSync(cacheDe(s.id))) return null;
  const c = JSON.parse(fs.readFileSync(cacheDe(s.id), 'utf8'));
  return c.lat === s.lat && c.lon === s.lon && c.raio >= RAIO ? c : null;
}

async function overpass(q, ordem = 0) {
  let erro;
  for (let k = 0; k < OVERPASS.length; k++) {
    const u = OVERPASS[(k + ordem) % OVERPASS.length];
    try {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(95000),
      });
      if (r.ok) return { json: await r.json(), url: u };
      erro = new Error(`${u} HTTP ${r.status}`);
    } catch (e) {
      erro = e;
    }
  }
  throw erro;
}

/**
 * Descarrega por células de 1° (uma caixa por célula com os spots que lá caem,
 * alargada do raio), um pedido de cada vez (--paralelo=N), e guarda por spot só as vias com
 * algum nó a < raio + 500 m. Retoma: só pede as células com spots sem cache.
 */
async function descarregar(spots) {
  fs.mkdirSync(CACHE, { recursive: true });
  const t0 = Date.now();
  const falta = spots.filter((s) => !cacheValida(s));
  const celulas = new Map();
  for (const s of falta) {
    const k = `${Math.floor(s.lat)},${Math.floor(s.lon)}`;
    if (!celulas.has(k)) celulas.set(k, []);
    celulas.get(k).push(s);
  }
  console.log(`${falta.length} spots sem cache em ${celulas.size} células`);
  const fila = [...celulas.values()];
  let ordem = 0;
  async function trabalhador() {
    while (fila.length) {
      if ((Date.now() - t0) / 1000 > MAX_S) return;
      const lote = fila.shift();
      const m = (RAIO + 600) / 110574;
      const mlon = m / Math.cos((lote[0].lat * Math.PI) / 180);
      const S = Math.min(...lote.map((s) => s.lat)) - m;
      const N = Math.max(...lote.map((s) => s.lat)) + m;
      const W = Math.min(...lote.map((s) => s.lon)) - mlon;
      const E = Math.max(...lote.map((s) => s.lon)) + mlon;
      const q = `[out:json][timeout:90];way[natural=coastline](${S.toFixed(4)},${W.toFixed(4)},${N.toFixed(4)},${E.toFixed(4)});out geom;`;
      let res;
      try {
        res = await overpass(q, ordem++);
      } catch (e) {
        console.log(`  falhou (${e.message}); fica para a próxima corrida`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      const { json, url } = res;
      const vias = viasDeOverpass(json);
      for (const s of lote) {
        const kx = Math.cos((s.lat * Math.PI) / 180) * 111320;
        const perto = vias.filter((v) => v.coords.some(([la, lo]) => Math.hypot((lo - s.lon) * kx, (la - s.lat) * 110574) < RAIO + 500));
        fs.writeFileSync(
          cacheDe(s.id),
          JSON.stringify({ fonte: url, osm_base: json.osm3s?.timestamp_osm_base ?? null, raio: RAIO, lat: s.lat, lon: s.lon, vias: perto }),
        );
      }
      console.log(`  ${lote.length} spots (${lote[0].id}…) → ${vias.length} vias [${url}]`);
    }
  }
  await Promise.all(Array.from({ length: opt('paralelo', 1) }, trabalhador));
  if (fila.length) console.log('tempo esgotado; volte a correr --fetch para continuar');
}

function rever(spots) {
  const curados = JSON.parse(fs.readFileSync(EDITORIAL, 'utf8')).spots;
  let osmBase = null;
  const linhas = spots.map((s) => {
    const motivos = [];
    let calc = null;
    const c = cacheValida(s);
    if (c) {
      osmBase = osmBase ?? c.osm_base;
      calc = orientacaoCosta(s, c.vias);
    } else {
      motivos.push('sem cache OSM (correr --fetch)');
    }
    const ok = calc && calc.ok;
    if (calc && !calc.ok) motivos.push(`sem linha de costa OSM a < ${RAIO} m`);
    if (ok && calc.ambigua)
      motivos.push(
        calc.cadeiaCurta && calc.retidao === null
          ? 'geometria ambígua (a linha de costa acaba a < 250 m)'
          : `geometria ambígua (dobra ${calc.dobra ?? '—'}°, 500 m vs 1 km ${calc.difEscalas ?? '—'}°: ponta, enseada ou foz)`,
      );
    if (ok && calc.outraMargem) motivos.push(`outra costa a ${calc.outraMargemM} m (margem oposta, ilhéu ou molhe)`);
    if (ok && !calc.ambigua && (calc.difEscalas ?? 0) > 15) motivos.push(`500 m e 1 km divergem ${calc.difEscalas}° (1 km: ${calc.escala1km}°)`);
    if (ok && calc.distM > DIST_REVISAO) motivos.push(`spot a ${calc.distM} m da costa`);
    const manual = REVISAO_MANUAL[s.id];
    if (manual) motivos.push(`água interior/abrigada: ${manual}`);
    const cur = curados[s.id];
    const ref = REFERENCIAS[s.id];
    let difRef = null;
    if (ok && ref) {
      difRef = Math.round(Math.min(...ref.map((r) => difAng(calc.graus, r))) * (calc.graus >= ref[0] - 0.001 && calc.graus <= ref[1] + 0.001 ? 0 : 1));
      if (difRef > TOL_REF) motivos.push(`calculado a ${difRef}° da referência ${ref[0] === ref[1] ? ref[0] : ref.join('–')}°`);
    }
    let difCurado = null;
    if (ok && cur) {
      difCurado = Math.round(difAng(calc.graus, cur.praiaVirada));
      if (difCurado > TOL_REF) motivos.push(`calculado a ${difCurado}° do curado v6 (${cur.praiaVirada}°)`);
    }

    let final = s.atual;
    let origem = 'mantido';
    const longe = ok && calc.distM > DIST_REVISAO && !(calc.retidao >= 0.95 && (calc.difEscalas ?? 99) <= 10);
    if (longe) motivos.push('longe da costa e costa não recta: não aplicado');
    // 2.º nível: a janela de 500 m é ambígua (recorte, enseada) mas a corda de 1 km é limpa
    const plano1km = ok && calc.ambigua && calc.retidao1km !== null && calc.retidao1km >= RETIDAO_1KM;
    const bloqueia = !ok || (calc.ambigua && !plano1km) || longe || manual;
    if (cur) {
      final = n360(cur.praiaVirada);
      origem = 'curado';
    } else if (s.interior) {
      // água interior: não há onshore/offshore; o valor fica e o motor não o usa para o vento
      final = s.atual;
      origem = 'agua-interior';
      motivos.push('água interior (aguaInterior): sem onshore/offshore, o vento fica neutro');
    } else if (manual && VALOR_MANUAL[s.id] !== undefined) {
      final = n360(VALOR_MANUAL[s.id]);
      origem = 'manual';
    } else if (!bloqueia) {
      final = plano1km ? calc.escala1kmArredondado : calc.arredondado;
      origem = plano1km ? 'osm-1km' : 'osm';
      if (plano1km) motivos.push(`aplicada a corda de 1 km (${calc.escala1kmArredondado}°, corda/arco ${calc.retidao1km})`);
    }
    const delta = Math.round(difAng(final, s.atual));
    const deltaCalc = ok ? Math.round(difAng(calc.arredondado, s.atual)) : null;
    if (origem.startsWith('osm') && delta > 45) motivos.push(`delta ${delta}° > 45° face ao valor antigo`);
    return {
      id: s.id,
      nome: s.nome,
      lat: s.lat,
      lon: s.lon,
      atual: s.atual,
      calculado: ok ? calc.arredondado : null,
      calculadoBruto: ok ? calc.graus : null,
      segmentoProximo: ok ? calc.local : null,
      retidao: ok ? calc.retidao : null,
      dobra: ok ? calc.dobra ?? null : null,
      escala1km: ok ? calc.escala1km : null,
      retidao1km: ok ? calc.retidao1km : null,
      distCostaM: ok ? calc.distM : null,
      curado: cur ? cur.praiaVirada : null,
      referencia: ref ? (ref[0] === ref[1] ? ref[0] : ref) : null,
      difReferencia: difRef,
      difCurado,
      final,
      origem,
      delta,
      deltaCalculado: deltaCalc,
      revisao: motivos.length > 0,
      motivos,
    };
  });
  // vizinho curado a < 2 km com mais de 25° de diferença: só aviso (spots como a Empa ao lado da Ribeira d'Ilhas)
  const curadosL = linhas.filter((l) => l.origem === 'curado');
  for (const l of linhas) {
    if (l.origem === 'curado') continue;
    for (const c of curadosL) {
      const kx = Math.cos((l.lat * Math.PI) / 180) * 111320;
      const dm = Math.hypot((l.lon - c.lon) * kx, (l.lat - c.lat) * 110574);
      if (dm > 0 && dm < 2000 && difAng(l.final, c.final) > 25) {
        l.motivos.push(`a ${Math.round(dm)} m de ${c.id} (curado ${c.final}°) com ${Math.round(difAng(l.final, c.final))}° de diferença`);
        l.revisao = true;
      }
    }
  }
  return { osmBase, linhas };
}

function aplicar(linhas) {
  const src = fs.readFileSync(SPOTS_TS, 'utf8');
  const porId = new Map(linhas.map((l) => [l.id, l]));
  let out = src.slice(0, blocos(src)[0].a);
  let n = 0;
  for (const { id, a, b } of blocos(src)) {
    let t = src.slice(a, b);
    const l = porId.get(id);
    const m = t.match(/\bcoastOrientation: (\d+)/);
    if (l && m && +m[1] !== l.final) {
      t = t.replace(/\bcoastOrientation: \d+/, `coastOrientation: ${l.final}`);
      n++;
    }
    out += t;
  }
  fs.writeFileSync(SPOTS_TS, out);
  console.log(`spots.ts: ${n} coastOrientation alterados`);
}

/**
 * `atual` = o valor ANTES da #178. Depois de um --apply, o spots.ts já tem o
 * valor novo; para a revisão continuar a mostrar antes → depois (e o script ser
 * idempotente), o `atual` de um spot que já está no ficheiro de revisão vem de lá.
 */
function comAntes(spots) {
  if (!fs.existsSync(OUT)) return spots;
  const ant = new Map(JSON.parse(fs.readFileSync(OUT, 'utf8')).spots.map((l) => [l.id, l.atual]));
  return spots.map((s) => (ant.has(s.id) ? { ...s, atual: ant.get(s.id) } : s));
}

const spots = comAntes(lerSpots());
if (FETCH) await descarregar(spots);
const { osmBase, linhas } = rever(spots);
const resumo = {
  spots: linhas.length,
  osm: linhas.filter((l) => l.origem === 'osm').length,
  osm1km: linhas.filter((l) => l.origem === 'osm-1km').length,
  curado: linhas.filter((l) => l.origem === 'curado').length,
  mantido: linhas.filter((l) => l.origem === 'mantido').length,
  manual: linhas.filter((l) => l.origem === 'manual').length,
  aguaInterior: linhas.filter((l) => l.origem === 'agua-interior').length,
  mudam: linhas.filter((l) => l.final !== l.atual).length,
  revisao: linhas.filter((l) => l.revisao).length,
  em270Antes: linhas.filter((l) => l.atual === 270).length,
  em270Depois: linhas.filter((l) => l.final === 270).length,
};
const out = {
  _doc: 'Gerado por scripts/compute-coast-orientation.mjs (#178). Ver docs/COAST-ORIENTATION.md. Dados © OpenStreetMap contributors (ODbL).',
  metodo: { fonte: 'OSM natural=coastline (Overpass)', raioPedidoM: RAIO, janela: 'corda ±250 m ao longo da costa (500 m)', controlo: 'corda ±500 m; dobra ≤ 45°; escalas ≤ 25°', tolReferencia: TOL_REF, distRevisaoM: DIST_REVISAO, distBloqueiaM: DIST_BLOQUEIA, arredondamento: 5 },
  osmBase,
  resumo,
  spots: linhas,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(resumo));
if (APPLY) aplicar(linhas);
