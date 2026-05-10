// Sistema de rating independente por desporto
// Cada desporto tem critérios próprios de avaliação

export type SportType = 'surf' | 'kitesurf' | 'windsurf' | 'wakeboard' | 'bodyboard' | 'sup'

export interface SportConditions {
  sport: SportType
  rating: number // 0-10
  label: string
  labelEn: string
  description: string
  descriptionEn: string
  color: string
  primaryFactor: string // O que mais importa para este desporto
}

// Critérios por desporto
const SPORT_CRITERIA: Record<SportType, {
  waveHeight: { min: number; ideal: [number, number]; max: number }
  period: { min: number; ideal: [number, number] }
  windSpeed: { min: number; ideal: [number, number]; max: number }
  windDirection?: string[] // Direções preferidas (offshore, sideshore)
  needsTide?: boolean
  tidePreference?: 'high' | 'medium' | 'low' | 'any'
}>
 = {
  surf: {
    waveHeight: { min: 0.5, ideal: [1.0, 2.5], max: 5.0 },
    period: { min: 6, ideal: [10, 14] },
    windSpeed: { min: 0, ideal: [0, 12], max: 25 },
    windDirection: ['N', 'NE', 'E', 'SE'], // Offshore/sideshore para costa ocidental PT
    needsTide: true,
    tidePreference: 'medium',
  },
  kitesurf: {
    waveHeight: { min: 0, ideal: [0.3, 1.0], max: 3.0 },
    period: { min: 0, ideal: [0, 12] },
    windSpeed: { min: 12, ideal: [18, 28], max: 40 },
    windDirection: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], // Qualquer direção com força
    needsTide: false,
    tidePreference: 'any',
  },
  windsurf: {
    waveHeight: { min: 0, ideal: [0.5, 2.0], max: 4.0 },
    period: { min: 0, ideal: [6, 12] },
    windSpeed: { min: 12, ideal: [18, 25], max: 35 },
    windDirection: ['N', 'NE', 'NW', 'W'], // Cross/cross-onshore
    needsTide: false,
    tidePreference: 'any',
  },
  wakeboard: {
    waveHeight: { min: 0, ideal: [0, 0.3], max: 0.5 },
    period: { min: 0, ideal: [0, 6] },
    windSpeed: { min: 0, ideal: [0, 8], max: 15 },
    needsTide: false,
    tidePreference: 'any',
  },
  bodyboard: {
    waveHeight: { min: 0.3, ideal: [0.8, 2.0], max: 4.0 },
    period: { min: 5, ideal: [8, 12] },
    windSpeed: { min: 0, ideal: [0, 12], max: 20 },
    windDirection: ['N', 'NE', 'E', 'SE'],
    needsTide: true,
    tidePreference: 'medium',
  },
  sup: {
    waveHeight: { min: 0, ideal: [0, 0.8], max: 1.5 },
    period: { min: 0, ideal: [0, 8] },
    windSpeed: { min: 0, ideal: [0, 8], max: 15 },
    needsTide: false,
    tidePreference: 'any',
  },
}

// Desportos que cada spot suporta (baseado nas suas características)
// Isto seria definido no spots.ts, mas aqui é a lógica
export function getCompatibleSports(
  waveHeight: number,
  windSpeed: number,
  wavePeriod: number,
  spotTypes?: string[]
): SportType[] {
  const sports: SportType[] = []

  // Surf: ondas decentes, vento não muito forte
  if (waveHeight >= 0.5 && wavePeriod >= 6 && windSpeed <= 25) {
    sports.push('surf')
  }

  // Kitesurf: vento forte
  if (windSpeed >= 12) {
    sports.push('kitesurf')
  }

  // Windsurf: vento moderado a forte + ondas opcionais
  if (windSpeed >= 12 && windSpeed <= 35) {
    sports.push('windsurf')
  }

  // Wakeboard: água plana (spot específico ou vento fraco)
  if (windSpeed <= 10 && waveHeight <= 0.5) {
    sports.push('wakeboard')
  }

  // Bodyboard: ondas pequenas a médias
  if (waveHeight >= 0.3 && waveHeight <= 4.0 && windSpeed <= 20) {
    sports.push('bodyboard')
  }

  // SUP: condições calmas
  if (windSpeed <= 15 && waveHeight <= 1.5) {
    sports.push('sup')
  }

  return sports
}

