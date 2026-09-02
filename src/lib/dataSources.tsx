import type { ReactNode } from 'react';
import {
  OpenMeteoAttribution,
  OPEN_METEO_ATTRIBUTION_LABEL,
  OPEN_METEO_LICENSE_URL,
} from '@/lib/openMeteoAttribution';
import { IPMA_URL } from '@/lib/ipmaAttribution';

/**
 * Fonte de verdade das cadeias de atribuição de dados — a mesma tabela da
 * página /fontes renderiza estes valores, e a UI mostra a `note` exacta junto
 * dos dados quando esses dados aparecem (ex. a nota Copernicus ao lado da
 * leitura WMO no card de onda). Nada de duplicar cadeias no componente e na
 * página: vivem aqui.
 */

/** Link de atribuição — mesmo estilo da tabela de fontes e do rodapé. */
function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="underline hover:text-fg transition-colors"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

// Licença CC BY — URL partilhada com o OpenMeteoAttribution (fonte única).
const CC_BY = OPEN_METEO_LICENSE_URL;
// Licença das boias ondógrafo do IH — CC BY-NC 4.0 (processo IH n.º 0191_2026).
const CC_BY_NC = 'https://creativecommons.org/licenses/by-nc/4.0/';

export type DataSourceId =
  | 'open-meteo'
  | 'ih'
  | 'ih-buoys'
  | 'ipma'
  | 'meteoalarm'
  | 'copernicus'
  | 'esri'
  | 'osm'
  | 'ecowitt'
  | 'metar'
  | 'weatherlink'
  | 'gemini'
  | 'unsplash';

export interface DataSourceAttribution {
  /** Cadeia de atribuição exacta (a parte obrigatória a reproduzir junto dos dados). */
  notePt: ReactNode;
  noteEn: ReactNode;
  /** Célula completa da tabela de fontes — cadeia + onde o VenTu a mostra. */
  cellPt: ReactNode;
  cellEn: ReactNode;
  /** Texto simples (sem links) para tooltip/aria. */
  titlePt: string;
  titleEn: string;
}

