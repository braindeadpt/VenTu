import { describe, expect, it } from 'vitest';
import { jsonLdHtml } from '../jsonLd';

describe('jsonLdHtml (H1 — JSON-LD script breakout)', () => {
  it('neutralises a </script> breakout while staying valid JSON', () => {
    const payload = { headline: '</script><img src=x onerror=alert(1)>' };
    const html = jsonLdHtml(payload);

    expect(html).not.toContain('<');
    expect(html).not.toContain('>');
    // Still parses back to the original string — search engines keep working.
    expect(JSON.parse(html)).toEqual(payload);
  });

  it('escapes every HTML-significant character, including & and raw >', () => {
    const payload = { description: 'a & b < c > d "quoted" </script>' };
    const html = jsonLdHtml(payload);

    expect(html).not.toMatch(/[<>&]/);
    expect(JSON.parse(html)).toEqual(payload);
  });

  it('handles arrays (layout renders a JSON-LD array) and nested objects', () => {
    const payload = [
      { '@type': 'WebApplication', name: '</script><script>alert(2)</script>' },
      { '@type': 'Organization', name: 'VenTu & Friends' },
    ];
    const html = jsonLdHtml(payload);

    expect(html).not.toMatch(/[<>&]/);
    expect(JSON.parse(html)).toEqual(payload);
  });

  it('round-trips plain data unchanged apart from escaping', () => {
    expect(JSON.parse(jsonLdHtml({ ok: true, n: 42, s: 'Nazaré' }))).toEqual({
      ok: true,
      n: 42,
      s: 'Nazaré',
    });
  });
});