// Calcular rating específico por desporto
export function calculateSportRating(
  sport: SportType,
  waveHeight: number,
  wavePeriod: number,
  windSpeed: number,
  windDirection: number, // degrees
  tideHeight?: number // meters
): SportConditions {
  const criteria = SPORT_CRITERIA[sport]
  let score = 0
  let primaryFactor = ''

  switch (sport) {
    case 'surf':
      score = calculateSurfRating(waveHeight, wavePeriod, windSpeed, windDirection)
      primaryFactor = waveHeight > 0 ? `${waveHeight.toFixed(1)}m ondas` : 'Sem ondas'
      break
    case 'kitesurf':
      score = calculateKitesurfRating(windSpeed, waveHeight)
      primaryFactor = `${windSpeed.toFixed(0)}kt vento`
      break
    case 'windsurf':
      score = calculateWindsurfRating(windSpeed, waveHeight, wavePeriod)
      primaryFactor = `${windSpeed.toFixed(0)}kt vento`
      break
    case 'wakeboard':
      score = calculateWakeboardRating(windSpeed, waveHeight)
      primaryFactor = waveHeight < 0.3 ? 'Água plana' : `${waveHeight.toFixed(1)}m ondas`
      break
    case 'bodyboard':
      score = calculateBodyboardRating(waveHeight, wavePeriod, windSpeed)
      primaryFactor = `${waveHeight.toFixed(1)}m ondas`
      break
    case 'sup':
      score = calculateSUPRating(windSpeed, waveHeight)
      primaryFactor = windSpeed < 10 ? 'Calmo' : `${windSpeed.toFixed(0)}kt vento`
      break
  }

  // Clamp score
  score = Math.max(0, Math.min(10, score))

  const labels: Record<number, string> = {
    0: 'Impraticável',
    1: 'Muito Mau',
    2: 'Mau',
    3: 'Fraco',
    4: 'Razoável',
    5: 'Médio',
    6: 'Bom',
    7: 'Muito Bom',
    8: 'Excelente',
    9: 'Épico',
    10: 'Perfeito',
  }

  const descriptions: Record<SportType, Record<number, string>> = {
    surf: {
      0: 'Sem ondas ou demasiado vento',
      3: 'Ondas pequenas, dá para surfar',
      6: 'Boas ondas, diverte-te!',
      8: 'Ondas excelentes, não percas!',
      10: 'Épico! Melhor dia do ano!',
    },
    kitesurf: {
      0: 'Sem vento suficiente',
      3: 'Vento fraco, kite grande',
      6: 'Bom vento, diverte-te!',
      8: 'Vento perfeito, freestyle!',
      10: 'Vento épico! Todos ao spot!',
    },
    windsurf: {
      0: 'Sem vento',
      3: 'Vento fraco, prancha grande',
      6: 'Bom vento, diverte-te!',
      8: 'Vento forte, ondas perfeitas!',
      10: 'Clássico! Vento + ondas!',
    },
    wakeboard: {
      0: 'Muito ondulado',
      3: 'Água aceitável',
      6: 'Água plana, bom para wake!',
      8: 'Espelho! Perfeito para wake!',
      10: 'Liso como espelho! Épico!',
    },
    bodyboard: {
      0: 'Sem ondas',
      3: 'Ondas pequenas, dá para BB',
      6: 'Boas ondas para bodyboard!',
      8: 'Ondas perfeitas para BB!',
      10: 'Tubos! Só bodyboarders!',
    },
    sup: {
      0: 'Muito vento/ondas',
      3: 'Condicões aceitáveis',
      6: 'Calmo, bom para SUP!',
      8: 'Perfeito para passeio de SUP!',
      10: 'Espelho! SUP de sonho!',
    },
  }

  const labelsEn: Record<number, string> = {
    0: 'Unrideable',
    1: 'Very Poor',
    2: 'Poor',
    3: 'Weak',
    4: 'Fair',
    5: 'Average',
    6: 'Good',
    7: 'Very Good',
    8: 'Excellent',
    9: 'Epic',
    10: 'Perfect',
  }

  const descriptionsEn: Record<SportType, Record<number, string>> = {
    surf: {
      0: 'No waves or too windy',
      3: 'Small waves, rideable',
      6: 'Good waves, have fun!',
      8: 'Excellent waves, don\'t miss!',
      10: 'Epic! Best day of the year!',
    },
    kitesurf: {
      0: 'Not enough wind',
      3: 'Light wind, big kite needed',
      6: 'Good wind, have fun!',
      8: 'Perfect wind for freestyle!',
      10: 'Epic wind! Everyone to the spot!',
    },
    windsurf: {
      0: 'No wind',
      3: 'Light wind, big board',
      6: 'Good wind, have fun!',
      8: 'Strong wind, perfect waves!',
      10: 'Classic! Wind + waves!',
    },
    wakeboard: {
      0: 'Too choppy',
      3: 'Acceptable water',
      6: 'Flat water, good for wake!',
      8: 'Glassy! Perfect for wake!',
      10: 'Smooth as glass! Epic!',
    },
    bodyboard: {
      0: 'No waves',
      3: 'Small waves, rideable for BB',
      6: 'Good waves for bodyboard!',
      8: 'Perfect waves for BB!',
      10: 'Barrels! BB only!',
    },
    sup: {
      0: 'Too windy/rough',
      3: 'Acceptable conditions',
      6: 'Calm, good for SUP!',
      8: 'Perfect for SUP ride!',
      10: 'Glassy! Dream SUP!',
    },
  }

  const roundedScore = Math.round(score)
  const label = labels[roundedScore] || 'Desconhecido'
  const labelEn = labelsEn[roundedScore] || 'Unknown'
  const description = descriptions[sport][roundedScore] || descriptions[sport][Math.floor(roundedScore / 2) * 2] || ''
  const descriptionEn = descriptionsEn[sport][roundedScore] || descriptionsEn[sport][Math.floor(roundedScore / 2) * 2] || ''

  // Cores por rating
  const colors = [
    '#ef4444', // 0-1: Vermelho
    '#f97316', // 2-3: Laranja
    '#eab308', // 4-5: Amarelo
    '#84cc16', // 6-7: Verde lima
    '#22c55e', // 8-9: Verde
    '#10b981', // 10: Esmeralda
  ]
  const colorIndex = Math.min(Math.floor(score / 2), 5)

  return {
    sport,
    rating: score,
    label,
    labelEn,
    description,
    descriptionEn,
    color: colors[colorIndex],
    primaryFactor,
  }
}

