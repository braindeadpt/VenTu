/**
 * Display-only Portuguese accent fixes for IH ANAV category strings.
 * Raw OGC payloads often omit accents (e.g. «maritima», «Exercicios»);
 * keep archived JSON unchanged and normalize at the UI layer.
 */
export function formatCoastalCategory(category: string): string {
  if (!category) return category;
  return category
    .replace(/\b[Mm]aritima\b/g, (match) => (match[0] === 'M' ? 'Marítima' : 'marítima'))
    .replace(/\bExercicios\b/g, 'Exercícios')
    .replace(/\bexercicios\b/g, 'exercícios')
    .replace(/\bExercicio\b/g, 'Exercício')
    .replace(/\bexercicio\b/g, 'exercício');
}
