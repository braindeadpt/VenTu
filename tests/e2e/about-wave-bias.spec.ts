import { test, expect } from '@playwright/test';
import { interceptData, interceptWaveBias } from './helpers/conditions';

/**
 * Secção de calibração do About — viés por boia (ondas).
 *
 * A secção é CLIENTE de propósito (WaveBiasSection busca wave-bias.json em
 * runtime, como o radar), por isso é possível alterná-la de forma determinística
 * interceptando o ficheiro — o About é estático (SSG), logo o HTML baked a
 * build não seria testável via page.route.
 *
 * Casos:
 *  1. wave-bias.json com boias ES (e IH) → tabela com a origem e stats.
 *  2. ficheiro em falta / 404 → a secção não aparece.
 */
const ES_BUOYS = {
  fetchedAt: '2026-08-15T06:00:00.000Z',
  buoys: {
    '6200085': { name: 'Golfo de Cádiz', area: 'Golfo de Cádiz', source: 'wmo-es', n: 38, me: -0.12, mae: 0.34, rmse: 0.41, corr: 0.93 },
    '6200084': { name: 'Cabo Silleiro', area: 'Galiza', source: 'wmo-es', n: 40, me: 0.28, mae: 0.4, rmse: 0.52, corr: 0.91 },
    // Boia IH (Datawell) — presente quando a IH_API_KEY está configurada.
    '4': { name: 'Leixões', area: 'Norte', source: 'ih', n: 45, me: 0.1, mae: 0.3, rmse: 0.4 },
  },
};

const SKILL = {
  fetchedAt: '2026-08-15T06:00:00.000Z',
  pairCount: 82,
  byOrigin: {
    ih: { n: 45, me: 0.1 },
    'wmo-es': { n: 37, me: -0.15 },
  },
  byBuoy: {
    // key por id — o mesmo id que o wave-bias usa no `code` (Cabo Silleiro).
    '6200084': { buoyName: 'Cabo Silleiro', n: 37, me: -0.15, mae: 0.4, rmse: 0.5, origin: 'wmo-es' },
    // Leixões (IH, idEst 4) sem skill ainda → «—» nas colunas Skill.
  },
};