// Algoritmos específicos por desporto
function calculateSurfRating(waveHeight: number, period: number, windSpeed: number, windDirection: number): number {
  let score = 0

  // Ondas (40%)
  if (waveHeight >= 0.8 && waveHeight <= 1.2) score += 3
  else if (waveHeight > 1.2 && waveHeight <= 2.0) score += 4
  else if (waveHeight > 2.0 && waveHeight <= 3.0) score += 3.5
  else if (waveHeight > 3.0 && waveHeight <= 5.0) score += 2
  else if (waveHeight > 0.5) score += 1

  // Período (30%)
  if (period >= 12 && period <= 16) score += 3
  else if (period >= 10 && period < 12) score += 2.5
  else if (period >= 8 && period < 10) score += 2
  else if (period >= 6) score += 1

  // Vento (30%)
  if (windSpeed <= 5) score += 3 // Glassy
  else if (windSpeed <= 10) score += 2.5 // Leve
  else if (windSpeed <= 15) score += 1.5 // Moderado
  else if (windSpeed <= 20) score += 0.5 // Forte
  // >20kt: penalidade já aplicada pelo limite

  return score
}

function calculateKitesurfRating(windSpeed: number, waveHeight: number): number {
  let score = 0

  // Vento é TUDO para kitesurf (70%)
  if (windSpeed >= 20 && windSpeed <= 28) score += 7 // Sweet spot
  else if (windSpeed >= 16 && windSpeed < 20) score += 5.5 // Bom
  else if (windSpeed >= 12 && windSpeed < 16) score += 4 // Fraco
  else if (windSpeed >= 28 && windSpeed <= 35) score += 4 // Forte
  else if (windSpeed > 35) score += 2 // Muito forte

  // Ondas (30%) - kitesurfers preferem flat ou ondas pequenas
  if (waveHeight <= 0.5) score += 3 // Flat = freestyle
  else if (waveHeight <= 1.0) score += 2.5 // Ondas pequenas
  else if (waveHeight <= 1.5) score += 1.5 // Wave kiting
  else if (waveHeight <= 2.5) score += 1 // Big air
  else score += 0.5 // Muito ondulado

  return score
}