export const ATTRIBUTIONS: Record<DataSourceId, DataSourceAttribution> = {
  'open-meteo': {
    // A cadeia (URLs + texto) vem do módulo partilhado openMeteoAttribution —
    // a mesma que o About, o mapa e o badge do radar usam. Os dois links
    // separados (Open-Meteo.com e o CC BY 4.0) preservam o render actual.
    notePt: (
      <>
        «<OpenMeteoAttribution className="underline hover:text-fg transition-colors" />»
      </>
    ),
    noteEn: (
      <>
        “<OpenMeteoAttribution className="underline hover:text-fg transition-colors" />”
      </>
    ),
    cellPt: (
      <>
        «<OpenMeteoAttribution className="underline hover:text-fg transition-colors" />» —
        já no mapa, no About e no footer. Modelos: ondas DWD EWAM e ECMWF WAM
        (CC-BY), NOAA GFS Wave/GWAM; vento DWD ICON-EU, ECMWF IFS, GFS e
        Météo-France. Citação oficial:{' '}
        <A href="https://doi.org/10.5281/zenodo.7970649">
          Zippenfenig, P. (2023). Open-Meteo.com Weather API. Zenodo
          (10.5281/zenodo.7970649)
        </A>
        .
      </>
    ),
    cellEn: (
      <>
        “<OpenMeteoAttribution className="underline hover:text-fg transition-colors" />” —
        already on the map, About and footer. Models: waves DWD EWAM & ECMWF WAM
        (CC-BY), NOAA GFS Wave/GWAM; wind DWD ICON-EU, ECMWF IFS, GFS &
        Météo-France. Citation:{' '}
        <A href="https://doi.org/10.5281/zenodo.7970649">
          Zippenfenig, P. (2023). Open-Meteo.com Weather API. Zenodo
          (10.5281/zenodo.7970649)
        </A>
        .
      </>
    ),
    titlePt: OPEN_METEO_ATTRIBUTION_LABEL,
    titleEn: OPEN_METEO_ATTRIBUTION_LABEL,
  },
  ih: {
    notePt: (
      <>
        «Dados © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A> (
        <A href={CC_BY}>CC BY 4.0</A>)»
      </>
    ),
    noteEn: (
      <>
        “Data © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A> (
        <A href={CC_BY}>CC BY 4.0</A>)”
      </>
    ),
    cellPt: (
      <>
        «Dados © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A> (
        <A href={CC_BY}>CC BY 4.0</A>)» — na secção de marés, no card de isóbatas
        e nos avisos à navegação (ver a entrada das boias para a licença CC BY-NC
        da camada observedWave).
      </>
    ),
    cellEn: (
      <>
        “Data © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A> (
        <A href={CC_BY}>CC BY 4.0</A>)” — in the tides section, the isobaths card
        and navigation warnings (see the buoys entry for the observedWave layer’s
        CC BY-NC licence).
      </>
    ),
    titlePt: 'Dados © Instituto Hidrográfico (CC BY 4.0)',
    titleEn: 'Data © Instituto Hidrográfico (CC BY 4.0)',
  },
  // Boias ondógrafo (Datawell Waverider) — licença CC BY-NC e entidades gestoras
  // da rede, conforme processo IH n.º 0191_2026 e ficha de metadados
  // metadata.hidrografico.pt/.../0205ed82-a085-4432-98f5-ff0326c4d4de (IH, APRAM
  // na Madeira e AEAI nos Açores). Apenas as boias são CC BY-NC; marés, isóbatas
  // e avisos mantêm CC BY (ver 'ih').
  'ih-buoys': {
    notePt: (
      <>
        «Dados © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A>,{' '}
        <A href="https://apram.pt/">
          Administração dos Portos da Região Autónoma da Madeira
        </A>{' '}
        e{' '}
        <A href="https://climaat.angra.uac.pt/boias/">
          Associação para o Estudo do Ambiente Insular
        </A>{' '}
        (<A href={CC_BY_NC}>CC BY-NC 4.0</A>)»
      </>
    ),
    noteEn: (
      <>
        “Data © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A>,{' '}
        <A href="https://apram.pt/">
          Administração dos Portos da Região Autónoma da Madeira
        </A>{' '}
        and{' '}
        <A href="https://climaat.angra.uac.pt/boias/">
          Associação para o Estudo do Ambiente Insular
        </A>{' '}
        (<A href={CC_BY_NC}>CC BY-NC 4.0</A>)”
      </>
    ),
    cellPt: (
      <>
        «Dados © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A>,{' '}
        <A href="https://apram.pt/">
          Administração dos Portos da Região Autónoma da Madeira
        </A>{' '}
        e{' '}
        <A href="https://climaat.angra.uac.pt/boias/">
          Associação para o Estudo do Ambiente Insular
        </A>{' '}
        (<A href={CC_BY_NC}>CC BY-NC 4.0</A>)» — na leitura de onda observada
        (card, comparador) e nas superfícies compactas quando a fonte é a boia
        Datawell do IH.
      </>
    ),
    cellEn: (
      <>
        “Data © <A href="https://www.hidrografico.pt/">Instituto Hidrográfico</A>,{' '}
        <A href="https://apram.pt/">
          Administração dos Portos da Região Autónoma da Madeira
        </A>{' '}
        and{' '}
        <A href="https://climaat.angra.uac.pt/boias/">
          Associação para o Estudo do Ambiente Insular
        </A>{' '}
        (<A href={CC_BY_NC}>CC BY-NC 4.0</A>)” — on the observed wave reading
        (card, comparator) and compact surfaces when the source is the IH
        Datawell buoy.
      </>
    ),
    titlePt:
      'Dados das boias © Instituto Hidrográfico, Administração dos Portos da Região Autónoma da Madeira e Associação para o Estudo do Ambiente Insular (CC BY-NC 4.0)',
    titleEn:
      'Buoy data © Instituto Hidrográfico, Administração dos Portos da Região Autónoma da Madeira and Associação para o Estudo do Ambiente Insular (CC BY-NC 4.0)',
  },
  ipma: {
    notePt: (
      <>
        «Dados <A href={IPMA_URL}>IPMA</A>»
      </>
    ),
    noteEn: (
      <>
        “<A href={IPMA_URL}>IPMA</A> data”
      </>
    ),
    cellPt: (
      <>
        «Dados <A href={IPMA_URL}>IPMA</A>» — no radar (badge «IPMA»), nos
        avisos e nas observações de vento.
      </>
    ),
    cellEn: (
      <>
        “<A href={IPMA_URL}>IPMA</A> data” — on the radar (IPMA badge),
        warnings and wind observations.
      </>
    ),
    titlePt: 'Dados IPMA',
    titleEn: 'IPMA data',
  },
  meteoalarm: {
    notePt: (
      <>
        «Avisos <A href="https://www.meteoalarm.org/">MeteoAlarm</A> (EUMETNET)»
      </>
    ),
    noteEn: (
      <>
        “<A href="https://www.meteoalarm.org/">MeteoAlarm</A> (EUMETNET) warnings”
      </>
    ),
    cellPt: (
      <>
        «Avisos <A href="https://www.meteoalarm.org/">MeteoAlarm</A> (EUMETNET)» —
        mostrado na secção de avisos quando a fonte é meteoalarm.
      </>
    ),
    cellEn: (
      <>
        “<A href="https://www.meteoalarm.org/">MeteoAlarm</A> (EUMETNET) warnings” —
        shown in the warnings section when the source is meteoalarm.
      </>
    ),
    titlePt: 'Avisos MeteoAlarm (EUMETNET)',
    titleEn: 'MeteoAlarm (EUMETNET) warnings',
  },
  copernicus: {
    notePt: (
      <>
        «Generated using E.U.{' '}
        <A href="https://marine.copernicus.eu/">Copernicus Marine Service Information</A>»
      </>
    ),
    noteEn: (
      <>
        “Generated using E.U.{' '}
        <A href="https://marine.copernicus.eu/">Copernicus Marine Service Information</A>”
      </>
    ),
    cellPt: (
      <>
        «Generated using E.U.{' '}
        <A href="https://marine.copernicus.eu/">Copernicus Marine Service Information</A>» —
        nas leituras WMO (boia Silleiro/Villano etc.).
      </>
    ),
    cellEn: (
      <>
        “Generated using E.U.{' '}
        <A href="https://marine.copernicus.eu/">Copernicus Marine Service Information</A>” —
        on WMO readings (Silleiro/Villano buoys, etc.).
      </>
    ),
    titlePt: 'Generated using E.U. Copernicus Marine Service Information',
    titleEn: 'Generated using E.U. Copernicus Marine Service Information',
  },
  esri: {
    notePt: (
      <>
        «Imagery © <A href="https://www.esri.com/">Esri</A>, Maxar, Earthstar
        Geographics»
      </>
    ),
    noteEn: (
      <>
        “Imagery © <A href="https://www.esri.com/">Esri</A>, Maxar, Earthstar
        Geographics”
      </>
    ),
    cellPt: (
      <>
        «Imagery © <A href="https://www.esri.com/">Esri</A>, Maxar, Earthstar
        Geographics» — no About e no controlo de atribuição do mapa.
      </>
    ),
    cellEn: (
      <>
        “Imagery © <A href="https://www.esri.com/">Esri</A>, Maxar, Earthstar
        Geographics” — on the About page and the map attribution control.
      </>
    ),
    titlePt: 'Imagery © Esri, Maxar, Earthstar Geographics',
    titleEn: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  osm: {
    notePt: (
      <>
        «© <A href="https://www.openstreetmap.org/copyright">OpenStreetMap</A>{' '}
        contributors © <A href="https://carto.com/attributions">CARTO</A>»
      </>
    ),
    noteEn: (
      <>
        “© <A href="https://www.openstreetmap.org/copyright">OpenStreetMap</A>{' '}
        contributors © <A href="https://carto.com/attributions">CARTO</A>”
      </>
    ),
    cellPt: (
      <>
        «© <A href="https://www.openstreetmap.org/copyright">OpenStreetMap</A>{' '}
        contributors © <A href="https://carto.com/attributions">CARTO</A>» — no
        controlo de atribuição do mapa.
      </>
    ),
    cellEn: (
      <>
        “© <A href="https://www.openstreetmap.org/copyright">OpenStreetMap</A>{' '}
        contributors © <A href="https://carto.com/attributions">CARTO</A>” — on
        the map attribution control.
      </>
    ),
    titlePt: '© OpenStreetMap contributors © CARTO',
    titleEn: '© OpenStreetMap contributors © CARTO',
  },
  ecowitt: {
    notePt: (
      <>
        «<A href="https://www.ecowitt.net/">Ecowitt</A>»
      </>
    ),
    noteEn: (
      <>
        “<A href="https://www.ecowitt.net/">Ecowitt</A>”
      </>
    ),
    cellPt: (
      <>
        «<A href="https://www.ecowitt.net/">Ecowitt</A>» — na atribuição das
        observações de vento.
      </>
    ),
    cellEn: (
      <>
        “<A href="https://www.ecowitt.net/">Ecowitt</A>” — in the wind observation
        attribution.
      </>
    ),
    titlePt: 'Ecowitt',
    titleEn: 'Ecowitt',
  },
  metar: {
    notePt: (
      <>
        «METAR via <A href="https://aviationweather.gov/">aviationweather.gov</A>»
      </>
    ),
    noteEn: (
      <>
        “METAR via <A href="https://aviationweather.gov/">aviationweather.gov</A>”
      </>
    ),
    cellPt: (
      <>
        «METAR via <A href="https://aviationweather.gov/">aviationweather.gov</A>» —
        na atribuição das observações de vento.
      </>
    ),
    cellEn: (
      <>
        “METAR via <A href="https://aviationweather.gov/">aviationweather.gov</A>” —
        in the wind observation attribution.
      </>
    ),
    titlePt: 'METAR via aviationweather.gov',
    titleEn: 'METAR via aviationweather.gov',
  },
  weatherlink: {
    notePt: (
      <>
        «<A href="https://www.weatherlink.com/">WeatherLink</A> · Davis»
      </>
    ),
    noteEn: (
      <>
        “<A href="https://www.weatherlink.com/">WeatherLink</A> · Davis”
      </>
    ),
    cellPt: (
      <>
        «<A href="https://www.weatherlink.com/">WeatherLink</A> · Davis» — no
        embed da secção de sensores.
      </>
    ),
    cellEn: (
      <>
        “<A href="https://www.weatherlink.com/">WeatherLink</A> · Davis” — on the
        sensors embed section.
      </>
    ),
    titlePt: 'WeatherLink · Davis',
    titleEn: 'WeatherLink · Davis',
  },
  gemini: {
    notePt: (
      <>
        «Gerado com <A href="https://ai.google.dev/">Google Gemini</A>»
      </>
    ),
    noteEn: (
      <>
        “Generated with <A href="https://ai.google.dev/">Google Gemini</A>”
      </>
    ),
    cellPt: (
      <>
        «Gerado com <A href="https://ai.google.dev/">Google Gemini</A>» — nas
        notícias e no Dawn Patrol.
      </>
    ),
    cellEn: (
      <>
        “Generated with <A href="https://ai.google.dev/">Google Gemini</A>” — on
        the news and Dawn Patrol.
      </>
    ),
    titlePt: 'Gerado com Google Gemini',
    titleEn: 'Generated with Google Gemini',
  },
  unsplash: {
    notePt: (
      <>
        <A href="https://unsplash.com/license">Unsplash</A> ·{' '}
        <A href="https://www.pexels.com/license/">Pexels</A>
      </>
    ),
    noteEn: (
      <>
        <A href="https://unsplash.com/license">Unsplash</A> ·{' '}
        <A href="https://www.pexels.com/license/">Pexels</A>
      </>
    ),
    cellPt: (
      <>
        Lista completa de créditos em <code className="text-fg">public/images/CREDITS.md</code>.
      </>
    ),
    cellEn: (
      <>
        Full credit list in <code className="text-fg">public/images/CREDITS.md</code>.
      </>
    ),    titlePt: 'Créditos de fotografia em public/images/CREDITS.md',
    titleEn: 'Photo credits in public/images/CREDITS.md',
  },
};




/** ID de atribuição da leitura de onda observada (boia IH ou WMO/Copernicus). */
export function waveSourceAttributionId(
  source: 'ih-buoy' | 'wmo-buoy',
): 'ih-buoys' | 'copernicus' {
  return source === 'ih-buoy' ? 'ih-buoys' : 'copernicus';
}

/**
 * ID de atribuição do vento observado no score: IPMA / Ecowitt / METAR. Cada
 * estação tem a sua cadeia na tabela ATTRIBUTIONS (ipma/ecowitt/metar), por isso
 * a nota mostrada junto do score deriva do metadata `source` da observação — a
 * mesma estação que o badge «Vento observado» nomeia. Qualquer obs. nova (ex.
 * ecowitt) cai naturalmente aqui; valor inseguro → fallback 'open-meteo'.
 */
export function windSourceAttributionId(
  source: 'ipma' | 'ecowitt' | 'metar' | (string & {}),
): DataSourceId {
  if (source === 'ipma') return 'ipma';
  if (source === 'ecowitt') return 'ecowitt';
  if (source === 'metar') return 'metar';
  return 'open-meteo';
}

export interface AttributionExpectation {
  /** Attribution IDs que DEVEM estar presentes nesta superfície (o par dinâmico). */
  present: DataSourceId[];
  /** Attribution IDs que NÃO devem aparecer nesta superfície (a contraparte). */
  absent: DataSourceId[];
}

/**
 * Auditoria dinâmica do card de onda observada: a cadeia mostrada deve
 * corresponder à fonte verdadeiramente exibida. Uma leitura IH mostra «Dados ©
 * Instituto Hidrográfico»; uma leitura WMO/Copernicus mostra a nota Copernicus
 * — e NUNCA a da contraparte. Derivado do metadata da observação (source), para
 * os testes validarem o par em vez de assumirem o texto.
 * @param source metadata da observação (conditions.json[spot].observedWave.source)
 */
export function waveCardAttributionExpectation(
  source: 'ih-buoy' | 'wmo-buoy',
): AttributionExpectation {
  const id = waveSourceAttributionId(source);
  return {
    present: [id],
    absent: id === 'ih-buoys' ? ['copernicus'] : ['ih-buoys'],
  };
}

/**
 * Auditoria dinâmica do basemap do mapa: a cadeia Esri/OSM só aparece no modo
 * satélite; o Carto/OSM só no modo mapa. Nunca as duas ao mesmo tempo.
 * @param basemap modo do basemap no momento
 */
export function basemapAttributionExpectation(
  basemap: 'map' | 'satellite',
): AttributionExpectation {
  return basemap === 'satellite'
    ? { present: ['esri'], absent: ['osm'] }
    : { present: ['osm'], absent: ['esri'] };
}

/**
 * Auditoria dinâmica do vento observado: a cadeia mostrada junto do score tem de
 * corresponder à estação realmente exibida. Uma observação Ecowitt mostra a nota
 * Ecowitt; um METAR mostra aviationweather; IPMA mostra IPMA. A contraparte
 * (qualquer outra estação) NUNCA aparece. Quando o score usa só previsão
 * (open-meteo), só a cadeia Open-Meteo está presente e nenhuma estação aparece.
 * @param source metadata da observação (conditions.json[spot].observed.source) ou 'forecast'
 */
export function windCardAttributionExpectation(
  source: 'ipma' | 'ecowitt' | 'metar' | 'forecast',
): AttributionExpectation {
  if (source === 'forecast') {
    return { present: ['open-meteo'], absent: ['ipma', 'ecowitt', 'metar'] };
  }
  const id = windSourceAttributionId(source);
  return {
    present: [id],
    absent: (['ipma', 'ecowitt', 'metar'] as const).filter((s) => s !== id),
  };
}