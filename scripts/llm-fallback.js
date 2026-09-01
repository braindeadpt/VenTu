/**
 * VenTu — LLM fallback chain: Gemini → Groq → Cerebras → throw
 * Used by dawn-patrol.js and update-news.js
 *
 * Model IDs (updated 2026-09-01 after production outage):
 *   - Gemini: gemini-2.0-flash → 404; use gemini-2.5-flash (GA)
 *   - Groq: llama-3.3-70b-versatile retired 2026-08-16; use openai/gpt-oss-120b
 *   - Cerebras: gpt-oss-120b (402 = billing/quota on the account, not a bad model id)
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

const PROVIDERS = {
  gemini: {
    name: 'Gemini',
    apiKey: GEMINI_API_KEY,
    model: 'gemini-2.5-flash',
    baseUrl:
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    isOpenAI: false,
  },
  groq: {
    name: 'Groq',
    apiKey: GROQ_API_KEY,
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    isOpenAI: true,
    // llama-3.3-70b-versatile retired 2026-08-16 — Groq's replacement ID
    model: 'openai/gpt-oss-120b',
    maxTokens: 2048,
  },
  cerebras: {
    name: 'Cerebras',
    apiKey: CEREBRAS_API_KEY,
    baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
    isOpenAI: true,
    model: 'gpt-oss-120b',
    maxTokens: 2048,
  },
};

async function callGemini(prompt, maxTokens = 2048) {
  const url = `${PROVIDERS.gemini.baseUrl}?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
    }),
  });

  if (!response.ok) {
    const body = (await response.text()).slice(0, 200);
    throw new Error(`Gemini HTTP ${response.status} (${PROVIDERS.gemini.model}): ${body}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

async function callOpenAIProvider(provider, prompt, maxTokens = 2048) {
  const response = await fetch(provider.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    const hint =
      response.status === 402
        ? ' (billing/quota — check provider console)'
        : response.status === 404
          ? ` (model id "${provider.model}" may be retired)`
          : '';
    throw new Error(
      `${provider.name} HTTP ${response.status}${hint}: ${error.substring(0, 200)}`,
    );
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(`${provider.name} returned empty response`);
  return text;
}

/**
 * Call LLM with automatic fallback chain
 * @param {string} prompt
 * @param {{ maxTokens?: number, extractJson?: boolean }} [options]
 * @returns {Promise<string|object>}
 */
async function callLLM(prompt, options = {}) {
  const { maxTokens = 2048, extractJson = false } = options;
  const errors = [];

  const chain = [
    { key: 'gemini', fn: () => callGemini(prompt, maxTokens) },
    { key: 'groq', fn: () => callOpenAIProvider(PROVIDERS.groq, prompt, maxTokens) },
    { key: 'cerebras', fn: () => callOpenAIProvider(PROVIDERS.cerebras, prompt, maxTokens) },
  ];

  for (const { key, fn } of chain) {
    const provider = PROVIDERS[key];
    if (!provider.apiKey) {
      console.log(`   ⏭️ ${provider.name}: no API key configured`);
      continue;
    }

    if (errors.length > 0) await new Promise((r) => setTimeout(r, 1500));

    try {
      console.log(`   🤖 Trying ${provider.name} (${provider.model})...`);
      const text = await fn();
      console.log(`   ✅ ${provider.name} responded (${text.length} chars)`);

      if (extractJson) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch {
            console.warn(`   ⚠️ ${provider.name} returned invalid JSON, using raw text`);
            return text;
          }
        }
      }

      return text;
    } catch (e) {
      console.warn(`   ❌ ${provider.name} failed: ${e.message}`);
      errors.push(`${provider.name}: ${e.message}`);
    }
  }

  const errorMsg = `All LLM providers failed:\n${errors.join('\n')}`;
  console.error(`❌ ${errorMsg}`);
  throw new Error(errorMsg);
}

function getAvailableProviders() {
  return Object.entries(PROVIDERS)
    .filter(([, p]) => !!p.apiKey)
    .map(([key, p]) => ({ key, name: p.name, model: p.model }));
}

module.exports = { callLLM, getAvailableProviders, PROVIDERS };
