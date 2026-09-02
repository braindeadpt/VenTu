import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { ATTRIBUTIONS, type DataSourceId } from '@/lib/dataSources';

/**
 * Auditoria de âncoras da tabela de fontes (src/lib/dataSources.tsx).
 *
 * Cada entrada de `ATTRIBUTIONS` é uma cadeia de atribuição OBRIGATÓRIA que tem
 * de ser mostrada junto dos dados que credita numa superfície real da UI — não
 * pode viver só dentro da própria tabela nem da página /fontes (que as lista de
 * forma genérica). Quando um autor adiciona uma nota nova, tem de a ligar a uma
 * superfície e registá-la aqui em `UI_ANCHORS` — o teste falha se a entrada
 * não estiver registada OU se a âncora deixar de existir no código (superfície
 * removida sem limpar o registo).
 *
 * A âncora não tem de usar o id literal como string: uma superfície que consome
 * `ATTRIBUTIONS[X].notePt` (ex. via waveSourceAttributionId) conta, desde que o
 * padrão escolhido corresponda a esse consumo no `src`.
 */

/** Superfícies que listam/definem as cadeias de forma genérica — não contam como âncora. */
function isNonAnchor(rel: string): boolean {
  if (rel.includes(`__tests__${sep}`) || rel.includes(`${sep}__tests__${sep}`)) return true;
  if (rel === 'lib/dataSources.tsx') return true; // a própria fonte
  if (rel.includes('app/[locale]/fontes/')) return true; // a tabela genérica /fontes
  return false;
}

/**
 * Registo obrigatório: cada fonte → a superfície de UI onde a nota é mostrada
 * junto dos dados, com um padrão que a prova no `src`. Manter em sincronia com
 * ATTRIBUTIONS — um id novo tem de ser registado (escrutínio do autor).
 */
const UI_ANCHORS: Record<DataSourceId, { surface: string; anchor: RegExp }> = {
  'open-meteo': {
    surface: 'controlo de atribuição do mapa + badge do radar + About',
    anchor: /OPEN_METEO_ATTRIBUTION|OpenMeteoAttribution/,
  },
  ih: {
    surface: 'marés · isóbatas · avisos navegação (CC BY)',
    anchor: /Instituto Hidrográfico/,
  },
  'ih-buoys': {
    surface: 'card/comparador de onda observada e notas compactas quando a fonte é a boia Datawell (CC BY-NC)',
    anchor: /Instituto Hidrográfico/,
  },
  ipma: { surface: 'badge do radar · avisos · observações de vento', anchor: /IPMA/i },
  meteoalarm: { surface: 'secção de avisos quando a fonte é meteoalarm', anchor: /meteoalarm/i },
  copernicus: {
    surface: 'nota junto da leitura WMO no card de onda observada',
    anchor: /Copernicus/,
  },
  esri: {
    surface: 'controlo de atribuição do mapa em modo satélite + About',
    anchor: /TILE_ATTRIBUTIONS\.esri|\bEsri\b/,
  },
  osm: { surface: 'controlo de atribuição do mapa (modo mapa)', anchor: /OpenStreetMap|CARTO/ },
  ecowitt: { surface: 'atribuição das observações de vento', anchor: /Ecowitt/i },
  metar: { surface: 'atribuição das observações de vento', anchor: /METAR|aviationweather/i },
  weatherlink: { surface: 'embebido de sensores da página do spot', anchor: /SpotWeatherlinkSection/ },
  gemini: { surface: 'notícias geradas por IA (Gemini Flash) + About', anchor: /Gemini/i },
  unsplash: { surface: 'créditos de fotografia no rodapé + About', anchor: /unsplash|pexels/i },
};

function walkSourceFiles(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = relative(root, full).split(sep).join('/');
      if (isNonAnchor(rel)) continue;
      const st = statSync(full);
      if (st.isDirectory()) visit(full);
      else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
    }
  };
  visit(root);
  return out;
}

describe('ATTRIBUTIONS — cada nota ligada a uma âncora de UI real', () => {
  const ids = Object.keys(ATTRIBUTIONS) as DataSourceId[];
  const files = walkSourceFiles(join(process.cwd(), 'src'));
  const contents = files.map((f) => ({
    rel: relative(join(process.cwd(), 'src'), f).split(sep).join('/'),
    text: readFileSync(f, 'utf-8'),
  }));

  it('todas as entradas de ATTRIBUTIONS estão registadas no UI_ANCHORS', () => {
    const unanchored = ids.filter((id) => !UI_ANCHORS[id]);
    expect(
      unanchored,
      `sem âncora de UI: ${unanchored.join(', ')}. Liga cada nota a uma superfície ` +
        '(ex. ATTRIBUTIONS[X].notePt num componente) e regista-a no UI_ANCHORS deste teste ' +
        '— a nota não pode viver só na tabela /fontes.',
    ).toEqual([]);
  });

  it('cada âncora registada ainda existe em src (a superfície não foi removida)', () => {
    const dead: string[] = [];
    for (const id of ids) {
      const reg = UI_ANCHORS[id];
      if (!reg) continue;
      const hit = contents.some(({ text }) => reg.anchor.test(text));
      if (!hit) dead.push(`${id} (${reg.surface})`);
    }
    expect(
      dead,
      `âncoras sem correspondência em src — superfície removida? Corrige o registo UI_ANCHORS ` +
        `ou remove a nota da tabela: ${dead.join('; ')}`,
    ).toEqual([]);
  });

  it('não há registos UI_ANCHORS órfãos (sempre correspondem a uma entrada)', () => {
    const stale = Object.keys(UI_ANCHORS).filter((k) => !(k in ATTRIBUTIONS));
    expect(stale, `UI_ANCHORS sem entrada em ATTRIBUTIONS: ${stale.join(', ')}`).toEqual([]);
  });
});