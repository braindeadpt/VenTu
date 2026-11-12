import { V6_BASE_FILTER_ID, v6BaseTable } from '@/lib/mapPeleBase';

const R = v6BaseTable(0);
const G = v6BaseTable(1);
const B = v6BaseTable(2);

/**
 * PR B6: o filtro SVG da base «Mapa» v6 (`filter:url(#v6base)` em mapa-pele-v6.css).
 * Só é montado com a pele e a flag da base ligadas; um <svg> de 0×0 fora do fluxo.
 */
export function MapPeleBaseFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }} data-map-pele-base-filter>
      <filter id={V6_BASE_FILTER_ID} colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="table" tableValues={R} />
          <feFuncG type="table" tableValues={G} />
          <feFuncB type="table" tableValues={B} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}
