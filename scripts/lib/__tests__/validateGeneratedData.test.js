/**
 * validate-generated-data.js — isobaths-contours.json validation.
 *
 * Runs the real CLI (subprocess) in `--mode=observations` against minimal
 * temp data dirs, isolating just the new isobaths checks. The rest of the
 * required files are filled with the smallest valid fixtures so the only
 * source of pass/fail is the isobaths payload.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALIDATOR = path.join(__dirname, '..', '..', 'validate-generated-data.js');

const now = () => new Date().toISOString();

function makeDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vgdiso-'));
  const hour = new Date(Date.now() + 3_600_000).toISOString(); // 1h no futuro (janela viva)
  const entry = { time: hour, waveHeight: 1.8, windSpeed: 12 };
  const series = Array.from({ length: 24 }, () => ({ ...entry }));
  const write = (rel, obj) =>
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(obj));

  write('pipeline-meta.json', {
    lastRunAt: now(),
    lastRunMode: 'observations',
    observationsUpdatedAt: now(),
    fullUpdatedAt: now(),
    displayUpdatedAt: now(),
  });
  write('conditions.json', { nazare: { waveHeight: 1.8 } });
  write('forecasts.json', { nazare: series });
  fs.mkdirSync(path.join(dir, 'forecasts'));
  write('forecasts/nazare.json', series);
  // spots-index precisa de descrições pt/en VÁLIDAS por omissão — a auditoria
  // de descrições (spots-index.desc.*) falha se a EN for copiada da PT ou se
  // faltar uma das duas. 'Nazaré' está na allowlist de topónimos, logo a EN
  // com o topónimo passa.
  write('spots-index.json', {
    generatedAt: now(),
    spots: [
      {
        slug: 'nazare',
        name: 'Nazaré',
        description: 'Praia da Nazaré com ondas gigantes no inverno.',
        descriptionEn: 'Nazaré beach with giant winter waves.',
      },
    ],
  });
  write('spots-lite.json', [{ slug: 'nazare', name: 'Nazaré' }]);
  write('ih-tides.json', { fetchedAt: now(), spotMapping: { nazare: {} } });
  // warnings.json fresco é OBRIGATÓRIO (TTL dos alertas falha com exit 1
  // quando velho/ausente) — fixture válida por omissão em todos os cenários.
  write('warnings.json', {
    source: 'ipma',
    fetchedAt: now(),
    warnings: [],
    spotWarnings: {},
  });
  return dir;
}

function validCoastalArchive() {
  return {
    fetchedAt: now(),
    windowDays: 90,
    dayCount: 2,
    days: [
      {
        date: '2026-08-30',
        warnings: [{ id: 1 }, { id: 2 }],
      },
      {
        date: '2026-08-31',
        warnings: [{ id: 3 }],
      },
    ],
    refs: [
      {
        ref: 'ANAV NR 1670/26',
        category: 'Requisitos de segurança maritima',
        source: 'ih',
        url: 'https://geoanavnet.hidrografico.pt/1',
        firstSeen: '2026-08-30',
        lastSeen: '2026-08-31',
        daysInForce: ['2026-08-30', '2026-08-31'],
        nDays: 2,
      },
    ],
  };
}

function validIsobaths() {
  const contours = {
    8: [[[-9.1, 39.6], [-9.05, 39.61], [-9.0, 39.6]]],
    16: [[[-9.08, 39.6], [-9.03, 39.62]]],
    30: [[[-9.12, 39.58], [-9.06, 39.6], [-9.0, 39.59]]],
  };
  let vertexCount = 0;
  for (const dep of Object.keys(contours)) {
    for (const line of contours[dep]) vertexCount += line.length;
  }
  return {
    contours,
    vertexCount,
    toleranceDeg: 0.001,
    depths: [8, 16, 30],
    fetchedAt: now(),
    sourceCollection: 'depcnt_8_16_30',
    sourceUrl: 'https://example.invalid/collections/depcnt_8_16_30',
  };
}

function runValidator(dir) {
  const r = spawnSync(process.execPath, [VALIDATOR, '--mode=observations'], {
    env: { ...process.env, VENTU_DATA_DIR: dir },
    encoding: 'utf8',
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

describe('validate-generated-data — isobaths-contours.json', () => {
  it('aceita um isobaths-contours.json válido (shape + vertexCount + orçamento)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'isobaths-contours.json'), JSON.stringify(validIsobaths()));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/isobaths/i);
  });

  it('falha quando falta uma profundidade (30 m) no contours', () => {
    const dir = makeDataDir();
    const bad = validIsobaths();
    delete bad.contours['30'];
    bad.vertexCount = 3 + 2;
    fs.writeFileSync(path.join(dir, 'isobaths-contours.json'), JSON.stringify(bad));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/isobaths\.shape/);
  });

  it('falha quando uma linha tem menos de 2 vértices', () => {
    const dir = makeDataDir();
    const bad = validIsobaths();
    bad.contours['16'] = [[[-9.08, 39.6]]]; // 1 vértice
    bad.vertexCount = 3 + 1 + 3;
    fs.writeFileSync(path.join(dir, 'isobaths-contours.json'), JSON.stringify(bad));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/isobaths\.shape/);
  });

  it('falha quando vertexCount não bate com a contagem real', () => {
    const dir = makeDataDir();
    const bad = validIsobaths();
    bad.vertexCount = 999;
    fs.writeFileSync(path.join(dir, 'isobaths-contours.json'), JSON.stringify(bad));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/isobaths\.vertexCountMatches/);
  });

  it('falha quando o orçamento de vértices é excedido (geometria sem simplificar)', () => {
    const dir = makeDataDir();
    const big = [];
    for (let i = 0; i < 61_000; i += 1) big.push([-9.1 + i * 1e-6, 39.6 + i * 1e-6]);
    const bad = validIsobaths();
    bad.contours['8'] = [big];
    bad.vertexCount = 61_000 + 2 + 3;
    fs.writeFileSync(path.join(dir, 'isobaths-contours.json'), JSON.stringify(bad));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/isobaths\.vertexBudget/);
  });

  it('passa sem o ficheiro (overlay best-effort, só warning)', () => {
    const dir = makeDataDir();
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).toMatch(/isobaths-contours\.json missing/i);
  });
});

describe('validate-generated-data — ih-coastal-warnings-archive.json', () => {
  it('aceita um arquivo costeiro válido (shape + datas ordenadas + janela)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'ih-coastal-warnings-archive.json'), JSON.stringify(validCoastalArchive()));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/coastal-archive/i);
  });

  it('falha quando as datas dos dias não estão estritamente ordenadas', () => {
    const dir = makeDataDir();
    const bad = validCoastalArchive();
    bad.days = [
      { date: '2026-08-31', warnings: [{ id: 3 }] },
      { date: '2026-08-30', warnings: [{ id: 1 }] },
    ];
    fs.writeFileSync(path.join(dir, 'ih-coastal-warnings-archive.json'), JSON.stringify(bad));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/coastal-archive\.daysOrder/);
  });

  it('falha quando dayCount não bate com o número de dias', () => {
    const dir = makeDataDir();
    const bad = validCoastalArchive();
    bad.dayCount = 99;
    fs.writeFileSync(path.join(dir, 'ih-coastal-warnings-archive.json'), JSON.stringify(bad));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/coastal-archive\.dayCount/);
  });

  it('falha quando windowDays excede a janela de 90 dias', () => {
    const dir = makeDataDir();
    const bad = validCoastalArchive();
    bad.windowDays = 91;
    fs.writeFileSync(path.join(dir, 'ih-coastal-warnings-archive.json'), JSON.stringify(bad));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/coastal-archive\.windowDays/);
  });

  it('falha quando um ref tem lastSeen anterior a firstSeen', () => {
    const dir = makeDataDir();
    const bad = validCoastalArchive();
    bad.refs[0].lastSeen = '2026-08-29';
    fs.writeFileSync(path.join(dir, 'ih-coastal-warnings-archive.json'), JSON.stringify(bad));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/coastal-archive\.refsShape/);
  });

  it('passa sem o ficheiro (histórico best-effort, só warning)', () => {
    const dir = makeDataDir();
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).toMatch(/ih-coastal-warnings-archive\.json missing/i);
  });
});

describe('validate-generated-data — auditoria de descrições pt/en (spots-index)', () => {
  const spot = (over) => ({
    slug: 'nazare',
    name: 'Nazaré',
    description: 'Praia da Nazaré com ondas gigantes no inverno.',
    descriptionEn: 'Nazaré beach with giant winter waves.',
    ...over,
  });
  const writeIndex = (dir, spotsArr) =>
    fs.writeFileSync(path.join(dir, 'spots-index.json'), JSON.stringify({ generatedAt: now(), spots: spotsArr }));

  it('aceita descrições pt/en válidas (sem checks desc.*)', () => {
    const dir = makeDataDir();
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/spots-index\.desc\./);
  });

  it('falha quando a EN é a descrição PT copiada sem traduzir', () => {
    const dir = makeDataDir();
    writeIndex(dir, [spot({ descriptionEn: 'Praia da Nazaré com ondas gigantes no inverno.' })]);
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/spots-index\.desc\.copy/);
    expect(out).toMatch(/copiada de description/);
  });

  it('falha quando falta a description ou a descriptionEn', () => {
    const dir = makeDataDir();
    writeIndex(dir, [spot({ descriptionEn: '' })]);
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/spots-index\.desc\.missing/);
    expect(out).toMatch(/descriptionEn vazia/);
  });

  it('falha quando a EN tem palavras portuguesas com acento fora da allowlist', () => {
    const dir = makeDataDir();
    writeIndex(dir, [spot({ descriptionEn: 'Nazaré beach with giant winter waves. Estacionamento fácil.' })]);
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/spots-index\.desc\.pt-words/);
    expect(out).toMatch(/"fácil"/);
  });

  it('aceita topónimos da allowlist na EN (ex. Nazaré)', () => {
    const dir = makeDataDir();
    writeIndex(dir, [spot({ descriptionEn: 'Nazaré beach, near São Martinho do Porto.' })]);
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/spots-index\.desc\./);
  });
});

describe('validate-generated-data — warnings.json TTL (segurança dos alertas)', () => {
  it('aceita um warnings.json fresco (fetchedAt recente)', () => {
    const dir = makeDataDir();
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/ttl\.warnings|warnings\.json missing/);
  });

  it('falha quando warnings.json está VELHO (>6h = dois ciclos de alerta)', () => {
    const dir = makeDataDir();
    const stale = new Date(Date.now() - 7 * 3_600_000).toISOString();
    fs.writeFileSync(path.join(dir, 'warnings.json'), JSON.stringify({
      source: 'ipma',
      fetchedAt: stale,
      warnings: [],
      spotWarnings: {},
    }));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/ttl\.warnings/);
    expect(out).toMatch(/evaluate-alerts correria sem avisos frescos/);
  });

  it('falha quando warnings.json está AUSENTE (alerta correria sem «Mar perigoso»)', () => {
    const dir = makeDataDir();
    fs.rmSync(path.join(dir, 'warnings.json'));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/warnings\.json missing/);
    expect(out).toMatch(/Mar perigoso/);
  });

  it('warnings.json com fetchedAt inválido também falha o TTL (sem falso positivo)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'warnings.json'), JSON.stringify({
      source: 'ipma',
      fetchedAt: 'not-a-date',
      warnings: [],
      spotWarnings: {},
    }));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/warnings\.fetchedAt/);
  });
});

describe('validate-generated-data — dependência de plataforma (pares por origem)', () => {
  const validSkill = (pairCountByOrigin) => ({
    fetchedAt: now(),
    forecasts: [],
    observations: [],
    pairs: [],
    stats: { me: 0.1, n: 50 },
    byOrigin: {},
    byBuoy: {},
    pairCountByOrigin,
    calibratedPairCount: 0,
    windowDays: 30,
    minPairs: 10,
    pairCount: Object.values(pairCountByOrigin).reduce((a, b) => a + b, 0),
    lastPairs: [],
    lastPairsByOrigin: {},
  });

  it('avisa no forecast-skill quando ≥80% dos pares vêm de UMA só origem (IH)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'forecast-skill.json'), JSON.stringify(
      validSkill({ ih: 95, 'wmo-pt': 0, 'wmo-es': 5 }),
    ));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).toMatch(/dependência de plataforma/);
    expect(out).toMatch(/95%/);
    expect(out).toMatch(/IH \(IH_API_KEY\)/);
  });

  it('avisa no forecast-skill também quando a origem dominante é a WMO-ES (keyless)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'forecast-skill.json'), JSON.stringify(
      validSkill({ ih: 3, 'wmo-pt': 0, 'wmo-es': 47 }),
    ));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).toMatch(/dependência de plataforma/);
    expect(out).toMatch(/WMO-ES \(Copernicus\)/);
  });

  it('não avisa com pares equilibrados entre duas plataformas', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'forecast-skill.json'), JSON.stringify(
      validSkill({ ih: 55, 'wmo-pt': 0, 'wmo-es': 45 }),
    ));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/dependência de plataforma/);
  });

  it('não avisa durante a acumulação (total abaixo do mínimo, stats ainda não estáveis)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'forecast-skill.json'), JSON.stringify(
      validSkill({ ih: 8, 'wmo-pt': 0, 'wmo-es': 1 }),
    ));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/dependência de plataforma/);
  });

  it('avisa no wave-bias quando todas as boias pertencem à mesma origem (wmo-es keyless)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'wave-bias.json'), JSON.stringify({
      fetchedAt: now(),
      buoys: {
        '6200084': { name: 'Cabo Silleiro', source: 'wmo-es', n: 40, me: -0.3 },
        '6201077': { name: 'Villano', source: 'wmo-es', n: 35 },
      },
      regions: { norte: { n: 75 } },
    }));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).toMatch(/dependência de plataforma/);
    expect(out).toMatch(/wave-bias/);
  });

  it('não avisa no wave-bias com IH e WMO-ES misturados (sem dependência)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'wave-bias.json'), JSON.stringify({
      fetchedAt: now(),
      buoys: {
        '1': { name: 'Leixões', source: 'ih', n: 40 },
        '6200084': { name: 'Cabo Silleiro', source: 'wmo-es', n: 30 },
      },
      regions: { norte: { n: 70 } },
    }));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/dependência de plataforma/);
  });
});

describe('validate-generated-data — par subóptimo na calibração ES→PT', () => {
  const validBuoyCoherence = (regions) => ({
    fetchedAt: now(),
    day: '20260814',
    pairs: [],
    overall: 'coherent',
    minAccumulatedPairs: 3,
    regions,
  });

  it('avisa quando uma região tem spots com par subóptimo (ref não é a PT mais próxima)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'buoy-coherence.json'), JSON.stringify(
      validBuoyCoherence({
        Algarve: {
          calibrated: 2,
          calibrationRefs: {
            '6200084→6201079': { esCode: '6200084', ptRefCode: '6201079', me: -0.9, n: 5, spots: ['faro', 'zavial'] },
          },
          suboptimalRefs: 1,
          suboptimal: [
            {
              spot: 'zavial',
              esCode: '6200084',
              ptRefCode: '6201079',
              ptRefKm: 95,
              nearestPtCode: '4',
              nearestPtName: 'Sines',
              nearestPtKm: 40,
            },
          ],
        },
      }),
    ));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0); // informativo — nunca bloqueia o deploy
    expect(out).toMatch(/par subóptimo/);
    expect(out).toMatch(/Algarve/);
    expect(out).toMatch(/zavial/);
    expect(out).toMatch(/Sines/);
  });

  it('não avisa quando todas as refs são a PT mais próxima (ou não há sub-óptimas)', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'buoy-coherence.json'), JSON.stringify(
      validBuoyCoherence({
        Algarve: {
          calibrated: 1,
          calibrationRefs: {
            '6200084→6201079': { esCode: '6200084', ptRefCode: '6201079', me: -0.9, n: 5, spots: ['faro'] },
          },
          suboptimalRefs: 0,
          suboptimal: [],
        },
      }),
    ));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/par subóptimo/);
  });
});

describe('validate-generated-data — map-hours.json', () => {
  const validHours = () => ({
    generatedAt: now(),
    stepHours: 3,
    times: Array.from({ length: 16 }, (_, i) => `2026-09-03T${String(8 + i * 3).padStart(2, '0')}:00`),
    sports: ['surf'],
    spots: { nazare: { best: Array(16).fill(40), surf: Array(16).fill(40) } },
  });

  it('aceita um map-hours.json válido em observations', () => {
    const dir = makeDataDir();
    fs.writeFileSync(path.join(dir, 'map-hours.json'), JSON.stringify(validHours()));
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).not.toMatch(/mapHours/);
  });

  it('falha quando a série de um spot não tem o mesmo comprimento que times', () => {
    const dir = makeDataDir();
    const file = validHours();
    file.spots.nazare.best = [1, 2, 3];
    fs.writeFileSync(path.join(dir, 'map-hours.json'), JSON.stringify(file));
    const { code, out } = runValidator(dir);
    expect(code).toBe(1);
    expect(out).toMatch(/mapHours.series/);
  });

  it('avisa (não falha) quando falta o ficheiro em observations', () => {
    const dir = makeDataDir();
    const { code, out } = runValidator(dir);
    expect(code).toBe(0);
    expect(out).toMatch(/map-hours.json missing/);
  });
});