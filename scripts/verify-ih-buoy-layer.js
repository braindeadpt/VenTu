/**
 * Verify IH buoy layer after fetch-ih-buoys.js — fails the job when IH_API_KEY
 * is configured but the produced data lacks the observed-wave layer.
 *
 * Contract (validated on 2026-09-02 with the real IH_API_KEY):
 *   - `getDatawellData` serves ONLY the Datawell Waverider family. The Fugro
 *     stations 2 (CSA88/2, Nazaré Costeira), 1010 (ZLT1) and 1011 (ZLT2)
 *     return an EMPTY set on a 48 h window — no HTTP error, no 401/403 — even
 *     though the keyless OGC API `buoys_Fugro_oceanor_wavescan/items` shows
 *     all three with last_data = 2026-09-02T11:00 (live stations, no NRT gap).
 *     Live stations + empty series = the endpoint does not cover this family.
 *   - The Datawell coastal buoys Leixões (4, CSA92/D), Sines (19, CSA83/1D),
 *     Faro (20, CSA82/D) and Caniçal (33, CSA94) all returned fresh readings
 *     (≤ 2 h) in the same run.
 *
 * Therefore:
 *   1. FAIL (exit 1) when `hasWaveData !== true` — the keyed run produced no
 *      wave rows at all (the honest "the layer is down" signal).
 *   2. FAIL (exit 1) when EVERY Datawell coastal buoy (4/19/20/33) lacks a
 *      fresh `latest` reading — same signal, from a keyed run that has no
 *      working station. Individual buoys drop out of service naturally (in
 *      the same collection BOND1–6 have last_data between 2022 and 2025), so
 *      requiring all four simultaneously would repeat the original defect: a
 *      maintenance stop in Faro stalls production on third-party data.
 *   3. WARNING (never fails) for the Fugro 2 buoy while it has no `latest` —
 *      so that IF IH ever starts serving the Fugro family through
 *      `getDatawellData`, it is noticed instead of silently accepted. Same for
 *      any individual Datawell station that is missing, has a wrong family or
 *      lacks a fresh reading.
 *
 * Exit 0 = OK · exit 1 = ::error:: com diagnóstico (o job falha no passo).
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH =
  process.env.IH_BUOY_OUTPUT_PATH ||
  path.join(__dirname, '../public/data/ih-buoys.json');

/**
 * Estação Fugro: Nazaré Costeira (idEst 2, CSA88/2, WMO 6200199). Já não faz
 * falhar (ver intro — `getDatawellData` não serve a família Fugro, provado em
 * 2026-09-02: séries vazias em 48 h com as estações vivas na OGC keyless).
 * Fica como AVISO para detectar uma eventual cobertura futura.
 */
const FUGRO_2_KEY = '2';
const FUGRO_2_FAMILY = 'fugro';

/**
 * Boias Datawell da costa continental + Madeira — o contrato real da camada.
 * FALHA só se NENHUMA estiver fresca; cada uma em falta é AVISO.
 */
const DATAWELL_FAMILY = 'datawell';
const DATAWELL_COASTAL_BUOYS = [
  { key: '4', name: 'Leixões (CSA92/D)' },
  { key: '19', name: 'Sines (CSA83/1D)' },
  { key: '20', name: 'Faro (CSA82/D)' },
  { key: '33', name: 'Caniçal (CSA94)' },
];

/**
 * Pure: verifica a camada de boias IH num payload de ih-buoys.json.
 * @param {object | null | undefined} data
 * @returns {{ ok: boolean, problems: string[], warnings: string[],
 *            fugro2: object | null, datawell: Array<{ key: string, name: string,
 *              ok: boolean, reason?: string, station?: object }>,
 *            freshDatawell: Array<{ key: string, name: string }> }}
 */
