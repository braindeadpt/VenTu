import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PROVIDERS, getAvailableProviders } = require('../../llm-fallback.js');

describe('llm-fallback provider models (P0 — retired IDs broke dawn patrol)', () => {
  it('Gemini aponta para gemini-3.6-flash (2.0/2.5 fechados a keys novas)', () => {
    expect(PROVIDERS.gemini.model).toBe('gemini-3.6-flash');
    expect(PROVIDERS.gemini.baseUrl).toContain('gemini-3.6-flash');
    expect(PROVIDERS.gemini.baseUrl).not.toMatch(/gemini-2\.[05]-flash/);
  });

  it('Groq usa openai/gpt-oss-120b (llama-3.3-70b-versatile retired 2026-08-16)', () => {
    expect(PROVIDERS.groq.model).toBe('openai/gpt-oss-120b');
    expect(PROVIDERS.groq.model).not.toMatch(/llama-3\.3/);
  });

  it('Cerebras mantém gpt-oss-120b (402 em prod = billing, não model id)', () => {
    expect(PROVIDERS.cerebras.model).toBe('gpt-oss-120b');
  });

  it('getAvailableProviders devolve a forma esperada', () => {
    const listed = getAvailableProviders();
    expect(Array.isArray(listed)).toBe(true);
    for (const p of listed) {
      expect(p).toEqual(
        expect.objectContaining({
          key: expect.any(String),
          name: expect.any(String),
          model: expect.any(String),
        }),
      );
    }
  });
});
