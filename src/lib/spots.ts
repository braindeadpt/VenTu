import { Spot } from '@/types';

export const spots: Spot[] = [
  {
      id: 'moledo', slug: 'moledo', name: 'Moledo do Minho', nameEn: 'Moledo do Minho',
      region: 'Caminha', regionEn: 'Caminha', lat: 41.848, lon: -8.863,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, NE', bestSwell: 'W, NW',
      description: 'Praia de areia fina no extremo norte de Portugal. Ondas potentes com pouca multidão. Vista para a Espanha do outro lado do rio Minho.',
      descriptionEn: 'Fine sand beach at the extreme north of Portugal. Powerful waves with little crowd. View of Spain across the Minho river.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Correntes fortes', 'Água fria']
    },
  {
      id: 'vila-praia-ancora', slug: 'vila-praia-ancora', name: 'Vila Praia de Âncora', nameEn: 'Vila Praia de Ancora',
      region: 'Viana do Castelo', regionEn: 'Viana do Castelo', lat: 41.817, lon: -8.850,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'E, NE', bestSwell: 'W, NW',
      description: 'A melhor praia para aprender surf no distrito de Viana. Ondas suaves, praia extensa e paisagem natural deslumbrante. Perfeita para famílias.',
      descriptionEn: 'The best beach to learn surf in Viana district. Gentle waves, extensive beach and stunning natural landscape. Perfect for families.',
      facilities: ['Estacionamento', 'Escola surf', 'Restaurantes', 'Alojamento', 'WC'],
      hazards: ['Correntes moderadas']
    },
  {
      id: 'ancora', slug: 'ancora', name: 'Âncora', nameEn: 'Ancora',
      region: 'Caminha', regionEn: 'Caminha', lat: 41.815, lon: -8.860,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Praia familiar com ondas suaves. Perfeita para iniciantes no norte de Portugal. Pouco crowd e água limpa.',
      descriptionEn: 'Family beach with gentle waves. Perfect for beginners in northern Portugal. Low crowd and clean water.',
      facilities: ['Estacionamento', 'Restaurantes', 'WC'],
      hazards: ['Correntes moderadas']
    },
  {
      id: 'afife', slug: 'afife', name: 'Afife (Praia da Arda)', nameEn: 'Afife (Arda Beach)',
      region: 'Viana do Castelo', regionEn: 'Viana do Castelo', lat: 41.780, lon: -8.860,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Destino de surf e windsurf desde os anos 70! Ondas de qualidade com ventos fortes ocasionais. Um dos spots mais icónicos do norte.',
      descriptionEn: 'Surfing and windsurfing destination since the 70s! Quality waves with occasional strong winds. One of the most iconic northern spots.',
      facilities: ['Estacionamento', 'Escola surf', 'Restaurante', 'WC'],
      hazards: ['Vento forte', 'Correntes', 'Exposto ao vento']
    },
  {
      id: 'castelo-neiva', slug: 'castelo-neiva', name: 'Castelo do Neiva', nameEn: 'Castelo do Neiva',
      region: 'Viana do Castelo', regionEn: 'Viana do Castelo', lat: 41.750, lon: -8.820,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Praia com bandeira azul e ambiente tranquilo. Beach break consistente com múltiplos picos. Clube náutico na zona.',
      descriptionEn: 'Blue flag beach with tranquil atmosphere. Consistent beach break with multiple peaks. Nautical club in the area.',
      facilities: ['Estacionamento', 'Restaurante', 'Clube Nautico', 'WC'],
      hazards: ['Rochas submersas', 'Correntes']
    },
  {
      id: 'amorosa', slug: 'amorosa', name: 'Praia da Amorosa', nameEn: 'Amorosa Beach',
      region: 'Viana do Castelo', regionEn: 'Viana do Castelo', lat: 41.700, lon: -8.850,
      coastOrientation: 270,
      type: 'kitesurf', difficulty: 'intermediate', bestWind: 'N, NW', bestSwell: 'S, SW',
      description: 'Spot de kitesurf ao lado do Cabedelo. Água plana ideal para freestyle e foil. Menos crowd que o Cabedelo principal.',
      descriptionEn: 'Kitesurf spot next to Cabedelo. Flat water ideal for freestyle and foil. Less crowded than main Cabedelo.',
      facilities: ['Estacionamento', 'Escola kite', 'WC'],
      hazards: ['Pedras entre Cabedelo e Amorosa', 'Mare']
    },
  {
      id: 'cabedelo', slug: 'cabedelo', name: 'Cabedelo', nameEn: 'Cabedelo',
      region: 'Viana do Castelo', regionEn: 'Viana do Castelo', lat: 41.687, lon: -8.845,
      coastOrientation: 270,
      type: 'kitesurf', difficulty: 'beginner', bestWind: 'NW, N', bestSwell: 'SW',
      description: 'Um dos melhores spots de kitesurf do Norte. Água plana na barra do rio Lima. Vento térmico de NW consistente. Épico para iniciantes!',
      descriptionEn: 'One of the best kitesurf spots in the north. Flat water at the Lima river bar. Consistent NW thermal wind. Epic for beginners!',
      facilities: ['Estacionamento', 'Escolas kite', 'Aluguer', 'WC'],
      hazards: ['Tráfego de barcos', 'Correntes na foz']
    },
  {
      id: 'foil-cabedelo', slug: 'foil-cabedelo', name: 'Cabedelo - Foil', nameEn: 'Cabedelo - Foil',
      region: 'Viana do Castelo', regionEn: 'Viana do Castelo', lat: 41.687, lon: -8.845,
      coastOrientation: 270,
      type: 'foil', difficulty: 'intermediate', bestWind: 'NW, N', bestSwell: 'Rio',
      description: 'Água plana na barra do rio Lima — perfeita para wing foil. Vento térmico de NW consistente. Spot de foil no norte de Portugal.',
      descriptionEn: 'Flat water at the Lima river bar — perfect for wing foil. Consistent NW thermal wind. Foil spot in northern Portugal.',
      facilities: ['Estacionamento', 'Escola foil', 'Aluguer', 'WC'],
      hazards: ['Tráfego de barcos', 'Correntes na foz']
    },
  {
      id: 'ofir', slug: 'ofir', name: 'Ofir', nameEn: 'Ofir',
      region: 'Esposende', regionEn: 'Esposende', lat: 41.548, lon: -8.789,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Beach break potente com ondas de qualidade. Pouco crowd comparado com outras praias do norte. Fundo de areia variável.',
      descriptionEn: 'Powerful beach break with quality waves. Less crowded than other northern beaches. Variable sand bottom.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Correntes', 'Ressaca forte']
    },
  {
      id: 'esposende', slug: 'esposende', name: 'Esposende', nameEn: 'Esposende',
      region: 'Braga', regionEn: 'Braga', lat: 41.536, lon: -8.783,
      coastOrientation: 270,
      type: 'kitesurf', difficulty: 'intermediate', bestWind: 'NW, N', bestSwell: 'SW',
      description: 'Lagoa, foz do rio e praia aberta — três spots num só. Água plana na lagoa, ondas no oceano. Versátil e consistente.',
      descriptionEn: 'Lagoon, river mouth and open beach — three spots in one. Flat water in the lagoon, waves in the ocean. Versatile and consistent.',
      facilities: ['Estacionamento', 'Escolas kite', 'Aluguer', 'WC'],
      hazards: ['Correntes na foz', 'Rochas na lagoa']
    },
  {
      id: 'fao', slug: 'fao', name: 'Fão', nameEn: 'Fao',
      region: 'Esposende', regionEn: 'Esposende', lat: 41.510, lon: -8.770,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Spot junto a Ofir com beach break consistente. Praia menos explorada, ideal para escapar da multidão. Fundo de areia variável.',
      descriptionEn: 'Spot next to Ofir with consistent beach break. Less explored beach, ideal to escape crowds. Variable sand bottom.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Ressaca forte', 'Correntes']
    },
  {
      id: 'apulia', slug: 'apulia', name: 'Apúlia', nameEn: 'Apulia',
      region: 'Esposende', regionEn: 'Esposende', lat: 41.480, lon: -8.760,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Praia famosa do Norte com moinhos de vento como cenário. Ondas suaves perfeitas para iniciantes e longboard. Ambiente único.',
      descriptionEn: 'Famous Northern beach with windmills as scenery. Gentle waves perfect for beginners and longboard. Unique atmosphere.',
      facilities: ['Estacionamento', 'Restaurante', 'WC', 'Moinhos de vento'],
      hazards: ['Correntes', 'Multidao no verao']
    },
  {
      id: 'povoa-varzim', slug: 'povoa-varzim', name: 'Póvoa do Varzim', nameEn: 'Povoa do Varzim',
      region: 'Porto', regionEn: 'Porto', lat: 41.377, lon: -8.760,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'E, NE', bestSwell: 'W, NW',
      description: 'Praia longa com ondas suaves perfeitas para iniciantes. Escolas de surf com boa reputação. Ambiente familiar.',
      descriptionEn: 'Long beach with gentle waves perfect for beginners. Reputable surf schools. Family-friendly atmosphere.',
      facilities: ['Estacionamento', 'Escolas surf', 'Restaurantes', 'WC'],
      hazards: ['Correntes moderadas']
    },
  {
      id: 'azurara', slug: 'azurara', name: 'Azurara', nameEn: 'Azurara',
      region: 'Vila do Conde', regionEn: 'Vila do Conde', lat: 41.360, lon: -8.750,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Uma das melhores praias de surf do Norte de Portugal! Orientação geográfica perfeita para ondas. Beach break com múltiplos picos.',
      descriptionEn: 'One of the best surf beaches in Northern Portugal! Perfect geographic orientation for waves. Beach break with multiple peaks.',
      facilities: ['Estacionamento', 'Escola surf', 'Restaurantes', 'WC'],
      hazards: ['Correntes', 'Ressaca forte']
    },
  {
      id: 'leca-palmeira', slug: 'leca-palmeira', name: 'Leça da Palmeira', nameEn: 'Leca da Palmeira',
      region: 'Porto', regionEn: 'Porto', lat: 41.190, lon: -8.700,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Praia com bandeira azul ao lado de Matosinhos. Beach break potente com ondas mais hollow. Pool de mares famoso nas proximidades.',
      descriptionEn: 'Blue flag beach next to Matosinhos. Powerful beach break with hollower waves. Famous tidal pool nearby.',
      facilities: ['Estacionamento', 'Restaurante', 'Piscina de Mares', 'WC'],
      hazards: ['Correntes', 'Ressaca']
    },
  {
      id: 'matosinhos', slug: 'matosinhos', name: 'Matosinhos', nameEn: 'Matosinhos',
      region: 'Porto', regionEn: 'Porto', lat: 41.177, lon: -8.692,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'A melhor praia para aprender surf em Portugal. Sem correntes, sem rochas, ondas suaves e consistentes. O local mais seguro do norte.',
      descriptionEn: 'The best beach to learn surf in Portugal. No rip currents, no rocks, soft and consistent waves. The safest spot in the north.',
      facilities: ['Estacionamento', 'Escolas surf', 'Restaurantes', 'Metro', 'WC'],
      hazards: ['Multidão nos fins de semana']
    },
  {
      id: 'espinho', slug: 'espinho', name: 'Espinho', nameEn: 'Espinho',
      region: 'Porto', regionEn: 'Porto', lat: 41.007, lon: -8.640,
      coastOrientation: 270,
      type: 'surf', difficulty: 'advanced', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'A LENDARIA "Direita do Casino"! Onda tubular que forma junto ao molhe do casino. Uma das ondas mais famosas do Norte. Sede de etapas do World Junior Tour.',
      descriptionEn: 'The LEGENDARY "Casino Right"! Barrel wave forming next to the casino breakwater. One of the most famous waves in the North. Host of World Junior Tour stages.',
      facilities: ['Estacionamento', 'Escola surf', 'Restaurantes', 'Casino', 'WC'],
      hazards: ['Ondas pesadas', 'Molhe', 'Locals']
    },
  {
      id: 'esmoriz', slug: 'esmoriz', name: 'Esmoriz', nameEn: 'Esmoriz',
      region: 'Ovar', regionEn: 'Ovar', lat: 40.960, lon: -8.620,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Considerada pelo Evening Times a 2ª melhor zona de surf do MUNDO! Beach break de 6km com múltiplos picos. Pinhal ao fundo. Spot selvagem e pouco crowd.',
      descriptionEn: 'Ranked by Evening Times as the 2nd best surf area in the WORLD! 6km beach break with multiple peaks. Pine forest backdrop. Wild and uncrowded spot.',
      facilities: ['Estacionamento', 'Escola surf', 'Restaurantes', 'Camping', 'WC'],
      hazards: ['Correntes', 'Ressaca forte']
    },
  {
      id: 'cortegaca', slug: 'cortegaca', name: 'Cortegaça', nameEn: 'Cortegaca',
      region: 'Ovar', regionEn: 'Ovar', lat: 40.940, lon: -8.610,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Beach break consistente famoso pelo festival de surf nocturno. Ondas de qualidade com pouco crowd. Pinhal ao lado.',
      descriptionEn: 'Consistent beach break famous for night surfing festival. Quality waves with little crowd. Pine forest next to it.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Correntes', 'Ressaca']
    },
  {
      id: 'maceda', slug: 'maceda', name: 'Maceda', nameEn: 'Maceda',
      region: 'Ovar', regionEn: 'Ovar', lat: 40.930, lon: -8.600,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Beach break selvagem com dunas imensas. Spot pouco explorado, ideal para escapar da multidão. Ondas de qualidade com crowd minimo.',
      descriptionEn: 'Wild beach break with huge dunes. Little explored spot, ideal to escape crowds. Quality waves with minimal crowd.',
      facilities: ['Estacionamento', 'WC'],
      hazards: ['Correntes fortes', 'Isolamento']
    },
  {
      id: 'sao-jacinto', slug: 'sao-jacinto', name: 'São Jacinto', nameEn: 'Sao Jacinto',
      region: 'Aveiro', regionEn: 'Aveiro', lat: 40.700, lon: -8.730,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Reserva Natural das Dunas com surf de qualidade. Praia selvagem acessível apenas de barco. Ondas consistentes e crowd zero.',
      descriptionEn: 'Dunes Nature Reserve with quality surf. Wild beach accessible only by boat. Consistent waves and zero crowd.',
      facilities: ['Barco', 'Restaurante', 'WC'],
      hazards: ['Acesso de barco apenas', 'Correntes']
    },
  {
      id: 'costa-nova', slug: 'costa-nova', name: 'Costa Nova', nameEn: 'Costa Nova',
      region: 'Aveiro', regionEn: 'Aveiro', lat: 40.620, lon: -8.747,
      coastOrientation: 270,
      type: 'windsurf', difficulty: 'intermediate', bestWind: 'N, NW', bestSwell: 'W',
      description: 'Spot clássico de windsurf no centro de Portugal. Ondas e vento de NW. Cenário único com as casas listradas.',
      descriptionEn: 'Classic windsurf spot in central Portugal. Waves and NW wind. Unique scenery with the striped houses.',
      facilities: ['Estacionamento', 'Escola windsurf', 'WC'],
      hazards: ['Correntes', 'Água fria']
    },
  {
      id: 'praia-norte', slug: 'praia-norte', name: 'Praia do Norte', nameEn: 'Praia do Norte',
      region: 'Nazaré', regionEn: 'Nazare', lat: 39.604, lon: -9.075,
      coastOrientation: 270,
      type: 'big-wave', difficulty: 'expert', bestWind: 'N, NNE', bestSwell: 'W, WNW',
      description: 'Ondas colossais até 30m+. Local do recorde mundial de surf. Apenas para profissionais.',
      descriptionEn: 'Colossal waves up to 30m+. World record surf location. Professionals only.',
      facilities: ['Salva-vidas', 'Acesso controlado'],
      hazards: ['Ondas mortais', 'Correntes extremas', 'Rochas']
    },
  {
      id: 'castelo-bode', slug: 'castelo-bode', name: 'Castelo de Bode', nameEn: 'Castelo de Bode',
      region: 'Santarém', regionEn: 'Santarem', lat: 39.600, lon: -8.300,
      coastOrientation: 270,
      type: 'wakeboard', difficulty: 'all', bestWind: 'Vário', bestSwell: 'Lagoa',
      description: 'Maior resort de wakeboard da Europa! 5 cable parks em 30km de lagoa. Água cristalina e plana. Perfeito para iniciantes a pros.',
      descriptionEn: 'Biggest wakeboard resort in Europe! 5 cable parks along 30km of lake. Crystal clear flat water. Perfect from beginners to pros.',
      facilities: ['Estacionamento', '5 Cable Parks', 'Escola wake', 'Aluguer', 'Restaurante', 'Alojamento'],
      hazards: ['Outros riders', 'Barcos']
    },
  {
      id: 'nazare', slug: 'nazare', name: 'Nazaré', nameEn: 'Nazare',
      region: 'Oeste', regionEn: 'West Coast', lat: 39.597, lon: -9.073,
      coastOrientation: 270,
      type: 'big-wave', difficulty: 'expert', bestWind: 'N, NNE', bestSwell: 'W, WNW',
      description: 'Famoso pelas maiores ondas do mundo. Praia do Norte é o palco do Big Wave Surfing. Canal submarino amplifica ondas gigantescas.',
      descriptionEn: 'Famous for the biggest waves in the world. Praia do Norte is the stage for Big Wave Surfing. Underwater canyon amplifies giant waves.',
      facilities: ['Estacionamento', 'Restaurantes', 'Salva-vidas', 'WC'],
      hazards: ['Ondas gigantescas', 'Correntes fortes', 'Rochas submersas']
    },
  {
      id: 'foz-arelho', slug: 'foz-arelho', name: 'Foz do Arelho', nameEn: 'Foz do Arelho',
      region: 'Oeste', regionEn: 'West Coast', lat: 39.427, lon: -9.210,
      coastOrientation: 270,
      type: 'kitesurf', difficulty: 'beginner', bestWind: 'N, NNE', bestSwell: 'W',
      description: 'Lagoa de Óbidos perfeita para iniciantes. Água plana, vento side-onshore. Escolas e aluguer.',
      descriptionEn: 'Obidos Lagoon perfect for beginners. Flat water, side-onshore wind. Schools and rental.',
      facilities: ['Estacionamento', 'Escolas kite', 'Aluguer', 'Restaurantes', 'WC'],
      hazards: ['Tráfego de iniciantes', 'Maré baixa']
    },
  {
      id: 'foil-foz-arelho', slug: 'foil-foz-arelho', name: 'Foz do Arelho - Foil', nameEn: 'Foz do Arelho - Foil',
      region: 'Oeste', regionEn: 'West Coast', lat: 39.427, lon: -9.210,
      coastOrientation: 270,
      type: 'foil', difficulty: 'beginner', bestWind: 'N, NNE', bestSwell: 'Lagoa',
      description: 'Lagoa de Óbidos perfeita para wing foil e kite foil. Água plana, vento side-onshore. Escolas com equipamento de foil.',
      descriptionEn: 'Obidos Lagoon perfect for wing foil and kite foil. Flat water, side-onshore wind. Schools with foil equipment.',
      facilities: ['Estacionamento', 'Escolas foil', 'Aluguer', 'Restaurantes', 'WC'],
      hazards: ['Tráfego de iniciantes', 'Maré baixa']
    },
  {
      id: 'baleal', slug: 'baleal', name: 'Baleal', nameEn: 'Baleal',
      region: 'Peniche', regionEn: 'Peniche', lat: 39.372, lon: -9.338,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'N, NE', bestSwell: 'W, NW',
      description: 'Cantinho da Baía — ondas suaves protegidas da ilha. Perfeito para iniciantes e intermediários. Vários picos ao longo da baía.',
      descriptionEn: 'Cantinho da Baía — soft waves protected by the island. Perfect for beginners and intermediates. Multiple peaks along the bay.',
      facilities: ['Estacionamento', 'Escolas surf', 'Restaurantes', 'WC'],
      hazards: ['Multidão na época alta']
    },
  {
      id: 'supertubos', slug: 'supertubos', name: 'Supertubos', nameEn: 'Supertubos',
      region: 'Peniche', regionEn: 'Peniche', lat: 39.338, lon: -9.359,
      coastOrientation: 270,
      type: 'surf', difficulty: 'advanced', bestWind: 'N, NE', bestSwell: 'W, NW',
      description: 'Onda tubular perfeita, palco do WSL Championship Tour. Tubos rápidos e potentes sobre areia.',
      descriptionEn: 'Perfect barreling wave, WSL Championship Tour venue. Fast and powerful tubes over sand.',
      facilities: ['Estacionamento', 'Escola de surf', 'Aluguer', 'WC'],
      hazards: ['Correntes', 'Ressaca forte']
    },
  {
      id: 'coxos', slug: 'coxos', name: 'Coxos', nameEn: 'Coxos',
      region: 'Ericeira', regionEn: 'Ericeira', lat: 38.999, lon: -9.430,
      coastOrientation: 270,
      type: 'surf', difficulty: 'advanced', bestWind: 'N, NE', bestSwell: 'NW, W',
      description: 'Reef break poderoso e tubar. Uma das melhores ondas de Portugal — direita longa, íngreme, ocas. Apenas para experts.',
      descriptionEn: 'Powerful reef break barrel. One of the best waves in Portugal — long, steep, hollow right. Experts only.',
      facilities: ['Estacionamento limitado', 'Acesso íngreme'],
      hazards: ['Rochas afiadas', 'Locals agressivos', 'Pouco profundo']
    },
  {
      id: 'ribeira-ilhas', slug: 'ribeira-ilhas', name: "Ribeira d'Ilhas", nameEn: "Ribeira d'Ilhas",
      region: 'Ericeira', regionEn: 'Ericeira', lat: 38.989, lon: -9.422,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'NW, W',
      description: 'Onda direita clássica da Ericeira, palco do WSL. Uma das mais consistentes de Portugal. Longa, perfeita, tubos incríveis.',
      descriptionEn: 'Classic Ericeira right-hand wave, WSL venue. One of the most consistent in Portugal. Long, perfect, incredible barrels.',
      facilities: ['Estacionamento', 'Café', 'WC'],
      hazards: ['Locals', 'Rochas', 'Multidão']
    },
  {
      id: 'foz-lizandro', slug: 'foz-lizandro', name: 'Foz do Lizandro', nameEn: 'Foz do Lizandro',
      region: 'Ericeira', regionEn: 'Ericeira', lat: 38.936, lon: -9.392,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'N, NE', bestSwell: 'S, SW',
      description: 'Praia de areia em forma de L no estuário do rio Lizandro. Ondas para todos os níveis. Reef breaks Lage dos Tubos e Limipicos no norte.',
      descriptionEn: 'L-shaped sand beach at the Lizandro river estuary. Waves for all levels. Lage dos Tubos and Limipicos reef breaks in the north.',
      facilities: ['Estacionamento', 'Restaurantes', 'Escola surf', 'WC'],
      hazards: ['Correntes na maré vazante', 'Rochas no reef']
    },
  {
      id: 'guincho', slug: 'guincho', name: 'Guincho', nameEn: 'Guincho',
      region: 'Cascais', regionEn: 'Cascais', lat: 38.733, lon: -9.473,
      coastOrientation: 270,
      type: 'kitesurf', difficulty: 'intermediate', bestWind: 'N, NNW', bestSwell: 'SW, W',
      description: 'Spot icónico de kitesurf e windsurf. Vento térmico Nortada consistente no verão. Melhor vento de Portugal.',
      descriptionEn: 'Iconic kitesurf and windsurf spot. Consistent thermal Nortada wind in summer. Best wind in Portugal.',
      facilities: ['Estacionamento', 'Restaurante', 'Escola kite', 'WC'],
      hazards: ['Vento forte', 'Correntes', 'Rochas']
    },
  {
      id: 'praia-vitoria', slug: 'praia-vitoria', name: 'Praia da Vitória', nameEn: 'Praia da Vitoria',
      region: 'Terceira', regionEn: 'Terceira', lat: 38.730, lon: -27.066,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, NE', bestSwell: 'W, NW',
      description: 'Baía abrigada na Terceira com ondas consistentes. Praia extensa com areia clara. Cenário único dos Açores centrais.',
      descriptionEn: 'Sheltered bay in Terceira with consistent waves. Long beach with light sand. Unique scenery of the Central Azores.',
      facilities: ['Estacionamento', 'Restaurantes', 'WC'],
      hazards: ['Correntes moderadas']
    },
  {
      id: 'santa-catarina-terceira', slug: 'santa-catarina-terceira', name: 'Santa Catarina', nameEn: 'Santa Catarina',
      region: 'Terceira', regionEn: 'Terceira', lat: 38.683, lon: -27.218,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, NE', bestSwell: 'W, NW',
      description: 'Reef break exposto e consistente. O mais popular da Terceira. Ondas longas e tubulares sobre fundo de rocha.',
      descriptionEn: 'Exposed and consistent reef break. The most popular in Terceira. Long and tubular waves over rock bottom.',
      facilities: ['Estacionamento', 'WC'],
      hazards: ['Rochas afiadas', 'Acesso difícil']
    },
  {
      id: 'carcavelos', slug: 'carcavelos', name: 'Carcavelos', nameEn: 'Carcavelos',
      region: 'Cascais', regionEn: 'Cascais', lat: 38.679, lon: -9.335,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'W, NW',
      description: 'O beach break mais famoso de Lisboa. Ondas de classe mundial ao pé do Forte de São Julião. Multidão de surfistas de qualidade.',
      descriptionEn: 'The most famous beach break in Lisbon. World-class waves next to Forte de São Julião. Crowd of quality surfers.',
      facilities: ['Estacionamento', 'Escola surf', 'Restaurantes', 'Comboio', 'WC'],
      hazards: ['Multidão extrema', 'Correntes']
    },
  {
      id: 'costa-caparica', slug: 'costa-caparica', name: 'Costa da Caparica', nameEn: 'Costa da Caparica',
      region: 'Almada', regionEn: 'Almada', lat: 38.645, lon: -9.236,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'W, SW',
      description: '10km de beach breaks perfeitos para aprender. Várias praias: Dragão Vermelho, CDS, Rainha. A 20 min de Lisboa.',
      descriptionEn: '10km of perfect beach breaks to learn. Multiple beaches: Dragão Vermelho, CDS, Rainha. 20 min from Lisbon.',
      facilities: ['Estacionamento', 'Escolas surf', 'Restaurantes', 'WC'],
      hazards: ['Correntes em alguns picos']
    },
  {
      id: 'fonte-telha', slug: 'fonte-telha', name: 'Fonte da Telha', nameEn: 'Fonte da Telha',
      region: 'Almada', regionEn: 'Almada', lat: 38.580, lon: -9.212,
      coastOrientation: 270,
      type: 'kitesurf', difficulty: 'beginner', bestWind: 'NW, N', bestSwell: 'SW',
      description: 'Praia de areia com ondas pequenas. Perfeito para iniciantes de kitesurf. Vento térmico de Nortada no verão. Pouca multidão!',
      descriptionEn: 'Sand beach with small waves. Perfect for beginner kitesurfers. Thermal Nortada wind in summer. Low crowd!',
      facilities: ['Estacionamento', 'Escola kite', 'WC'],
      hazards: ['Falésias no fundo — usar vento sideshore']
    },
  {
      id: 'almoxarife', slug: 'almoxarife', name: 'Praia do Almoxarife', nameEn: 'Praia do Almoxarife',
      region: 'Faial', regionEn: 'Faial', lat: 38.533, lon: -28.633,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'N, NW',
      description: 'Breaks rochosos na costa leste do Faial. Recebe swell do norte e sul. Vistas para o Pico.',
      descriptionEn: 'Rocky breaks on the east coast of Faial. Takes north and south swells. Views of Pico.',
      facilities: ['Estacionamento', 'WC'],
      hazards: ['Rochas', 'Pouco profundo']
    },
  {
      id: 'lagoa-albufeira', slug: 'lagoa-albufeira', name: 'Lagoa de Albufeira', nameEn: 'Albufeira Lagoon',
      region: 'Sesimbra', regionEn: 'Sesimbra', lat: 38.501, lon: -9.140,
      coastOrientation: 270,
      type: 'kitesurf', difficulty: 'beginner', bestWind: 'NW, N', bestSwell: 'SW',
      description: 'Lagoa separada do oceano por um banco de areia. Água plana até à cintura — paraíso para iniciantes. Nortada consistente.',
      descriptionEn: 'Lagoon separated from the ocean by a sand bar. Chest-high flat water — paradise for beginners. Consistent Nortada.',
      facilities: ['Estacionamento', 'Escola kite', 'Aluguer', 'WC'],
      hazards: ['Maré alta pode subir a lagoa']
    },
  {
      id: 'foil-lagoa-albufeira', slug: 'foil-lagoa-albufeira', name: 'Lagoa de Albufeira - Foil', nameEn: 'Albufeira Lagoon - Foil',
      region: 'Sesimbra', regionEn: 'Sesimbra', lat: 38.501, lon: -9.140,
      coastOrientation: 270,
      type: 'foil', difficulty: 'beginner', bestWind: 'NW, N', bestSwell: 'Lagoa',
      description: 'Paraíso do foil! Água plana até à cintura, vento térmico consistente. Perfeito para aprender wing foil e kite foil. Sem ondas, sem stress.',
      descriptionEn: 'Foil paradise! Chest-high flat water, consistent thermal wind. Perfect for learning wing foil and kite foil. No waves, no stress.',
      facilities: ['Estacionamento', 'Escola foil', 'Aluguer', 'WC'],
      hazards: ['Maré alta pode subir a lagoa', 'Outros riders']
    },
  {
      id: 'alqueva', slug: 'alqueva', name: 'Alqueva', nameEn: 'Alqueva',
      region: 'Alentejo', regionEn: 'Alentejo', lat: 38.200, lon: -7.500,
      coastOrientation: 270,
      type: 'wakeboard', difficulty: 'all', bestWind: 'Vário', bestSwell: 'Lagoa',
      description: 'Maior lago artificial da Europa. Wakeboard e waterski com Mastercraft. Clima estável e água calma o ano todo.',
      descriptionEn: 'Largest artificial lake in Europe. Wakeboard and waterski with Mastercraft. Stable climate and calm water all year round.',
      facilities: ['Estacionamento', 'Escola wake', 'Aluguer', 'Restaurante'],
      hazards: ['Barcos de pesca']
    },
  {
      id: 'sao-torpes', slug: 'sao-torpes', name: 'São Torpes', nameEn: 'Sao Torpes',
      region: 'Alentejo', regionEn: 'Alentejo', lat: 37.950, lon: -8.800,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Spot único — antiga central térmica aquece a água! Surf de inverno com wetsuit mais fino. Beach break longo e acessível.',
      descriptionEn: 'Unique spot — old power station warms the water! Winter surfing with thinner wetsuit. Long and accessible beach break.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Estruturas industriais no fundo']
    },
  {
      id: 'mosteiros', slug: 'mosteiros', name: 'Mosteiros', nameEn: 'Mosteiros',
      region: 'São Miguel', regionEn: 'Sao Miguel', lat: 37.890, lon: -25.823,
      coastOrientation: 270,
      type: 'surf', difficulty: 'advanced', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Point break direito com ondas longas sobre rocha vulcânica. Os ilhéus escuros criam um cenário épico ao pôr do sol.',
      descriptionEn: 'Right-hand point break with long waves over volcanic rock. The dark islets create an epic sunset scenery.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Rocha vulcânica rasa', 'Acesso difícil']
    },
  {
      id: 'porto-covo', slug: 'porto-covo', name: 'Porto Covo', nameEn: 'Porto Covo',
      region: 'Alentejo', regionEn: 'Alentejo', lat: 37.852, lon: -8.790,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Vila piscatória típica com praias cristalinas. Praia Grande com ondas perfeitas para longboarders. Várias enseadas secretas.',
      descriptionEn: 'Typical fishing village with crystal clear beaches. Praia Grande with perfect waves for longboarders. Several secret coves.',
      facilities: ['Estacionamento', 'Restaurantes', 'WC'],
      hazards: ['Acesso por trilhos']
    },
  {
      id: 'monte-verde', slug: 'monte-verde', name: 'Monte Verde', nameEn: 'Monte Verde',
      region: 'São Miguel', regionEn: 'Sao Miguel', lat: 37.829, lon: -25.653,
      coastOrientation: 0,
      type: 'surf', difficulty: 'intermediate', bestWind: 'S, SE', bestSwell: 'NW, W',
      description: 'Beach break versátil que funciona com qualquer swell. Ondas poderosas em dias grandes. Fácil acesso pela cidade de Ribeira Grande.',
      descriptionEn: 'Versatile beach break that works with any swell. Powerful waves on big days. Easy access from Ribeira Grande town.',
      facilities: ['Estacionamento', 'Café', 'WC'],
      hazards: ['Correntes', 'Ondas pesadas']
    },
  {
      id: 'santa-barbara', slug: 'santa-barbara', name: 'Santa Bárbara', nameEn: 'Santa Barbara',
      region: 'São Miguel', regionEn: 'Sao Miguel', lat: 37.821, lon: -25.698,
      coastOrientation: 0,
      type: 'surf', difficulty: 'intermediate', bestWind: 'S, SE', bestSwell: 'N, NW',
      description: 'Paraíso dos surfistas nos Açores. Ondas potentes com cenário vulcânico único. Competições internacionais. Areia negra vulcânica.',
      descriptionEn: 'Surfers paradise in the Azores. Powerful waves with unique volcanic scenery. International competitions. Black volcanic sand.',
      facilities: ['Estacionamento', 'Café', 'Escola surf', 'WC'],
      hazards: ['Rochas vulcânicas', 'Multidão em eventos']
    },
  {
      id: 'malhao', slug: 'malhao', name: 'Malhão', nameEn: 'Malhao',
      region: 'Alentejo', regionEn: 'Alentejo', lat: 37.775, lon: -8.775,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Beach break versátil de 2km com múltiplos picos. Varia de slab overhead a ondas de joelho. Escolas de surf locais.',
      descriptionEn: 'Versatile 2km beach break with multiple peaks. Varies from overhead slab to knee-high waves. Local surf schools.',
      facilities: ['Estacionamento', 'Escola surf', 'WC'],
      hazards: ['Multidão', 'Correntes']
    },
  {
      id: 'milicias', slug: 'milicias', name: 'Milícias', nameEn: 'Milicias',
      region: 'São Miguel', regionEn: 'Sao Miguel', lat: 37.738, lon: -25.636,
      coastOrientation: 180,
      type: 'surf', difficulty: 'beginner', bestWind: 'N, NE', bestSwell: 'S, SW',
      description: 'Praia urbana perto de Ponta Delgada. Areia negra vulcânica com múltiplos picos. Consistente com swell do sul.',
      descriptionEn: 'Urban beach near Ponta Delgada. Black volcanic sand with multiple peaks. Consistent with south swell.',
      facilities: ['Estacionamento', 'Escola surf', 'Restaurantes', 'WC'],
      hazards: ['Multidão', 'Surf schools']
    },
  {
      id: 'vila-nova-milfontes', slug: 'vila-nova-milfontes', name: 'Vila Nova de Milfontes', nameEn: 'Vila Nova de Milfontes',
      region: 'Alentejo', regionEn: 'Alentejo', lat: 37.723, lon: -8.783,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, NE', bestSwell: 'W, NW',
      description: 'Vila charmosa na foz do rio Mira. Múltiplos beach breaks: Malhão, Aivados, Furnas. Costa Vicentina selvagem.',
      descriptionEn: 'Charming village at the mouth of the Mira River. Multiple beach breaks: Malhao, Aivados, Furnas. Wild Vicentina Coast.',
      facilities: ['Estacionamento', 'Escola surf', 'Restaurantes', 'Alojamento', 'WC'],
      hazards: ['Correntes']
    },
  {
      id: 'agua-alto', slug: 'agua-alto', name: "Água d'Alto", nameEn: 'Agua de Alto',
      region: 'São Miguel', regionEn: 'Sao Miguel', lat: 37.714, lon: -25.472,
      coastOrientation: 180,
      type: 'surf', difficulty: 'beginner', bestWind: 'N, NE', bestSwell: 'S, SE',
      description: 'Alternativa perfeita para fugir da multidão de Milícias. Beach break com fundo misto. Esquerda longa perto do hotel.',
      descriptionEn: 'Perfect alternative to escape the Milicias crowd. Beach break with mixed bottom. Long left near the hotel.',
      facilities: ['Estacionamento', 'Hotel', 'WC'],
      hazards: ['Rochas no fundo']
    },
  {
      id: 'zambujeira', slug: 'zambujeira', name: 'Zambujeira do Mar', nameEn: 'Zambujeira do Mar',
      region: 'Alentejo', regionEn: 'Alentejo', lat: 37.527, lon: -8.785,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, NE', bestSwell: 'W, NW',
      description: 'Vila postal nas falésias com beach break potente. Direita pesada junto às falésias. Festival MEO Sudoeste nas proximidades.',
      descriptionEn: 'Postcard village on cliffs with powerful beach break. Heavy right near the cliffs. MEO Sudoeste festival nearby.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Ondas pesadas', 'Locals']
    },
  {
      id: 'odeceixe', slug: 'odeceixe', name: 'Odeceixe', nameEn: 'Odeceixe',
      region: 'Alentejo', regionEn: 'Alentejo', lat: 37.440, lon: -8.800,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'N, NE', bestSwell: 'S, SW',
      description: 'Praia única onde o rio encontra o mar. Perfeita para SUP e iniciantes de surf. Natureza intocada.',
      descriptionEn: 'Unique beach where the river meets the sea. Perfect for SUP and beginner surfers. Untouched nature.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Correntes de maré']
    },
  {
      id: 'arrifana', slug: 'arrifana', name: 'Arrifana', nameEn: 'Arrifana',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.294, lon: -8.864,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Baía protegida com ondas consistentes para todos os níveis. Fundo misto de areia e rocha. Cenário deslumbrante.',
      descriptionEn: 'Protected bay with consistent waves for all levels. Mixed sand and rock bottom. Stunning scenery.',
      facilities: ['Estacionamento', 'Restaurantes', 'Escola surf', 'WC'],
      hazards: ['Rochas', 'Correntes na saída']
    },
  {
      id: 'vila-real-santo-antonio', slug: 'vila-real-santo-antonio', name: 'Vila Real de Santo António', nameEn: 'Vila Real de Santo Antonio',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.200, lon: -7.418,
      coastOrientation: 180,
      type: 'kitesurf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'Ria Formosa',
      description: 'Água plana na Ria Formosa com vento de leste térmico consistente. Um dos spots mais fiáveis do Algarve para kitesurf. Praia extensa e segura.',
      descriptionEn: 'Flat water in Ria Formosa with consistent east thermal wind. One of the most reliable spots in the Algarve for kitesurfing. Long and safe beach.',
      facilities: ['Estacionamento', 'Escolas kite', 'Aluguer', 'Restaurantes', 'WC'],
      hazards: ['Tráfego de barcos na ria']
    },
  {
      id: 'carrapateira', slug: 'carrapateira', name: 'Carrapateira', nameEn: 'Carrapateira',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.183, lon: -8.905,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'W, NW',
      description: 'Praia da Bordeira com ondas de beach break potentes. Cenário natural deslumbrante da Costa Vicentina.',
      descriptionEn: 'Bordeira Beach with powerful beach break waves. Stunning natural scenery of the Vicentina Coast.',
      facilities: ['Estacionamento limitado', 'Restaurante', 'WC'],
      hazards: ['Correntes fortes', 'Rochas']
    },
  {
      id: 'monte-gordo', slug: 'monte-gordo', name: 'Monte Gordo', nameEn: 'Monte Gordo',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.183, lon: -7.450,
      coastOrientation: 180,
      type: 'kitesurf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'S, SE',
      description: 'Praia dourada extensa com água morna e vento de leste épico. Kitesurf perfeito para todos os níveis. Uma das melhores praias do Sotavento.',
      descriptionEn: 'Long golden beach with warm water and epic east wind. Perfect kitesurfing for all levels. One of the best beaches in the Sotavento.',
      facilities: ['Estacionamento', 'Escolas kite', 'Restaurantes', 'WC'],
      hazards: ['Multidão no verão']
    },
  {
      id: 'praia-verde', slug: 'praia-verde', name: 'Praia Verde', nameEn: 'Praia Verde',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.183, lon: -7.500,
      coastOrientation: 180,
      type: 'kitesurf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'S, SE',
      description: 'Praia selvagem entre VRSA e Monte Gordo. Menos crowd, ondas mais organizadas. Kitesurf com vento de leste e ondas de Sotavento. ⚠️ Proibido kitesurf de 1 junho a 30 setembro — usar Altura (a 3km) como alternativa.',
      descriptionEn: 'Wild beach between VRSA and Monte Gordo. Less crowded, more organized waves. Kitesurfing with east wind and Sotavento waves. ⚠️ Kitesurf banned 1 Jun–30 Sep — use Altura (3km away) as alternative.',
      facilities: ['Estacionamento', 'Bar de praia (verão)'],
      hazards: ['Correntes', 'Sem vigilância', 'Kitesurf proibido 1 Jun–30 Sep']
    },
  {
      id: 'altura', slug: 'altura', name: 'Altura (Praia da Alagoa)', nameEn: 'Altura (Alagoa Beach)',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.170, lon: -7.498,
      coastOrientation: 180,
      type: 'kitesurf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'S, SE',
      description: 'Praia extensa em Altura, a 3km de Monte Gordo. Água plana e vento de leste consistente. Alternativa oficial para kitesurf durante a proibição de Verão na Praia Verde (1 junho–30 setembro). Escola de kite no local.',
      descriptionEn: 'Long beach at Altura, 3km from Monte Gordo. Flat water and consistent east wind. Official alternative for kitesurfing during the Praia Verde summer ban (1 Jun–30 Sep). Kite school on site.',
      facilities: ['Estacionamento', 'Escola kite', 'Restaurantes', 'WC'],
      hazards: ['Multidão no verão']
    },
  {
      id: 'praia-rocha', slug: 'praia-rocha', name: 'Praia da Rocha', nameEn: 'Praia da Rocha',
      region: 'Portimão', regionEn: 'Portimão', lat: 37.139, lon: -8.535,
      coastOrientation: 270,
      type: 'multisport', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'SW',
      description: 'Praia de areia com falésias impressionantes. Ondas de inverno para surf. Vento de leste para windsurf e kitesurf no verão.',
      descriptionEn: 'Sand beach with impressive cliffs. Winter waves for surf. East wind for windsurf and kitesurf in summer.',
      facilities: ['Estacionamento', 'Restaurantes', 'WC'],
      hazards: ['Rochas submersas', 'Multidão na época alta']
    },
  {
      id: 'alvor', slug: 'alvor', name: 'Alvor', nameEn: 'Alvor',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.136, lon: -8.594,
      coastOrientation: 180,
      type: 'multisport', difficulty: 'beginner', bestWind: 'W, NW', bestSwell: 'S, SW',
      description: 'Praia extensa com ondas suaves. Ideal para surf iniciante, SUP e famílias. Lagoa de Alvor para kitesurf flat water.',
      descriptionEn: 'Long beach with gentle waves. Ideal for beginner surf, SUP and families. Alvor Lagoon for flat water kitesurf.',
      facilities: ['Estacionamento', 'Restaurantes', 'Aluguer', 'Salva-vidas', 'WC'],
      hazards: ['Rochas na extremidade sul']
    },
  {
      id: 'foil-alvor', slug: 'foil-alvor', name: 'Alvor - Foil', nameEn: 'Alvor - Foil',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.136, lon: -8.594,
      coastOrientation: 270,
      type: 'foil', difficulty: 'intermediate', bestWind: 'W, NW', bestSwell: 'Lagoa',
      description: 'Lagoa de Alvor é o spot secreto de foil do Algarve. Água plana com vento térmico. Wing foil e kite foil em condições perfeitas.',
      descriptionEn: 'Alvor Lagoon is the secret foil spot of the Algarve. Flat water with thermal wind. Wing foil and kite foil in perfect conditions.',
      facilities: ['Estacionamento', 'Escola foil', 'Aluguer', 'WC'],
      hazards: ['Rochas na extremidade sul', 'Maré']
    },
  {
      id: 'lagos', slug: 'lagos', name: 'Meia Praia', nameEn: 'Meia Praia',
      region: 'Lagos', regionEn: 'Lagos', lat: 37.115, lon: -8.653,
      coastOrientation: 180,
      type: 'kitesurf', difficulty: 'beginner', bestWind: 'NW, N', bestSwell: 'S',
      description: 'Praia extensa de 4km com vento side-shore. Escola de kitesurf e windsurf no centro.',
      descriptionEn: '4km long beach with side-shore wind. Kitesurf and windsurf school in the center.',
      facilities: ['Estacionamento', 'Escolas', 'Aluguer', 'Restaurantes'],
      hazards: ['Tráfego na época alta']
    },
  {
      id: 'lagos-wakepark', slug: 'lagos-wakepark', name: 'Lagos Wake Park', nameEn: 'Lagos Wake Park',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.100, lon: -8.670,
      coastOrientation: 270,
      type: 'wakeboard', difficulty: 'all', bestWind: 'Vário', bestSwell: 'Lagoa',
      description: 'Cable park 2.0 na salina de Lagos. Rampas, rails, kickers e sliders. Mastercraft X-23 para wake boat. Campo completo!',
      descriptionEn: '2.0 cable park on Lagos salt flat. Ramps, rails, kickers and sliders. Mastercraft X-23 for wake boat. Complete park!',
      facilities: ['Estacionamento', 'Cable 2.0', 'Wake Boat', 'Escola', 'Alojamento'],
      hazards: ['Outros riders']
    },
  {
      id: 'beliche', slug: 'beliche', name: 'Praia do Beliche', nameEn: 'Beliche Beach',
      region: 'Sagres', regionEn: 'Sagres', lat: 37.030, lon: -8.970,
      coastOrientation: 270,
      type: 'surf', difficulty: 'advanced', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Praia virada a oeste com ondas potentes. Acesso por escadaria na falésia. Beach break épico em dias grandes.',
      descriptionEn: 'West-facing beach with powerful waves. Access by staircase on the cliff. Epic beach break on big days.',
      facilities: ['Estacionamento limitado', 'WC'],
      hazards: ['Acesso difícil', 'Correntes fortes', 'Rochas']
    },
  {
      id: 'martinhal', slug: 'martinhal', name: 'Martinhal', nameEn: 'Martinhal',
      region: 'Sagres', regionEn: 'Sagres', lat: 37.025, lon: -8.935,
      coastOrientation: 270,
      type: 'windsurf', difficulty: 'intermediate', bestWind: 'N, NW', bestSwell: 'SW',
      description: 'Centro internacional de windsurf. Água plana à tarde com vento térmico. Escola com equipamento de qualidade.',
      descriptionEn: 'International windsurf center. Flat water in the afternoon with thermal wind. School with quality equipment.',
      facilities: ['Estacionamento', 'Escola windsurf', 'Aluguer', 'Restaurante', 'WC'],
      hazards: ['Vento pode desligar de repente']
    },
  {
      id: 'barrinha-faro', slug: 'barrinha-faro', name: 'Barrinha de Faro', nameEn: 'Barrinha de Faro',
      region: 'Algarve', regionEn: 'Algarve', lat: 37.016, lon: -7.933,
      coastOrientation: 180,
      type: 'kitesurf', difficulty: 'beginner', bestWind: 'E, SE', bestSwell: 'Ria Formosa',
      description: 'Lagoa da Ria Formosa com água plana e vento de leste. Spot perfeito para iniciantes e freestyle. Barra de acesso com barco típico.',
      descriptionEn: 'Ria Formosa lagoon with flat water and east wind. Perfect spot for beginners and freestyle. Access via traditional boat.',
      facilities: ['Estacionamento', 'Barco-táxi', 'Escolas kite', 'Restaurantes'],
      hazards: ['Tráfego de barcos', 'Maré']
    },
  {
      id: 'tonel', slug: 'tonel', name: 'Praia do Tonel', nameEn: 'Tonel Beach',
      region: 'Sagres', regionEn: 'Sagres', lat: 37.010, lon: -8.945,
      coastOrientation: 270,
      type: 'surf', difficulty: 'advanced', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'Um dos beach breaks mais consistentes do sul. Ondas nítidas e ocas em frente à falésia. Melhor entre maré baixa e média.',
      descriptionEn: 'One of the most consistent beach breaks in the south. Clean and hollow waves in front of the cliff. Best between low and mid tide.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Correntes fortes', 'Rochas', 'Multidão']
    },
  {
      id: 'zavial', slug: 'zavial', name: 'Zavial', nameEn: 'Zavial',
      region: 'Sagres', regionEn: 'Sagres', lat: 37.005, lon: -8.925,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'S, SW',
      description: 'Beach break virado a sul com ondas de qualidade. Menos crowd que Tonel e Beliche. Fundo de areia.',
      descriptionEn: 'South-facing beach break with quality waves. Less crowd than Tonel and Beliche. Sand bottom.',
      facilities: ['Estacionamento', 'WC'],
      hazards: ['Correntes']
    },
  {
      id: 'anjos', slug: 'anjos', name: 'Anjos', nameEn: 'Anjos',
      region: 'Santa Maria', regionEn: 'Santa Maria', lat: 36.967, lon: -25.100,
      coastOrientation: 270,
      type: 'surf', difficulty: 'intermediate', bestWind: 'S, SW', bestSwell: 'NW, N',
      description: 'Reef break direito exposto na costa noroeste de Santa Maria. Ondas tubulares em dias grandes.',
      descriptionEn: 'Exposed right reef break on the northwest coast of Santa Maria. Tubular waves on big days.',
      facilities: ['Estacionamento limitado', 'WC'],
      hazards: ['Rochas', 'Acesso difícil']
    },
  {
      id: 'ponta-delgada', slug: 'ponta-delgada', name: 'Ponta Delgada (Açores)', nameEn: 'Ponta Delgada (Azores)',
      region: 'Açores', regionEn: 'Azores', lat: 37.741, lon: -25.669,
      coastOrientation: 180,
      type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
      description: 'São Miguel — ondas potentes no meio do Atlântico. Água cristalina, crowd mínimo. Um paraíso escondido para surfistas aventureiros.',
      descriptionEn: 'São Miguel — powerful waves in the middle of the Atlantic. Crystal clear water, minimal crowd. A hidden paradise for adventurous surfers.',
      facilities: ['Estacionamento', 'Escola surf', 'Restaurantes', 'WC'],
      hazards: ['Ondas irregulares', 'Água fria (17-20°C)']
    },
  {
      id: 'sao-vicente-madeira', slug: 'sao-vicente-madeira', name: 'São Vicente', nameEn: 'Sao Vicente',
      region: 'Madeira', regionEn: 'Madeira', lat: 32.800, lon: -17.033,
      coastOrientation: 270,
      type: 'surf', difficulty: 'beginner', bestWind: 'S, SE', bestSwell: 'N, NW',
      description: 'Norte da ilha com ondas suaves perfeitas para iniciantes. Mar sempre agitado. Escola de surf local.',
      descriptionEn: 'North of the island with soft waves perfect for beginners. Sea always rough. Local surf school.',
      facilities: ['Estacionamento', 'Escola surf', 'WC'],
      hazards: ['Correntes moderadas']
    },
  {
      id: 'porto-da-cruz', slug: 'porto-da-cruz', name: 'Porto da Cruz', nameEn: 'Porto da Cruz',
      region: 'Madeira', regionEn: 'Madeira', lat: 32.767, lon: -16.833,
      coastOrientation: 90,
      type: 'surf', difficulty: 'beginner', bestWind: 'S, SE', bestSwell: 'N, NW',
      description: 'Melhor spot para iniciantes na Madeira. Ondas suaves com areia vulcânica preta. Escolas de surf e ambiente familiar.',
      descriptionEn: 'Best beginner spot in Madeira. Gentle waves with black volcanic sand. Surf schools and family atmosphere.',
      facilities: ['Estacionamento', 'Escolas surf', 'Restaurantes', 'WC'],
      hazards: ['Multidão em dias de evento']
    },
  {
      id: 'paul-mar', slug: 'paul-mar', name: 'Paul do Mar', nameEn: 'Paul do Mar',
      region: 'Madeira', regionEn: 'Madeira', lat: 32.767, lon: -17.233,
      coastOrientation: 270,
      type: 'surf', difficulty: 'advanced', bestWind: 'E, NE', bestSwell: 'W, NW',
      description: 'Ondas tubulares de classe mundial. Aqui foi realizado o World Big Wave Championship 2001. Ondas até 8 metros.',
      descriptionEn: 'World-class barreling waves. The 2001 World Big Wave Championship was held here. Waves up to 8 meters.',
      facilities: ['Estacionamento', 'Restaurante', 'Escola surf'],
      hazards: ['Rochas', 'Ondas gigantescas', 'Correntes']
    },
  {
      id: 'jardim-mar', slug: 'jardim-mar', name: 'Jardim do Mar', nameEn: 'Jardim do Mar',
      region: 'Madeira', regionEn: 'Madeira', lat: 32.750, lon: -17.217,
      coastOrientation: 270,
      type: 'surf', difficulty: 'advanced', bestWind: 'E, NE', bestSwell: 'W, NW',
      description: 'Onda direita lendária da Madeira. Uma das mais pesadas da Europa. Tubos longos sobre reef. Apenas experts.',
      descriptionEn: 'Legendary Madeira right-hand wave. One of the heaviest in Europe. Long tubes over reef. Experts only.',
      facilities: ['Estacionamento limitado', 'Restaurante'],
      hazards: ['Reef raso', 'Acesso por molhe', 'Ondas mortais']
    },
  {
      id: 'ponta-sao-lourenco', slug: 'ponta-sao-lourenco', name: 'Ponta de São Lourenço', nameEn: 'Ponta de Sao Lourenco',
      region: 'Madeira', regionEn: 'Madeira', lat: 32.733, lon: -16.667,
      coastOrientation: 90,
      type: 'surf', difficulty: 'advanced', bestWind: 'N, NE', bestSwell: 'S, SE',
      description: 'Paisagem lunar vulcânica com ondas consistentes. Spot remoto para aventureiros. Águas turquesa e cenário dramático.',
      descriptionEn: 'Lunar volcanic landscape with consistent waves. Remote spot for adventurers. Turquoise waters and dramatic scenery.',
      facilities: ['Estacionamento limitado'],
      hazards: ['Acesso difícil', 'Rochas', 'Sem infraestruturas']
    },
  {
      id: 'ribeira-brava', slug: 'ribeira-brava', name: 'Ribeira Brava', nameEn: 'Ribeira Brava',
      region: 'Madeira', regionEn: 'Madeira', lat: 32.683, lon: -17.000,
      coastOrientation: 90,
      type: 'surf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'S, SW',
      description: 'Onda de reef break potente na costa sul. Cenário de montanhas verdes. Acesso fácil pela estrada costeira.',
      descriptionEn: 'Powerful reef break wave on the south coast. Green mountain scenery. Easy access by coastal road.',
      facilities: ['Estacionamento', 'Restaurante', 'WC'],
      hazards: ['Rochas', 'Correntes']
    },
  {
      id: 'funchal', slug: 'funchal', name: 'Praia Formosa', nameEn: 'Praia Formosa',
      region: 'Madeira', regionEn: 'Madeira', lat: 32.650, lon: -16.917,
      coastOrientation: 90,
      type: 'kitesurf', difficulty: 'intermediate', bestWind: 'N, NE', bestSwell: 'S',
      description: 'Baía do Funchal com vento térmico. Kitesurf no centro da cidade. Águas quentes e cenário urbano único.',
      descriptionEn: 'Funchal bay with thermal wind. Kitesurf in the city center. Warm waters and unique urban scenery.',
      facilities: ['Estacionamento', 'Escola kite', 'Restaurantes', 'WC'],
      hazards: ['Tráfego de barcos', 'Banhistas']
    },
];

export const getSpotBySlug = (slug: string): Spot | undefined =>
  spots.find(s => s.slug === slug);
