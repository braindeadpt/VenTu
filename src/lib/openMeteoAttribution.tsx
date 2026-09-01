import type { ReactNode } from 'react';

/**
 * FONTE ÚNICA da cadeia de atribuição obrigatória do Open-Meteo (CC BY 4.0).
 *
 * As URLs, o texto do label e a variante HTML (para o controlo de atribuição
 * do Leaflet) vivem SÓ aqui. Tudo o resto — About, tabela de /fontes, card de
 * onda observada, badge do radar e controlo de atribuição do mapa — importa
 * deste módulo, para o crédito nunca divergir entre superfícies.
 */

export const OPEN_METEO_URL = 'https://open-meteo.com/';
export const OPEN_METEO_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

/** Texto canónico simples (tooltips, aria, badge do radar). */
export const OPEN_METEO_ATTRIBUTION_LABEL = 'Weather data by Open-Meteo.com (CC BY 4.0)';

/**
 * Variante HTML crua para `Leaflet.control.attribution().addAttribution(...)`
 * — o controlo do mapa espera uma string, não ReactNode.
 */
export const OPEN_METEO_ATTRIBUTION_HTML =
  `Weather data by <a href="${OPEN_METEO_URL}" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a> ` +
  `(<a href="${OPEN_METEO_LICENSE_URL}" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>)`;

interface OpenMeteoAttributionProps {
  /** Classe aplicada aos dois <a> (ex.: estilo de link do About/fontes). */
  className?: string;
}

/**
 * A cadeia com os dois links (Open-Meteo.com + CC BY 4.0) exactamente como o
 * About e a tabela de /fontes renderizam hoje — duas âncoras separadas, para
 * o «CC BY 4.0» ser um link de licença próprio. As URLs canónicas vêm daqui.
 */
export function OpenMeteoAttribution({ className }: OpenMeteoAttributionProps) {
  return (
    <>
      Weather data by{' '}
      <a href={OPEN_METEO_URL} target="_blank" rel="noopener noreferrer" className={className}>
        Open-Meteo.com
      </a>{' '}
      (
        <a href={OPEN_METEO_LICENSE_URL} target="_blank" rel="noopener noreferrer" className={className}>
          CC BY 4.0
        </a>
      )
    </>
  );
}