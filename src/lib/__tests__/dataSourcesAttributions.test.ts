import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ATTRIBUTIONS, type DataSourceId } from '@/lib/dataSources';

/**
 * Auditoria das cadeias de atribuição obrigatória.
 *
 * Duas garantias, para as licenças NUNCA divergirem entre a página /fontes e
 * a UI que mostra os dados:
 *
 *  1. Rendering — cada cadeia do módulo partilhado (dataSources.tsx) é render
 *     para markup estático e provada completa: todas as variantes pt/en de
 *     note/cell/title presentes e com pelo menos um link https de atribuição
 *     (nenhuma licença pode existir só como texto, sem link).
 *
 *  2. Presença na UI — cada fonte declarada tem de aparecer TEXTUALMENTE em
 *     algum ficheiro de UI (src/components e src/app, excluindo a própria
 *     página de fontes e o módulo). Se uma fonte só existir na tabela de
 *     /fontes e nunca for renderizada onde os seus dados aparecem, falha —
 *     apanha a licença que alguém declarou mas esqueceu de mostrar.
 */

/** Dir raiz dos ficheiros de UI (excluindo o módulo de atribuições e as fontes). */
const UI_DIRS = ['src/components', 'src/app'];

/** Âncoras textuais por fonte — um destes termos tem de existir nalgum ficheiro de UI. */
const UI_ANCHORS: Record<DataSourceId, string[]> = {
  'open-meteo': ['Open-Meteo', 'open-meteo.com'],
  ih: ['Instituto Hidrográfico', 'hidrografico'],
  'ih-buoys': ['Instituto Hidrográfico', 'hidrografico'],
  ipma: ['IPMA', 'ipma.pt'],
  meteoalarm: ['MeteoAlarm'],
  copernicus: ['Copernicus', 'marine.copernicus'],
  esri: ['Esri', 'esri.com'],
  osm: ['OpenStreetMap', 'openstreetmap.org'],
  ecowitt: ['Ecowitt', 'ecowitt.net'],
  metar: ['METAR', 'aviationweather'],
  weatherlink: ['WeatherLink'],
  gemini: ['Gemini', 'gemini'],
  unsplash: ['Unsplash', 'pexels'],
};

function walk(files: string[], dir: string): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(files, full);
    } else if (full.endsWith('.tsx') || full.endsWith('.ts')) {
      files.push(full);
    }
  }
}

describe('cadeias de atribuição (dataSources.tsx)', () => {
  it('cobre todas as fontes declaradas na página de fontes', () => {
    // As 13 fontes esperadas (espelham a tabela de /fontes — o IH está dividido
    // em marés/isóbatas/avisos 'ih' e boias ondógrafo 'ih-buoys', CC BY-NC).
    const expected: DataSourceId[] = [
      'open-meteo',
      'ih',
      'ih-buoys',
      'ipma',
      'meteoalarm',
      'copernicus',
      'esri',
      'osm',
      'ecowitt',
      'metar',
      'weatherlink',
      'gemini',
      'unsplash',
    ];
    expect(Object.keys(ATTRIBUTIONS).sort()).toEqual([...expected].sort());
  });

  it('cada cadeia está completa (pt/en) e tem um link https de atribuição', () => {
    for (const id of Object.keys(ATTRIBUTIONS) as DataSourceId[]) {
      const att = ATTRIBUTIONS[id];
      const rendered = {
        notePt: renderToStaticMarkup(att.notePt),
        noteEn: renderToStaticMarkup(att.noteEn),
        cellPt: renderToStaticMarkup(att.cellPt),
        cellEn: renderToStaticMarkup(att.cellEn),
      };

      for (const [key, markup] of Object.entries(rendered)) {
        expect(
          markup.trim().length,
          `${id}.${key} em branco — cadeia obrigatória vazia`,
        ).toBeGreaterThan(0);
        // A nota (mostrada junto dos dados) tem SEMPRE de ligar à fonte real;
        // a célula da tabela pode, em vez disso, remeter o crédito para
        // public/images/CREDITS.md (caso Unsplash/Pexels).
        if (key.startsWith('note')) {
          expect(
            markup,
            `${id}.${key} sem link https — a nota tem de ligar à fonte`,
          ).toMatch(/href="https:\/\/[^"]+"/);
        } else {
          expect(
            markup.includes('href="https://') || markup.includes('CREDITS.md'),
            `${id}.${key} sem link nem remissão a CREDITS.md — a célula tem de ligar à fonte ou aos créditos`,
          ).toBe(true);
        }
      }

      // Titles pt/en também preenchidos (usados em tooltips/aria).
      expect(att.titlePt.trim().length, `${id}.titlePt`).toBeGreaterThan(0);
      expect(att.titleEn.trim().length, `${id}.titleEn`).toBeGreaterThan(0);
    }
  });

  it('cada fonte declarada aparece textualmente nalgum ficheiro de UI (mapa, About, footer, …)', () => {
    const files: string[] = [];
    for (const dir of UI_DIRS) walk(files, dir);

    const sources = files.filter(
      (f) => !f.includes('dataSources') && !f.includes('fontes'),
    );
    const uiText = sources.map((f) => readFileSync(f, 'utf-8')).join('\n');

    for (const id of Object.keys(ATTRIBUTIONS) as DataSourceId[]) {
      const anchors = UI_ANCHORS[id];
      const foundIn = sources.filter((f) =>
        anchors.some((a) => readFileSync(f, 'utf-8').includes(a)),
      );
      // A cadeia tem de estar em pelo menos um sítio da UI — nunca só na tabela.
      expect(
        foundIn.length,
        `${id}: nenhum ficheiro de UI referencia ${anchors.join('" ou "')} — a fonte só existe na tabela de /fontes, sem presença na UI`,
      ).toBeGreaterThan(0);
    }
  });
});