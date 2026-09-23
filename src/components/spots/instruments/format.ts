import { LOCALE_HTML_LANG, type Locale } from '@/lib/i18n';

/** Formatters por locale, com cache de módulo (Intl.NumberFormat é caro). */
const cache = new Map<
  string,
  {
    f0: (n: number) => string;
    f1: (n: number) => string;
    /** Com sinal explícito (−0,45 / +0,33) — marés. */
    fS: (n: number) => string;
    weekdayShort: (isoLocal: string) => string;
  }
>();

export function getInstrumentFmt(locale: string) {
  const tag = LOCALE_HTML_LANG[(locale as Locale)] ?? 'pt-PT';
  const cached = cache.get(tag);
  if (cached) return cached;

  const nf1 = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const nf0 = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const wd = new Intl.DateTimeFormat(tag, { weekday: 'short' });
  const fmt = {
    f0: (n: number) => nf0.format(Math.round(n)),
    f1: (n: number) => nf1.format(n),
    fS: (n: number) => (n < 0 ? '−' : n > 0 ? '+' : '') + nf1.format(Math.abs(n)),
    // «seg»/«Mon» — a data vem em ISO local («2026-09-21T00:00»); construir
    // por partes evita deriva de fuso num runtime fora de Europe/Lisbon.
    weekdayShort: (isoLocal: string) => {
      const [y, m, d] = isoLocal.slice(0, 10).split('-').map(Number);
      return wd.format(new Date(y, (m || 1) - 1, d || 1)).replace('.', '');
    },
  };
  cache.set(tag, fmt);
  return fmt;
}