// Referência PT escolhida por região na calibração ES→PT (buoy-coherence.json,
// bloco regions[region].calibrationRefs escrito pelo merge-observations).
const COHERENCE_REFS = {
  day: '20260815',
  fetchedAt: '2026-08-15T06:00:00.000Z',
  regions: {
    'Costa de Prata': {
      spotCount: 3,
      calibrationRefs: {
        '6200084→19': {
          esCode: '6200084',
          esName: 'Cabo Silleiro',
          ptRefCode: '19',
          ptRefName: 'Leixões',
          ptRefArea: 'Norte',
          pair: '6200084×19',
          me: -0.9,
          n: 23,
          spots: ['nazare', 'baleal'],
        },
      },
    },
    Algarve: {
      spotCount: 2,
      calibrationRefs: {
        '6200084→6201079': {
          esCode: '6200084',
          esName: 'Cabo Silleiro',
          ptRefCode: '6201079',
          ptRefName: 'Faro',
          ptRefArea: 'Algarve',
          pair: '6200084×6201079',
          me: -0.4,
          n: 12,
          spots: [],
        },
      },
      // Auditoria de par subóptimo: zavial calibrado com Faro (95 km) quando a
      // estação IH Sines (4) está a 40 km — o aviso aparece junto das refs.
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
  },
};

test.describe('About — secção de viés por boia (ondas)', () => {
  test.use({ serviceWorkers: 'block' });

  test('mostra a tabela quando o wave-bias.json tem boias ES (e IH)', async ({ page }) => {
    await interceptWaveBias(page, ES_BUOYS);
    await interceptData(page, 'forecast-skill.json', SKILL);
    await interceptData(page, 'buoy-coherence.json', COHERENCE_REFS);

    await page.goto('/pt/about/', { waitUntil: 'networkidle', timeout: 60_000 });

    const section = page.locator('[data-wave-bias-section="true"]');
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(section).toContainText('Calibração — viés por boia (ondas)');

    // Coluna Origem + linhas por boia (IH e ES com stats correctas).
    const table = section.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table).toContainText('Cabo Silleiro');
    await expect(table).toContainText('Golfo de Cádiz');
    await expect(table).toContainText('Leixões');
    await expect(table).toContainText('Origem'); // coluna de origem (pt)
    // Origem por linha.
    await expect(table).toContainText('WMO-ES');
    await expect(table).toContainText('IH');

    // Rodapé com contagem por plataforma.
    await expect(section).toContainText('ES 2');
    await expect(section).toContainText('IH 1');

    // Colunas de skill real (forecast-skill) por boia — Silleiro tem, Leixões não.
    const silleiro = table.getByRole('row', { name: /Cabo Silleiro/ });
    await expect(silleiro).toContainText('-0.15'); // skill ME
    await expect(silleiro).toContainText('37'); // skill n
    const leixoes = table.getByRole('row', { name: /Leixões/ });
    // Sem skill para Leixões → colunas de skill vazias («—»).
    await expect(leixoes).not.toContainText('-0.15'); // não herda o skill do Silleiro

    // Referência PT da calibração ES→PT por região (buoy-coherence.json), junto
    // da tabela: Silleiro → Leixões na Costa de Prata e Silleiro → Faro no
    // Algarve, com o ME/n do par que recalibrou.
    const refs = section.locator('[data-coherence-refs="true"]');
    await expect(refs).toBeVisible();
    await expect(refs).toContainText('Referência PT da calibração ES→PT (por região)');
    await expect(refs).toContainText('Costa de Prata');
    await expect(refs).toContainText('Cabo Silleiro → Leixões');
    await expect(refs).toContainText('ME -0.90 m · n=23');
    await expect(refs).toContainText('Algarve');
    await expect(refs).toContainText('Cabo Silleiro → Faro');
    await expect(refs).toContainText('ME -0.40 m · n=12');

    // Par subóptimo assinalado dentro da região: ref Faro a 95 km vs Sines a
    // 40 km (auditoria de par — a calibração só usa WMO-PT, uma IH pode estar
    // mais perto).
    const suboptimal = section.locator('[data-coherence-suboptimal="true"]');
    await expect(suboptimal).toBeVisible();
    await expect(suboptimal).toContainText('Par subóptimo em 1 spot(s)');
    await expect(suboptimal).toContainText('zavial: 6201079 a 95 km');
    await expect(suboptimal).toContainText('Sines a 40 km');
  });

  test('leitura das refs PT em EN (labels e par subóptimo traduzidos, sem resíduo pt)', async ({ page }) => {
    // A mesma injecção do teste PT mas em /en/about/: a leitura do
    // buoy-coherence.json tem de renderizar a cadeia EN — a linha do par
    // subóptimo já apanhou um resíduo pt («mais próxima») num estado anterior.
    await interceptWaveBias(page, ES_BUOYS);
    await interceptData(page, 'forecast-skill.json', SKILL);
    await interceptData(page, 'buoy-coherence.json', COHERENCE_REFS);

    await page.goto('/en/about/', { waitUntil: 'networkidle', timeout: 60_000 });

    const section = page.locator('[data-wave-bias-section="true"]');
    await expect(section).toBeVisible({ timeout: 15_000 });
    const refs = section.locator('[data-coherence-refs="true"]');
    await expect(refs).toBeVisible();
    await expect(refs).toContainText('ES→PT calibration — PT reference (per region)');
    await expect(refs).toContainText('Cabo Silleiro → Leixões');
    await expect(refs).toContainText('ME -0.90 m · n=23');
    await expect(refs).toContainText('Cabo Silleiro → Faro');

    // Par subóptimo em EN — sem resíduo português na linha do spot.
    const suboptimal = section.locator('[data-coherence-suboptimal="true"]');
    await expect(suboptimal).toBeVisible();
    await expect(suboptimal).toContainText('Suboptimal pair in 1 spot(s)');
    await expect(suboptimal).toContainText('zavial: 6201079 at 95 km');
    await expect(suboptimal).toContainText('Sines at 40 km');
    await expect(suboptimal).not.toContainText('mais próxima');
  });

  test('bloco de referências PT não aparece sem calibrationRefs no buoy-coherence.json', async ({ page }) => {
    await interceptWaveBias(page, ES_BUOYS);
    await interceptData(page, 'forecast-skill.json', SKILL);
    // Ficheiro presente mas sem refs de calibração (dia sem calibração ES→PT).
    await interceptData(page, 'buoy-coherence.json', {
      day: '20260815',
      fetchedAt: '2026-08-15T06:00:00.000Z',
      regions: { 'Costa de Prata': { calibrationRefs: {} } },
    });

    await page.goto('/pt/about/', { waitUntil: 'networkidle', timeout: 60_000 });

    const section = page.locator('[data-wave-bias-section="true"]');
    await expect(section).toBeVisible({ timeout: 15_000 });
    await expect(section.locator('[data-coherence-refs="true"]')).toHaveCount(0);
  });

  test('secção de skill real mostra país/fonte e a cobertura do NW sem IH_API_KEY', async ({
    page,
  }) => {
    // A secção de skill do About é SSG (lê forecast-skill.json em build time),
    // por isso não dá para a alternar via page.route — o HTML baked é que manda.
    // Gate honesto: só valida quando o build já tem uma boia ES com skill (a
    // rota keyless da Copernicus). O CI (sem forecast-skill.json / buoys) salta;
    // local: injectar public/data/forecast-skill.json com a byBuoy ES + `npm run build`
    // (recipe do fixture, como o write-wave-bias-fixture).
    await page.goto('/pt/about/', { waitUntil: 'networkidle', timeout: 60_000 });

    const silleiroCell = page.locator('[data-skill-buoy-origin="wmo-es"]');
    if ((await page.locator('[data-skill-buoy-origin]').count()) === 0) {
      test.skip(true, 'build sem boias ES no skill (About é SSG) — injetar forecast-skill.json + build');
      return;
    }

    // País/fonte explícito na linha da boia ES — não só um código enigmático.
    await expect(silleiroCell).toBeVisible();
    await expect(silleiroCell).toHaveText('Copernicus-ES');
    await expect(silleiroCell).toHaveAttribute('title', /Copernicus-ES · Espanha/);

    // Nota honesta: o NW é coberto sem IH_API_KEY.
    await expect(
      page.getByText(/O Noroeste é coberto pelas boias espanholas \(Copernicus-ES\)/),
    ).toBeVisible();
  });

  test('a secção não aparece quando o ficheiro falta (404)', async ({ page }) => {
    await interceptData(page, 'wave-bias.json', {}, { status: 404 });
    await interceptData(page, 'forecast-skill.json', {}, { status: 404 });
    await interceptData(page, 'buoy-coherence.json', {}, { status: 404 });

    await page.goto('/pt/about/', { waitUntil: 'networkidle', timeout: 60_000 });
    await page.waitForTimeout(1500); // deixa o fetch resolver → sem dados

    await expect(page.locator('[data-wave-bias-section="true"]')).toHaveCount(0);
    await expect(page.getByText('Calibração — viés por boia (ondas)')).toHaveCount(0);
  });
});