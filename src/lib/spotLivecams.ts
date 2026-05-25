/** Curated public livecam pages for popular spots (external — no fragile iframe embeds). */

export interface SpotLivecam {
  url: string
  provider: string
  labelPt: string
  labelEn: string
  /** Optional iframe embed (e.g. MEO Beachcam player page). */
  embedUrl?: string
}

const SURFTOTAL = 'Surftotal'
const MEO = 'MEO Beachcam'

export const SPOT_LIVECAMS: Record<string, SpotLivecam> = {
  moledo: {
    url: 'https://www.surftotal.com/camaras-report/minho/moledo',
    provider: SURFTOTAL,
    labelPt: 'Moledo',
    labelEn: 'Moledo',
  },
  'vila-praia-ancora': {
    url: 'https://www.surftotal.com/camaras-report/minho/vila-praia-ancora',
    provider: SURFTOTAL,
    labelPt: 'Vila Praia de Âncora',
    labelEn: 'Vila Praia de Ancora',
  },
  ofir: {
    url: 'https://www.surftotal.com/camaras-report/minho/ofir',
    provider: SURFTOTAL,
    labelPt: 'Ofir',
    labelEn: 'Ofir',
  },
  'povoa-varzim': {
    url: 'https://www.surftotal.com/camaras-report/grande-porto-douro-litoral/povoa-de-varzim',
    provider: SURFTOTAL,
    labelPt: 'Póvoa do Varzim',
    labelEn: 'Povoa do Varzim',
  },
  azurara: {
    url: 'https://www.surftotal.com/camaras-report/grande-porto-douro-litoral/azurara',
    provider: SURFTOTAL,
    labelPt: 'Azurara',
    labelEn: 'Azurara',
  },
  'leca-palmeira': {
    url: 'https://www.surftotal.com/camaras-report/grande-porto-douro-litoral/leca-da-palmeira',
    provider: SURFTOTAL,
    labelPt: 'Leça da Palmeira',
    labelEn: 'Leca da Palmeira',
  },
  matosinhos: {
    url: 'https://www.surftotal.com/camaras-report/grande-porto-douro-litoral/matosinhos-hd',
    provider: SURFTOTAL,
    labelPt: 'Matosinhos HD',
    labelEn: 'Matosinhos HD',
  },
  'cabedelo-douro': {
    url: 'https://www.surftotal.com/camaras-report/grande-porto-douro-litoral/cabedelo-do-porto',
    provider: SURFTOTAL,
    labelPt: 'Cabedelo do Douro',
    labelEn: 'Cabedelo do Douro',
  },
  espinho: {
    url: 'https://www.surftotal.com/camaras-report/grande-porto-douro-litoral/espinho-hd',
    provider: SURFTOTAL,
    labelPt: 'Espinho HD',
    labelEn: 'Espinho HD',
  },
  cortegaca: {
    url: 'https://www.surftotal.com/camaras-report/aveiro/cortegaca-hd',
    provider: SURFTOTAL,
    labelPt: 'Cortegaça HD',
    labelEn: 'Cortegaca HD',
  },
  'barra-aveiro': {
    url: 'https://www.surftotal.com/camaras-report/aveiro/praia-da-barra-norte-hd',
    provider: SURFTOTAL,
    labelPt: 'Praia da Barra',
    labelEn: 'Barra Beach',
  },
  cabedelo: {
    url: 'https://www.surftotal.com/camaras-report/figueira-da-foz/praia-do-cabedelo-hd',
    provider: SURFTOTAL,
    labelPt: 'Cabedelo HD',
    labelEn: 'Cabedelo HD',
  },
  'figueira-foz': {
    url: 'https://www.surftotal.com/camaras-report/figueira-da-foz/praia-do-cabedelo-hd',
    provider: SURFTOTAL,
    labelPt: 'Figueira da Foz — Cabedelo',
    labelEn: 'Figueira da Foz — Cabedelo',
  },
  nazare: {
    url: 'https://www.surftotal.com/camaras-report/nazare/nazare-hd',
    provider: SURFTOTAL,
    labelPt: 'Nazaré Praia do Norte HD',
    labelEn: 'Nazare North Beach HD',
  },
  peniche: {
    url: 'https://www.surftotal.com/camaras-report/peniche/peniche-hd',
    provider: SURFTOTAL,
    labelPt: 'Peniche HD',
    labelEn: 'Peniche HD',
  },
  supertubos: {
    url: 'https://beachcam.meo.pt/livecams/peniche-supertubos/',
    provider: MEO,
    labelPt: 'Supertubos — Molhe Leste',
    labelEn: 'Supertubos — East Pier',
    embedUrl: 'https://beachcam.meo.pt/livecams/peniche-supertubos/',
  },
  coxos: {
    url: 'https://beachcam.meo.pt/livecams/ericeira/',
    provider: MEO,
    labelPt: 'Ericeira (zona Coxos)',
    labelEn: 'Ericeira (Coxos area)',
    embedUrl: 'https://beachcam.meo.pt/livecams/ericeira/',
  },
  baleal: {
    url: 'https://www.surftotal.com/camaras-report/peniche/peniche-super-tubos',
    provider: SURFTOTAL,
    labelPt: 'Baleal / Peniche',
    labelEn: 'Baleal / Peniche',
  },
  consolacao: {
    url: 'https://www.surftotal.com/camaras-report/peniche/peniche-super-tubos',
    provider: SURFTOTAL,
    labelPt: 'Supertubos / Lagido',
    labelEn: 'Supertubos / Lagido',
  },
  'santa-cruz': {
    url: 'https://www.surftotal.com/camaras-report/santa-cruz/praia-do-navio-hd',
    provider: SURFTOTAL,
    labelPt: 'Santa Cruz — Navio',
    labelEn: 'Santa Cruz — Navio',
  },
  'ribeira-ilhas': {
    url: 'https://www.surftotal.com/camaras-report/ericeira/ribeira-d-ilhas',
    provider: SURFTOTAL,
    labelPt: "Ribeira d'Ilhas",
    labelEn: "Ribeira d'Ilhas",
  },
  'foz-lizandro': {
    url: 'https://www.surftotal.com/camaras-report/ericeira/foz-do-lizandro',
    provider: SURFTOTAL,
    labelPt: 'Foz do Lizandro',
    labelEn: 'Foz do Lizandro',
  },
  'praia-grande-sintra': {
    url: 'https://www.surftotal.com/camaras-report/sintra/praiagrande',
    provider: SURFTOTAL,
    labelPt: 'Praia Grande (Sintra)',
    labelEn: 'Praia Grande (Sintra)',
  },
  guincho: {
    url: 'https://www.surftotal.com/camaras-report/linha-de-cascais-estoril/guincho-norte',
    provider: SURFTOTAL,
    labelPt: 'Guincho Norte HD',
    labelEn: 'Guincho North HD',
  },
  parede: {
    url: 'https://www.surftotal.com/camaras-report/linha-de-cascais-estoril/parede',
    provider: SURFTOTAL,
    labelPt: 'Parede',
    labelEn: 'Parede',
  },
  carcavelos: {
    url: 'https://www.surftotal.com/camaras-report/linha-de-cascais-estoril/carcavelos',
    provider: SURFTOTAL,
    labelPt: 'Carcavelos HD',
    labelEn: 'Carcavelos HD',
  },
  'costa-caparica': {
    url: 'https://www.surftotal.com/camaras-report/costa-da-caparica/costa-da-caparica-praia-cds',
    provider: SURFTOTAL,
    labelPt: 'Costa da Caparica — CDS',
    labelEn: 'Costa da Caparica — CDS',
  },
  'fonte-telha': {
    url: 'https://www.surftotal.com/camaras-report/costa-da-caparica/fonte-da-telha',
    provider: SURFTOTAL,
    labelPt: 'Fonte da Telha',
    labelEn: 'Fonte da Telha',
  },
  'monte-clerigo': {
    url: 'https://www.surftotal.com/camaras-report/alentejo-algarve/monte-clerigo-o-sargo',
    provider: SURFTOTAL,
    labelPt: 'Monte Clérigo',
    labelEn: 'Monte Clerigo',
  },
  fuseta: {
    url: 'https://www.surftotal.com/camaras-report/alentejo-algarve/fuzeta',
    provider: SURFTOTAL,
    labelPt: 'Fuseta',
    labelEn: 'Fuseta',
  },
  'ilha-faro': {
    url: 'https://www.surftotal.com/camaras-report/alentejo-algarve/ilha-de-faro',
    provider: SURFTOTAL,
    labelPt: 'Ilha de Faro',
    labelEn: 'Faro Island',
  },
  machico: {
    url: 'https://www.surftotal.com/camaras-report/madeira/machico-hd',
    provider: SURFTOTAL,
    labelPt: 'Machico HD',
    labelEn: 'Machico HD',
  },
  'seixal-madeira': {
    url: 'https://www.surftotal.com/camaras-report/madeira/seixal-hd',
    provider: SURFTOTAL,
    labelPt: 'Seixal (Madeira)',
    labelEn: 'Seixal (Madeira)',
  },
  'obidos-lagoon': {
    url: 'https://www.surftotal.com/camaras-report/figueira-da-foz/praia-do-cabedelo-hd',
    provider: SURFTOTAL,
    labelPt: 'Lagoa de Óbidos (Cabedelo ref.)',
    labelEn: 'Obidos Lagoon (Cabedelo ref.)',
  },
  lagos: {
    url: 'https://www.surftotal.com/camaras-report/alentejo-algarve/fuzeta',
    provider: SURFTOTAL,
    labelPt: 'Lagos / Fuzeta (Ria)',
    labelEn: 'Lagos / Fuzeta (estuary)',
  },
}

export function getSpotLivecam(slug: string): SpotLivecam | null {
  return SPOT_LIVECAMS[slug] ?? null
}

export function getLivecamSpotCount(): number {
  return Object.keys(SPOT_LIVECAMS).length
}

export interface LivecamEntry {
  slug: string
  cam: SpotLivecam
}

/** All curated livecams sorted by label. */
export function listAllLivecams(): LivecamEntry[] {
  return Object.entries(SPOT_LIVECAMS)
    .map(([slug, cam]) => ({ slug, cam }))
    .sort((a, b) => a.cam.labelPt.localeCompare(b.cam.labelPt, 'pt'))
}
