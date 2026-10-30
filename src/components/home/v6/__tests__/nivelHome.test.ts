/**
 * #nivel-ui — as palavras do nível na home v6 sobre o estado do motor (#360):
 * a frase do nível em «poucos»/«zero», o «nº N da costa» dos cartões acima do
 * nível e a cópia nas 5 línguas. Dados: a fixture da maquete aprovada
 * (qua 14 out 2026, 14h), com os níveis reais da ficha (`metaCosta`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { metaCosta } from '@/lib/home/dadosHomeServidor';
import { compactarCosta, montarCosta } from '@/lib/home/dadosHome';
import { criarModelo } from '@/lib/home/homeV6';
import { estadoHome } from '@/lib/home/estadoHome';
import { homeV6Copy } from '@/lib/translations/homeV6';
import { NIVEL_COPY, nivelCopy, nivelCopyV6 } from '@/lib/translations/nivel';
import type { LinhaForecast } from '@/lib/horaSpot';
import type { Modalidade } from '@/lib/modalidades';
import type { NivelUtilizador } from '@/lib/mapDifficulty';
import { emPoucos, fraseNivel, quandoDe, rkDe } from '../nivelHome';

const RAIZ = path.resolve(__dirname, '../../../../..');
const html = fs.readFileSync(path.join(RAIZ, 'docs/design/maquetes/v6-atlantico/index.html'), 'utf8');
const D = JSON.parse(/<script id="dados" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]);
const IDS: Record<string, string> = { viana: 'cabedelo', 'lagoa-obidos': 'obidos-lagoon', caparica: 'costa-caparica', 'meia-praia': 'lagos' };
const KT = 1.94384;
type H = Record<string, number[]>;
const linhas = (h: H): LinhaForecast[] => {
  const T0 = D.meta.inicio as string;
  return h.w.map((_, i) => ({
    time: new Date(Date.UTC(+T0.slice(0, 4), +T0.slice(5, 7) - 1, +T0.slice(8, 10), i)).toISOString().slice(0, 16),
    windSpeed: h.w[i] / KT,
    windGust: h.g[i] / KT,
    windDirection: h.wd[i],
    waveHeight: h.hs[i],
    wavePeriod: h.tp[i],
    waveDirection: h.sd[i],
    tideHeight: h.tide[i] - 2.0,
    precipitation: h.rain[i],
    cloudCover: h.cloud[i],
  })) as unknown as LinhaForecast[];
};
const F = Object.fromEntries((D.spots as Array<{ id: string; h: H }>).map((s) => [IDS[s.id] ?? s.id, linhas(s.h)]));

const c = homeV6Copy('pt');
const cn = nivelCopy('pt');
const meta = metaCosta();
const L: Record<string, LinhaForecast[]> = {};
for (const [id, m] of Object.entries(meta)) L[id] = F[m.serie] ?? [];
const T = new Date('2026-10-14T13:00:00Z').getTime(); // 14h WEST
const costa = montarCosta(compactarCosta(L, T, meta), T, meta);
const M = criarModelo(costa.spots, c);
const E = (d: Modalidade, nv: NivelUtilizador | null, b: string | null = null) => estadoHome(M, d, costa.agoraI, b, nv);

describe('home v6 com nível (fixture da maquete)', () => {
  it('kite · iniciante: ≥ 3 do nível dão → sem frase do nível; o Guincho fica de fora', () => {
    const e = E('kite', 'beginner');
    expect(emPoucos(e)).toBe(false);
    expect(fraseNivel(e, 'beginner', c, cn)).toBeNull();
    expect(e.fora?.sp.id).toBe('guincho');
    expect(cn.foraResto('advanced')).toBe(' fica de fora: é um spot para avançados.');
  });

  it('surf · iniciante: zero → a frase do nível, com o melhor do nível e a banda dele', () => {
    const e = E('surf', 'beginner');
    expect(e.poucos?.dar).toBe(0);
    const f = fraseNivel(e, 'beginner', c, cn)!;
    expect(f.txt).toMatch(/^Para iniciante, o surf não dá em lado nenhum agora\. O melhor do teu nível é .+: <em>fraco<\/em>\.$/);
    expect(f.b).toBe(e.top[0].b);
    expect(cn.poucosT(0, e.poucos!.total, 'beginner', quandoDe(e, c))).toBe(`Nenhum dos ${e.poucos!.total} spots para iniciantes dá agora.`);
  });

  it('surf · intermédio ao fim da tarde: poucos (1) → «só X dá», cartões acima marcados «nº N da costa»', () => {
    const e = E('surf', 'intermediate', '0-fim');
    expect(e.poucos?.dar).toBe(1);
    const f = fraseNivel(e, 'intermediate', c, cn)!;
    // o nº 1 do nível está na banda «dá»: sem chip (a forma antiga «…: <em>dá</em>.» repetia o verbo)
    expect(e.top[0].b).toBe('da');
    expect(f.txt).toMatch(/^Para intermédio, só [^:<]+ dá hoje ao fim da tarde\.$/);
    const acima = e.top.filter((r) => r.acimaDoNivel);
    expect(acima.length).toBeGreaterThan(0);
    for (const r of acima) expect(rkDe(e, r, 'x', c, cn)).toBe(`nº ${r.nCosta} da costa hoje ao fim da tarde`);
    expect(rkDe(e, e.top[0], 'nº 1 hoje ao fim da tarde', c, cn)).toBe('nº 1 hoje ao fim da tarde');
    expect(cn.poucosT(1, 12, 'intermediate', 'agora')).toBe('Só 1 dos 12 spots para intermédios dá agora.');
    expect(cn.poucosT(2, 12, 'intermediate', 'agora')).toBe('Só 2 dos 12 spots para intermédios dão agora.');
  });

  it('sem nível: nada muda (sem frase, sem «fora», sem poucos)', () => {
    const e = E('surf', null);
    expect(fraseNivel(e, null, c, cn)).toBeNull();
    expect(e.fora).toBeUndefined();
    expect(e.poucos).toBeUndefined();
  });
});

describe('cópia do nível nas 5 línguas', () => {
  it('as 5 línguas têm todas as chaves e as funções devolvem texto', () => {
    const chaves = Object.keys(NIVEL_COPY.pt).sort();
    for (const [lg, cp] of Object.entries(NIVEL_COPY)) {
      expect(Object.keys(cp).sort(), lg).toEqual(chaves);
      expect(cp.tag('advanced'), lg).toBeTruthy();
      expect(cp.poucosT(2, 9, 'beginner', 'x'), lg).toContain('9');
      expect(cp.fraseZero('beginner', 'surf', 'x', 'Viana', 'b'), lg).toContain('<em>b</em>');
      expect(cp.nCosta(3, 'x'), lg).toContain('3');
    }
    expect(nivelCopy('xx')).toBe(NIVEL_COPY.pt);
  });

  it('na home/spot v6 a cópia segue a língua que a v6 desenha (PT ou EN; es/de/fr caem para EN como homeV6Copy)', () => {
    expect(nivelCopyV6('pt')).toBe(NIVEL_COPY.pt);
    for (const lg of ['en', 'es', 'de', 'fr']) {
      expect(nivelCopyV6(lg), lg).toBe(NIVEL_COPY.en);
      expect(homeV6Copy(lg), lg).toBe(homeV6Copy('en'));
    }
  });

  it('PT: o porquê sai dos perigos da ficha, sem vermelho nem alarme', () => {
    expect(cn.porque(['Vento forte', 'Correntes', 'Rochas'], 'kite')).toBe('Vento forte, correntes e rochas: aqui o kite pede experiência.');
    expect(cn.porque([], 'surf')).toBe('Aqui o surf pede experiência.');
    expect(cn.dica('advanced', 'kite')).toBe('Spot para avançados em kite.');
    expect(cn.pertoLink(3, 'beginner')).toBe('3 spots de iniciante perto');
    expect(cn.nivelEm('Avançado', 'kite')).toBe('avançado em kite');
  });
});
