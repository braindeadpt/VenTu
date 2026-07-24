import { describe, expect, it } from 'vitest';
import { safeExternalUrl, safeTelHref } from '../safeUrl';

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
