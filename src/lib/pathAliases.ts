/**
 * Path policy (static export + trailingSlash)
 * ----------------------------------------
 * Canonical URL segments are locale-agnostic and mostly English
 * (`favorites`, `compare`, `about`) or an established product slug
 * (`sazonalidade`). UI labels are translated (Favoritos, Comparar, Sobre…),
 * so users often type the label as a path → 404.
 *
 * Alias routes under `[locale]/<alias>/` emit thin static HTML that
 * meta-refreshes + JS-redirects to the canonical segment. Next.js
 * `redirects` in next.config do not run with `output: 'export'`.
 */

export const PATH_ALIASES = [
  { alias: 'favoritos', canonical: 'favorites' },
  { alias: 'comparar', canonical: 'compare' },
  { alias: 'sobre', canonical: 'about' },
  /** EN mental-model for the PT product slug `/sazonalidade/`. */
  { alias: 'seasonality', canonical: 'sazonalidade' },
] as const;

export type PathAlias = (typeof PATH_ALIASES)[number]['alias'];

export function resolvePathAlias(segment: string): string | null {
  const hit = PATH_ALIASES.find((a) => a.alias === segment);
  return hit ? hit.canonical : null;
}

/** Build `/{locale}/{canonical}/` preserving a trailing slash. */
export function aliasTargetPath(locale: string, canonical: string): string {
  return `/${locale}/${canonical}/`;
}
