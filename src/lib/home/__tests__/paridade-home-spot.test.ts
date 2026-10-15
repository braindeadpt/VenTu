/**
 * Paridade de notas home ↔ página de spot (#183, critério de aceitação):
 * para o mesmo spot, modalidade e hora, a nota que a home usa no ranking é a
 * da página de spot. Mínimo: Guincho, Nazaré, Lagoa de Albufeira e um do
 * Algarve (Meia Praia = `lagos`), kite e surf, todas as horas dos blocos de
 * hoje e amanhã. 0 diferenças.
 *
 * As linhas do forecast são as da maquete (docs/design/maquetes/v6-atlantico,
 * `<script id="dados">`) escritas no formato do pipeline (m/s, maré ao nível
 * médio), e passam pelos DOIS caminhos reais: o da home (`cortarLinhas` +
 * `montarCosta`) e o do spot (`construirHoras`, com o «agora» de cada hora,
 * como a régua do spot a escolhe).
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { montarCosta } from '@/lib/home/dadosHome';
import { costaCompacta, metaCosta, serieDe } from '@/lib/home/dadosHomeServidor';
import { criarModelo } from '@/lib/home/homeV6';
import { construirHoras, NIVEL_MEDIO_ZH, type LinhaForecast } from '@/lib/horaSpot';
import { avaliaHoras } from '@/lib/modalidades';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { spots as TODOS } from '@/lib/spots';
import { COSTA_V6 } from '@/lib/home/homeV6';

const RAIZ = path.resolve(__dirname, '../../../..');
const html = fs.readFileSync(path.join(RAIZ, 'docs/design/maquetes/v6-atlantico/index.html'), 'utf8');
const D = JSON.parse(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]);
const KT = 1.94384;
const T0 = D.meta.inicio as string;
const tDe = (i: number) => new Date(Date.UTC(+T0.slice(0, 4), +T0.slice(5, 7) - 1, +T0.slice(8, 10), i)).toISOString().slice(0, 16);

/** Linhas do pipeline a partir das horas da maquete. */
function linhasDe(m: { h: Record<string, number[]> }): LinhaForecast[] {
  return m.h.w.map((_, i) => ({
    time: tDe(i),
    windSpeed: m.h.w[i] / KT,
    windGust: m.h.g[i] / KT,
    windDirection: m.h.wd[i],
    waveHeight: m.h.hs[i],
    wavePeriod: m.h.tp[i],
    waveDirection: m.h.sd[i],
    tideHeight: m.h.tide[i] - NIVEL_MEDIO_ZH,
    precipitation: m.h.rain[i],
    cloudCover: m.h.cloud[i],
  }));
}
const FORECASTS: Record<string, LinhaForecast[]> = {};
for (const c of COSTA_V6.spots) {
  const m = D.spots.find((s: { id: string }) => s.id === c.maqueteId);
  FORECASTS[serieDe(c.id)] = linhasDe(m);
}
/** «agora» da maquete: qua 14 out 14h em Lisboa (WEST, UTC+1). */
const AGORA = Date.parse('2026-10-14T13:00:00Z');
const msDe = (t: string) => Date.parse(t + ':00Z') - 3600e3;

describe('home ↔ spot: a mesma nota para o mesmo spot, modalidade e hora', () => {
  const { spots, agoraI } = montarCosta(costaCompacta(FORECASTS as never, AGORA), AGORA, metaCosta());
  const M = criarModelo(spots);
  const BL = M.blocos(agoraI).filter((b) => !b.passado);

  it('a home monta os 19 spots com hoje e amanhã (48 h) e o «agora» às 14h', () => {
    expect(spots).toHaveLength(19);
    expect(spots[0].h).toHaveLength(48);
    expect(M.t(agoraI)).toBe('2026-10-14T14:00');
    expect(BL.map((b) => b.id)).toEqual(['0-tarde', '0-fim', '1-manha', '1-tarde', '1-fim']);
  });

  for (const id of ['guincho', 'nazare', 'lagoa-albufeira', 'lagos'])
    for (const d of ['kite', 'surf'] as const)
      it(`${id} · ${d}: todas as horas dos blocos de hoje e amanhã`, () => {
        const s = spots.find((x) => x.id === id)!;
        const spot = TODOS.find((x) => x.id === id)!;
        const ed = editorialDe(spot);
        const NS = M.notas(d)[id];
        const difs: string[] = [];
        let n = 0;
        for (const b of BL)
          for (let i = b.atual ? agoraI : b.a; i <= b.z; i++) {
            const t = s.h[i].t;
            // a página do spot aberta a essa hora: a hora 0 da régua é «agora»
            const dados = construirHoras(FORECASTS[serieDe(id)], { lat: spot.lat, lon: spot.lon, praiaVirada: ed.praiaVirada }, msDe(t));
            expect(dados.horas[0].t).toBe(t);
            const r = avaliaHoras(spotModalidadeDe(ed), d, dados.horas)[0];
            if (r.n !== NS[i]) difs.push(`${t}: home ${NS[i]} ≠ spot ${r.n}`);
            // o mesmo objecto da hora (a temperatura da água e do ar não entram na home)
            const { agua: _a, ar: _r, ...h0 } = dados.horas[0];
            expect(h0).toEqual(s.h[i]);
            n++;
          }
        expect(n).toBe(18); // hoje 14–16h e 17–19h, amanhã 8–12h, 13–16h e 17–19h
        expect(difs).toEqual([]);
      });

  it('pelo caminho real (forecast → horas → motor), o ranking e as frases são os da maquete (nucleo.js)', () => {
    const req = createRequire(import.meta.url);
    const Nucleo = req(path.join(RAIZ, 'docs/design/maquetes/home/fontes/nucleo.js'));
    const Mm = Nucleo.Modelo(D);
    const MAPA: Record<string, string> = { viana: 'cabedelo', 'lagoa-obidos': 'obidos-lagoon', caparica: 'costa-caparica', 'meia-praia': 'lagos' };
    const difs: string[] = [];
    Mm.blocos(agoraI).forEach((bm: { id: string; passado: boolean }, k: number) => {
      if (bm.passado) return;
      const bt = M.blocos(agoraI)[k];
      for (const d of ['kite', 'surf'] as const) {
        const a = Mm.ranking(d, bm, agoraI).map((r: { sp: { id: string }; n: number | null }) => `${MAPA[r.sp.id] ?? r.sp.id}:${r.n}`).join(' ');
        const b = M.ranking(d, bt, agoraI).map((r) => `${r.sp.id}:${r.n}`).join(' ');
        if (a !== b) difs.push(`${d} ${bm.id}: ${a} ≠ ${b}`);
        const fa = Mm.nacional(d, bm, agoraI).txt.replace(/<[^>]+>/g, '');
        const fb = M.nacional(d, bt, agoraI).txt.replace(/<[^>]+>/g, '');
        if (fa !== fb) difs.push(`${d} ${bm.id}: «${fa}» ≠ «${fb}»`);
      }
    });
    expect(difs).toEqual([]);
  });

  it('o ranking da home usa estas notas (nº 1 de cada bloco = a nota do spot à hora escolhida)', () => {
    for (const d of ['kite', 'surf'] as const)
      for (const b of BL) {
        const r = M.ranking(d, b, agoraI)[0];
        expect(r.n).toBe(M.notas(d)[r.sp.id][r.i]);
      }
  });
});
