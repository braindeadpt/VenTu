/**
 * Filtro de nível do utilizador (#nivel-logica) no estado da home v6.
 *
 * Fixtures: os mesmos dados da maquete v6 aprovada que a paridade usa
 * (`<script id="dados">` de docs/design/maquetes/v6-atlantico/index.html),
 * com `nivel`/`nivelPorModalidade` injectados por cenário. O `nivel` nunca
 * recalcula notas: o top 3, o «fora», os «poucos» e a régua saem sempre da
 * mesma lista `ranking()`.
 *
 * Números da maquete (agora = qua 14 out 14h, bloco 0-tarde, kite):
 *   guincho 9, lagoa-albufeira 8, baleal 7, costa-caparica 7, fonte-telha 7,
 *   lagos 6 | a dar < 5: cabedelo 3, moledo 2, esposende, martinhal
 * kite @ 1-manha: moledo 9, cabedelo 9, lagoa-albufeira 7, guincho 7, …
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { criarModelo, COSTA_V6, type Modelo, type SpotHome } from '@/lib/home/homeV6';
import { editorialDe, spotModalidadeDe } from '@/lib/spotEditorial';
import { spots as TODOS } from '@/lib/spots';
import { estadoHome } from '@/lib/home/estadoHome';
import { metaCosta } from '@/lib/home/dadosHomeServidor';
import { spotDentroDoNivel } from '@/lib/mapDifficulty';
import type { HoraSpot } from '@/lib/horaSpot';
import type { Modalidade } from '@/lib/modalidades';
import type { Spot } from '@/types';

const req = createRequire(import.meta.url);
const RAIZ = path.resolve(__dirname, '../../../..');
const html = fs.readFileSync(path.join(RAIZ, 'docs/design/maquetes/v6-atlantico/index.html'), 'utf8');
const D = JSON.parse(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]);

type MSpot = { id: string; h: Record<string, unknown[]> };
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

const SPOTS_BASE: SpotHome[] = COSTA_V6.spots.map((c) => {
  const m = (D.spots as MSpot[]).find((s) => s.id === c.maqueteId)!;
  const site = TODOS.find((s) => s.id === c.id)!;
  return { ...c, lat: site.lat, lon: site.lon, sp: spotModalidadeDe(editorialDe(site)), h: horasDe(m) };
});

const AGORA = Math.round((Date.parse(D.meta.agora + ':00Z') - Date.parse(T0 + ':00Z')) / 36e5);
const NOITE = AGORA + 8; // 22h — «Noite», dados = bloco seguinte (1-manha)

/** Costa com níveis injectados (mapa id → nível; `def` para os restantes). */
function modeloComNiveis(
  niveis: Record<string, Spot['difficulty']>,
  def: Spot['difficulty'] = 'beginner',
  porModalidade: Record<string, Partial<Record<Modalidade, Spot['difficulty']>>> = {},
): Modelo {
  const spots = SPOTS_BASE.map((s) => ({
    ...s,
    nivel: niveis[s.id] ?? def,
    ...(porModalidade[s.id] ? { nivelPorModalidade: porModalidade[s.id] } : {}),
  }));
  return criarModelo(spots);
}

describe('estadoHome sem nível — byte a byte igual ao actual', () => {
  const M = modeloComNiveis({});
  for (const [d, i, b] of [
    ['kite', AGORA, null],
    ['surf', AGORA, '0-tarde'],
    ['kite', NOITE, null],
  ] as Array<[Modalidade, number, string | null]>) {
    it(`${d} agora=${i} bloco=${b}: omitido, null e 'all' são o mesmo estado`, () => {
      const sem = estadoHome(M, d, i, b);
      expect(estadoHome(M, d, i, b, null)).toEqual(sem);
      expect(estadoHome(M, d, i, b, 'all')).toEqual(sem);
      expect('fora' in sem).toBe(false);
      expect('poucos' in sem).toBe(false);
      expect('proximoDoNivel' in sem).toBe(false);
    });
  }
});

