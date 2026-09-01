/**
 * Verify IH buoy layer after fetch-ih-buoys.js — fails the job when IH_API_KEY
 * is configured but the produced data lacks the observed-wave layer.
 *
 * Enforced checks (only meaningful WITH a key — the workflow skips this step
 * without one, so the current keyless setup never false-fails):
 *   1. `hasWaveData === true` — the keyed run must have produced wave rows
 *      (hm0/tp/thtp/hmax/temp from getDatawellData).
 *   2. The Fugro 2 buoy (Nazaré Costeira, idEst 2, family 'fugro') carries a
 *      `latest` reading — the Costa de Prata observedWave depends on it (36
 *      spots mapped). If getDatawellData serves only the Datawell family,
 *      this step fails loudly instead of silently shipping spots without
 *      observed wave (docs/IH_API_KEY.md «Verificar a família Fugro»).
 *   3. With the key ACTIVE (`hasWaveData === true`), the main Datawell coastal
 *      buoys — Leixões (4), Sines (19), Faro (20) — also get a fresh reading,
 *      not just the Fugro 2. In a keyless run these are gated off (they have no
 *      `latest`), so the current keyless setup never false-fails on them.
 *
 * Exit 0 = OK · exit 1 = ::error:: com diagnóstico (o job falha no passo).
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH =
  process.env.IH_BUOY_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/ih-buoys.json');

/** Estação Fugro esperada: Nazaré Costeira (idEst 2, CSA88/2, WMO 6200199). */
const FUGRO_2_KEY = '2';
const FUGRO_2_FAMILY = 'fugro';

/** Boias Datawell costeiras de Portugal continental (validadas quando key activa). */
const DATAWELL_FAMILY = 'datawell';
const DATAWELL_COASTAL_BUOYS = [
  { key: '4', name: 'Leixões (CSA92/D)' },
  { key: '19', name: 'Sines (CSA83/1D)' },
  { key: '20', name: 'Faro (CSA82/D)' },
];

/**
 * Pure: verifica a camada de boias IH num payload de ih-buoys.json.
 * @param {object | null | undefined} data
 * @returns {{ ok: boolean, problems: string[], fugro2: object | null,
 *            datawell: Array<{ key: string, name: string, ok: boolean,
 *                              reason?: string, station?: object }> }}
 */
function verifyIhBuoyLayer(data) {
  const problems = [];
  if (data?.hasWaveData !== true) {
    problems.push(
      `hasWaveData=${String(data?.hasWaveData)} — a key não produziu séries de onda (esperado true). ` +
        'Diagnóstico: fetch-ih-buoys.js com IH_API_KEY e a API a devolver leituras.',
    );
  }

  const fugro2 = data?.stations?.[FUGRO_2_KEY] ?? null;
  if (!fugro2) {
    problems.push(
      `Estação ${FUGRO_2_KEY} (Nazaré Costeira) não está catalogada em ih-buoys.json.`,
    );
  } else {
    if (fugro2.family !== FUGRO_2_FAMILY) {
      problems.push(
        `Estação ${FUGRO_2_KEY} tem family '${fugro2.family}' (esperado '${FUGRO_2_FAMILY}' — Nazaré Costeira).`,
      );
    }
    const latest = fugro2.latest;
    if (!latest || typeof latest !== 'object' || !Number.isFinite(Number(latest.hm0))) {
      problems.push(
        `Boia Fugro ${FUGRO_2_KEY} (${fugro2.name ?? '?'}, ${fugro2.area ?? '?'}) sem leitura fresca (latest) — ` +
          'getDatawellData não devolveu séries desta boia. Se a API servir só a família Datawell, ' +
          'a fallback WMO ES (Cabo Silleiro) cobre o NW — ver docs/IH_API_KEY.md.',
      );
    }
  }

  // Com a key ACTIVA, as boias Datawell costeiras têm de ter leitura também —
  // não só a Fugro 2. Keyless (hasWaveData false) não as valida (não têm latest).
  const datawell = [];
  if (data?.hasWaveData === true) {
    for (const { key, name } of DATAWELL_COASTAL_BUOYS) {
      const st = data.stations?.[key] ?? null;
      if (!st) {
        problems.push(`Boia Datawell ${name} (estação ${key}) não está catalogada em ih-buoys.json.`);
        datawell.push({ key, name, ok: false, reason: 'missing' });
        continue;
      }
      if (st.family !== DATAWELL_FAMILY) {
        problems.push(
          `Estação ${key} (${name}) tem family '${st.family}' (esperado '${DATAWELL_FAMILY}').`,
        );
        datawell.push({ key, name, station: st, ok: false, reason: `family '${st.family}'` });
        continue;
      }
      const latest = st.latest;
      const okLatest =
        latest && typeof latest === 'object' && Number.isFinite(Number(latest.hm0));
      if (!okLatest) {
        problems.push(
          `Boia Datawell ${name} (estação ${key}) sem leitura fresca (latest) — ` +
            'getDatawellData não devolveu séries desta boia.',
        );
        datawell.push({ key, name, station: st, ok: false, reason: 'no-latest' });
      } else {
        datawell.push({ key, name, station: st, ok: true });
      }
    }
  }

  return { ok: problems.length === 0, problems, fugro2, datawell };
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch (err) {
    console.error(`::error::ih-buoys.json ilegível: ${err.message}`);
    process.exit(1);
  }

  const { ok, problems, fugro2, datawell } = verifyIhBuoyLayer(data);
  if (!ok) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }

  const latest = fugro2.latest;
  const datawellLine =
    datawell.length > 0
      ? ` · Datawell ${datawell
          .map((d) => `${d.name} hm0 ${d.station?.latest?.hm0 ?? '?'} m`)
          .join(' / ')}`
      : '';
  console.log(
    `✅ IH buoy layer OK — hasWaveData: true · Fugro 2 (${fugro2.name}, ${fugro2.area}) ` +
      `com leitura: hm0 ${latest.hm0} m · tp ${latest.tp ?? '?'} s @ ${latest.date ?? '?'}${datawellLine}`,
  );
}

// Só corre como CLI; nos testes importa-se a função pura verifyIhBuoyLayer.
if (require.main === module) {
  main();
}

module.exports = {
  verifyIhBuoyLayer,
  FUGRO_2_KEY,
  FUGRO_2_FAMILY,
  DATAWELL_FAMILY,
  DATAWELL_COASTAL_BUOYS,
  main,
};
