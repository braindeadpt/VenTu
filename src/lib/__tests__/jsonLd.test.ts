import { describe, expect, it } from 'vitest';
import { jsonLdHtml } from '../jsonLd';
import { buildSpotJsonLd } from '../seo';

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

describe('buildSpotJsonLd — @type geográfico (#457)', () => {
  const base = {
    locale: 'pt' as const,
    spotName: 'Spot',
    regionName: 'Região',
  };
  const placeOf = (input: Parameters<typeof buildSpotJsonLd>[0]) =>
    (buildSpotJsonLd(input)['@graph'] as Record<string, unknown>[])[0];

  it('spot de costa é Beach + SportsActivityLocation', () => {
    expect(placeOf({ ...base, slug: 'guincho', spotType: 'surf' })['@type']).toEqual([
      'Beach',
      'SportsActivityLocation',
    ]);
  });

  it('marina costeira não é Beach (modalidade foil não implica praia)', () => {
    expect(
      placeOf({ ...base, slug: 'marina-afurada-foil', spotType: 'foil' })['@type'],
    ).toBe('SportsActivityLocation');
  });

  it('água interior nunca é Beach (cable parks, lagoas, albufeiras)', () => {
    expect(
      placeOf({ ...base, slug: 'alqueva', spotType: 'wakeboard', inlandWater: true })['@type'],
    ).toBe('SportsActivityLocation');
  });
});
