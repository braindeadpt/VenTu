/**
 * Safe serialization for `<script type="application/ld+json">`.
 *
 * `JSON.stringify` does NOT escape `<`, so a single attacker-controlled string
 * (an RSS headline that survived `fetch-rss.js` as `</script><img src=x
 * onerror=…>`) would close the script element early and inject HTML/JS into the
 * page — JSON-LD is rendered via `dangerouslySetInnerHTML`, so React does not
 * protect us here.
 *
 * Escape the three HTML-significant characters as JSON unicode escapes: the
 * output is still valid JSON (parsers decode `\u003c` inside strings), but it
 * can no longer terminate or escape the `<script>` element. This is the exact
 * mitigation recommended by the Next.js JSON-LD guide.
 *
 * Usable from both server components and client components — keep this module
 * free of `node:`/server-only imports.
 *
 * @param data JSON-LD payload (object, array or primitive)
 * @returns JSON text that is inert as HTML
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}
