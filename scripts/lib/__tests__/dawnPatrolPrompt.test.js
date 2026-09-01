/**
 * Dawn Patrol LLM prompt — integração dos avisos costeiros do IH.
 *
 * Requer scripts/dawn-patrol.js (guard require.main → sem rede nem execução
 * do pipeline ao importar) e valida que o prompt puro inclui os avisos
 * costeiros por spot e a instrução para os mencionar no conselho pt/en.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  buildDawnPatrolPrompt,
  generateBasicAdvice,
  resolveCoastalBySlug,
  resolveSeaBySlug,
  seaWarningPromptLine,
} = require('../../dawn-patrol.js');

function spot(overrides = {}) {
  return {
    name: 'Nazaré',
    slug: 'nazare',
    region: 'Nazaré',
    bestWindow: {
      hour: 8,
      waveHeight: 2.5,
      wavePeriod: 12,
      windSpeed: 6,
      waterTemp: 17,
    },
    score: 78,
    scoreSource: 'previsão',
    ...overrides,
  };
}

const COASTAL = {
  coverage: { nazare: [1, 2], 'ribeira-ilhas': [] },
  warnings: [
    { id: 1, ref: 'ANAV NR 1670/26', category: 'Requisitos de segurança maritima' },
    { id: 2, ref: 'ANAV NR 1686/26', category: 'Exercício militar' },
  ],
};

describe('buildDawnPatrolPrompt — avisos costeiros', () => {
  it('inclui a linha de avisos costeiros (ref + categoria) para o spot coberto', () => {
    const coastalBySlug = resolveCoastalBySlug([spot()], COASTAL);
    const prompt = buildDawnPatrolPrompt([spot()], coastalBySlug);

    expect(prompt).toContain('- Avisos costeiros (IH): ANAV NR 1670/26 (Requisitos de segurança maritima); ANAV NR 1686/26 (Exercício militar)');
    // Instrução para o LLM mencionar no conselho pt/en.
    expect(prompt).toMatch(/menciona-os de forma curta no advice em pt E en/);
  });

  it('não adiciona linha de avisos quando o spot não tem cobertura', () => {
    const spotSemCobertura = spot({ slug: 'ribeira-ilhas', name: 'Ribeira d\u2019Ilhas' });
    const coastalBySlug = resolveCoastalBySlug([spotSemCobertura], COASTAL);
    const prompt = buildDawnPatrolPrompt([spotSemCobertura], coastalBySlug);

    expect(prompt).not.toContain('Avisos costeiros (IH)');
    // O resto do prompt mantém-se intacto.
    expect(prompt).toContain('Ribeira d\u2019Ilhas');
    expect(prompt).toContain('Gera um JSON com esta estrutura EXACTA');
  });

  it('não rebenta sem dados costeiros (Map vazio)', () => {
    const prompt = buildDawnPatrolPrompt([spot()], new Map());
    expect(prompt).not.toContain('Avisos costeiros (IH)');
    expect(prompt).toContain('- Ondas: 2.5m @ 12s');
  });
});

describe('resolveCoastalBySlug', () => {
  it('mapeia coverage → avisos (via coastalWarningsForSpot)', () => {
    const map = resolveCoastalBySlug(
      [spot(), spot({ slug: 'ribeira-ilhas', name: 'Ribeira d\u2019Ilhas' })],
      COASTAL,
    );
    expect(map.get('nazare').map((w) => w.ref)).toEqual(['ANAV NR 1670/26', 'ANAV NR 1686/26']);
    expect(map.get('ribeira-ilhas')).toEqual([]);
  });

  it('devolve Map vazio sem coastalData', () => {
    expect(resolveCoastalBySlug([spot()], null).size).toBe(0);
  });
});

const SEA_WARNINGS = {
  source: 'ipma',
  fetchedAt: '2026-08-14T12:00:00Z',
  warnings: [],
  spotWarnings: {
    nazare: [
      { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Agitação Marítima', level: 'orange', text: '', relevant: true },
      { areaCode: 'LRA', areaLabel: 'Leiria', type: 'Vento', level: 'yellow', text: '', relevant: true },
    ],
    'ribeira-ilhas': [],
  },
};

describe('buildDawnPatrolPrompt — agitação marítima (Mar perigoso)', () => {
  it('inclui a linha «Mar perigoso» com nível e área para o spot com aviso', () => {
    const seaBySlug = resolveSeaBySlug([spot()], SEA_WARNINGS);
    const prompt = buildDawnPatrolPrompt([spot()], new Map(), seaBySlug);

    expect(prompt).toContain('- ⚠️ Mar perigoso (agitação marítima): Laranja — Leiria');
    // Instrução para o LLM avisar em pt/en como o banner de segurança do site.
    expect(prompt).toMatch(/AGITAÇÃO MARÍTIMA \(linha «Mar perigoso» num spot\)/);
    expect(prompt).toMatch(/avisa de forma curta no advice em pt E en/);
  });

  it('sem aviso de agitação → sem linha «Mar perigoso» (o resto do prompt intacto)', () => {
    const seaBySlug = resolveSeaBySlug([spot({ slug: 'ribeira-ilhas' })], SEA_WARNINGS);
    const prompt = buildDawnPatrolPrompt([spot({ slug: 'ribeira-ilhas' })], new Map(), seaBySlug);

    // A INSTRUÇÃO menciona «Mar perigoso» sempre — o que não pode existir é a
    // LINHA por spot (com ⚠️) quando o spot não tem aviso de agitação.
    expect(prompt).not.toContain('- ⚠️ Mar perigoso');
    expect(prompt).toContain('- Ondas: 2.5m @ 12s');
    expect(prompt).toContain('Gera um JSON com esta estrutura EXACTA');
  });

  it('não rebenta sem warningsData (Map vazio)', () => {
    const prompt = buildDawnPatrolPrompt([spot()], new Map(), new Map());
    expect(prompt).not.toContain('- ⚠️ Mar perigoso');
    expect(prompt).toContain('- Ondas: 2.5m @ 12s');
  });
});

describe('resolveSeaBySlug / seaWarningPromptLine', () => {
  it('mapeia slug → aviso mais forte de agitação (ignora Vento)', () => {
    const map = resolveSeaBySlug([spot(), spot({ slug: 'ribeira-ilhas' })], SEA_WARNINGS);
    expect(map.get('nazare')).toMatchObject({ type: 'Agitação Marítima', level: 'orange' });
    expect(map.get('ribeira-ilhas')).toBeNull();
  });

  it('devolve Map vazio sem warningsData', () => {
    expect(resolveSeaBySlug([spot()], null).size).toBe(0);
  });

  it('seaWarningPromptLine formata nível+área e devolve vazio sem aviso', () => {
    expect(seaWarningPromptLine({ level: 'orange', areaLabel: 'Lisboa' })).toBe(
      '- ⚠️ Mar perigoso (agitação marítima): Laranja — Lisboa',
    );
    expect(seaWarningPromptLine(null)).toBe('');
  });
});

describe('generateBasicAdvice — texto do briefing (fallback sem LLM)', () => {
  const seaBySlug = new Map([
    ['nazare', { level: 'orange', areaLabel: 'Leiria', type: 'Agitação Marítima' }],
  ]);

  it('o conselho do melhor spot repete o «Mar perigoso» em pt e en', () => {
    const advice = generateBasicAdvice([spot()], new Map(), seaBySlug);
    expect(advice.pt.advice).toContain('⚠️ Mar perigoso — agitação marítima (laranja)');
    expect(advice.en.advice).toContain('⚠️ Dangerous sea — sea state warning (orange)');
    expect(advice.topSpotSlug).toBe('nazare');
  });

  it('sem aviso de agitação → sem linha de segurança no conselho', () => {
    const advice = generateBasicAdvice([spot()], new Map(), new Map());
    expect(advice.pt.advice).not.toContain('Mar perigoso');
    expect(advice.en.advice).not.toContain('Dangerous sea');
    expect(advice.pt.advice).toContain('Melhor janela: 8:00h');
  });
});