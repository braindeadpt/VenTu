import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

/** Safelist — classes referenced dynamically that Tailwind JIT can't detect. */
const SCORE_GLOW_SAFELIST = [
  'shadow-glow-epic',
  'shadow-glow-good',
  'shadow-glow-fair',
  'shadow-glow-poor',
  'shadow-glow-closed',
]

/**
 * VenTu Tailwind Config — Design System v2.0
 *
 * Ocean-tech sério. Dados são protagonistas.
 *
 * Semantic tokens (use these in new code):
 * - bg-surface-1 / bg-surface-2: card backgrounds
 * - text-fg / text-fg-muted / text-fg-subtle: text hierarchy
 * - border-divider: subtle separators
 * - text-score-epic / bg-score-epic/10 / shadow-glow-epic etc.
 * - text-data-waves / text-data-wind / text-data-water / text-data-period
 * - text-sport-{surf,kitesurf,windsurf,...}
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

        bg: {
          base:     'rgb(var(--bg-base) / <alpha-value>)',
          elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
        },
        // RGB-only in CSS vars — always set opacity: bg-surface-1/[0.04], bg-surface-2/[0.08], bg-surface-3/[0.12]
        surface: {
          1: 'rgb(var(--surface-1) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
          3: 'rgb(var(--surface-3) / <alpha-value>)',
        },
        divider: {
          DEFAULT: 'rgb(var(--divider))',
          strong:  'rgb(var(--divider-strong))',
        },
        fg: {
          DEFAULT:  'rgb(var(--fg))',
          muted:    'rgb(var(--fg-muted))',
          subtle:   'rgb(var(--fg-subtle))',
          disabled: 'rgb(var(--fg-disabled))',
        },

        // ═══════════════════════════════════════════════════════════
        //  DATA VISUALIZATION COLORS
        // ═══════════════════════════════════════════════════════════
        data: {
          waves:  'rgb(var(--data-waves) / <alpha-value>)',
          wind:   'rgb(var(--data-wind) / <alpha-value>)',
          water:  'rgb(var(--data-water) / <alpha-value>)',
          period: 'rgb(var(--data-period) / <alpha-value>)',
        },

        // ═══════════════════════════════════════════════════════════
        //  SPORT ACCENTS
        // ═══════════════════════════════════════════════════════════
        sport: {
          surf:      'rgb(var(--sport-surf) / <alpha-value>)',
          kitesurf:  'rgb(var(--sport-kitesurf) / <alpha-value>)',
          windsurf:  'rgb(var(--sport-windsurf) / <alpha-value>)',
          bodyboard: 'rgb(var(--sport-bodyboard) / <alpha-value>)',
          sup:       'rgb(var(--sport-sup) / <alpha-value>)',
          wakeboard: 'rgb(var(--sport-wakeboard) / <alpha-value>)',
          foil:      'rgb(var(--sport-foil) / <alpha-value>)',
        },

        // ═══════════════════════════════════════════════════════════
        //  SCORE COLORS
        // ═══════════════════════════════════════════════════════════
        score: {
          epic:   'rgb(var(--score-epic) / <alpha-value>)',
          good:   'rgb(var(--score-good) / <alpha-value>)',
          fair:   'rgb(var(--score-fair) / <alpha-value>)',
          mid:    'rgb(var(--score-mid, var(--score-fair)) / <alpha-value>)',
          poor:   'rgb(var(--score-poor) / <alpha-value>)',
          closed: 'rgb(var(--score-closed) / <alpha-value>)',
        },

        // ═══════════════════════════════════════════════════════════
        //  WIND DIRECTION TINT
        // ═══════════════════════════════════════════════════════════
        windDir: {
          offshore: 'rgb(var(--windDir-offshore) / <alpha-value>)',
          onshore:  'rgb(var(--windDir-onshore) / <alpha-value>)',
          cross:    'rgb(var(--windDir-cross) / <alpha-value>)',
        },

      },

      // ═══════════════════════════════════════════════════════════
      //  TYPOGRAPHY
      // ═══════════════════════════════════════════════════════════
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
        serif: ['Georgia', 'serif'],
      },

      fontSize: {
        // Display — hero scores, major numeric displays
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

        // Numeric — pair with font-mono for alignment
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
        'chip':  '4px',
        'input': '6px',
        'card':  '8px',
        'modal': '12px',
        'pill':  '9999px',
      },

      boxShadow: {
        'card':         '0 1px 2px 0 rgb(0 0 0 / 0.2), 0 1px 3px 0 rgb(0 0 0 / 0.15)',
        'card-hover':   '0 8px 24px -4px rgb(0 0 0 / 0.3), 0 4px 8px -2px rgb(0 0 0 / 0.2)',
        'inset-divider':'inset 0 -1px 0 0 rgb(255 255 255 / 0.06)',
        'modal':        '0 8px 24px -4px rgb(0 0 0 / 0.3), 0 4px 8px -2px rgb(0 0 0 / 0.2)',

        // Score glows
        'glow-epic':   '0 0 32px -4px rgb(var(--score-epic) / 0.45)',
        'glow-good':   '0 0 32px -4px rgb(var(--score-good) / 0.40)',
        'glow-fair':   '0 0 24px -4px rgb(var(--score-fair) / 0.35)',
        'glow-poor':   '0 0 24px -4px rgb(var(--score-poor) / 0.30)',
        'glow-closed': '0 0 16px -4px rgb(var(--score-closed) / 0.25)',
      },

      // ═══════════════════════════════════════════════════════════
      //  ANIMATION
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
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.font-tabular': {
          'font-variant-numeric': 'tabular-nums',
        },
      })
    }),
  ],
}

export default config
