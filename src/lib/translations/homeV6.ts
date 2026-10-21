/**
 * homeV6 — home v6 «Atlântico» (#183). PT-PT primeiro, EN a seguir (es/de/fr
 * caem no EN, como a página de spot v6).
 *
 * As frases do motor (`src/lib/home/homeV6.ts`) são as da maquete aprovada
 * (`docs/design/maquetes/home/fontes/nucleo.js`); aqui ficam só as palavras.
 * Marcas: `<b>` (número forte) e `<em>` (a banda, pintada em chip).
 */
import type { BandaK, Modalidade, VentoRel } from '@/lib/modalidades';
import type { SpotCosta, ZonaHome } from '@/lib/home/homeV6';
import COSTA from '@/lib/home/costaV6.json';

const ZONAS = COSTA.zonas as Record<ZonaHome, { nome: string; em: string; nomeEn: string; emEn: string }>;
const nomeC = (sp: Pick<SpotCosta, 'nome' | 'curto'>) => sp.curto || sp.nome;
const listaPt = (a: string[]) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);
const listaEn = (a: string[]) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const fmt1 = (x: number, loc: string) => x.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Frase da noite: «Amanhã de manhã: <frase>». As frases sem `corpo` («Pouco vento
 * na costa: kite não dá.») já trazem os seus dois pontos; o prefixo fica com os
 * únicos «:» e os da 1.ª oração da frase passam a vírgula («Amanhã de manhã: pouco
 * vento na costa, kite não dá.»). Uma 2.ª frase («… O melhor é o Guincho: dá …»)
 * não se toca.
 */
const comBlocoVirgula = (bloco: string, frase: string) => {
  const cap = bloco.replace(/^./, (x) => x.toUpperCase());
  const low = frase.replace(/^./, (x) => x.toLowerCase());
  const fimOracao = low.search(/\.(\s|$)/);
  const ate = fimOracao < 0 ? low.length : fimOracao;
  const dp = low.indexOf(': ');
  const corpo = dp >= 0 && dp < ate ? low.slice(0, dp) + ', ' + low.slice(dp + 2) : low;
  return `${cap}: ${corpo}`;
};

const ART_EM: Record<string, string> = { o: 'no ', a: 'na ', '': 'em ' };
const ART_DE: Record<string, string> = { o: 'do ', a: 'da ', '': 'de ' };
const ART_A: Record<string, string> = { o: 'ao ', a: 'à ', '': 'a ' };
const ART_O: Record<string, string> = { o: 'o ', a: 'a ', '': '' };

const REL_EN: Record<VentoRel['k'], string> = {
  mar: 'onshore',
  'lat-mar': 'cross-onshore',
  lat: 'cross-shore',
  'lat-terra': 'cross-offshore',
  terra: 'offshore',
};

