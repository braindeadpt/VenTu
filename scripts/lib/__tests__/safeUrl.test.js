import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isSafeHttpUrl, isSafeImageUrl } = require('../safeUrl.js');
const { sanitizeItemImage } = require('../../news/merge-persist.js');

describe('isSafeHttpUrl (scripts CJS)', () => {
  it('accepts http(s) only', () => {
    expect(isSafeHttpUrl('https://x.pt')).toBe(true);
    expect(isSafeHttpUrl('http://x.pt')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,x')).toBe(false);
    expect(isSafeHttpUrl('ftp://x.pt')).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
  });
});

describe('isSafeImageUrl (scripts CJS)', () => {
  it('accepts http(s) and site-relative /paths', () => {
    expect(isSafeImageUrl('https://cdn.x.pt/a.jpg')).toBe(true);
    expect(isSafeImageUrl('/images/events/a.jpg')).toBe(true);
  });

  it('rejects schemes and protocol-relative tricks', () => {
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:image/svg+xml,<svg/>')).toBe(false);
    expect(isSafeImageUrl('//evil.com/x.png')).toBe(false);
    expect(isSafeImageUrl('/\\evil.com/x.png')).toBe(false);
    expect(isSafeImageUrl('')).toBe(false);
    expect(isSafeImageUrl(undefined)).toBe(false);
  });
});

describe('sanitizeItemImage (news merge choke point)', () => {
  it('keeps safe images and drops unsafe ones', () => {
    const safe = sanitizeItemImage({ title: 'A', image: 'https://x.pt/a.jpg' });
    expect(safe.image).toBe('https://x.pt/a.jpg');

    const relative = sanitizeItemImage({ title: 'B', image: '/images/events/b.jpg' });
    expect(relative.image).toBe('/images/events/b.jpg');

    const bad = sanitizeItemImage({ title: 'C', image: 'javascript:alert(1)' });
    expect(bad).toEqual({ title: 'C' });
    expect('image' in bad).toBe(false);

    const noImage = sanitizeItemImage({ title: 'D' });
    expect(noImage).toEqual({ title: 'D' });
  });
});
