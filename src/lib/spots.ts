import { Spot } from '@/types';

export const spots: Spot[] = [
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
    description: 'Spot icónico de kitesurf e windsurf. Vento térmico Nortada consistente no verão.',
    descriptionEn: 'Iconic kitesurf and windsurf spot. Consistent thermal Nortada wind in summer.',
    images: ['/images/guincho-1.jpg'], facilities: ['Estacionamento', 'Restaurante', 'Escola kite', 'WC'],
    hazards: ['Vento forte', 'Correntes', 'Rochas']
  },
  {
    id: 'foz-arelho', slug: 'foz-arelho', name: 'Foz do Arelho', nameEn: 'Foz do Arelho',
    region: 'Oeste', regionEn: 'West Coast', lat: 39.427, lon: -9.210,
    type: 'kitesurf', difficulty: 'beginner', bestWind: 'N, NNE', bestSwell: 'W',
    description: 'Lagoa de Óbidos perfeita para iniciantes. Água plana, vento side-onshore.',
    descriptionEn: 'Obidos Lagoon perfect for beginners. Flat water, side-onshore wind.',
    images: ['/images/foz-arelho-1.jpg'], facilities: ['Estacionamento', 'Escolas kite', 'Aluguer', 'Restaurantes', 'WC'],
    hazards: ['Tráfego de iniciantes', 'Maré baixa']
  },
  {
    id: 'arrifana', slug: 'arrifana', name: 'Arrifana', nameEn: 'Arrifana',
    region: 'Algarve', regionEn: 'Algarve', lat: 37.294, lon: -8.864,
    type: 'surf', difficulty: 'intermediate', bestWind: 'E, SE', bestSwell: 'W, NW',
    description: 'Baía protegida com ondas consistentes para todos os níveis. Fundo misto de areia e rocha.',
    descriptionEn: 'Protected bay with consistent waves for all levels. Mixed sand and rock bottom.',
    images: ['/images/arrifana-1.jpg'], facilities: ['Estacionamento', 'Restaurantes', 'Escola surf', 'WC'],
    hazards: ['Rochas', 'Correntes na saída']
  },
  {
    id: 'alvor', slug: 'alvor', name: 'Alvor', nameEn: 'Alvor',
    region: 'Algarve', regionEn: 'Algarve', lat: 37.136, lon: -8.594,
    type: 'multisport', difficulty: 'beginner', bestWind: 'W, NW', bestSwell: 'S, SW',
    description: 'Praia extensa com ondas suaves. Ideal para surf iniciante, SUP e famílias.',
    descriptionEn: 'Long beach with gentle waves. Ideal for beginner surf, SUP and families.',
    images: ['/images/alvor-1.jpg'], facilities: ['Estacionamento', 'Restaurantes', 'Aluguer', 'Salva-vidas', 'WC'],
    hazards: ['Rochas na extremidade sul']
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
    description: 'Praia da Bordeira com ondas de beach break potentes. Cenário natural deslumbrante.',
    descriptionEn: 'Bordeira Beach with powerful beach break waves. Stunning natural scenery.',
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
    description: 'Praia extensa de 4km com vento side-shore. Escola de kitesurf e windsurf.',
    descriptionEn: '4km long beach with side-shore wind. Kitesurf and windsurf school.',
    images: ['/images/meia-praia-1.jpg'], facilities: ['Estacionamento', 'Escolas', 'Aluguer', 'Restaurantes'],
    hazards: ['Tráfego na época alta']
  }
];

export const getSpotBySlug = (slug: string): Spot | undefined =>
  spots.find(s => s.slug === slug);