function verifyIhBuoyLayer(data) {
  const problems = [];
  const warnings = [];

  if (data?.hasWaveData !== true) {
    problems.push(
      `hasWaveData=${String(data?.hasWaveData)} — a key não produziu séries de onda (esperado true). ` +
        'Diagnóstico: fetch-ih-buoys.js com IH_API_KEY e a API a devolver leituras.',
    );
  }

  // Sinais só fazem sentido com a key activa (sem key não há séries para exigir);
  // com key, um payload sem `stations` conta como "nenhuma boia fresca" (falha).
  if (data?.hasWaveData === true) {
    const stMap = data.stations ?? {};
    const freshDatawell = [];

    // Família Fugro — AVISO, nunca falha (getDatawellData não a serve; 2026-09-02).
    const fugro2 = stMap[FUGRO_2_KEY] ?? null;
    if (!fugro2) {
      warnings.push(
        `AVISO Fugro: estação ${FUGRO_2_KEY} (Nazaré Costeira) não está catalogada. ` +
          'getDatawellData não serve a família Fugro (provado 2026-09-02: séries vazias ' +
          'em 48 h com as estações vivas na OGC keyless) — se passar a servir, este aviso ' +
          'some e a camada volta a cobrir a Costa de Prata.',
      );
    } else {
      if (fugro2.family !== FUGRO_2_FAMILY) {
        warnings.push(
          `AVISO Fugro: estação ${FUGRO_2_KEY} tem family '${fugro2.family}' (esperado '${FUGRO_2_FAMILY}').`,
        );
      }
      const latest = fugro2.latest;
      if (!latest || typeof latest !== 'object' || !Number.isFinite(Number(latest.hm0))) {
        warnings.push(
          `AVISO Fugro: boia ${FUGRO_2_KEY} (${fugro2.name ?? '?'}, ${fugro2.area ?? '?'}) sem leitura ` +
            '(latest) — esperado: getDatawellData não devolve séries da família Fugro ' +
            '(2026-09-02, estações 2/1010/1011 vivas na OGC keyless mas com série vazia em 48 h). ' +
            'A Costa de Prata fica sem observedWave de origem IH; a fallback WMO ES cobre ' +
            'os spots do NW dentro do alcance — ver docs/IH_API_KEY.md.',
        );
      }
    }

    // Boias Datawell costeiras: ≥ 1 fresca obrigatória; cada uma em falta é aviso.
    for (const { key, name } of DATAWELL_COASTAL_BUOYS) {
      const st = stMap[key] ?? null;
      if (!st) {
        warnings.push(
          `AVISO Datawell: boia ${name} (estação ${key}) não está catalogada em ih-buoys.json.`,
        );
        continue;
      }
      if (st.family !== DATAWELL_FAMILY) {
        warnings.push(
          `AVISO Datawell: estação ${key} (${name}) tem family '${st.family}' (esperado '${DATAWELL_FAMILY}').`,
        );
        continue;
      }
      const latest = st.latest;
      const okLatest = latest && typeof latest === 'object' && Number.isFinite(Number(latest.hm0));
      if (!okLatest) {
        warnings.push(
          `AVISO Datawell: boia ${name} (estação ${key}) sem leitura fresca (latest).`,
        );
      } else {
        freshDatawell.push({ key, name });
      }
    }

    if (freshDatawell.length === 0) {
      problems.push(
        'Nenhuma boia Datawell costeira (Leixões 4, Sines 19, Faro 20, Caniçal 33) tem leitura ' +
          'fresca (latest) com a key activa — a camada observedWave não está a funcionar.',
      );
    }
  }

  const datawell = DATAWELL_COASTAL_BUOYS.map(({ key, name }) => {
    const st = data?.stations?.[key] ?? null;
    const okLatest =
      st && st.latest && typeof st.latest === 'object' && Number.isFinite(Number(st.latest.hm0));
    return { key, name, ok: Boolean(okLatest), reason: okLatest ? undefined : 'no-latest', station: st };
  });

  return {
    ok: problems.length === 0,
    problems,
    warnings,
    fugro2: data?.stations?.[FUGRO_2_KEY] ?? null,
    datawell,
    freshDatawell:
      data?.hasWaveData === true
        ? datawell.filter((d) => d.ok).map(({ key, name }) => ({ key, name }))
        : [],
  };
}

function main() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch (err) {
    console.error(`::error::ih-buoys.json ilegível: ${err.message}`);
    process.exit(1);
  }

  const { ok, problems, warnings, fugro2, freshDatawell } = verifyIhBuoyLayer(data);
  if (!ok) {
    for (const p of problems) console.error(`::error::${p}`);
    process.exit(1);
  }

  for (const w of warnings) console.warn(`::warning::${w}`);

  const freshLine =
    freshDatawell.length > 0
      ? ` · Datawell frescas: ${freshDatawell.map((d) => d.name).join(' / ')}`
      : ' · nenhuma Datawell fresca';
  const fugroLatest = fugro2?.latest;
  const fugroLine =
    fugroLatest && Number.isFinite(Number(fugroLatest.hm0))
      ? ` · Fugro 2 (${fugro2.name}, ${fugro2.area}) fresca: hm0 ${fugroLatest.hm0} m @ ${fugroLatest.date ?? '?'}`
      : ' · Fugro 2 sem leitura (esperado — família não servida por getDatawellData)';
  console.log(`✅ IH buoy layer OK — hasWaveData: true${freshLine}${fugroLine}`);
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
