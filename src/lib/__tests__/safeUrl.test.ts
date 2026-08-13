import { describe, expect, it } from 'vitest';
import { safeExternalUrl, safeImageUrl, safeTelHref } from '../safeUrl';

describe('safeExternalUrl', () => {
  it('blocks javascript: schemes', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('JavaScript:alert(1)')).toBeNull();
    expect(safeExternalUrl(' javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('JAVASCRIPT:fetch("https://evil")')).toBeNull();
  });

  it('blocks data: and other non-http schemes', () => {
    expect(safeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeExternalUrl('vbscript:MsgBox(1)')).toBeNull();
    expect(safeExternalUrl('mailto:a@b.com')).toBeNull();
    expect(safeExternalUrl('tel:+351900000000')).toBeNull();
    expect(safeExternalUrl('file:///etc/passwd')).toBeNull();
  });

  it('prefixes https for scheme-less hosts', () => {
    expect(safeExternalUrl('evil.com')).toBe('https://evil.com/');
    expect(safeExternalUrl('escola.pt')).toBe('https://escola.pt/');
  });

  it('keeps valid http(s) URLs', () => {
    expect(safeExternalUrl('https://ok.pt')).toBe('https://ok.pt/');
    expect(safeExternalUrl('http://ok.pt')).toBe('http://ok.pt/');
    expect(safeExternalUrl('https://ok.pt/path?q=1')).toBe('https://ok.pt/path?q=1');
  });

  it('returns null for empty input', () => {
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl('   ')).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});

describe('safeImageUrl', () => {
  it('keeps http(s) URLs', () => {
    expect(safeImageUrl('https://cdn.ventu.surf/flyer.jpg')).toBe('https://cdn.ventu.surf/flyer.jpg');
    expect(safeImageUrl('http://ok.pt/img.png')).toBe('http://ok.pt/img.png');
  });

  it('keeps site-relative /paths (events convention)', () => {
    expect(safeImageUrl('/images/events/nortada-kite-fest.jpg')).toBe('/images/events/nortada-kite-fest.jpg');
    expect(safeImageUrl('/og-image.png')).toBe('/og-image.png');
  });

  it('blocks javascript: / data: / vbscript: schemes', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull();
    expect(safeImageUrl('vbscript:MsgBox(1)')).toBeNull();
  });

  it('blocks protocol-relative //host and backslash tricks', () => {
    expect(safeImageUrl('//evil.com/x.png')).toBeNull();
    expect(safeImageUrl('/\\evil.com/x.png')).toBeNull();
  });

  it('returns null for empty/null input', () => {
    expect(safeImageUrl('')).toBeNull();
    expect(safeImageUrl('   ')).toBeNull();
    expect(safeImageUrl(null)).toBeNull();
    expect(safeImageUrl(undefined)).toBeNull();
  });
});

describe('safeTelHref', () => {
  it('builds tel: from normal phone numbers', () => {
    expect(safeTelHref('+351 912 345 678')).toBe('tel:+351 912 345 678');
    expect(safeTelHref('(21) 123-4567')).toBe('tel:(21) 123-4567');
  });

  it('strips characters that could break tel:', () => {
    expect(safeTelHref('912#javascript:alert(1)')).toBe('tel:912');
    expect(safeTelHref('abc')).toBeNull();
    expect(safeTelHref('')).toBeNull();
    expect(safeTelHref(null)).toBeNull();
  });
});
