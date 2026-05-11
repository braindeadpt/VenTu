import type { Config } from 'tailwindcss'

/** Safelist — classes referenced dynamically that Tailwind JIT can't detect. */
const SCORE_GLOW_SAFELIST = [
  'shadow-glow-epic',
  'shadow-glow-good',
  'shadow-glow-fair',
  'shadow-glow-poor',
  'shadow-glow-closed',
]

/**
 * WindSpot Tailwind Config
 *
 * Design system organized around three layers:
 *
 * 1. SEMANTIC TOKENS (use these in new code)
 *    - bg-surface-1 / bg-surface-2: card backgrounds
 *    - text-fg / text-fg-muted / text-fg-subtle: text hierarchy
 *    - border-divider: subtle separators
 *    - Score colors via CSS vars (see globals.css):
 *      use `text-score-epic` / `bg-score-epic/10` / `shadow-glow-epic` etc.
 *      where the suffix is one of: epic, good, fair, poor, closed
 *
 * 2. DATA-VIZ COLORS (use for charts, gauges, condition icons)
 *    - text-data-waves, text-data-wind, text-data-water, text-data-period
 *
 * 3. SPORT ACCENTS (use ONLY for sport identification — icons, badges, tabs)
 *    Never as primary background or border.
 *    - text-sport-surf, text-sport-kitesurf, text-sport-windsurf,
 *      text-sport-bodyboard, text-sport-sup, text-sport-wakeboard
 *
 * LEGACY (deprecated, kept for backward compat):
 * - ocean / surf / wave / wind 50-900 palettes are still defined but should be
 *   migrated to the semantic tokens above as components are redesigned.
 *
 * Typography: use semantic tokens (text-h1, text-body, text-num) instead of
 * raw sizes (text-3xl, text-base). Tailwind defaults remain available for
 * one-off cases.
 */

