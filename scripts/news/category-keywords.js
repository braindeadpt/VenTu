/**
 * Infer news category from title/summary when feed default is too broad.
 * Order matters: first match wins.
 */

const NICHE_SPORTS = new Set(['bodyboard', 'wakeboard', 'foil', 'sup', 'kitesurf', 'windsurf', 'big-wave', 'surf']);

const RULES = [
  {
    category: 'bodyboard',
    keywords: [
      'bodyboard', 'body board', 'bodyboarding', 'boogie board',
      'prone', 'drop knee', 'drop-knee', 'iamba', 'apb',
    ],
  },
  {
    category: 'wakeboard',
    keywords: [
      'wakeboard', 'wake board', 'wakeboarding', 'wakeskate', 'wakesurfing',
      'cable park', 'wake park', 'cable wake', 'boat wake',
    ],
  },
  {
    category: 'sup',
    keywords: [
      'stand up paddle', 'stand-up paddle', 'standup paddle', 'paddleboard',
      'paddle board', 'sup race', 'sup surfing', ' sup ', 'foil sup',
      'alqueva', 'lagoa de óbidos', 'lagoa de obidos',
    ],
  },
  {
    category: 'foil',
    keywords: [
      'kitefoil', 'kite foil', 'kitefoiling', 'hydrofoil', 'hydro foil',
      'wing foil', 'wingfoil', 'wing foiling', 'prone foil', 'dock start',
      'foil surfing', 'windfoil', 'wind foil',
    ],
  },
  {
    category: 'kitesurf',
    keywords: ['kitesurf', 'kite surf', 'kiteboard', 'kitesurfing', 'kite boarding'],
  },
  {
    category: 'windsurf',
    keywords: ['windsurf', 'wind surf', 'windsurfing'],
  },
  {
    category: 'big-wave',
    keywords: ['big wave', 'ondas gigantes', 'nazaré', 'nazare', 'supertubos', 'tow-in'],
  },
  {
    category: 'surf',
    keywords: [
      'peniche', 'ericeira', 'costa da caparica', 'guincho', 'carcavelos',
      'sagres', 'algarve', 'madeira', 'açores', 'azores', 'cascais',
      'praia do norte', 'baleal', 'coxos', 'ribeira d', 'surf championship',
      'world surf league', 'wsl',
    ],
  },
  {
    category: 'kitesurf',
    keywords: ['foz do arelho', 'lagos', 'tavira', 'obidos lagoon', 'lagoa de óbidos'],
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

/** True when keyword inference found a specific sport (not generic). */
function hasSpecificCategory(text, fallback) {
  const inferred = inferCategoryFromText(text, fallback);
  return inferred !== fallback && NICHE_SPORTS.has(inferred);
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

module.exports = {
  inferCategoryFromText,
  applyCategoryKeywords,
  hasSpecificCategory,
  NICHE_SPORTS,
  RULES,
};
