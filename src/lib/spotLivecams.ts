/** Curated public livecam pages for popular spots (external — no fragile iframe embeds). */

export interface SpotLivecam {
  url: string
  provider: string
  labelPt: string
  labelEn: string
}

export const SPOT_LIVECAMS: Record<string, SpotLivecam> = {
  guincho: {
    url: 'https://www.surftotal.com/camaras-report/linha-de-cascais-estoril/guincho-norte',
    provider: 'Surftotal',
    labelPt: 'Guincho Norte HD',
    labelEn: 'Guincho North HD',
  },
  carcavelos: {
    url: 'https://www.surftotal.com/camaras-report/linha-de-cascais-estoril/carcavelos',
    provider: 'Surftotal',
    labelPt: 'Carcavelos HD',
    labelEn: 'Carcavelos HD',
  },
  'costa-caparica': {
    url: 'https://www.surftotal.com/camaras-report/costa-da-caparica/costa-da-caparica-praia-cds',
    provider: 'Surftotal',
    labelPt: 'Costa da Caparica — CDS',
    labelEn: 'Costa da Caparica — CDS',
  },
  nazare: {
    url: 'https://www.surftotal.com/camaras-report/nazare/nazare-hd',
    provider: 'Surftotal',
    labelPt: 'Nazaré Praia do Norte HD',
    labelEn: 'Nazare North Beach HD',
  },
  supertubos: {
    url: 'https://beachcam.meo.pt/livecams/peniche-supertubos/',
    provider: 'MEO Beachcam',
    labelPt: 'Supertubos — Molhe Leste',
    labelEn: 'Supertubos — East Pier',
  },
  peniche: {
    url: 'https://www.surftotal.com/camaras-report/peniche/peniche-hd',
    provider: 'Surftotal',
    labelPt: 'Peniche HD',
    labelEn: 'Peniche HD',
  },
  'ribeira-ilhas': {
    url: 'https://www.surftotal.com/camaras-report/ericeira/ribeira-d-ilhas',
    provider: 'Surftotal',
    labelPt: "Ribeira d'Ilhas",
    labelEn: "Ribeira d'Ilhas",
  },
  matosinhos: {
    url: 'https://www.surftotal.com/camaras-report/grande-porto-douro-litoral/matosinhos-hd',
    provider: 'Surftotal',
    labelPt: 'Matosinhos HD',
    labelEn: 'Matosinhos HD',
  },
  'leca-palmeira': {
    url: 'https://www.surftotal.com/camaras-report/grande-porto-douro-litoral/leca-da-palmeira',
    provider: 'Surftotal',
    labelPt: 'Leça da Palmeira',
    labelEn: 'Leca da Palmeira',
  },
  'figueira-foz': {
    url: 'https://www.surftotal.com/camaras-report/figueira-da-foz/praia-do-cabedelo-hd',
    provider: 'Surftotal',
    labelPt: 'Figueira da Foz — Cabedelo',
    labelEn: 'Figueira da Foz — Cabedelo',
  },
  consolacao: {
    url: 'https://www.surftotal.com/camaras-report/peniche/peniche-hd',
    provider: 'Surftotal',
    labelPt: 'Peniche / Consolação',
    labelEn: 'Peniche / Consolacao',
  },
  cabedelo: {
    url: 'https://www.surftotal.com/camaras-report/figueira-da-foz/praia-do-cabedelo-hd',
    provider: 'Surftotal',
    labelPt: 'Cabedelo HD',
    labelEn: 'Cabedelo HD',
  },
}

export function getSpotLivecam(slug: string): SpotLivecam | null {
  return SPOT_LIVECAMS[slug] ?? null
}