const pt = {
  lingua: 'pt-PT',
  banda: { nao: 'Não dá', fraco: 'Fraco', da: 'Dá', bom: 'Bom', mb: 'Muito bom', noite: 'Noite' } as Record<BandaK, string>,
  modNome: { kite: 'kite', surf: 'surf' } as Record<Modalidade, string>,
  horaH: (h: number) => `${h}h`,
  nortada: (r: string) => `nortada ${r}`,
  brisa: (r: string) => `brisa de ${r}`,
  ventoDe: (r: string) => `vento de ${r}`,
  das: (h: number) => `das ${h}h `,
  quando: (desde: string, fim: string | null) =>
    desde + (fim == null ? (desde ? 'ao pôr do sol' : 'até ao pôr do sol') : desde ? `às ${fim}` : `até às ${fim}`),
  nos: 'nós',
  rajadas: 'rajadas',
  rajadasAte: (g: number) => `, rajadas até ${g}`,
  lateralMar: 'lateral de mar',
  relCurta: (vr: VentoRel) => vr.txt.split(',')[0],
  poucoVento: 'Pouco vento',
  ventoTerra: 'Vento de terra',
  rajado: (b: string, chuva: boolean) => `${b}: rajado${chuva ? ' e com chuva' : ''}`,
  mar: (hs: number, tp: number, r: string) => `${fmt1(hs, 'pt-PT')} m a ${tp} s de ${r}`,
  marCurto: (hs: number, tp: number) => `${fmt1(hs, 'pt-PT')} m a ${tp} s`,
  quaseSemVento: 'quase sem vento',
  terral: (r: string, w: number) => `terral de ${r} ${w} nós`,
  vento: (r: string, w: number) => `vento ${r} ${w} nós`,
  ondaGrandeDemais: 'Onda grande demais',
  ventoEstraga: 'Vento a estragar o mar',
  poucaOnda: 'Pouca onda',
  chuvaSuf: ' · chuva',
  noite: 'Noite',
  noiteNaCosta: 'Noite na costa.',
  zonaEm: (z: ZonaHome) => ZONAS[z].em,
  zonaNome: (z: ZonaHome) => ZONAS[z].nome,
  em: (sp: SpotCosta) => ART_EM[sp.art] + nomeC(sp),
  oA: (sp: SpotCosta) => ART_O[sp.art] + nomeC(sp),
  doAo: (a: SpotCosta, b: SpotCosta) => `${ART_DE[a.art]}${nomeC(a)} ${ART_A[b.art]}${nomeC(b)}`,
  lista: listaPt,
  costaOesteToda: 'em toda a costa oeste',
  norteASul: 'de norte a sul',
  ehCostaToda: (o: string) => /costa|norte a sul/.test(o),
  naCostaOeste: 'na costa oeste',
  naCosta: 'na costa',
  aA: (a: string, b: string) => `${a} a ${b}`,
  aApertar: 'a apertar',
  aCair: 'a cair',
  diaMornoKite: (nm: string, oA: string, q: string) => `Dia morno para ${nm}. O melhor é ${oA}: <em>dá</em> ${q}.`,
  frenteKite: (nm: string) => `Frente com chuva e rajadas: ${nm} <em>não dá</em> em lado nenhum.`,
  poucoVentoCosta: (nm: string) => `Pouco vento na costa: ${nm} <em>não dá</em>.`,
  ventoTorto: (nm: string, b: string) => `Vento torto para ${nm}: <em>${b}</em> em toda a costa.`,
  ondulacaoDe: (r: string) => `ondulação de ${r}`,
  aEstragarOeste: (v: string) => `${v} a estragar o oeste; `,
  limpa: (s: string) => `${s} limpa; `,
  soASul: 'só a sul, ',
  marMexido: (nm: string, oA: string, q: string) => `Mar mexido para ${nm}. O melhor é ${oA}: <em>dá</em> ${q}.`,
  frenteSurf: (nm: string) => `Frente com chuva e vento de mar: ${nm} <em>não dá</em> em lado nenhum.`,
  marGrande: (nm: string, b: string) => `Mar grande demais para ${nm}: <em>${b}</em> em toda a costa.`,
  ventoEstragaNaoDa: (nm: string) => `Vento a estragar o mar: ${nm} <em>não dá</em> em lado nenhum.`,
  ventoEstragaFraco: (nm: string) => `Vento a estragar o mar: ${nm} <em>fraco</em> em toda a costa.`,

  /* ---------- página ---------- */
  modalidadeAria: 'Modalidade',
  modalidades: { kite: 'Kite', surf: 'Surf' } as Record<string, string>,
  veredito: { vai: 'Vai.', da: 'Dá.', naoVai: 'Não vai.', noite: 'Noite.' },
  noiteSub: 'a costa fecha · vê amanhã',
  dias: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  meses: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  agora: 'agora',
  noiteRot: 'noite',
  hoje: 'Hoje',
  amanha: 'Amanhã',
  blocoNome: { manha: 'manhã', tarde: 'tarde', fim: 'fim de tarde' } as Record<'manha' | 'tarde' | 'fim', string>,
  blocoCurto: { manha: 'manhã', tarde: 'tarde', fim: 'fim tarde' } as Record<'manha' | 'tarde' | 'fim', string>,
  nomeBloco: (dia: 0 | 1, k: 'manha' | 'tarde' | 'fim') =>
    (dia === 0 ? 'hoje ' : 'amanhã ') + ({ manha: 'de manhã', tarde: 'à tarde', fim: 'ao fim da tarde' } as const)[k],
  /** «Amanhã de manhã: pouco vento na costa, kite não dá.» (um só «:»). */
  comBloco: comBlocoVirgula,
  intervalo: (a: number, z: number) => `${a}h–${z}h`,
  nRank: (k: number, quando: string) => `nº ${k} ${quando}`,
  notaAria: (n: number | null, b: string) => (n == null ? 'Noite' : `Nota ${n} em 10, ${b}`),
  notaSr: (n: number) => `, nota ${n} em 10`,
  outrosAria: 'Nº 2 e nº 3',
  heroAria: 'Vou ou não vou?',
  reguaT: 'Quando: hoje e amanhã',
  reguaAria: 'Escolher período',
  blocoAria: (nome: string, agora: boolean, spot: string, banda: string, n: number) =>
    `${nome}${agora ? ' (agora)' : ''}: o melhor é ${spot}, ${banda.toLowerCase()}, ${n} em 10`,
  noiteAria: 'agora: noite',
  mapa: 'Mapa',
  mapaRegiao: 'Mapa interactivo da costa',
  mapaFig: 'A costa portuguesa em 3D, com o mar junto a cada spot na cor da nota e o vento em movimento',
  mapaSub: { kite: 'Nota de kite em toda a costa.', surf: 'Nota de surf em toda a costa.' } as Record<Modalidade, string>,
  mapaSubVento: ' Os traços brancos são o vento da hora.',
  explorarMapa: 'Explorar o mapa da costa',
  ctaLinha: (n: number, d: Modalidade) => `${n} spots de ${d} · vento ao vivo · 48 h`,
  chipVento: (spot: string, r: string, w: number) => `${spot}: ${r} ${w} nós`,
  estatica: 'Mapa plano: este aparelho não mostra 3D. As cores e o vento seguem o período escolhido.',
  legenda:
    'O mar junto a cada spot tem a cor da sua nota; quanto mais claro, melhor. As linhas brancas são o vento da hora, em movimento. Toca num spot para o abrir no mapa.',
  legNum: { nao: '0–3', fraco: '3–5', da: '5–7', bom: '7–9', mb: '9–10' } as Record<string, string>,
  relevo: 'relevo',
  lugares: { espanha: 'Espanha', atlantico: 'Atlântico' },
  rotAria: (nome: string, b: string, n: number | null) => `${nome}: ${b}${n != null ? `, ${n} em 10` : ''}, abrir no mapa`,
  foto: 'Foto',
  rodapeLinks: 'Mais na costa',
  todosSpots: 'Todos os spots',
  comoLemos: 'Como lemos a nota',
  fotosA: 'Fotografias: Unsplash (Unsplash License) e uma do Wikimedia Commons (CC BY-SA 3.0); autor em cada foto e lista em ',
  fotosB: '. Quando a foto não é do próprio spot, o crédito diz de onde é.',
  creditos: 'CREDITOS',
  fonte: 'Previsão Open-Meteo, lida de um só objecto por spot e hora; as notas são as mesmas da página de cada spot.',
  semDados: 'Sem previsão para hoje e amanhã nesta costa.',
  /** Hora sem vento/onda na fonte (null): sem nota, mas não é noite. */
  semDadosHora: 'Sem dados',
  titulo: (p: string, frase: string) => `VenTu · ${p} ${frase}`,
};

