/**
 * «Porquê este score» — formata os factores existentes do scorer
 * (`score.factors` / `score.factorsEn`, já resolvidos por locale) numa linha
 * curta. Não inventa texto: sem factores devolve null e o chamador não
 * renderiza a linha.
 */
export function whyLine(factors: readonly string[] | undefined, _locale: string): string | null {
  const clean = (factors ?? []).map((f) => f.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  return clean.slice(0, 3).join(' · ');
}
