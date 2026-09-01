import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

/**
 * Ficheiros/rotas já convertidos para o dicionário i18n (getTranslation(locale)).
 * A regra no-restricted-syntax abaixo falha qualquer novo branch `isPt ? 'pt' : 'EN'`
 * de copy nestes ficheiros — os ternários de língua legítimos (isPt ? 'pt' : 'en',
 * 'pt-PT'/'en-GB' em datas, SPORT_LABELS) ficam de fora via :not().
 *
 * À medida que cada rota migra (about, homepage, news, account, …), adiciona-a a
 * MIGRATED_GLOBS para a regra a cobrir também aí.
 */
const MIGRATED_GLOBS = [
  'src/components/admin/**',
  'src/components/compare/**',
  'src/components/directory/**',
  'src/components/passaporte/**',
  'src/components/alerts/**',
  'src/components/tools/**',
  'src/app/[locale]/admin/**',
  'src/app/[locale]/compare/**',
  'src/app/[locale]/diretorio/**',
  'src/app/[locale]/passaporte/**',
  'src/app/[locale]/alerts/**',
  'src/app/[locale]/ferramentas/**',
  'src/components/spots/SpotDetailClient.tsx',
  'src/components/spots/ObservedWaveCard.tsx',
  'src/components/spots/ObservedNow.tsx',
  'src/components/spots/BuoySkillLine.tsx',
  'src/components/spots/SpotConditionsDashboard.tsx',
  'src/components/spots/TideScheduleStrip.tsx',
  'src/components/spots/MoonTideCard.tsx',
];

// Apanha `isPt ? 'copy' : 'copy'` (strings literais OU templates) quando NENHUM
// dos ramos é um código de língua (pt/en/pt-PT/en-GB…). Os selectors de língua
// legítimos (getTranslation, SPORT_LABELS, locales de datas) não matcheiam.
const IS_PT_COPY_TERNARY_SELECTOR =
  "ConditionalExpression[test.name='isPt']" +
  ":matches([consequent.type='Literal'][alternate.type='Literal']," +
  "[consequent.type='TemplateLiteral'][alternate.type='TemplateLiteral'])" +
  ":not([consequent.value=/^(pt|en|es|de|fr)(-[A-Z]{2})?$/])" +
  ":not([alternate.value=/^(pt|en|es|de|fr)(-[A-Z]{2})?$/])";

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    rules: {
      // React 19 compiler rules — too strict for existing client hydration patterns
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: MIGRATED_GLOBS,
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: IS_PT_COPY_TERNARY_SELECTOR,
          message:
            'Copy bilingue fora do dicionário: usa getTranslation(locale) (dicionário i18n) em vez de `isPt ? \'pt\' : \'EN\'` — vê src/lib/i18n.ts.',
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'node_modules/**',
    'build/**',
  ]),
]);

export default eslintConfig;