export type HomeV6Copy = typeof pt;

const en: HomeV6Copy = {
  lingua: 'en-GB',
  banda: { nao: 'No go', fraco: 'Poor', da: 'OK', bom: 'Good', mb: 'Very good', noite: 'Night' },
  modNome: { kite: 'kite', surf: 'surf' },
  horaH: (h: number) => `${h}:00`,
  nortada: (r: string) => `north wind ${r}`,
  brisa: (r: string) => `sea breeze from ${r}`,
  ventoDe: (r: string) => `wind from ${r}`,
  das: (h: number) => `from ${h}:00 `,
  quando: (desde: string, fim: string | null) =>
    desde + (fim == null ? (desde ? 'to sunset' : 'until sunset') : desde ? `to ${fim}` : `until ${fim}`),
  nos: 'kt',
  rajadas: 'gusts',
  rajadasAte: (g: number) => `, gusts up to ${g}`,
  lateralMar: 'cross-onshore',
  relCurta: (vr: VentoRel) => REL_EN[vr.k],
  poucoVento: 'Light wind',
  ventoTerra: 'Offshore wind',
  rajado: (b: string, chuva: boolean) => `${b}: gusty${chuva ? ' and wet' : ''}`,
  mar: (hs: number, tp: number, r: string) => `${fmt1(hs, 'en-GB')} m at ${tp} s from ${r}`,
  marCurto: (hs: number, tp: number) => `${fmt1(hs, 'en-GB')} m at ${tp} s`,
  quaseSemVento: 'almost no wind',
  terral: (r: string, w: number) => `offshore ${r} ${w} kt`,
  vento: (r: string, w: number) => `wind ${r} ${w} kt`,
  ondaGrandeDemais: 'Too big',
  ventoEstraga: 'Wind spoiling the sea',
  poucaOnda: 'Small waves',
  chuvaSuf: ' · rain',
  noite: 'Night',
  noiteNaCosta: 'Night on the coast.',
  zonaEm: (z: ZonaHome) => ZONAS[z].emEn,
  zonaNome: (z: ZonaHome) => ZONAS[z].nomeEn,
  em: (sp: SpotCosta) => `at ${nomeC(sp)}`,
  oA: (sp: SpotCosta) => nomeC(sp),
  doAo: (a: SpotCosta, b: SpotCosta) => `from ${nomeC(a)} to ${nomeC(b)}`,
  lista: listaEn,
  costaOesteToda: 'all along the west coast',
  norteASul: 'from north to south',
  ehCostaToda: (o: string) => /coast|north to south/.test(o),
  naCostaOeste: 'on the west coast',
  naCosta: 'on the coast',
  aA: (a: string, b: string) => `${a} to ${b}`,
  aApertar: 'picking up',
  aCair: 'dropping',
  diaMornoKite: (nm: string, oA: string, q: string) => `A mellow day for ${nm}. Best bet is ${oA}: <em>OK</em> ${q}.`,
  frenteKite: (nm: string) => `A front with rain and gusts: ${nm} is a <em>no go</em> everywhere.`,
  poucoVentoCosta: (nm: string) => `Light wind on the coast: ${nm} is a <em>no go</em>.`,
  ventoTorto: (nm: string, b: string) => `Wrong wind for ${nm}: <em>${b}</em> all along the coast.`,
  ondulacaoDe: (r: string) => `${r} swell`,
  aEstragarOeste: (v: string) => `${v} spoiling the west; `,
  limpa: (s: string) => `Clean ${s.charAt(0).toLowerCase() + s.slice(1)}; `,
  soASul: 'only down south, ',
  marMexido: (nm: string, oA: string, q: string) => `Messy sea for ${nm}. Best bet is ${oA}: <em>OK</em> ${q}.`,
  frenteSurf: (nm: string) => `A front with rain and onshore wind: ${nm} is a <em>no go</em> everywhere.`,
  marGrande: (nm: string, b: string) => `Too big for ${nm}: <em>${b}</em> all along the coast.`,
  ventoEstragaNaoDa: (nm: string) => `Wind spoiling the sea: ${nm} is a <em>no go</em> everywhere.`,
  ventoEstragaFraco: (nm: string) => `Wind spoiling the sea: ${nm} is <em>poor</em> all along the coast.`,

  modalidadeAria: 'Sport',
  modalidades: { kite: 'Kite', surf: 'Surf' },
  veredito: { vai: 'Go.', da: 'OK.', naoVai: 'No go.', noite: 'Night.' },
  noiteSub: 'the coast is closing · check tomorrow',
  dias: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  meses: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  agora: 'now',
  noiteRot: 'night',
  hoje: 'Today',
  amanha: 'Tomorrow',
  blocoNome: { manha: 'morning', tarde: 'afternoon', fim: 'evening' },
  blocoCurto: { manha: 'morning', tarde: 'afternoon', fim: 'evening' },
  nomeBloco: (dia: 0 | 1, k: 'manha' | 'tarde' | 'fim') =>
    (dia === 0 ? 'this ' : 'tomorrow ') + ({ manha: 'morning', tarde: 'afternoon', fim: 'evening' } as const)[k],
  comBloco: comBlocoVirgula,
  intervalo: (a: number, z: number) => `${a}:00–${z}:00`,
  nRank: (k: number, quando: string) => `no. ${k} ${quando}`,
  notaAria: (n: number | null, b: string) => (n == null ? 'Night' : `Score ${n} out of 10, ${b}`),
  notaSr: (n: number) => `, score ${n} out of 10`,
  outrosAria: 'No. 2 and no. 3',
  heroAria: 'Go or no go?',
  reguaT: 'When: today and tomorrow',
  reguaAria: 'Choose a period',
  blocoAria: (nome: string, agora: boolean, spot: string, banda: string, n: number) =>
    `${nome}${agora ? ' (now)' : ''}: best is ${spot}, ${banda.toLowerCase()}, ${n} out of 10`,
  noiteAria: 'now: night',
  mapa: 'Map',
  mapaRegiao: 'Interactive map of the coast',
  mapaFig: 'The Portuguese coast in 3D, with the sea by each spot in the colour of its score and the wind in motion',
  mapaSub: { kite: 'Kite score along the whole coast.', surf: 'Surf score along the whole coast.' },
  mapaSubVento: ' The white streaks are the wind for that hour.',
  explorarMapa: 'Explore the coast map',
  ctaLinha: (n: number, d: Modalidade) => `${n} ${d} spots · live wind · 48 h`,
  chipVento: (spot: string, r: string, w: number) => `${spot}: ${r} ${w} kt`,
  estatica: 'Flat map: this device cannot show 3D. Colours and wind follow the chosen period.',
  legenda:
    'The sea by each spot takes the colour of its score; the lighter, the better. The white lines are the wind for that hour, in motion. Tap a spot to open it on the map.',
  legNum: { nao: '0–3', fraco: '3–5', da: '5–7', bom: '7–9', mb: '9–10' },
  relevo: 'terrain',
  lugares: { espanha: 'Spain', atlantico: 'Atlantic' },
  rotAria: (nome: string, b: string, n: number | null) => `${nome}: ${b}${n != null ? `, ${n} out of 10` : ''}, open on the map`,
  foto: 'Photo',
  rodapeLinks: 'More on the coast',
  todosSpots: 'All spots',
  comoLemos: 'How we score',
  fotosA: 'Photos: Unsplash (Unsplash License) and one from Wikimedia Commons (CC BY-SA 3.0); author on each photo and full list in ',
  fotosB: '. When a photo is not of the spot itself, the credit says where it is from.',
  creditos: 'CREDITS',
  fonte: 'Open-Meteo forecast, read from a single object per spot and hour; the scores are the same as on each spot page.',
  semDados: 'No forecast for today and tomorrow on this coast.',
  semDadosHora: 'No data',
  titulo: (p: string, frase: string) => `VenTu · ${p} ${frase}`,
};

export function homeV6Copy(locale: string): HomeV6Copy {
  return locale === 'pt' ? pt : en;
}
