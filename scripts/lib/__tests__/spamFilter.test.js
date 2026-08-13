import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { canDiscard, isSafeHttpUrl } = require('../../news/spam-filter.js');

describe('spam-filter URL validation (S3)', () => {
  it('accepts valid http(s) items', () => {
    expect(
      canDiscard({ title: 'Ondas grandes', url: 'https://example.com/a', summary: 'x' }),
    ).toBe(false);
    expect(
      canDiscard({ title: 'Ondas grandes', url: 'http://example.com/a', summary: 'x' }),
    ).toBe(false);
  });

  it('discards javascript: URLs', () => {
    expect(
      canDiscard({ title: 'Ondas grandes', url: 'javascript:alert(1)', summary: 'x' }),
    ).toBe(true);
  });

  it('discards data:/vbscript: URLs', () => {
    expect(
      canDiscard({ title: 'Ondas grandes', url: 'data:text/html,<script>1</script>', summary: 'x' }),
    ).toBe(true);
    expect(
      canDiscard({ title: 'Ondas grandes', url: 'vbscript:msgbox(1)', summary: 'x' }),
    ).toBe(true);
  });

  it('discards items without a URL', () => {
    expect(canDiscard({ title: 'Ondas', url: '', summary: '' })).toBe(true);
    expect(canDiscard({ title: 'Ondas', summary: '' })).toBe(true);
  });

  it('isSafeHttpUrl matches only http(s)', () => {
    expect(isSafeHttpUrl('https://x.pt')).toBe(true);
    expect(isSafeHttpUrl('http://x.pt')).toBe(true);
    expect(isSafeHttpUrl('ftp://x.pt')).toBe(false);
    expect(isSafeHttpUrl('javascript:foo')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,x')).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });
});
