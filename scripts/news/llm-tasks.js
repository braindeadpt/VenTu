/**
 * VenTu — LLM Auxiliary Tasks (Etapa 3)
 *
 * Three small, specific LLM tasks:
 *   A — Categorise an RSS item by modality
 *   B — Translate PT ↔ EN
 *   C — Synthesise a short news story from an event
 *
 * LLM NEVER researches. NEVER invents facts.
 * Each call is a single shot with a strict prompt.
 */

const { callLLM } = require('../llm-fallback');

const CATEGORIES = ['surf', 'kitesurf', 'windsurf', 'big-wave', 'sup', 'foil', 'bodyboard', 'wakeboard', 'safety', 'general'];

/**
 * Task A — Categorise a news item by modality.
 * Falls back to defaultCategory on failure.
 *
 * @param {string} title
 * @param {string} summary
 * @param {string} defaultCategory
 * @returns {Promise<string>}
 */
async function categoriseItem(title, summary, defaultCategory) {
  const prompt = `Categoriza este item de notícia náutica numa das categorias: ${CATEGORIES.join(', ')}.

Título: ${title}
Resumo: ${(summary || '').substring(0, 300)}

Responde APENAS com a categoria, sem mais texto.`;

  try {
    const text = await callLLM(prompt, { maxTokens: 20 });
    const cat = text.trim().toLowerCase();
    if (CATEGORIES.includes(cat)) return cat;
    console.warn(`  ⚠️ LLM returned invalid category "${cat}", using default "${defaultCategory}"`);
    return defaultCategory;
  } catch (e) {
    console.warn(`  ⚠️ LLM categorise failed: ${e.message}, using default "${defaultCategory}"`);
    return defaultCategory;
  }
}

/**
 * Task B — Translate text from source language to target.
 *
 * @param {string} text - Text to translate
 * @param {'pt' | 'en'} targetLang
 * @returns {Promise<string>}
 */
async function translateText(text, targetLang) {
  if (!text || text.trim().length < 5) return text;

  const langName = targetLang === 'pt' ? 'português europeu' : 'English';
  const prompt = `Traduz para ${langName} este texto sobre desportos náuticos.
Mantém nomes próprios, locais e termos técnicos.
Tom factual, sem floreados.

Texto: ${text.substring(0, 500)}

Responde APENAS com a tradução, sem mais texto.`;

  try {
    const result = await callLLM(prompt, { maxTokens: 512 });
    const cleaned = result.trim().replace(/^["']|["']$/g, '');
    if (cleaned.length > 0) return cleaned;
    return text;
  } catch (e) {
    console.warn(`  ⚠️ LLM translate failed: ${e.message}, using original`);
    return text;
  }
}

/**
 * Translate RSS item fields so both title/titleEn and summary/summaryEn exist.
 * If source text is same in both languages, assume it's English → translate to PT.
 *
 * @param {{ title: string; titleEn: string; summary: string; summaryEn: string }} item
 * @returns {Promise<{ title: string; titleEn: string; summary: string; summaryEn: string }>}
 */
async function ensureBilingual(item) {
  // Assume all RSS feeds are in English
  if (item.title && !item.titleEn) item.titleEn = item.title;
  if (item.summary && !item.summaryEn) item.summaryEn = item.summary;

  if (item.title) {
    item.title = await translateText(item.title, 'pt');
  }
  if (item.summary) {
    item.summary = await translateText(item.summary, 'pt');
  }

  return item;
}

/**
 * Task C — Synthesise a short news story from a detected event.
 * @param {{ title: string; summary: string; eventSeverity: string; category: string; tags: string[] }} event
 * @returns {Promise<{ title: string; titleEn: string; summary: string; summaryEn: string; keyPoints: string[] } | null>}
 */
async function synthesiseEvent(event) {
  const affectedSpots = (event.tags || []).filter((t) => !['ondas-grandes', 'big-wave', 'vento-forte', 'strong-wind', 'agua-quente', 'warm-water', 'verao', 'tempestade', 'storm', 'safety'].includes(t));
  const eventDesc = `${event.title} — ${event.summary.substring(0, 200)}`;

  const prompt = `És editor da VenTu. Foi detectado este evento meteorológico:

Evento: ${eventDesc}
Categoria: ${event.category}
Severidade: ${event.eventSeverity}
Spots afectados: ${affectedSpots.length > 0 ? affectedSpots.join(', ') : 'Vários spots em Portugal'}

Escreve UMA notícia curta sobre este evento. Tom factual e útil, sem exagero. Português europeu. Não uses 'brutal', 'épico', 'chega para nos varrer'.

Responde APENAS com JSON neste formato exacto:
{
  "title": "string PT, max 80 chars",
  "titleEn": "string EN, max 80 chars",
  "summary": "string PT, 2-3 frases factuais",
  "summaryEn": "string EN, 2-3 frases factuais",
  "keyPoints": ["ponto 1 PT", "ponto 2 PT", "ponto 3 PT"]
}

Sem texto antes nem depois do JSON. Sem markdown fences.`;

  try {
    const json = await callLLM(prompt, { maxTokens: 512, extractJson: true });
    if (json && json.title && json.summary) {
      return {
        title: json.title,
        titleEn: json.titleEn || json.title,
        summary: json.summary,
        summaryEn: json.summaryEn || json.summary,
        keyPoints: Array.isArray(json.keyPoints) ? json.keyPoints : [],
      };
    }
    throw new Error('Invalid JSON shape from LLM');
  } catch (e) {
    console.warn(`  ⚠️ LLM synthesise failed: ${e.message}, using raw event`);
    return null;
  }
}

module.exports = { categoriseItem, translateText, ensureBilingual, synthesiseEvent };
