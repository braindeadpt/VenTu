import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extractJsVar } = require('../apaExtract.js');
const {
  parseApaHomepage,
  normalizeBeach,
  normalizeAlert,
  inSeason,
  nearestBeach,
  buildWaterQualityArtifact,
  stripHtml,
} = require('../waterQuality.js');

const BEACH = {
  id: 549,
  profile: { praia: 'CARCAVELOS', bandeira_azul: 1, vigilancia: 1, acessivel: 1 },
  quality: {
    nome_agua_balnear: 'CARCAVELOS',
    latitude_wgs84: 38.677,
    longitude_wgs84: -9.334,
    data_inicio_epoca_balnear: 1777593600000,
    data_fim_epoca_balnear: 1790726400000,
    classificacao_ano_anterior: 1,
    classificacao_ano_anterior_dsc: 'Excelente',
    ultima_classificacao: 1,
    data_ultima_classificacao: 1788739200000,
    motivo: [],
    motivo_desc: null,
    data_ultima_analise: 1788739200000,
    ultima_classificacao_desc: 'Água adequada para banhos',
    ultima_classificacao_titulo: {
      pt: { name: '<p>Adequada</p>\n' },
      en: { name: '<p>Adequate</p>\n' },
    },
  },
};

const ALERT = {
  pt: {
    beach_id: 549,
    name: '<p>Contaminação Microbiológica</p>',
    advices: '<p>NÃO TOMAR BANHO.</p>',
    beach_update: '25/09/2026',
  },
  en: {
    name: '<p>Microbiological contamination</p>',
    advices: '<p>DO NOT BATHE.</p>',
  },
};

const HTML = `prefix;DATA_BeachesData = ${JSON.stringify([BEACH])};mid;DATA_BeachesAlerts = ${JSON.stringify([ALERT])};DATA_BeachQualityMap = [{"id":1}];suffix`;

describe('apaExtract — extractJsVar', () => {
  it('extrai array com ; dentro de strings HTML', () => {
    const src = 'X = [{"a":"<p>foo;bar</p>"}]; Y=1';
    expect(JSON.parse(extractJsVar(src, 'X'))).toEqual([{ a: '<p>foo;bar</p>' }]);
  });

  it('extrai objecto e respeita escapes', () => {
    const src = 'Y = {"s":"a\\"b}c"}; Z=2';
    expect(JSON.parse(extractJsVar(src, 'Y'))).toEqual({ s: 'a"b}c' });
  });

  it('devolve null quando a variável não existe ou não é literal', () => {
    expect(extractJsVar('const a = f()', 'Z')).toBeNull();
    expect(extractJsVar('Z = foo();', 'Z')).toBeNull();
  });
});

describe('waterQuality — parseApaHomepage', () => {
  it('extrai praias, alertas e mapa de classes', () => {
    const parsed = parseApaHomepage(HTML);
    expect(parsed.beaches).toHaveLength(1);
    expect(parsed.alerts).toHaveLength(1);
    expect(parsed.qualityMap).toEqual([{ id: 1 }]);
  });

  it('devolve null sem DATA_BeachesData', () => {
    expect(parseApaHomepage('<html>sem dataset</html>')).toBeNull();
    expect(parseApaHomepage(null)).toBeNull();
  });
});

describe('waterQuality — normalizeBeach', () => {
  it('normaliza conselho, classe anual, época e flags', () => {
    const b = normalizeBeach(BEACH);
    expect(b).toMatchObject({
      beachId: 549,
      beach: 'CARCAVELOS',
      advice: 1,
      adviceTitlePt: 'Adequada',
      adviceTitleEn: 'Adequate',
      annualClass: 1,
      blueFlag: true,
      guarded: true,
      accessible: true,
    });
  });

  it('descarta entrada sem coordenadas finitas', () => {
    const bad = { ...BEACH, quality: { ...BEACH.quality, latitude_wgs84: 'x' } };
    expect(normalizeBeach(bad)).toBeNull();
  });

  it('conselho fora de {0,1,2} vira 0 (sem análises) — nunca inventa', () => {
    const bad = { ...BEACH, quality: { ...BEACH.quality, ultima_classificacao: 9 } };
    expect(normalizeBeach(bad).advice).toBe(0);
  });
});

describe('waterQuality — normalizeAlert', () => {
  it('normaliza com pt+en e limpa HTML', () => {
    const a = normalizeAlert(ALERT);
    expect(a).toMatchObject({
      beachId: 549,
      namePt: 'Contaminação Microbiológica',
      nameEn: 'Microbiological contamination',
      advicePt: 'NÃO TOMAR BANHO.',
      adviceEn: 'DO NOT BATHE.',
      date: '25/09/2026',
    });
  });

  it('descarta alerta sem beach_id ou nome', () => {
    expect(normalizeAlert({ pt: { name: 'x' } })).toBeNull();
    expect(normalizeAlert({ pt: { beach_id: 1 } })).toBeNull();
  });
});

describe('waterQuality — inSeason', () => {
  const b = normalizeBeach(BEACH);
  it('dentro da época', () => {
    expect(inSeason(b, 1785000000000)).toBe(true);
  });
  it('fora da época e sem datas → false', () => {
    expect(inSeason(b, 1800000000000)).toBe(false);
    expect(inSeason({ ...b, seasonStart: null }, 1785000000000)).toBe(false);
  });
});

describe('waterQuality — nearestBeach', () => {
  const beaches = [normalizeBeach(BEACH)];
  it('apanha a praia mais próxima dentro do limite', () => {
    const hit = nearestBeach(38.68, -9.33, beaches);
    expect(hit.beach.beach).toBe('CARCAVELOS');
    expect(hit.distKm).toBeLessThan(1);
  });
  it('devolve null além de MAX_BEACH_KM', () => {
    expect(nearestBeach(38.9, -9.33, beaches)).toBeNull();
  });
});

describe('waterQuality — buildWaterQualityArtifact', () => {
  it('mapeia spots, junta alertas por beach_id, regista distKm', () => {
    const art = buildWaterQualityArtifact(HTML, [{ id: 'carcavelos', lat: 38.68, lon: -9.33 }], '2026-09-30T00:00:00Z');
    const rec = art.spots.carcavelos;
    expect(rec).toMatchObject({ beach: 'CARCAVELOS', advice: 1, annualClass: 1 });
    expect(rec.distKm).toBeLessThan(1);
    expect(rec.alerts).toHaveLength(1);
    expect(rec.alerts[0].namePt).toBe('Contaminação Microbiológica');
    expect(rec.lat).toBeUndefined(); // coords não vão para o artefacto
  });

  it('spot sem praia próxima fica de fora (não inventa)', () => {
    const art = buildWaterQualityArtifact(HTML, [{ id: 'longe', lat: 40.5, lon: -7.0 }], 'x');
    expect(art.spots.longe).toBeUndefined();
  });

  it('devolve null sem dataset', () => {
    expect(buildWaterQualityArtifact('<html/>', [], 'x')).toBeNull();
  });
});

describe('waterQuality — stripHtml', () => {
  it('remove tags e colapsa whitespace', () => {
    expect(stripHtml('<p>Água <b>adequada</b></p>\n')).toBe('Água adequada');
    expect(stripHtml(null)).toBeNull();
    expect(stripHtml(5)).toBeNull();
  });
});
