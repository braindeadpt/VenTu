import { Spot } from '@/types';

export const spots: Spot[] = [
  // ==================== NORTE ====================
  {
    id: 'matosinhos', slug: 'matosinhos', name: 'Matosinhos', nameEn: 'Matosinhos',
    region: 'Porto', regionEn: 'Porto', lat: 41.174, lon: -8.688,
    type: 'surf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'W, NW',
    description: 'A melhor praia para aprender surf em Portugal. Sem correntes, sem rochas, ondas suaves e consistentes. O local mais seguro do norte.',
    descriptionEn: 'The best beach to learn surf in Portugal. No rip currents, no rocks, soft and consistent waves. The safest spot in the north.',
    images: ['/images/matosinhos-1.jpg'], facilities: ['Estacionamento', 'Escolas surf', 'Restaurantes', 'Metro', 'WC'],
    hazards: ['Multidão nos fins de semana']
  },
  {
    id: 'ofir', slug: 'ofir', name: 'Ofir', nameEn: 'Ofir',
    region: 'Esposende', regionEn: 'Esposende', lat: 41.548, lon: -8.789,
    type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
    description: 'Beach break potente com ondas de qualidade. Pouco crowd comparado com outras praias do norte. Fundo de areia variável.',
    descriptionEn: 'Powerful beach break with quality waves. Less crowded than other northern beaches. Variable sand bottom.',
    images: ['/images/ofir-1.jpg'], facilities: ['Estacionamento', 'Restaurante', 'WC'],
    hazards: ['Correntes', 'Ressaca forte']
  },
  {
    id: 'povoa-varzim', slug: 'povoa-varzim', name: 'Póvoa do Varzim', nameEn: 'Povoa do Varzim',
    region: 'Porto', regionEn: 'Porto', lat: 41.380, lon: -8.770,
    type: 'surf', difficulty: 'beginner', bestWind: 'E, NE', bestSwell: 'W, NW',
    description: 'Praia longa com ondas suaves perfeitas para iniciantes. Escolas de surf com boa reputação. Ambiente familiar.',
    descriptionEn: 'Long beach with gentle waves perfect for beginners. Reputable surf schools. Family-friendly atmosphere.',
    images: ['/images/povoa-1.jpg'], facilities: ['Estacionamento', 'Escolas surf', 'Restaurantes', 'WC'],
    hazards: ['Correntes moderadas']
  },
  {
    id: 'cabedelo', slug: 'cabedelo', name: 'Cabedelo', nameEn: 'Cabedelo',
    region: 'Viana do Castelo', regionEn: 'Viana do Castelo', lat: 41.687, lon: -8.845,
    type: 'kitesurf', difficulty: 'beginner', bestWind: 'NW, N', bestSwell: 'SW',
    description: 'Um dos melhores spots de kitesurf do Norte. Água plana na barra do rio Lima. Vento térmico de NW consistente. Épico para iniciantes!',
    descriptionEn: 'One of the best kitesurf spots in the north. Flat water at the Lima river bar. Consistent NW thermal wind. Epic for beginners!',
    images: ['/images/cabedelo-1.jpg'], facilities: ['Estacionamento', 'Escolas kite', 'Aluguer', 'WC'],
    hazards: ['Tráfego de barcos', 'Correntes na foz']
  },
  {
    id: 'esposende', slug: 'esposende', name: 'Esposende', nameEn: 'Esposende',
    region: 'Braga', regionEn: 'Braga', lat: 41.536, lon: -8.783,
    type: 'kitesurf', difficulty: 'intermediate', bestWind: 'NW, N', bestSwell: 'SW',
    description: 'Lagoa, foz do rio e praia aberta — três spots num só. Água plana na lagoa, ondas no oceano. Versátil e consistente.',
    descriptionEn: 'Lagoon, river mouth and open beach — three spots in one. Flat water in the lagoon, waves in the ocean. Versatile and consistent.',
    images: ['/images/esposende-1.jpg'], facilities: ['Estacionamento', 'Escolas kite', 'Aluguer', 'WC'],
    hazards: ['Correntes na foz', 'Rochas na lagoa']
  },
  {
    id: 'moledo', slug: 'moledo', name: 'Moledo do Minho', nameEn: 'Moledo do Minho',
    region: 'Caminha', regionEn: 'Caminha', lat: 41.848, lon: -8.863,
    type: 'surf', difficulty: 'intermediate', bestWind: 'E, NE', bestSwell: 'W, NW',
    description: 'Praia de areia fina no extremo norte de Portugal. Ondas potentes com pouca multidão. Vista para a Espanha do outro lado do rio Minho.',
    descriptionEn: 'Fine sand beach at the extreme north of Portugal. Powerful waves with little crowd. View of Spain across the Minho river.',
    images: ['/images/moledo-1.jpg'], facilities: ['Estacionamento', 'Restaurante', 'WC'],
    hazards: ['Correntes fortes', 'Água fria']
  },

  // ==================== CENTRO ====================
  {
    id: 'ribeira-ilhas', slug: 'ribeira-ilhas', name: "Ribeira d'Ilhas", nameEn: "Ribeira d'Ilhas",
    region: 'Ericeira', regionEn: 'Ericeira', lat: 38.989, lon: -9.422,
    type: 'surf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'NW, W',
    description: 'Onda direita clássica da Ericeira, palco do WSL. Uma das mais consistentes de Portugal. Longa, perfeita, tubos incríveis.',
    descriptionEn: 'Classic Ericeira right-hand wave, WSL venue. One of the most consistent in Portugal. Long, perfect, incredible barrels.',
    images: ['/images/ribeira-ilhas-1.jpg'], facilities: ['Estacionamento', 'Café', 'WC'],
    hazards: ['Locals', 'Rochas', 'Multidão']
  },
  {
    id: 'coxos', slug: 'coxos', name: 'Coxos', nameEn: 'Coxos',
    region: 'Ericeira', regionEn: 'Ericeira', lat: 38.999, lon: -9.430,
    type: 'surf', difficulty: 'advanced', bestWind: 'N, NE', bestSwell: 'NW, W',
    description: 'Reef break poderoso e tubar. Uma das melhores ondas de Portugal — direita longa, íngreme, ocas. Apenas para experts.',
    descriptionEn: 'Powerful reef break barrel. One of the best waves in Portugal — long, steep, hollow right. Experts only.',
    images: ['/images/coxos-1.jpg'], facilities: ['Estacionamento limitado', 'Acesso íngreme'],
    hazards: ['Rochas afiadas', 'Locals agressivos', 'Pouco profundo']
  },
  {
    id: 'foz-lizandro', slug: 'foz-lizandro', name: 'Foz do Lizandro', nameEn: 'Foz do Lizandro',
    region: 'Ericeira', regionEn: 'Ericeira', lat: 38.936, lon: -9.392,
    type: 'surf', difficulty: 'beginner', bestWind: 'N, NE', bestSwell: 'S, SW',
    description: 'Praia de areia em forma de L no estuário do rio Lizandro. Ondas para todos os níveis. Reef breaks Lage dos Tubos e Limipicos no norte.',
    descriptionEn: 'L-shaped sand beach at the Lizandro river estuary. Waves for all levels. Lage dos Tubos and Limipicos reef breaks in the north.',
    images: ['/images/foz-lizandro-1.jpg'], facilities: ['Estacionamento', 'Restaurantes', 'Escola surf', 'WC'],
    hazards: ['Correntes na maré vazante', 'Rochas no reef']
  },
  {
    id: 'baleal', slug: 'baleal', name: 'Baleal', nameEn: 'Baleal',
    region: 'Peniche', regionEn: 'Peniche', lat: 39.371, lon: -9.340,
    type: 'surf', difficulty: 'beginner', bestWind: 'N, NE', bestSwell: 'W, NW',
    description: 'Cantinho da Baía — ondas suaves protegidas da ilha. Perfeito para iniciantes e intermediários. Vários picos ao longo da baía.',
    descriptionEn: 'Cantinho da Baía — soft waves protected by the island. Perfect for beginners and intermediates. Multiple peaks along the bay.',
    images: ['/images/baleal-1.jpg'], facilities: ['Estacionamento', 'Escolas surf', 'Restaurantes', 'WC'],
    hazards: ['Multidão na época alta']
  },
  {
    id: 'carcavelos', slug: 'carcavelos', name: 'Carcavelos', nameEn: 'Carcavelos',
    region: 'Cascais', regionEn: 'Cascais', lat: 38.677, lon: -9.336,
    type: 'surf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'W, NW',
    description: 'O beach break mais famoso de Lisboa. Ondas de classe mundial ao pé do Forte de São Julião. Multidão de surfistas de qualidade.',
    descriptionEn: 'The most famous beach break in Lisbon. World-class waves next to Forte de São Julião. Crowd of quality surfers.',
    images: ['/images/carcavelos-1.jpg'], facilities: ['Estacionamento', 'Escola surf', 'Restaurantes', 'Comboio', 'WC'],
    hazards: ['Multidão extrema', 'Correntes']
  },
  {
    id: 'costa-caparica', slug: 'costa-caparica', name: 'Costa da Caparica', nameEn: 'Costa da Caparica',
    region: 'Almada', regionEn: 'Almada', lat: 38.645, lon: -9.236,
    type: 'surf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'W, SW',
    description: '10km de beach breaks perfeitos para aprender. Várias praias: Dragão Vermelho, CDS, Rainha. A 20 min de Lisboa.',
    descriptionEn: '10km of perfect beach breaks to learn. Multiple beaches: Dragão Vermelho, CDS, Rainha. 20 min from Lisbon.',
    images: ['/images/costa-caparica-1.jpg'], facilities: ['Estacionamento', 'Escolas surf', 'Restaurantes', 'WC'],
    hazards: ['Correntes em alguns picos']
  },
  {
    id: 'fonte-telha', slug: 'fonte-telha', name: 'Fonte da Telha', nameEn: 'Fonte da Telha',
    region: 'Almada', regionEn: 'Almada', lat: 38.580, lon: -9.212,
    type: 'kitesurf', difficulty: 'beginner', bestWind: 'NW, N', bestSwell: 'SW',
    description: 'Praia de areia com ondas pequenas. Perfeito para iniciantes de kitesurf. Vento térmico de Nortada no verão. Pouca multidão!',
    descriptionEn: 'Sand beach with small waves. Perfect for beginner kitesurfers. Thermal Nortada wind in summer. Low crowd!',
    images: ['/images/fonte-telha-1.jpg'], facilities: ['Estacionamento', 'Escola kite', 'WC'],
    hazards: ['Falésias no fundo — usar vento sideshore']
  },
  {
    id: 'lagoa-albufeira', slug: 'lagoa-albufeira', name: 'Lagoa de Albufeira', nameEn: 'Albufeira Lagoon',
    region: 'Sesimbra', regionEn: 'Sesimbra', lat: 38.501, lon: -9.140,
    type: 'kitesurf', difficulty: 'beginner', bestWind: 'NW, N', bestSwell: 'SW',
    description: 'Lagoa separada do oceano por um banco de areia. Água plana até à cintura — paraíso para iniciantes. Nortada consistente.',
    descriptionEn: 'Lagoon separated from the ocean by a sand bar. Chest-high flat water — paradise for beginners. Consistent Nortada.',
    images: ['/images/lagoa-albufeira-1.jpg'], facilities: ['Estacionamento', 'Escola kite', 'Aluguer', 'WC'],
    hazards: ['Maré alta pode subir a lagoa']
  },
  {
    id: 'costa-nova', slug: 'costa-nova', name: 'Costa Nova', nameEn: 'Costa Nova',
    region: 'Aveiro', regionEn: 'Aveiro', lat: 40.620, lon: -8.747,
    type: 'windsurf', difficulty: 'intermediate', bestWind: 'N, NW', bestSwell: 'W',
    description: 'Spot clássico de windsurf no centro de Portugal. Ondas e vento de NW. Cenário único com as casas listradas.',
    descriptionEn: 'Classic windsurf spot in central Portugal. Waves and NW wind. Unique scenery with the striped houses.',
    images: ['/images/costa-nova-1.jpg'], facilities: ['Estacionamento', 'Escola windsurf', 'WC'],
    hazards: ['Correntes', 'Água fria']
  },
  {
    id: 'nazare', slug: 'nazare', name: 'Nazaré', nameEn: 'Nazare',
    region: 'Oeste', regionEn: 'West Coast', lat: 39.601, lon: -9.068,
    type: 'big-wave', difficulty: 'expert', bestWind: 'N, NNE', bestSwell: 'W, WNW',
    description: 'Famoso pelas maiores ondas do mundo. Praia do Norte é o palco do Big Wave Surfing. Canal submarino amplifica ondas gigantescas.',
    descriptionEn: 'Famous for the biggest waves in the world. Praia do Norte is the stage for Big Wave Surfing. Underwater canyon amplifies giant waves.',
    images: ['/images/nazare-1.jpg'], facilities: ['Estacionamento', 'Restaurantes', 'Salva-vidas', 'WC'],
    hazards: ['Ondas gigantescas', 'Correntes fortes', 'Rochas submersas']
  },
  {
    id: 'supertubos', slug: 'supertubos', name: 'Supertubos', nameEn: 'Supertubos',
    region: 'Peniche', regionEn: 'Peniche', lat: 39.338, lon: -9.359,
    type: 'surf', difficulty: 'advanced', bestWind: 'N, NE', bestSwell: 'W, NW',
    description: 'Onda tubular perfeita, palco do WSL Championship Tour. Tubos rápidos e potentes sobre areia.',
    descriptionEn: 'Perfect barreling wave, WSL Championship Tour venue. Fast and powerful tubes over sand.',
    images: ['/images/supertubos-1.jpg'], facilities: ['Estacionamento', 'Escola de surf', 'Aluguer', 'WC'],
    hazards: ['Correntes', 'Ressaca forte']
  },
  {
    id: 'guincho', slug: 'guincho', name: 'Guincho', nameEn: 'Guincho',
    region: 'Cascais', regionEn: 'Cascais', lat: 39.731, lon: -9.472,
    type: 'kitesurf', difficulty: 'intermediate', bestWind: 'N, NNW', bestSwell: 'SW, W',
    description: 'Spot icónico de kitesurf e windsurf. Vento térmico Nortada consistente no verão. Melhor vento de Portugal.',
    descriptionEn: 'Iconic kitesurf and windsurf spot. Consistent thermal Nortada wind in summer. Best wind in Portugal.',
    images: ['/images/guincho-1.jpg'], facilities: ['Estacionamento', 'Restaurante', 'Escola kite', 'WC'],
    hazards: ['Vento forte', 'Correntes', 'Rochas']
  },
  {
    id: 'foz-arelho', slug: 'foz-arelho', name: 'Foz do Arelho', nameEn: 'Foz do Arelho',
    region: 'Oeste', regionEn: 'West Coast', lat: 39.427, lon: -9.210,
    type: 'kitesurf', difficulty: 'beginner', bestWind: 'N, NNE', bestSwell: 'W',
    description: 'Lagoa de Óbidos perfeita para iniciantes. Água plana, vento side-onshore. Escolas e aluguer.',
    descriptionEn: 'Obidos Lagoon perfect for beginners. Flat water, side-onshore wind. Schools and rental.',
    images: ['/images/foz-arelho-1.jpg'], facilities: ['Estacionamento', 'Escolas kite', 'Aluguer', 'Restaurantes', 'WC'],
    hazards: ['Tráfego de iniciantes', 'Maré baixa']
  },

  // ==================== ALGARVE ====================
  {
    id: 'arrifana', slug: 'arrifana', name: 'Arrifana', nameEn: 'Arrifana',
    region: 'Algarve', regionEn: 'Algarve', lat: 37.294, lon: -8.864,
    type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
    description: 'Baía protegida com ondas consistentes para todos os níveis. Fundo misto de areia e rocha. Cenário deslumbrante.',
    descriptionEn: 'Protected bay with consistent waves for all levels. Mixed sand and rock bottom. Stunning scenery.',
    images: ['/images/arrifana-1.jpg'], facilities: ['Estacionamento', 'Restaurantes', 'Escola surf', 'WC'],
    hazards: ['Rochas', 'Correntes na saída']
  },
  {
    id: 'alvor', slug: 'alvor', name: 'Alvor', nameEn: 'Alvor',
    region: 'Algarve', regionEn: 'Algarve', lat: 37.136, lon: -8.594,
    type: 'multisport', difficulty: 'beginner', bestWind: 'W, NW', bestSwell: 'S, SW',
    description: 'Praia extensa com ondas suaves. Ideal para surf iniciante, SUP e famílias. Lagoa de Alvor para kitesurf flat water.',
    descriptionEn: 'Long beach with gentle waves. Ideal for beginner surf, SUP and families. Alvor Lagoon for flat water kitesurf.',
    images: ['/images/alvor-1.jpg'], facilities: ['Estacionamento', 'Restaurantes', 'Aluguer', 'Salva-vidas', 'WC'],
    hazards: ['Rochas na extremidade sul']
  },
  {
    id: 'tonel', slug: 'tonel', name: 'Praia do Tonel', nameEn: 'Tonel Beach',
    region: 'Sagres', regionEn: 'Sagres', lat: 37.010, lon: -8.945,
    type: 'surf', difficulty: 'advanced', bestWind: 'E, SE', bestSwell: 'W, NW',
    description: 'Um dos beach breaks mais consistentes do sul. Ondas nítidas e ocas em frente à falésia. Melhor entre maré baixa e média.',
    descriptionEn: 'One of the most consistent beach breaks in the south. Clean and hollow waves in front of the cliff. Best between low and mid tide.',
    images: ['/images/tonel-1.jpg'], facilities: ['Estacionamento', 'Restaurante', 'WC'],
    hazards: ['Correntes fortes', 'Rochas', 'Multidão']
  },
  {
    id: 'beliche', slug: 'beliche', name: 'Praia do Beliche', nameEn: 'Beliche Beach',
    region: 'Sagres', regionEn: 'Sagres', lat: 37.030, lon: -8.970,
    type: 'surf', difficulty: 'advanced', bestWind: 'E, SE', bestSwell: 'W, NW',
    description: 'Praia virada a oeste com ondas potentes. Acesso por escadaria na falésia. Beach break épico em dias grandes.',
    descriptionEn: 'West-facing beach with powerful waves. Access by staircase on the cliff. Epic beach break on big days.',
    images: ['/images/beliche-1.jpg'], facilities: ['Estacionamento limitado', 'WC'],
    hazards: ['Acesso difícil', 'Correntes fortes', 'Rochas']
  },
  {
    id: 'zavial', slug: 'zavial', name: 'Zavial', nameEn: 'Zavial',
    region: 'Sagres', regionEn: 'Sagres', lat: 37.005, lon: -8.925,
    type: 'surf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'S, SW',
    description: 'Beach break virado a sul com ondas de qualidade. Menos crowd que Tonel e Beliche. Fundo de areia.',
    descriptionEn: 'South-facing beach break with quality waves. Less crowd than Tonel and Beliche. Sand bottom.',
    images: ['/images/zavial-1.jpg'], facilities: ['Estacionamento', 'WC'],
    hazards: ['Correntes']
  },
  {
    id: 'martinhal', slug: 'martinhal', name: 'Martinhal', nameEn: 'Martinhal',
    region: 'Sagres', regionEn: 'Sagres', lat: 37.025, lon: -8.935,
    type: 'windsurf', difficulty: 'intermediate', bestWind: 'N, NW', bestSwell: 'SW',
    description: 'Centro internacional de windsurf. Água plana à tarde com vento térmico. Escola com equipamento de qualidade.',
    descriptionEn: 'International windsurf center. Flat water in the afternoon with thermal wind. School with quality equipment.',
    images: ['/images/martinhal-1.jpg'], facilities: ['Estacionamento', 'Escola windsurf', 'Aluguer', 'Restaurante', 'WC'],
    hazards: ['Vento pode desligar de repente']
  },
  {
    id: 'praia-rocha', slug: 'praia-rocha', name: 'Praia da Rocha', nameEn: 'Praia da Rocha',
    region: 'Portimão', regionEn: 'Portimão', lat: 37.139, lon: -8.535,
    type: 'multisport', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'SW',
    description: 'Praia de areia com falésias impressionantes. Ondas de inverno para surf. Vento de leste para windsurf e kitesurf no verão.',
    descriptionEn: 'Sand beach with impressive cliffs. Winter waves for surf. East wind for windsurf and kitesurf in summer.',
    images: ['/images/praia-rocha-1.jpg'], facilities: ['Estacionamento', 'Restaurantes', 'WC'],
    hazards: ['Rochas submersas', 'Multidão na época alta']
  },
  {
    id: 'espinho', slug: 'espinho', name: 'Espinho', nameEn: 'Espinho',
    region: 'Norte', regionEn: 'North', lat: 41.007, lon: -8.640,
    type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
    description: 'Onda de direita consistente sobre areia. Uma das melhores do norte de Portugal.',
    descriptionEn: 'Consistent right-hand wave over sand. One of the best in northern Portugal.',
    images: ['/images/espinho-1.jpg'], facilities: ['Estacionamento', 'Restaurantes', 'Escola surf', 'WC'],
    hazards: ['Correntes', 'Ressaca']
  },
  {
    id: 'carrapateira', slug: 'carrapateira', name: 'Carrapateira', nameEn: 'Carrapateira',
    region: 'Algarve', regionEn: 'Algarve', lat: 37.183, lon: -8.905,
    type: 'surf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'W, NW',
    description: 'Praia da Bordeira com ondas de beach break potentes. Cenário natural deslumbrante da Costa Vicentina.',
    descriptionEn: 'Bordeira Beach with powerful beach break waves. Stunning natural scenery of the Vicentina Coast.',
    images: ['/images/carrapateira-1.jpg'], facilities: ['Estacionamento limitado', 'Restaurante', 'WC'],
    hazards: ['Correntes fortes', 'Rochas']
  },
  {
    id: 'praia-norte', slug: 'praia-norte', name: 'Praia do Norte', nameEn: 'Praia do Norte',
    region: 'Nazaré', regionEn: 'Nazare', lat: 39.604, lon: -9.075,
    type: 'big-wave', difficulty: 'expert', bestWind: 'N, NNE', bestSwell: 'W, WNW',
    description: 'Ondas colossais até 30m+. Local do recorde mundial de surf. Apenas para profissionais.',
    descriptionEn: 'Colossal waves up to 30m+. World record surf location. Professionals only.',
    images: ['/images/praia-norte-1.jpg'], facilities: ['Salva-vidas', 'Acesso controlado'],
    hazards: ['Ondas mortais', 'Correntes extremas', 'Rochas']
  },
  {
    id: 'lagos', slug: 'lagos', name: 'Meia Praia', nameEn: 'Meia Praia',
    region: 'Lagos', regionEn: 'Lagos', lat: 37.115, lon: -8.653,
    type: 'kitesurf', difficulty: 'beginner', bestWind: 'NW, N', bestSwell: 'S',
    description: 'Praia extensa de 4km com vento side-shore. Escola de kitesurf e windsurf no centro.',
    descriptionEn: '4km long beach with side-shore wind. Kitesurf and windsurf school in the center.',
    images: ['/images/meia-praia-1.jpg'], facilities: ['Estacionamento', 'Escolas', 'Aluguer', 'Restaurantes'],
    hazards: ['Tráfego na época alta']
  }
];

export const getSpotBySlug = (slug: string): Spot | undefined =>
  spots.find(s => s.slug === slug);
