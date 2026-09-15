/** Curated live streams — Surftotal / MEO / YouTube (embed when kind=youtube). */

export type LivecamKind = 'external' | 'youtube' | 'surfline'

export interface SpotLivecam {
  url: string
  provider: string
  labelPt: string
  labelEn: string
  kind?: LivecamKind
  /** Required when kind is youtube — used for nocookie embed on spot page. */
  youtubeId?: string
  /** Full embed URL when kind is surfline. */
  embedUrl?: string
}

const SURFTOTAL = 'Surftotal'
const MEO = 'MEO Beachcam'
const YOUTUBE = 'YouTube'
const SURFLINE = 'Surfline'

const FEELVIANA_SURFLINE_EMBED =
  'https://embed.cdn-surfline.com/cams/613205b46012d3ad55a4eec5/ba821de41fedcb2cdd9cdc28e95d92e4450dad63'

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
  afife: {
    url: 'https://beachcam.meo.pt/livecams/viana-do-castelo-afife-arda/',
    provider: MEO,
    labelPt: 'Afife — Praia da Arda',
    labelEn: 'Afife — Arda Beach',
  },
  ofir: {
    url: 'https://www.surftotal.com/camaras-report/minho/ofir',
    provider: SURFTOTAL,
    labelPt: 'Ofir',
    labelEn: 'Ofir',
  },
  esposende: {
    url: 'https://beachcam.meo.pt/livecams/esposende/',
    provider: MEO,
    labelPt: 'Esposende',
    labelEn: 'Esposende',
  },
  'esposende-praia': {
    url: 'https://beachcam.meo.pt/livecams/esposende/',
    provider: MEO,
    labelPt: 'Esposende (praia)',
    labelEn: 'Esposende (beach)',
  },
  fao: {
    url: 'https://beachcam.meo.pt/livecams/esposende-foz-do-cavado/',
    provider: MEO,
    labelPt: 'Foz do Cávado — Esposende (ref.)',
    labelEn: 'Cavado river mouth — Esposende (ref.)',
  },
  'foil-fao-cavado': {
    url: 'https://beachcam.meo.pt/livecams/esposende-foz-do-cavado/',
    provider: MEO,
    labelPt: 'Foz do Cávado — Esposende',
    labelEn: 'Cavado river mouth — Esposende',
  },
  'foil-esposende-piscinas': {
    url: 'https://beachcam.meo.pt/livecams/esposende-foz-do-cavado/',
    provider: MEO,
    labelPt: 'Foz do Cávado — Esposende',
    labelEn: 'Cavado river mouth — Esposende',
  },
  apulia: {
    url: 'https://beachcam.meo.pt/livecams/apulia/',
    provider: MEO,
    labelPt: 'Apúlia',
    labelEn: 'Apulia',
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
  mindelo: {
    url: 'https://beachcam.meo.pt/livecams/caxinas-macaco-17/',
    provider: MEO,
    labelPt: 'Caxinas — Vila do Conde (ref.)',
    labelEn: 'Caxinas — Vila do Conde (ref.)',
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
  aterro: {
    url: 'https://beachcam.meo.pt/livecams/leca-da-palmeira-panoraminca-aterro/',
    provider: MEO,
    labelPt: 'Aterro — Leça da Palmeira',
    labelEn: 'Aterro — Leca da Palmeira',
  },
  'sereia-costa-verde': {
    url: 'https://beachcam.meo.pt/livecams/praia-canide-norte-sul/',
    provider: MEO,
    labelPt: 'Canide — Vila Nova de Gaia',
    labelEn: 'Canide — Vila Nova de Gaia',
  },
  'canide-sul': {
    url: 'https://beachcam.meo.pt/livecams/praia-canide-norte-sul/',
    provider: MEO,
    labelPt: 'Canide — Vila Nova de Gaia',
    labelEn: 'Canide — Vila Nova de Gaia',
  },
  espinho: {
    url: 'https://www.surftotal.com/camaras-report/grande-porto-douro-litoral/espinho-hd',
    provider: SURFTOTAL,
    labelPt: 'Espinho HD',
    labelEn: 'Espinho HD',
  },
  'praia-37': {
    url: 'https://beachcam.meo.pt/livecams/espinhopicodocasino/',
    provider: MEO,
    labelPt: 'Espinho — Pico do Casino (ref.)',
    labelEn: 'Espinho — Pico do Casino (ref.)',
  },
  'bairro-piscatorio': {
    url: 'https://beachcam.meo.pt/livecams/praia-de-espinho/',
    provider: MEO,
    labelPt: 'Espinho — panorâmica (ref.)',
    labelEn: 'Espinho — panoramic (ref.)',
  },
  paramos: {
    url: 'https://beachcam.meo.pt/livecams/espinho-silvalde/',
    provider: MEO,
    labelPt: 'Silvalde — Espinho (ref.)',
    labelEn: 'Silvalde — Espinho (ref.)',
  },
  esmoriz: {
    url: 'https://beachcam.meo.pt/livecams/esmoriz/',
    provider: MEO,
    labelPt: 'Esmoriz',
    labelEn: 'Esmoriz',
  },
  'barrinha-esmoriz': {
    url: 'https://beachcam.meo.pt/livecams/esmoriz/',
    provider: MEO,
    labelPt: 'Esmoriz',
    labelEn: 'Esmoriz',
  },
  furadouro: {
    url: 'https://beachcam.meo.pt/livecams/furadouro/',
    provider: MEO,
    labelPt: 'Furadouro',
    labelEn: 'Furadouro',
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
  'praia-torreira': {
    url: 'https://beachcam.meo.pt/livecams/praia-da-torreira/',
    provider: MEO,
    labelPt: 'Praia da Torreira',
    labelEn: 'Torreira Beach',
  },
  'ria-torreira': {
    url: 'https://beachcam.meo.pt/livecams/praia-da-torreira/',
    provider: MEO,
    labelPt: 'Praia da Torreira (oceano)',
    labelEn: 'Torreira Beach (ocean side)',
  },
  'sao-jacinto': {
    url: 'https://beachcam.meo.pt/livecams/praia-de-sao-jacinto-barra/',
    provider: MEO,
    labelPt: 'São Jacinto — Barra',
    labelEn: 'Sao Jacinto — Barra',
  },
  'costa-nova': {
    url: 'https://beachcam.meo.pt/livecams/costa-nova/',
    provider: MEO,
    labelPt: 'Costa Nova',
    labelEn: 'Costa Nova',
  },
  tocha: {
    url: 'https://beachcam.meo.pt/livecams/praia-da-tocha/',
    provider: MEO,
    labelPt: 'Praia da Tocha',
    labelEn: 'Tocha Beach',
  },
  cabedelo: {
    kind: 'youtube',
    youtubeId: 'MTF1W80G-a4',
    url: 'https://www.youtube.com/watch?v=MTF1W80G-a4',
    provider: YOUTUBE,
    labelPt: 'Cabedelo — Viana do Castelo (24h)',
    labelEn: 'Cabedelo — Viana do Castelo (24h live)',
  },
  'foil-cabedelo': {
    kind: 'youtube',
    youtubeId: 'MTF1W80G-a4',
    url: 'https://www.youtube.com/watch?v=MTF1W80G-a4',
    provider: YOUTUBE,
    labelPt: 'Cabedelo — Viana do Castelo (24h)',
    labelEn: 'Cabedelo — Viana do Castelo (24h live)',
  },
  'cabedelo-wakepark': {
    kind: 'surfline',
    embedUrl: FEELVIANA_SURFLINE_EMBED,
    url: 'https://www.feelviana.com/en/wake-park',
    provider: SURFLINE,
    labelPt: 'FeelViana Wake Park — Cabedelo',
    labelEn: 'FeelViana Wake Park — Cabedelo',
  },
  'figueira-foz': {
    url: 'https://www.surftotal.com/camaras-report/figueira-da-foz/praia-do-cabedelo-hd',
    provider: SURFTOTAL,
    labelPt: 'Figueira da Foz — Cabedelo',
    labelEn: 'Figueira da Foz — Cabedelo',
  },
  'praia-da-vieira': {
    url: 'https://beachcam.meo.pt/livecams/praia-da-vieira/',
    provider: MEO,
    labelPt: 'Praia da Vieira',
    labelEn: 'Vieira Beach',
  },
  nazare: {
    url: 'https://www.surftotal.com/camaras-report/nazare/nazare-hd',
    provider: SURFTOTAL,
    labelPt: 'Nazaré Praia do Norte HD',
    labelEn: 'Nazare North Beach HD',
  },
  'sao-martinho-porto': {
    url: 'https://beachcam.meo.pt/livecams/sao-martinho-do-porto/',
    provider: MEO,
    labelPt: 'São Martinho do Porto',
    labelEn: 'Sao Martinho do Porto',
  },
  'foz-arelho': {
    url: 'https://beachcam.meo.pt/livecams/foz-do-arelho/',
    provider: MEO,
    labelPt: 'Foz do Arelho',
    labelEn: 'Foz do Arelho',
  },
  'foil-foz-arelho': {
    url: 'https://beachcam.meo.pt/livecams/foz-do-arelho/',
    provider: MEO,
    labelPt: 'Foz do Arelho',
    labelEn: 'Foz do Arelho',
  },
  'foz-arelho-beach': {
    url: 'https://beachcam.meo.pt/livecams/foz-do-arelho/',
    provider: MEO,
    labelPt: 'Foz do Arelho',
    labelEn: 'Foz do Arelho',
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
  },
  coxos: {
    url: 'https://beachcam.meo.pt/livecams/ericeira/',
    provider: MEO,
    labelPt: 'Ericeira (zona Coxos)',
    labelEn: 'Ericeira (Coxos area)',
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
  'areia-branca': {
    url: 'https://beachcam.meo.pt/livecams/areia-branca/',
    provider: MEO,
    labelPt: 'Areia Branca — Lourinhã',
    labelEn: 'Areia Branca — Lourinha',
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
  'sao-lourenco': {
    url: 'https://beachcam.meo.pt/livecams/ericeira-sao-lourenco/',
    provider: MEO,
    labelPt: 'São Lourenço — Ericeira',
    labelEn: 'Sao Lourenco — Ericeira',
  },
  'sao-sebastiao': {
    url: 'https://beachcam.meo.pt/livecams/ericeira-praia-do-sul/',
    provider: MEO,
    labelPt: 'Praia do Sul — Ericeira',
    labelEn: 'Praia do Sul — Ericeira',
  },
  empa: {
    url: 'https://beachcam.meo.pt/livecams/ericeira-praia-do-sul/',
    provider: MEO,
    labelPt: 'Praia do Sul — Ericeira',
    labelEn: 'Praia do Sul — Ericeira',
  },
  'pescadores-ericeira': {
    url: 'https://beachcam.meo.pt/livecams/praia-dos-pescadores/',
    provider: MEO,
    labelPt: 'Praia dos Pescadores — Ericeira',
    labelEn: 'Fishermen Beach — Ericeira',
  },
  'cave-ericeira': {
    url: 'https://beachcam.meo.pt/livecams/ericeira/',
    provider: MEO,
    labelPt: 'Ericeira (panorâmica)',
    labelEn: 'Ericeira (panoramic)',
  },
  'crazy-left': {
    url: 'https://beachcam.meo.pt/livecams/ericeira/',
    provider: MEO,
    labelPt: 'Ericeira (panorâmica)',
    labelEn: 'Ericeira (panoramic)',
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
  adraga: {
    url: 'https://beachcam.meo.pt/livecams/praia-da-adraga/',
    provider: MEO,
    labelPt: 'Praia da Adraga',
    labelEn: 'Adraga Beach',
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
  'cova-do-vapor': {
    url: 'https://beachcam.meo.pt/livecams/costa-de-caparica-sao-joao-cova-do-vapor/',
    provider: MEO,
    labelPt: 'São João / Cova do Vapor',
    labelEn: 'Sao Joao / Cova do Vapor',
  },
  'sao-joao-caparica': {
    url: 'https://beachcam.meo.pt/livecams/costa-de-caparica-sao-joao-cova-do-vapor/',
    provider: MEO,
    labelPt: 'São João / Cova do Vapor',
    labelEn: 'Sao Joao / Cova do Vapor',
  },
  'nova-vaga': {
    url: 'https://beachcam.meo.pt/livecams/costa-de-caparica-praia-do-norte/',
    provider: MEO,
    labelPt: 'Costa da Caparica — Praia Norte',
    labelEn: 'Costa da Caparica — North Beach',
  },
  'praia-da-rainha': {
    url: 'https://beachcam.meo.pt/livecams/costa-da-caparica/',
    provider: MEO,
    labelPt: 'Costa da Caparica (panorâmica)',
    labelEn: 'Costa da Caparica (panoramic)',
  },
  'lagoa-albufeira': {
    url: 'https://beachcam.meo.pt/livecams/lagoa-de-albufeira/',
    provider: MEO,
    labelPt: 'Lagoa de Albufeira',
    labelEn: 'Albufeira Lagoon',
  },
  'foil-lagoa-albufeira': {
    url: 'https://beachcam.meo.pt/livecams/lagoa-de-albufeira/',
    provider: MEO,
    labelPt: 'Lagoa de Albufeira',
    labelEn: 'Albufeira Lagoon',
  },
  'praia-lagoa-albufeira': {
    url: 'https://beachcam.meo.pt/livecams/lagoa-de-albufeira/',
    provider: MEO,
    labelPt: 'Lagoa de Albufeira',
    labelEn: 'Albufeira Lagoon',
  },
  meco: {
    url: 'https://beachcam.meo.pt/livecams/praia-do-meco/',
    provider: MEO,
    labelPt: 'Praia do Meco',
    labelEn: 'Meco Beach',
  },
  troia: {
    url: 'https://beachcam.meo.pt/livecams/troia/',
    provider: MEO,
    labelPt: 'Tróia',
    labelEn: 'Troia',
  },
  comporta: {
    url: 'https://beachcam.meo.pt/livecams/comporta/',
    provider: MEO,
    labelPt: 'Comporta',
    labelEn: 'Comporta',
  },
  'carvalhal-comporta': {
    url: 'https://beachcam.meo.pt/livecams/praia-do-carvalhal/',
    provider: MEO,
    labelPt: 'Praia do Carvalhal — Comporta',
    labelEn: 'Carvalhal Beach — Comporta',
  },
  'lagoa-santo-andre': {
    url: 'https://beachcam.meo.pt/livecams/lagoa-de-santo-andre/',
    provider: MEO,
    labelPt: 'Lagoa de Santo André',
    labelEn: 'Santo Andre Lagoon',
  },
  'sao-torpes': {
    url: 'https://beachcam.meo.pt/livecams/praia-de-sao-torpes/',
    provider: MEO,
    labelPt: 'São Torpes — Sines',
    labelEn: 'Sao Torpes — Sines',
  },
  'vila-nova-milfontes': {
    url: 'https://beachcam.meo.pt/livecams/vila-nova-de-milfontes-furnas-mar/',
    provider: MEO,
    labelPt: 'V.N. Milfontes — Furnas',
    labelEn: 'Milfontes — Furnas Beach',
  },
  zambujeira: {
    url: 'https://beachcam.meo.pt/livecams/zambujeira-do-mar/',
    provider: MEO,
    labelPt: 'Zambujeira do Mar',
    labelEn: 'Zambujeira do Mar',
  },
  carvalhal: {
    url: 'https://beachcam.meo.pt/livecams/carvalhal/',
    provider: MEO,
    labelPt: 'Carvalhal — Odemira',
    labelEn: 'Carvalhal — Odemira',
  },
  odeceixe: {
    url: 'https://beachcam.meo.pt/livecams/odeceixe/',
    provider: MEO,
    labelPt: 'Odeceixe',
    labelEn: 'Odeceixe',
  },
  amoreira: {
    url: 'https://beachcam.meo.pt/livecams/praia-da-amoreira/',
    provider: MEO,
    labelPt: 'Praia da Amoreira — Aljezur',
    labelEn: 'Amoreira Beach — Aljezur',
  },
  'monte-clerigo': {
    url: 'https://www.surftotal.com/camaras-report/alentejo-algarve/monte-clerigo-o-sargo',
    provider: SURFTOTAL,
    labelPt: 'Monte Clérigo',
    labelEn: 'Monte Clerigo',
  },
  arrifana: {
    url: 'https://beachcam.meo.pt/livecams/arrifana/',
    provider: MEO,
    labelPt: 'Arrifana — Aljezur',
    labelEn: 'Arrifana — Aljezur',
  },
  amado: {
    url: 'https://beachcam.meo.pt/livecams/praia-do-amado/',
    provider: MEO,
    labelPt: 'Praia do Amado — Carrapateira',
    labelEn: 'Amado Beach — Carrapateira',
  },
  cordoama: {
    url: 'https://beachcam.meo.pt/livecams/cordoama/',
    provider: MEO,
    labelPt: 'Cordoama — Vila do Bispo',
    labelEn: 'Cordoama — Vila do Bispo',
  },
  mareta: {
    url: 'https://beachcam.meo.pt/livecams/sagres/',
    provider: MEO,
    labelPt: 'Sagres — Mareta',
    labelEn: 'Sagres — Mareta',
  },
  tonel: {
    url: 'https://beachcam.meo.pt/livecams/sagres/',
    provider: MEO,
    labelPt: 'Sagres (ref.)',
    labelEn: 'Sagres (ref.)',
  },
  beliche: {
    url: 'https://beachcam.meo.pt/livecams/sagres/',
    provider: MEO,
    labelPt: 'Sagres (ref.)',
    labelEn: 'Sagres (ref.)',
  },
  martinhal: {
    url: 'https://beachcam.meo.pt/livecams/sagres/',
    provider: MEO,
    labelPt: 'Sagres (ref.)',
    labelEn: 'Sagres (ref.)',
  },
  luz: {
    url: 'https://beachcam.meo.pt/livecams/praia-da-luz/',
    provider: MEO,
    labelPt: 'Praia da Luz — Lagos',
    labelEn: 'Luz Beach — Lagos',
  },
  burgau: {
    url: 'https://beachcam.meo.pt/livecams/praia-da-luz/',
    provider: MEO,
    labelPt: 'Praia da Luz (ref.)',
    labelEn: 'Luz Beach (ref.)',
  },
  alvor: {
    url: 'https://beachcam.meo.pt/livecams/alvor/',
    provider: MEO,
    labelPt: 'Alvor',
    labelEn: 'Alvor',
  },
  'foil-alvor': {
    url: 'https://beachcam.meo.pt/livecams/alvor-nascente/',
    provider: MEO,
    labelPt: 'Alvor — Ria (nascente)',
    labelEn: 'Alvor — estuary side',
  },
  'tres-irmaos': {
    url: 'https://beachcam.meo.pt/livecams/praia-do-alemao/',
    provider: MEO,
    labelPt: 'Praia do Alemão — Alvor',
    labelEn: 'Alemao Beach — Alvor',
  },
  'praia-rocha': {
    url: 'https://beachcam.meo.pt/livecams/praia-da-rocha/',
    provider: MEO,
    labelPt: 'Praia da Rocha — Portimão',
    labelEn: 'Praia da Rocha — Portimao',
  },
  ferragudo: {
    url: 'https://beachcam.meo.pt/livecams/ferragudo/',
    provider: MEO,
    labelPt: 'Ferragudo — Praia Grande',
    labelEn: 'Ferragudo — Praia Grande',
  },
  'armacao-pera': {
    url: 'https://beachcam.meo.pt/livecams/armacao-de-pera/',
    provider: MEO,
    labelPt: 'Armação de Pêra',
    labelEn: 'Armacao de Pera',
  },
  falesia: {
    url: 'https://beachcam.meo.pt/livecams/praia-da-falesia/',
    provider: MEO,
    labelPt: 'Praia da Falésia — Albufeira',
    labelEn: 'Falesia Beach — Albufeira',
  },
  garrao: {
    url: 'https://beachcam.meo.pt/livecams/vilamoura/',
    provider: MEO,
    labelPt: 'Vilamoura (ref.)',
    labelEn: 'Vilamoura (ref.)',
  },
  'faro-mar': {
    url: 'https://beachcam.meo.pt/livecams/faro/',
    provider: MEO,
    labelPt: 'Praia de Faro',
    labelEn: 'Faro Beach',
  },
  culatra: {
    url: 'https://beachcam.meo.pt/livecams/ilha-do-farol-culatra/',
    provider: MEO,
    labelPt: 'Ilha do Farol — Culatra',
    labelEn: 'Farol Island — Culatra',
  },
  'barrinha-faro': {
    url: 'https://beachcam.meo.pt/livecams/ilha-do-farol-culatra/',
    provider: MEO,
    labelPt: 'Ilha do Farol — Culatra',
    labelEn: 'Farol Island — Culatra',
  },
  altura: {
    url: 'https://beachcam.meo.pt/livecams/praia-da-alagoa/',
    provider: MEO,
    labelPt: 'Praia da Alagoa — Altura',
    labelEn: 'Alagoa Beach — Altura',
  },
  'praia-verde': {
    url: 'https://beachcam.meo.pt/livecams/praia-verde/',
    provider: MEO,
    labelPt: 'Praia Verde — Castro Marim',
    labelEn: 'Praia Verde — Castro Marim',
  },
  'monte-gordo': {
    url: 'https://beachcam.meo.pt/livecams/praia-verde/',
    provider: MEO,
    labelPt: 'Praia Verde (ref.)',
    labelEn: 'Praia Verde (ref.)',
  },
  'castelo-bode': {
    url: 'https://beachcam.meo.pt/livecams/ferreira-do-zezere-dornes/',
    provider: MEO,
    labelPt: 'Dornes — Castelo de Bode',
    labelEn: 'Dornes — Castelo de Bode lake',
  },
  'sao-vicente-madeira': {
    url: 'https://beachcam.meo.pt/livecams/faja-da-areia/',
    provider: MEO,
    labelPt: 'Fajã da Areia — São Vicente',
    labelEn: 'Faja da Areia — Sao Vicente',
  },
  'porto-da-cruz': {
    url: 'https://beachcam.meo.pt/livecams/madeira-maiata/',
    provider: MEO,
    labelPt: 'Maiata — Porto da Cruz',
    labelEn: 'Maiata — Porto da Cruz',
  },
  'paul-mar': {
    url: 'https://beachcam.meo.pt/livecams/madeira-paul-do-mar/',
    provider: MEO,
    labelPt: 'Paul do Mar',
    labelEn: 'Paul do Mar',
  },
  'jardim-mar': {
    url: 'https://beachcam.meo.pt/livecams/ponta-pequena/',
    provider: MEO,
    labelPt: 'Ponta Pequena — Jardim do Mar',
    labelEn: 'Ponta Pequena — Jardim do Mar',
  },
  'santa-barbara': {
    url: 'https://beachcam.meo.pt/livecams/acores-ribeira-grande-praia-do-monte-verde/',
    provider: MEO,
    labelPt: 'Monte Verde — Ribeira Grande',
    labelEn: 'Monte Verde — Ribeira Grande',
  },
  'monte-verde': {
    url: 'https://beachcam.meo.pt/livecams/acores-ribeira-grande-praia-do-monte-verde/',
    provider: MEO,
    labelPt: 'Monte Verde — Ribeira Grande',
    labelEn: 'Monte Verde — Ribeira Grande',
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
    url: 'https://beachcam.meo.pt/livecams/meia-praia/',
    provider: MEO,
    labelPt: 'Meia Praia — Lagos',
    labelEn: 'Meia Praia — Lagos',
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
