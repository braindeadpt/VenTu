export const defaultLocale = 'pt';
export const locales = ['pt', 'en'] as const;

export const translations = {
  pt: {
    nav: { home: 'Início', spots: 'Spots', news: 'Notícias', about: 'Sobre' },
    hero: {
      title: 'WindSpot',
      subtitle: 'Condições em tempo real para desportos náuticos em Portugal',
      cta: 'Ver Spots',
      stats: { spots: 'Spots', updates: 'Atualizações/dia', sports: 'Desportos' }
    },
    spots: {
      title: 'Spots', filter: 'Filtrar por', all: 'Todos',
      surf: 'Surf', kitesurf: 'Kitesurf', windsurf: 'Windsurf',
      bigWave: 'Big Wave', foil: 'Foil',
      current: 'Condições Atuais', forecast: 'Previsão',
      waveHeight: 'Altura Onda', windSpeed: 'Vento', waterTemp: 'Temp. Água',
      bestConditions: 'Melhores Condições', difficulty: 'Dificuldade',
      facilities: 'Instalações', hazards: 'Riscos',
      beginner: 'Iniciante', intermediate: 'Intermédio', advanced: 'Avançado', expert: 'Especialista',
    },
    conditions: {
      title: 'Condições em Tempo Real', updated: 'Atualizado', rating: 'Avaliação', recommendation: 'Recomendação',
      excellent: 'Excelente', good: 'Bom', fair: 'Razoável', poor: 'Fraco', closed: 'Não recomendado',
    },
    news: { title: 'Notícias', latest: 'Últimas', readMore: 'Ler mais', source: 'Fonte', category: 'Categoria', generatedBy: 'Resumido por IA' },
    footer: {
      about: 'WindSpot é uma plataforma open-source para desportos náuticos em Portugal.',
      openSource: 'Código aberto', data: 'Dados', poweredBy: 'Powered by',
      copyright: 'WindSpot Portugal. Open Source Project.',
    },
    common: { loading: 'A carregar...', error: 'Erro ao carregar dados', refresh: 'Atualizar', today: 'Hoje', tomorrow: 'Amanhã', now: 'Agora' }
  },
  en: {
    nav: { home: 'Home', spots: 'Spots', news: 'News', about: 'About' },
    hero: {
      title: 'WindSpot',
      subtitle: 'Real-time conditions for water sports in Portugal',
      cta: 'View Spots',
      stats: { spots: 'Spots', updates: 'Updates/day', sports: 'Sports' }
    },
    spots: {
      title: 'Spots', filter: 'Filter by', all: 'All',
      surf: 'Surf', kitesurf: 'Kitesurf', windsurf: 'Windsurf',
      bigWave: 'Big Wave', foil: 'Foil',
      current: 'Current Conditions', forecast: 'Forecast',
      waveHeight: 'Wave Height', windSpeed: 'Wind', waterTemp: 'Water Temp',
      bestConditions: 'Best Conditions', difficulty: 'Difficulty',
      facilities: 'Facilities', hazards: 'Hazards',
      beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert',
    },
    conditions: {
      title: 'Real-time Conditions', updated: 'Updated', rating: 'Rating', recommendation: 'Recommendation',
      excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor', closed: 'Not recommended',
    },
    news: { title: 'News', latest: 'Latest', readMore: 'Read more', source: 'Source', category: 'Category', generatedBy: 'Summarized by AI' },
    footer: {
      about: 'WindSpot is an open-source platform for water sports in Portugal.',
      openSource: 'Open Source', data: 'Data', poweredBy: 'Powered by',
      copyright: 'WindSpot Portugal. Open Source Project.',
    },
    common: { loading: 'Loading...', error: 'Error loading data', refresh: 'Refresh', today: 'Today', tomorrow: 'Tomorrow', now: 'Now' }
  }
};

export const getTranslation = (locale: typeof locales[number]) => translations[locale];
