/**
 * Paridade do motor TS com a maquete v6 (#184, critério de aceitação).
 *
 * Fixture: os dados do Guincho embutidos em
 * `docs/design/maquetes/v6-atlantico/guincho.html` e, para cada hora, a nota
 * (`window.__NS()`) e a frase (`window.__frase(i)`) que a maquete mostra,
 * extraídas da página com o Chromium (`fixtures/guincho-v6.json`).
 * Resultado exigido: 48 horas × kite/surf, 0 diferenças na nota e na frase.
 * Também corre o `modalidades-avalia.js` original sobre as mesmas horas.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import path from 'path';
import ref from './fixtures/guincho-v6.json';
import { avaliaHoras, MOTOR, MODALIDADES_DEF, type HoraModalidade, type SpotModalidade } from '@/lib/modalidades';
import { construirFrase, parteTxt } from '@/lib/spotVeredicto';
import { spotPageV6 } from '@/lib/translations/spotPage/v6';

const require_ = createRequire(import.meta.url);
const ModAvaliaJs = require_(path.resolve(__dirname, '../../../../docs/design/maquetes/modalidades-avalia.js'));
const DEF_JSON = require_(path.resolve(__dirname, '../../../../docs/design/maquetes/modalidades-def.json'));

const H = ref.dados.horas as HoraModalidade[];
const SP = ref.dados.spot as unknown as SpotModalidade;
const txt = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;|\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

describe('motor de modalidades: paridade com a maquete v6 (Guincho, 48 h)', () => {
  it('a definição é a mesma do contrato (o JSON não se corta)', () => {
    expect(MODALIDADES_DEF).toEqual(DEF_JSON);
    expect(H).toHaveLength(48);
  });

  for (const d of ['kite', 'surf'] as const) {
    it(`${d}: nota do motor TS = nota da maquete nas 48 horas (0 diferenças)`, () => {
      const L = MOTOR.para(SP);
      const difs = H.map((h, i) => [i, L.avalia(d, h).n, ref.modalidades[d][i].n]).filter(([, a, b]) => a !== b);
      expect(difs).toEqual([]);
    });

    it(`${d}: igual ao modalidades-avalia.js original`, () => {
      const AV = ModAvaliaJs(DEF_JSON, { DA: 5 }).para(SP);
      const L = MOTOR.para(SP);
      for (const h of H) expect(L.avalia(d, h)).toEqual(AV.avalia(d, h));
    });

    it(`${d}: frase PT = frase da maquete nas 48 horas (0 diferenças)`, () => {
      const NS = avaliaHoras(SP, d, H);
      const frase = construirFrase({ sp: SP, d, H, NS, sol: ref.dados.sol, copy: spotPageV6.pt, locale: 'pt' });
      const difs: string[] = [];
      H.forEach((_, i) => {
        const f = frase(i);
        const e = ref.modalidades[d][i];
        if (txt(f.l1) !== txt(e.l1) || txt(parteTxt(f.l2)) !== txt(e.l2))
          difs.push(`${i}: «${f.l1} | ${parteTxt(f.l2)}» ≠ «${txt(e.l1)} | ${txt(e.l2)}»`);
      });
      expect(difs).toEqual([]);
    });

    it(`${d}: o tecto de segurança do vento (#210) não muda o Guincho da maquete`, () => {
      const NS = avaliaHoras(SP, d, H);
      expect(NS.map((r) => r.n)).toEqual(ref.modalidades[d].map((x) => x.n));
    });
  }
});
