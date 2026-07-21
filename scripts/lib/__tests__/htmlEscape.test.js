import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { escapeHtml, safeLocale } = require('../htmlEscape.js');

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml(`O'Neil & Co`)).toBe('O&#39;Neil &amp; Co');
  });

  it('stringifies nullish as empty', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('safeLocale', () => {
  it('allows only pt/en', () => {
    expect(safeLocale('en')).toBe('en');
    expect(safeLocale('pt')).toBe('pt');
    expect(safeLocale('../evil')).toBe('pt');
  });
});