describe('estadoHome com nível — top 3 dentro do nível', () => {
  it('«Iniciante» com ≥3 a dar: top = o nº 1–3 sem filtro, sem marcas', () => {
    const M = modeloComNiveis({});
    const e = estadoHome(M, 'kite', AGORA, null, 'beginner');
    expect(e.top.map((r) => r.sp.id)).toEqual(['guincho', 'lagoa-albufeira', 'baleal']);
    expect(e.top.every((r) => !r.acimaDoNivel)).toBe(true);
    expect(e.fora).toBeNull();
    expect(e.poucos).toEqual({ dar: 6, total: e.R.length });
    expect(e.proximoDoNivel).toBeNull();
  });

  it('«fora»: o nº 1 sem filtro acima do nível aparece em `fora`, com a nota', () => {
    const M = modeloComNiveis({ guincho: 'advanced' }, 'intermediate');
    const e = estadoHome(M, 'kite', AGORA, null, 'intermediate');
    expect(e.fora?.sp.id).toBe('guincho');
    expect(e.fora?.n).toBe(9);
    expect(e.top[0].sp.id).toBe('lagoa-albufeira');
    expect(e.heroSpot).toBe('lagoa-albufeira');
    // nº 1 sem filtro dentro do nível → «fora» é null (mesmo havendo outros acima)
    const M2 = modeloComNiveis({ baleal: 'expert' }, 'intermediate');
    expect(estadoHome(M2, 'kite', AGORA, null, 'intermediate').fora).toBeNull();
  });

  it('«poucos» (1–2 a dar): nº 1 do nível + melhores acima do nível a dar, marcados', () => {
    const dentro = { guincho: 'beginner', 'lagoa-albufeira': 'beginner', cabedelo: 'beginner', moledo: 'beginner' } as Record<
      string,
      Spot['difficulty']
    >;
    const M = modeloComNiveis(dentro, 'advanced');
    const e = estadoHome(M, 'kite', AGORA, null, 'beginner');
    expect(e.poucos).toEqual({ dar: 2, total: 4 });
    expect(e.top.map((r) => r.sp.id)).toEqual(['guincho', 'baleal', 'costa-caparica']);
    expect(e.top[0].acimaDoNivel).toBeUndefined();
    expect(e.top[1]).toMatchObject({ acimaDoNivel: true, nCosta: 3 });
    expect(e.top[2]).toMatchObject({ acimaDoNivel: true, nCosta: 4 });
    expect(e.fora).toBeNull(); // o nº 1 sem filtro (guincho) está dentro do nível
    expect(e.proximoDoNivel).toBeNull();
  });

  it('«poucos» sem acima a dar suficientes: preenche com os seguintes do nível', () => {
    // surf @1-manha: só o tonel dá (5) em toda a costa. Dentro do nível:
    // tonel (dá) + arrifana 4 + baleal 3 — o resto do top 3 são os seguintes
    // do nível (não há acima a dar para preencher).
    const M = modeloComNiveis(
      { tonel: 'beginner', arrifana: 'beginner', baleal: 'beginner' },
      'expert',
    );
    const e = estadoHome(M, 'surf', AGORA, '1-manha', 'beginner');
    expect(e.poucos).toEqual({ dar: 1, total: 3 });
    expect(e.top.map((r) => r.sp.id)).toEqual(['tonel', 'arrifana', 'baleal']);
    expect(e.top[1].acimaDoNivel).toBeUndefined();
    expect(e.top[2].acimaDoNivel).toBeUndefined();
  });

  it('«zero» a dar (kite): nº 1 fraco do nível + melhores acima a dar, marcados', () => {
    // cabedelo 3 e moledo 2 em 0-tarde; o cabedelo chega a 5 já em 0-fim.
    const M = modeloComNiveis({ cabedelo: 'beginner', moledo: 'beginner' }, 'advanced');
    const e = estadoHome(M, 'kite', AGORA, null, 'beginner');
    expect(e.poucos).toEqual({ dar: 0, total: 2 });
    expect(e.top[0].sp.id).toBe('cabedelo');
    expect(e.top[0].n).toBe(3);
    // estado «Zero» aprovado: a seguir ao nº 1 entram os melhores da costa
    // acima do nível a dar, marcados — não os seguintes do nível.
    expect(e.top.map((r) => r.sp.id)).toEqual(['cabedelo', 'guincho', 'lagoa-albufeira']);
    expect(e.top[1]).toMatchObject({ acimaDoNivel: true, nCosta: 1 });
    expect(e.top[2]).toMatchObject({ acimaDoNivel: true, nCosta: 2 });
    expect(e.proximoDoNivel?.bloco.id).toBe('0-fim');
    expect(e.proximoDoNivel?.linha.sp.id).toBe('cabedelo');
    expect(e.proximoDoNivel?.linha.n).toBe(5);
  });

  it('«zero» a dar (surf iniciante): top[1..2] acima do nível a dar e `fora` null', () => {
    // surf @0-tarde: cabedelo 3 e matosinhos 3 são os únicos do nível;
    // acima, arrifana 7 e tonel 7 entram marcados — o nº 1 sem filtro
    // (arrifana) está no top, logo não é «fora».
    const M = modeloComNiveis({ cabedelo: 'beginner', matosinhos: 'beginner' }, 'advanced');
    const e = estadoHome(M, 'surf', AGORA, null, 'beginner');
    expect(e.poucos).toEqual({ dar: 0, total: 2 });
    expect(e.top[0].sp.id).toBe('cabedelo');
    expect(e.top[0].acimaDoNivel).toBeUndefined();
    expect(e.top.map((r) => r.sp.id)).toEqual(['cabedelo', 'arrifana', 'tonel']);
    expect(e.top[1]).toMatchObject({ acimaDoNivel: true, nCosta: 1, n: 7 });
    expect(e.top[2]).toMatchObject({ acimaDoNivel: true, nCosta: 2, n: 7 });
    expect(e.fora).toBeNull();
  });

  it('«zero» sem nenhum acima a dar: o top fica todo do nível', () => {
    // surf @1-tarde: ninguém dá em toda a costa — não há acima a dar para
    // preencher, entram os seguintes do nível.
    const dentro = { arrifana: 'beginner', baleal: 'beginner', moledo: 'beginner' } as Record<
      string,
      Spot['difficulty']
    >;
    const M = modeloComNiveis(dentro, 'expert');
    const e = estadoHome(M, 'surf', AGORA, '1-tarde', 'beginner');
    expect(e.poucos).toEqual({ dar: 0, total: 3 });
    expect(e.top).toHaveLength(3);
    expect(e.top.map((r) => r.sp.id).sort()).toEqual(['arrifana', 'baleal', 'moledo']);
    expect(e.top.every((r) => !r.acimaDoNivel)).toBe(true);
    expect(e.top.every((r) => (r.n ?? -1) < 5)).toBe(true);
    expect(e.proximoDoNivel).toBeNull();
  });

  it('«zero» a dar sem nenhum bloco futuro a dar → `proximoDoNivel` null', () => {
    // martinhal fraco em todo o lado; no bloco seguinte ninguém do nível dá.
    const M = modeloComNiveis({ martinhal: 'beginner' }, 'advanced');
    const e = estadoHome(M, 'surf', AGORA, null, 'beginner');
    expect(e.poucos).toEqual({ dar: 0, total: 1 });
    expect(e.top[0].sp.id).toBe('martinhal');
    expect(e.proximoDoNivel).toBeNull();
  });

  it('o nº 1 acima do nível que entra no top («poucos») NÃO é `fora`', () => {
    // kite @0-tarde: dentro só lagoa-albufeira dá (8); o nº 1 sem filtro
    // (guincho, 9) preenche o top como acimaDoNivel — aparecer como excluído
    // E recomendado era contraditório (review do PR #360).
    const dentro = { 'lagoa-albufeira': 'beginner', cabedelo: 'beginner', moledo: 'beginner' } as Record<
      string,
      Spot['difficulty']
    >;
    const M = modeloComNiveis(dentro, 'advanced');
    const e = estadoHome(M, 'kite', AGORA, null, 'beginner');
    expect(e.poucos?.dar).toBe(1);
    expect(e.top.map((r) => r.sp.id)).toEqual(['lagoa-albufeira', 'guincho', 'baleal']);
    expect(e.top[1]).toMatchObject({ sp: { id: 'guincho' }, acimaDoNivel: true, nCosta: 1 });
    expect(e.fora).toBeNull();
  });

  it('`proximoDoNivel` nunca aponta para trás do bloco seleccionado', () => {
    // surf @1-tarde: arrifana fraco (o único do nível). @0-fim a arrifana
    // dá (6), mas 0-fim fica ANTES de 1-tarde — «próximo» tem de ser a
    // seguir à selecção, nunca para trás (review do PR #360).
    const M = modeloComNiveis({ arrifana: 'beginner' }, 'advanced');
    const e = estadoHome(M, 'surf', AGORA, '1-tarde', 'beginner');
    expect(e.poucos).toEqual({ dar: 0, total: 1 });
    expect(e.proximoDoNivel).toBeNull();
  });

  it('`proximoDoNivel` = o primeiro bloco a seguir a `dados` com um do nível a dar', () => {
    // kite @1-manha: os três do nível estão fracos; @1-tarde todos dão —
    // o primeiro do nível é a costa-caparica (10).
    const dentro = { 'costa-caparica': 'beginner', 'fonte-telha': 'beginner', martinhal: 'beginner' } as Record<
      string,
      Spot['difficulty']
    >;
    const M = modeloComNiveis(dentro, 'advanced');
    const e = estadoHome(M, 'kite', AGORA, '1-manha', 'beginner');
    expect(e.poucos).toEqual({ dar: 0, total: 3 });
    expect(e.proximoDoNivel?.bloco.id).toBe('1-tarde');
    expect(e.proximoDoNivel?.linha.sp.id).toBe('costa-caparica');
    expect(e.proximoDoNivel?.linha.n).toBe(10);
  });

  it('a régua usa o nº 1 filtrado em cada bloco', () => {
    const M = modeloComNiveis({ guincho: 'advanced', moledo: 'advanced' }, 'intermediate');
    const e = estadoHome(M, 'kite', AGORA, null, 'intermediate');
    const dentro = (r: (typeof e.R)[number]) =>
      spotDentroDoNivel(r.sp.nivelPorModalidade?.kite ?? r.sp.nivel, 'intermediate');
    for (const { celulas } of e.regua) {
      for (const cel of celulas) {
        if (cel.id === 'noite') continue;
        const bloco = e.blocos.find((b) => b.id === cel.id)!;
        const esperado = M.ranking('kite', bloco, AGORA).find(dentro);
        expect(cel.spot).toBe(esperado?.sp.id ?? '');
        expect(cel.n).toBe(esperado?.n ?? null);
      }
    }
    // 0-tarde sem filtro o nº 1 é o guincho; com «intermédio» é a lagoa
    const cel0 = e.regua.flatMap((x) => x.celulas).find((c) => c.id === '0-tarde')!;
    expect(cel0.spot).toBe('lagoa-albufeira');
  });

  it('à noite o filtro aplica-se ao bloco seguinte (1-manha)', () => {
    const M = modeloComNiveis({ moledo: 'advanced' }, 'intermediate');
    const e = estadoHome(M, 'kite', NOITE, null, 'intermediate');
    expect(e.noite).toBe(true);
    expect(e.dados?.id).toBe('1-manha');
    // sem filtro o nº 1 de 1-manha é o moledo (9); com «intermédio» fica o cabedelo (9)
    expect(e.top[0].sp.id).toBe('cabedelo');
    expect(e.fora?.sp.id).toBe('moledo');
    const cel = e.regua.flatMap((x) => x.celulas).find((c) => c.id === '1-manha')!;
    expect(cel.spot).toBe('cabedelo');
  });

  it('o override por modalidade manda na base (kite avançado, surf intermédio)', () => {
    const M = modeloComNiveis({}, 'intermediate', { guincho: { kite: 'advanced' } });
    const kite = estadoHome(M, 'kite', AGORA, null, 'intermediate');
    expect(kite.fora?.sp.id).toBe('guincho');
    expect(kite.top.map((r) => r.sp.id)).not.toContain('guincho');
    expect(kite.poucos?.total).toBe(kite.R.length - 1);
    // em surf a base manda: o guincho continua dentro do nível
    const surf = estadoHome(M, 'surf', AGORA, null, 'intermediate');
    expect(surf.fora).toBeNull();
    expect(surf.poucos?.total).toBe(surf.R.length);
  });
});

describe('metaCosta traz o nível (a home não lê spots.ts)', () => {
  const meta = metaCosta();
  it('cada spot da costa tem `nivel` (a difficulty da ficha)', () => {
    for (const id of Object.keys(meta)) expect(meta[id].nivel).toBeTruthy();
    expect(meta.guincho.nivel).toBe('intermediate');
  });
  it('o Guincho tem `nivelPorModalidade.kite = advanced` (surf herda a base)', () => {
    expect(meta.guincho.nivelPorModalidade).toEqual({ kite: 'advanced' });
    expect(meta['lagoa-albufeira'].nivelPorModalidade).toBeUndefined();
  });
});
