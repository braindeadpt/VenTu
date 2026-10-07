/**
 * Textos do lab — PT-PT primeiro, EN como fallback para es/de/fr.
 * Não importa `@/lib/i18n` de propósito: isso arrastaria os 5 dicionários
 * completos para o chunk cliente do lab.
 */
const PT = {
  eyebrow: 'Lab · protótipo',
  title: 'Mar vivo',
  lede: 'Vento e ondulação nas próximas 48 h, sobre a costa toda.',
  modeLabel: 'Camadas',
  modeBoth: 'Vento + ondulação',
  modeWind: 'Vento',
  modeSwell: 'Ondulação',
  play: 'Reproduzir',
  pause: 'Pausa',
  timeline: 'Linha temporal, 48 horas',
  loading: 'A preparar o mar…',
  error: 'Não foi possível carregar as previsões. Tenta recarregar a página.',
  noWebgl: 'Este dispositivo não suporta WebGL 2 — o protótipo precisa dele.',
  legendWind: 'Vento (nós)',
  legendHs: 'Altura significativa (m)',
  legendScore: 'Score do spot',
  tierEpic: 'ÉPICO',
  tierGood: 'BOM',
  tierFair: 'FUN',
  tierPoor: 'FLAT',
  tierClosed: 'FECHADO',
  generated: 'Previsão gerada',
  idwNote: 'Campo interpolado (IDW) a partir de {n} spots — ainda não é uma grelha de modelo.',
  noSwell: 'Sem direcção/período de ondulação neste build — só vento.',
  reducedMotion: 'Movimento reduzido: setas estáticas.',
  night: 'noite',
  day: 'dia',
  score: 'Score',
  weekdays: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
  mapLabel: 'Mapa animado de vento e ondulação em Portugal continental',
  metaTitle: 'Mar vivo · Lab VenTu',
  metaDescription: 'Protótipo: vento e ondulação animados sobre a costa portuguesa nas próximas 48 h.',
};

type Strings = typeof PT;

const EN: Strings = {
  eyebrow: 'Lab · prototype',
  title: 'Living sea',
  lede: 'Wind and swell over the next 48 h, along the whole coast.',
  modeLabel: 'Layers',
  modeBoth: 'Wind + swell',
  modeWind: 'Wind',
  modeSwell: 'Swell',
  play: 'Play',
  pause: 'Pause',
  timeline: 'Timeline, 48 hours',
  loading: 'Getting the sea ready…',
  error: 'Could not load the forecast. Try reloading the page.',
  noWebgl: 'This device does not support WebGL 2 — the prototype needs it.',
  legendWind: 'Wind (knots)',
  legendHs: 'Significant height (m)',
  legendScore: 'Spot score',
  tierEpic: 'EPIC',
  tierGood: 'GOOD',
  tierFair: 'FUN',
  tierPoor: 'FLAT',
  tierClosed: 'CLOSED',
  generated: 'Forecast generated',
  idwNote: 'Field interpolated (IDW) from {n} spots — not a model grid yet.',
  noSwell: 'No swell direction/period in this build — wind only.',
  reducedMotion: 'Reduced motion: static arrows.',
  night: 'night',
  day: 'day',
  score: 'Score',
  weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  mapLabel: 'Animated wind and swell map of mainland Portugal',
  metaTitle: 'Living sea · VenTu Lab',
  metaDescription: 'Prototype: animated wind and swell along the Portuguese coast over the next 48 h.',
};

export type MarVivoStrings = Strings;

export function marVivoStrings(locale: string): MarVivoStrings {
  return locale === 'pt' ? PT : EN;
}
