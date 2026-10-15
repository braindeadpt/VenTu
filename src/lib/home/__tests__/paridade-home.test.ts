/**
 * Paridade do motor da home (#183) com a maquete v6 aprovada.
 *
 * Referência: o `nucleo.js` original da maquete (docs/design/maquetes/home/fontes)
 * a correr sobre os dados embutidos em docs/design/maquetes/v6-atlantico/index.html
 * (`<script id="dados">`, 19 spots × 62 h, «agora» = qua 14 out 14h).
 * Para kite e surf × cada bloco de hoje e amanhã: ranking completo (ids e notas),
 * frase nacional e as duas linhas do nº 1–3 — 0 diferenças.
 *
 * Também: a costa da home = a da maquete (mesmos spots, mesma praia para o
 * motor que a página de spot lê de `spotEditorial`), e «lista única»: o nº 1 da
 * lista = o melhor da régua = a foto do hero, e os três da lista = os três rótulos.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { criarModelo, COSTA_V6, textoFrase, type SpotHome } from '@/lib/home/homeV6';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { spots as TODOS } from '@/lib/spots';
import { avaliaHoras, type HoraModalidade } from '@/lib/modalidades';
import { estadoHome } from '@/lib/home/estadoHome';
import type { HoraSpot } from '@/lib/horaSpot';

const req = createRequire(import.meta.url);
const RAIZ = path.resolve(__dirname, '../../../..');
const Nucleo = req(path.join(RAIZ, 'docs/design/maquetes/home/fontes/nucleo.js'));
const html = fs.readFileSync(path.join(RAIZ, 'docs/design/maquetes/v6-atlantico/index.html'), 'utf8');
const D = JSON.parse(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]);

type MSpot = {
  id: string;
  lat: number;
  lon: number;
  praiaVirada: number;
  surf: { janela: [number, number]; tol: number };
  aguaPlana: boolean;
  h: Record<string, unknown[]>;
};
const MAPA_IDS: Record<string, string> = { viana: 'cabedelo', 'lagoa-obidos': 'obidos-lagoon', caparica: 'costa-caparica', 'meia-praia': 'lagos' };
const NH = D.spots[0].h.w.length as number;
const T0 = D.meta.inicio as string;
const tDe = (i: number) => {
  const d = new Date(Date.UTC(+T0.slice(0, 4), +T0.slice(5, 7) - 1, +T0.slice(8, 10), i));
  return d.toISOString().slice(0, 16);
};
const horasDe = (sp: MSpot): HoraSpot[] =>
  Array.from({ length: NH }, (_, i) => {
    const o: Record<string, unknown> = { t: tDe(i) };
    for (const k of Object.keys(sp.h)) o[k] = sp.h[k][i];
    return o as unknown as HoraSpot;
  });
/** A costa da home com as horas da maquete (o objecto da hora tal como a maquete o tem). */
const SPOTS: SpotHome[] = COSTA_V6.spots.map((c) => {
  const m = (D.spots as MSpot[]).find((s) => s.id === c.maqueteId)!;
  const site = TODOS.find((s) => s.id === c.id)!;
  return { ...c, lat: site.lat, lon: site.lon, sp: spotModalidadeDe(editorialDe(site)), h: horasDe(m) };
});
const agoraI = Math.round((Date.parse(D.meta.agora + ':00Z') - Date.parse(T0 + ':00Z')) / 36e5);
const txt = (s: string) => textoFrase(s).replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

describe('home v6: a costa é a da maquete', () => {
  it('os mesmos 19 spots, de norte a sul, com os ids do site', () => {
    expect(COSTA_V6.spots.map((s) => s.maqueteId)).toEqual(D.spots.map((s: MSpot) => s.id));
    for (const c of COSTA_V6.spots) expect(MAPA_IDS[c.maqueteId] ?? c.maqueteId).toBe(c.id);
  });
  it('a praia que o motor lê (spotEditorial) é a da maquete', () => {
    for (const c of COSTA_V6.spots) {
      const m = (D.spots as MSpot[]).find((s) => s.id === c.maqueteId)!;
      const sp = spotModalidadeDe(editorialDe(TODOS.find((s) => s.id === c.id)!));
      expect({ id: c.id, ...sp }).toEqual({ id: c.id, praiaVirada: m.praiaVirada, surf: { janela: m.surf.janela, tol: m.surf.tol }, aguaPlana: m.aguaPlana });
    }
  });
});

