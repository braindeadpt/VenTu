/**
 * VenTu - LLM Fallback Module
 * Cadeia de fallback: Gemini → Groq → Cerebras → Static
 * Usado por dawn-patrol.js e update-news.js
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

// Provider configs
const PROVIDERS = {
  gemini: {
    name: 'Gemini',
    apiKey: GEMINI_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    isOpenAI: false,
  },
  groq: {
    name: 'Groq',
    apiKey: GROQ_API_KEY,
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    isOpenAI: true,
    model: 'llama-3.3-70b-versatile',
    maxTokens: 2048,
  },
  cerebras: {
    name: 'Cerebras',
    apiKey: CEREBRAS_API_KEY,
    baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
    isOpenAI: true,
    model: 'llama-3.3-70b',
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
    throw new Error(`Gemini HTTP ${response.status}`);
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
      'Authorization': `Bearer ${provider.apiKey}`,
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
    throw new Error(`${provider.name} HTTP ${response.status}: ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(`${provider.name} returned empty response`);
  return text;
}

/**
 * Call LLM with automatic fallback chain
 * @param {string} prompt - The prompt to send
 * @param {object} options
 * @param {number} options.maxTokens - Max output tokens
 * @param {string} options.extractJson - If true, extracts JSON from response
 * @returns {Promise<string>} LLM response text
 */
async function callLLM(prompt, options = {}) {
  const { maxTokens = 2048, extractJson = false } = options;
  const errors = [];

  // Try chain: Gemini → Groq → Cerebras
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

    try {
      console.log(`   🤖 Trying ${provider.name}...`);
      const text = await fn();
      console.log(`   ✅ ${provider.name} responded (${text.length} chars)`);

      if (extractJson) {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch (e) {
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

  // All providers failed
  const errorMsg = `All LLM providers failed:\n${errors.join('\n')}`;
  console.error(`❌ ${errorMsg}`);
  throw new Error(errorMsg);
}

/**
 * Check which providers are available
 */
function getAvailableProviders() {
  return Object.entries(PROVIDERS)
    .filter(([_, p]) => !!p.apiKey)
    .map(([key, p]) => ({ key, name: p.name }));
}

module.exports = { callLLM, getAvailableProviders, PROVIDERS };
