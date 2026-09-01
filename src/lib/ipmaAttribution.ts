/**
 * FONTE ÚNICA da cadeia de atribuição obrigatória do IPMA (dados de radar).
 *
 * O radar do mapa sobrepõe frames de precipitação reais do IPMA por cima de
 * previsões Open-Meteo — por isso o badge do radar mostra as DUAS atribuições
 * lado a lado. A URL e os rótulos vivem SÓ aqui; o badge e a página /fontes
 * importam deste módulo, para o crédito nunca divergir entre superfícies.
 */

export const IPMA_URL = 'https://www.ipma.pt/';

export const IPMA_RADAR_ATTRIBUTION_LABEL_PT = 'Dados IPMA';
export const IPMA_RADAR_ATTRIBUTION_LABEL_EN = 'IPMA data';