function calculateWindsurfRating(windSpeed: number, waveHeight: number, period: number): number {
  let score = 0

  // Vento (60%)
  if (windSpeed >= 18 && windSpeed <= 25) score += 6 // Sweet spot
  else if (windSpeed >= 15 && windSpeed < 18) score += 4.5 // Bom
  else if (windSpeed >= 12 && windSpeed < 15) score += 3 // Planar?
  else if (windSpeed >= 25 && windSpeed <= 30) score += 4 // Forte
  else if (windSpeed > 30) score += 2 // Muito forte

  // Ondas (25%)
  if (waveHeight >= 1.0 && waveHeight <= 2.5) score += 2.5 // Wave sailing
  else if (waveHeight >= 0.5 && waveHeight < 1.0) score += 2 // Bump & jump
  else if (waveHeight < 0.5) score += 1.5 // Freestyle/slalom
  else score += 1 // Muito grande

  // Período (15%)
  if (period >= 8 && period <= 12) score += 1.5
  else if (period >= 6) score += 1

  return score
}

function calculateWakeboardRating(windSpeed: number, waveHeight: number): number {
  let score = 0

  // Água plana é ESSENCIAL (70%)
  if (waveHeight <= 0.2) score += 7 // Espelho
  else if (waveHeight <= 0.4) score += 5 // Quase plano
  else if (waveHeight <= 0.6) score += 3 // Aceitável
  else if (waveHeight <= 1.0) score += 1.5 // Difícil
  else score += 0.5 // Muito ondulado

  // Vento fraco ajuda (30%)
  if (windSpeed <= 5) score += 3 // Ideal
  else if (windSpeed <= 10) score += 2 // Bom
  else if (windSpeed <= 15) score += 1 // OK
  else score += 0.5 // Ventoso

  return score
}

function calculateBodyboardRating(waveHeight: number, period: number, windSpeed: number): number {
  let score = 0

  // Ondas (50%)
  if (waveHeight >= 0.8 && waveHeight <= 1.5) score += 5 // Sweet spot BB
  else if (waveHeight > 1.5 && waveHeight <= 2.5) score += 4 // Bom
  else if (waveHeight > 2.5 && waveHeight <= 3.5) score += 3 // Grande
  else if (waveHeight >= 0.4) score += 2 // Pequeno

  // Período (25%)
  if (period >= 8 && period <= 12) score += 2.5
  else if (period >= 6) score += 2

  // Vento (25%)
  if (windSpeed <= 8) score += 2.5
  else if (windSpeed <= 15) score += 1.5
  else if (windSpeed <= 20) score += 1

  return score
}

function calculateSUPRating(windSpeed: number, waveHeight: number): number {
  let score = 0

  // Calma é essencial (60%)
  if (windSpeed <= 5 && waveHeight <= 0.3) score += 6 // Perfeito
  else if (windSpeed <= 8 && waveHeight <= 0.5) score += 5 // Muito bom
  else if (windSpeed <= 10 && waveHeight <= 0.8) score += 4 // Bom
  else if (windSpeed <= 12 && waveHeight <= 1.0) score += 3 // OK
  else if (windSpeed <= 15 && waveHeight <= 1.2) score += 2 // Difícil
  else score += 1 // Desafiante

  // Ondas pequenas são ok para SUP surf (40%)
  if (waveHeight >= 0.3 && waveHeight <= 0.8) score += 4
  else if (waveHeight <= 0.5) score += 2 // Flat
  else score += 1

  return score
}

// Labels dos desportos
export const SPORT_LABELS: Record<SportType, { pt: string; en: string }> = {
  surf: { pt: 'Surf', en: 'Surf' },
  kitesurf: { pt: 'Kitesurf', en: 'Kitesurf' },
  windsurf: { pt: 'Windsurf', en: 'Windsurf' },
  wakeboard: { pt: 'Wakeboard', en: 'Wakeboard' },
  bodyboard: { pt: 'Bodyboard', en: 'Bodyboard' },
  sup: { pt: 'SUP', en: 'SUP' },
}

// Desportos disponíveis para filtro
export const ALL_SPORTS: SportType[] = ['surf', 'kitesurf', 'windsurf', 'wakeboard', 'bodyboard', 'sup']
