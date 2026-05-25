/**
 * Infer news category from title/summary when feed default is too broad.
 */

const RULES = [
  {
    category: 'wakeboard',
    keywords: ['wakeboard', 'wake board', 'cable park', 'wake park', 'wakeskate'],
  },
  {
    category: 'kitesurf',
    keywords: ['kitesurf', 'kite surf', 'kiteboard', 'kitesurfing'],
  },
  {
    category: 'windsurf',
    keywords: ['windsurf', 'wind surf', 'windsurfing', 'windfoil'],
  },
  {
    category: 'foil',
    keywords: ['hydrofoil', 'wing foil', 'wingfoil', 'prone foil'],
  },
  {
    category: 'big-wave',
    keywords: ['big wave', 'ondas gigantes', 'nazaré', 'nazare'],
  },
];

function inferCategoryFromText(text, fallback) {
  if (!text) return fallback;
  const lower = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.category;
    }
  }
  return fallback;
}

/**
 * @param {{ title?: string; summary?: string; defaultCategory: string }} stub
 */
function applyCategoryKeywords(stub) {
  const combined = `${stub.title || ''} ${stub.summary || ''}`;
  return {
    ...stub,
    defaultCategory: inferCategoryFromText(combined, stub.defaultCategory),
  };
}

module.exports = { inferCategoryFromText, applyCategoryKeywords, RULES };
