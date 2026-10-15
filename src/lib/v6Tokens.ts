/**
 * Tokens de design v6 «Atlântico» (#184; partilhados com a #183).
 * Copiados de `docs/design/maquetes/v6-atlantico/cores.md` — não inventar
 * outros. As mesmas cores estão em CSS em `src/styles/v6-atlantico.css`
 * (`.v6 { --abismo … }`); este módulo serve o canvas e o mapa.
 *
 * Contraste (cores.md): Dá, Bom e Muito bom como texto em qualquer tamanho;
 * Não dá, Fraco e Noite só como texto ≥ 24 px — abaixo disso, fill da banda
 * com o texto da banda.
 */
import type { BandaK } from '@/lib/modalidades';

export const V6_UI = {
  abismo: '#030E18',
  fundo: '#071B2C',
  mar: '#0C2A42',
  linha: '#1E4361',
  espuma: '#F3F8FB',
  nevoa: '#A9C2D4',
  sol: '#FFC93C',
  gelo: '#7FE7FF',
  ink: '#04131F',
} as const;

/** Fill e texto no fill de cada banda (escala 0–10 da #210). */
export const V6_BANDAS: Record<BandaK, { c: string; t: string }> = {
  nao: { c: '#A8464A', t: '#FFFFFF' },
  fraco: { c: '#4479EE', t: '#04131F' },
  da: { c: '#C99E2A', t: '#04131F' },
  bom: { c: '#40DCD0', t: '#04131F' },
  mb: { c: '#FFF07A', t: '#04131F' },
  noite: { c: '#56677B', t: '#FFFFFF' },
};

/** Bandas cuja cor só pode ser texto a ≥ 24 px sobre o fundo escuro. */
export const BANDAS_TEXTO_SO_GRANDE: ReadonlyArray<BandaK> = ['nao', 'fraco', 'noite'];

/** Variáveis CSS de uma banda (`--c` fill, `--t` texto no fill). */
export const bandaVars = (b: BandaK): Record<string, string> => ({ '--c': V6_BANDAS[b].c, '--t': V6_BANDAS[b].t });