describe('home v6: paridade com o nucleo.js da maquete (0 diferenças)', () => {
  const M = Nucleo.Modelo(D);
  const BLm = M.blocos(agoraI);
  const T = criarModelo(SPOTS);
  const BLt = T.blocos(agoraI);

  it('os mesmos blocos', () => {
    expect(BLt.map((b) => [b.id, b.a, b.z, b.luz, b.passado, b.atual])).toEqual(
      BLm.map((b: { id: string; a: number; z: number; luz: number; passado: boolean; atual: boolean }) => [b.id, b.a, b.z, b.luz, b.passado, b.atual]),
    );
  });

  for (const d of ['kite', 'surf'] as const) {
    // O tecto de segurança do vento (#210, offshore/side-offshore) é da página de spot e a home
    // usa-o também (a nota tem de ser igual nas duas). Nos dados da maquete só toca em duas horas
    // de kite (amanhã 16h, vento a rodar para terra) que não entram em nenhum ranking/frase/top 3.
    it(`${d}: o tecto de segurança do vento (#210) só muda as horas conhecidas da maquete`, () => {
      const difs: string[] = [];
      for (const s of SPOTS) {
        const r = avaliaHoras(s.sp, d, s.h as HoraModalidade[]);
        r.forEach((x, i) => {
          if (x.n !== x.nMotor) difs.push(`${s.id} ${i}: ${x.nMotor} → ${x.n}`);
        });
      }
      expect(difs).toEqual(d === 'kite' ? ['carcavelos 40: 8 → 5', 'martinhal 40: 6 → 5'] : []);
    });

    it(`${d}: ranking completo, frase nacional e linhas do top 3 de cada bloco`, () => {
      const difs: string[] = [];
      BLm.forEach((bm: { id: string; passado: boolean }, k: number) => {
        if (bm.passado) return;
        const bt = BLt[k];
        const Rm = M.ranking(d, bm, agoraI).map((r: { sp: { id: string }; n: number | null; i: number }) => [MAPA_IDS[r.sp.id] ?? r.sp.id, r.n, r.i]);
        const Rt = T.ranking(d, bt, agoraI).map((r) => [r.sp.id, r.n, r.i]);
        if (JSON.stringify(Rm) !== JSON.stringify(Rt)) difs.push(`${bm.id} ranking: ${JSON.stringify(Rm)} ≠ ${JSON.stringify(Rt)}`);
        const fm = M.nacional(d, bm, agoraI);
        const ft = T.nacional(d, bt, agoraI);
        if (txt(fm.txt) !== txt(ft.txt)) difs.push(`${bm.id} nacional: «${txt(fm.txt)}» ≠ «${txt(ft.txt)}»`);
        if (txt(fm.corpo ?? '') !== txt(ft.corpo ?? '')) difs.push(`${bm.id} corpo: «${txt(fm.corpo ?? '')}» ≠ «${txt(ft.corpo ?? '')}»`);
        if (fm.b.k !== ft.b) difs.push(`${bm.id} banda da frase: ${fm.b.k} ≠ ${ft.b}`);
        const Rm3 = M.ranking(d, bm, agoraI).slice(0, 3);
        const Rt3 = T.ranking(d, bt, agoraI).slice(0, 3);
        Rm3.forEach((rm: unknown, j: number) => {
          const lm = M.linha(rm, d, bm);
          const lt = T.linha(Rt3[j], d, bt);
          if (txt(lm.l1) !== txt(lt.l1) || txt(lm.l2) !== txt(lt.l2) || (lm.pal ?? null) !== lt.pal)
            difs.push(`${bm.id} nº ${j + 1}: «${txt(lm.l1)} | ${txt(lm.l2)}» ≠ «${txt(lt.l1)} | ${txt(lt.l2)}»`);
        });
      });
      expect(difs).toEqual([]);
    });
  }

  it('a 22h (noite): o mesmo estado da maquete (nenhum bloco de hoje, frase de amanhã)', () => {
    const i22 = agoraI + 8;
    const Bm = M.blocos(i22).filter((b: { passado: boolean }) => !b.passado).map((b: { id: string }) => b.id);
    const Bt = T.blocos(i22).filter((b) => !b.passado).map((b) => b.id);
    expect(Bt).toEqual(Bm);
    const e = estadoHome(T, 'kite', i22, null);
    expect(e.noite).toBe(true);
    expect(e.bloco).toBeNull();
    expect(e.palavra).toBe('noite');
    // «Amanhã de manhã: <frase>» com um só «:» na 1.ª oração (kite e surf), pelo caminho real.
    for (const d of ['kite', 'surf'] as const) {
      const f = txt(estadoHome(T, d, i22, null).frase.txt);
      expect(f.startsWith('Amanhã de manhã: '), f).toBe(true);
      expect(f.split(/\.(?:\s|$)/)[0].match(/:/g), f).toHaveLength(1);
    }
  });
});

describe('home v6: lista única (kite e surf × cada bloco)', () => {
  const T = criarModelo(SPOTS);
  for (const d of ['kite', 'surf'] as const)
    for (const b of T.blocos(agoraI).filter((x) => !x.passado))
      it(`${d} · ${b.id}: nº 1 da lista = melhor da régua = 1.º rótulo do mapa = foto do hero; top 3 = 3 rótulos`, () => {
        const e = estadoHome(T, d, agoraI, b.id);
        const celula = e.regua.flatMap((x) => x.celulas).find((c) => c.id === b.id)!;
        expect(celula.spot).toBe(e.top[0].sp.id);
        expect(celula.n).toBe(e.top[0].n);
        expect(e.rotulosTop.map((r) => r.sp.id)).toEqual(e.top.map((r) => r.sp.id));
        expect(e.heroSpot).toBe(e.top[0].sp.id);
        expect(e.top).toHaveLength(3);
      });
});
