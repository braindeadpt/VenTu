/**
 * Texto localizado com fallback.
 *
 * O dataset do VenTu traz PT e EN; traduções adicionais (es/de/fr) são
 * opcionais. Devolve a língua pedida quando existe, senão o EN — nunca deixa
 * cair para PT num locale estrangeiro.
 */
export function localizedText(value: { pt: string; en: string }, locale: string): string {
  const picked = (value as Record<string, string | undefined>)[locale];
  return picked ?? value.en;
}