const config: Config = {
  safelist: SCORE_GLOW_SAFELIST,
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ═══════════════════════════════════════════════════════════
        //  SEMANTIC SURFACE / TEXT TOKENS
        // ═══════════════════════════════════════════════════════════

        // Backgrounds (use these for app shell + cards)
        bg: {
          base: '#09090b',       // zinc-950 — page background
          elevated: '#18181b',   // zinc-900 — modals, popovers
        },
        surface: {
          1: 'rgb(255 255 255 / 0.04)',   // default card
          2: 'rgb(255 255 255 / 0.08)',   // hover / active card
          3: 'rgb(255 255 255 / 0.12)',   // pressed / selected
        },
        divider: {
          DEFAULT: 'rgb(255 255 255 / 0.08)',
          strong: 'rgb(255 255 255 / 0.12)',
        },

        // Foreground text (semantic hierarchy)
        fg: {
          DEFAULT: 'rgb(255 255 255 / 0.95)',  // primary text
          muted: 'rgb(255 255 255 / 0.65)',    // secondary — AA on bg-base
          subtle: 'rgb(255 255 255 / 0.45)',   // tertiary — labels (AA large only)
          disabled: 'rgb(255 255 255 / 0.30)', // disabled state
        },

        // ═══════════════════════════════════════════════════════════
        //  DATA VISUALIZATION COLORS
        //  (use for chart series, condition icons, gauges)
        // ═══════════════════════════════════════════════════════════
        data: {
          waves: '#60a5fa',    // blue-400  — ocean wave
          wind: '#fbbf24',     // amber-400 — air movement
          water: '#2dd4bf',    // teal-400  — water temperature
          period: '#a78bfa',   // violet-400 — temporal measure
        },

        // ═══════════════════════════════════════════════════════════
        //  SPORT ACCENTS
        //  Used only for sport identification (icons, badges, tabs).
        //  Chosen to be visually distinct from each other AND from
        //  score colors. Never use as card background or primary border.
        // ═══════════════════════════════════════════════════════════
        sport: {
          surf: '#22d3ee',      // cyan-400
          kitesurf: '#c084fc',  // purple-400  — distinct from surf
          windsurf: '#fb923c',  // orange-400  — "wind & speed"
          bodyboard: '#2dd4bf', // teal-400
          sup: '#6ee7b7',       // emerald-300
          wakeboard: '#e879f9', // fuchsia-400 — cable park, stands out
        },

        // ═══════════════════════════════════════════════════════════
        //  WIND DIRECTION TINT (offshore vs onshore)
        //  Use as subtle background or border tint, not dominant color.
        //  NOTE: namespaced under windDir/ to avoid collision with the
        //        legacy `wind` palette below.
        // ═══════════════════════════════════════════════════════════
        windDir: {
          offshore: '#22c55e',  // green-500 — wind from land (good for surf)
          onshore: '#ef4444',   // red-500   — wind from sea (bad for surf)
          cross: '#94a3b8',     // slate-400 — sideshore (neutral)
        },

        // ═══════════════════════════════════════════════════════════
        //  LEGACY PALETTES (deprecated — migrate to semantic tokens)
        //  Kept to avoid breaking 15 files that currently use them.
        //  TODO: remove once Fase 4 component migration is complete.
        // ═══════════════════════════════════════════════════════════
        ocean: {
          50: '#f0f9ff',   100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc',
          400: '#38bdf8',  500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1',
          800: '#075985',  900: '#0c4a6e', 950: '#082f49',
        },
        surf: {
          50: '#ecfdf5',   100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7',
          400: '#34d399',  500: '#10b981', 600: '#059669', 700: '#047857',
          800: '#065f46',  900: '#064e3b',
        },
        wind: {
          50: '#fffbeb',   100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d',
          400: '#fbbf24',  500: '#f59e0b', 600: '#d97706', 700: '#b45309',
          800: '#92400e',  900: '#78350f',
        },
        wave: {
          50: '#eff6ff',   100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa',  500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af',  900: '#1e3a8a',
        },
      },

      // ═══════════════════════════════════════════════════════════
      //  TYPOGRAPHY
      // ═══════════════════════════════════════════════════════════
      fontFamily: {
        // Wired up in src/app/layout.tsx via the `geist` package.
        // CSS variables: --font-geist-sans, --font-geist-mono.
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },

      // Semantic font sizes with line-height, letter-spacing and weight baked in.
      // Prefer these over raw text-3xl etc. for new code.
      fontSize: {
        // Display — only for hero spot names and major numeric displays
        'display-xl': ['3.5rem',  { lineHeight: '1.05', letterSpacing: '-0.03em',  fontWeight: '700' }],
        'display-lg': ['2.5rem',  { lineHeight: '1.1',  letterSpacing: '-0.025em', fontWeight: '700' }],

        // Headings
        'h1':         ['2rem',    { lineHeight: '1.2',  letterSpacing: '-0.02em',  fontWeight: '600' }],
        'h2':         ['1.5rem',  { lineHeight: '1.3',  letterSpacing: '-0.015em', fontWeight: '600' }],
        'h3':         ['1.125rem',{ lineHeight: '1.4',  letterSpacing: '-0.01em',  fontWeight: '600' }],

        // Body
        'body-lg':    ['1rem',    { lineHeight: '1.55' }],
        'body':       ['0.875rem',{ lineHeight: '1.55' }],
        'body-sm':    ['0.8125rem',{ lineHeight: '1.5' }],

        // Meta — labels, units, captions
        'meta':       ['0.75rem', { lineHeight: '1.4',  letterSpacing: '0.005em' }],
        'meta-sm':    ['0.6875rem',{ lineHeight: '1.4', letterSpacing: '0.04em',  fontWeight: '500' }],

        // Numeric — pair with `font-mono tabular-nums` utilities for alignment
        'num-xl':     ['3rem',    { lineHeight: '1', fontWeight: '600' }],
        'num-lg':     ['2rem',    { lineHeight: '1', fontWeight: '600' }],
        'num':        ['1.125rem',{ lineHeight: '1', fontWeight: '500' }],
        'num-sm':     ['0.875rem',{ lineHeight: '1', fontWeight: '500' }],
        'num-xs':     ['0.75rem', { lineHeight: '1', fontWeight: '500' }],
      },

      // ═══════════════════════════════════════════════════════════
      //  RADIUS / SHADOWS
      // ═══════════════════════════════════════════════════════════
      borderRadius: {
        // One radius per category — don't mix raw rounded-xl/2xl ad hoc
        'card':    '1rem',     // 16px — default card
        'card-lg': '1.5rem',   // 24px — hero cards, major surfaces
        'pill':    '9999px',
      },

      boxShadow: {
        'card':         '0 1px 2px 0 rgb(0 0 0 / 0.2), 0 1px 3px 0 rgb(0 0 0 / 0.15)',
        'card-hover':   '0 8px 24px -4px rgb(0 0 0 / 0.3), 0 4px 8px -2px rgb(0 0 0 / 0.2)',
        'inset-divider':'inset 0 -1px 0 0 rgb(255 255 255 / 0.06)',

        // Score glows for badges, gauges, hero CTAs
        'glow-epic':   '0 0 32px -4px rgb(52 211 153 / 0.45)',  // emerald
        'glow-good':   '0 0 32px -4px rgb(56 189 248 / 0.40)',  // sky
        'glow-fair':   '0 0 24px -4px rgb(251 191 36 / 0.35)',  // amber
        'glow-poor':   '0 0 24px -4px rgb(249 115 22 / 0.30)',  // orange
        'glow-closed': '0 0 16px -4px rgb(244 63 94 / 0.25)',   // rose
      },

      // ═══════════════════════════════════════════════════════════
      //  ANIMATION
      //  prefers-reduced-motion handled globally in globals.css
      // ═══════════════════════════════════════════════════════════
      transitionDuration: {
        'fast': '120ms',
        'base': '200ms',
        'slow': '320ms',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring':   'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        marquee: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'marquee':  'marquee 30s linear infinite',
        'fade-up':  'fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'shimmer':  'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
