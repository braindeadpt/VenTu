/**
 * Arredonda uma coordenada antes de ela chegar a um atributo SVG.
 *
 * PORQUE EXISTE: `Math.cos`/`Math.sin` não são obrigados pela spec ECMAScript
 * a ser correctamente arredondados, e o V8 do Node (SSR) diverge do V8 do
 * browser no último bit. O React compara os atributos renderizados no
 * servidor com os que o cliente calcula e, ao ver
 *
 *   servidor  x1="19.122649247653435"
 *   cliente   x1={19.122649247653428}
 *
 * declara um hydration mismatch — por 7e-15, numa figura de 144 unidades.
 *
 * Duas casas decimais são ~0.005 px num ecrã: várias ordens de grandeza acima
 * de qualquer diferença de ulp, e muito abaixo de um pixel. O desenho não muda;
 * o mismatch desaparece.
 *
 * Usar em QUALQUER componente que renderize SVG no servidor e calcule
 * coordenadas com trigonometria.
 */
export function svgUnit(n: number): number {
  // `+ 0` normaliza -0 para 0: `Math.round(-0.1)` devolve -0, e um -0 a
  // circular por coordenadas é um segundo valor para o mesmo ponto. Aqui não
  // chega a partir a hidratação (String(-0) já é "0"), mas não há razão para
  // deixar sair do helper duas representações do zero.
  return Math.round(n * 100) / 100 + 0;
}
