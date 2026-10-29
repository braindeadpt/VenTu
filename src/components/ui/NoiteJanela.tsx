/**
 * Peças do estado «Noite» fora do /mapa (opção A, aprovada 28/10; maquete
 * `noite.html`): a lua no fill `noite` (#56677B, a mesma do `Nota` do spot v6),
 * a próxima janela «amanhã 07–11h [8]» com a nota UMA vez (chip na banda) e a
 * faixa de contexto das listas. Só apresentação: quem chama decide se é noite
 * e qual é a janela (`lib/noiteListas`).
 */
import type { CSSProperties } from 'react';
import { getTranslation } from '@/lib/i18n';
import { DATE_LOCALE } from '@/lib/dataFreshness';
import { scoreToNota } from '@/lib/nota';
import { V6_BANDAS } from '@/lib/v6Tokens';
import { bandaDeScore, type JanelaSeguinte } from '@/lib/noiteListas';
import { formatUpcomingWindowLabel } from '@/lib/upcomingWindowLabel';
import { LUA_D } from '@/components/v6/Nota';
import { cn } from '@/lib/cn';

/** Lua branca no fill da banda «noite» (o quadrado do `Nota` v6). */
export function LuaNoite({
  size = 32,
  locale,
  className,
  decorativa = false,
}: {
  size?: number;
  locale: string;
  className?: string;
  /** Já há um rótulo «Noite» ao lado: a lua fica fora da árvore acessível. */
  decorativa?: boolean;
}) {
  const t = getTranslation(locale).noite;
  return (
    <span
      className={cn('inline-grid place-items-center shrink-0', className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: V6_BANDAS.noite.c,
        color: V6_BANDAS.noite.t,
      }}
      data-noite=""
      {...(decorativa ? { 'aria-hidden': true } : { role: 'img', 'aria-label': t.luaAria })}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: '58%', height: '58%' }}>
        <path d={LUA_D} fill="currentColor" />
      </svg>
    </span>
  );
}

/** Pílula «🌙 NOITE» (cabeçalho do comparador, faixas). */
export function PilulaNoite({ locale, className }: { locale: string; className?: string }) {
  const t = getTranslation(locale).noite;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[7px] py-1 pl-1.5 pr-2 text-meta-sm font-bold uppercase tracking-[0.1em] whitespace-nowrap',
        className,
      )}
      style={{ background: V6_BANDAS.noite.c, color: V6_BANDAS.noite.t }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5">
        <path d={LUA_D} fill="currentColor" />
      </svg>
      {t.rotulo}
    </span>
  );
}

/** A nota da janela, uma vez, no fill da banda v6. */
export function ChipNota({ score, locale, className }: { score: number; locale: string; className?: string }) {
  const n = scoreToNota(score);
  const b = V6_BANDAS[bandaDeScore(score)];
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center min-w-[1.7em] rounded-[7px] px-1.5 py-0.5 font-mono font-bold tabular-nums leading-none',
        className,
      )}
      style={{ background: b.c, color: b.t } as CSSProperties}
      aria-label={getTranslation(locale).noite.chipAria.replace('{n}', String(n))}
      data-nota-janela={n}
    >
      {n}
    </span>
  );
}

/**
 * «Hoje» / «Amanhã» / dia da semana do início da janela. `dia` = dias desde
 * hoje no relógio de quem lê (`null` antes de haver relógio: dia da semana).
 */
export function rotuloDiaJanela(iso: string, dia: number | null, locale: string): string {
  const c = getTranslation(locale).common;
  if (dia === 0) return c.today;
  if (dia === 1) return c.tomorrow;
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12));
  const w = new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? 'en-GB', { timeZone: 'UTC', weekday: 'long' })
    .format(d)
    .replace(/-feira$/, '');
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Dia e horas da janela, como nas «Próximas janelas» da home (o mesmo rótulo). */
export function partesJanela(j: JanelaSeguinte, locale: string): { dia: string; horas: string } {
  const c = getTranslation(locale).common;
  const dia = rotuloDiaJanela(j.w.startIso, j.dia, locale);
  const fimDia = j.dia == null ? null : j.dia + (j.w.endIso.slice(0, 10) !== j.w.startIso.slice(0, 10) ? 1 : 0);
  const l = formatUpcomingWindowLabel(
    j.w.startIso,
    j.w.endIso,
    (iso) => (iso === j.w.startIso ? dia : rotuloDiaJanela(iso, fimDia, locale)),
    locale,
    c.tomorrow,
  );
  return { dia, horas: l.hours };
}

/**
 * A próxima janela (ou «Sem janela boa nas próximas horas»).
 * `pilha`: dia em versaletes por cima, horas + chip por baixo (tabela, Top 8).
 * `linha`: «amanhã 07–11h [8]» numa linha (cartões, comparador, widget).
 * `tabela`: «Amanhã 07–11h · 8» numa só linha, sem quebra, com a altura de uma
 * linha normal da tabela do /spots (sem janela: «–», o texto no `title`).
 */
export function JanelaNoite({
  janela,
  locale,
  layout = 'linha',
  className,
}: {
  janela: JanelaSeguinte | null;
  locale: string;
  layout?: 'linha' | 'pilha' | 'tabela';
  className?: string;
}) {
  const t = getTranslation(locale).noite;
  if (!janela && layout === 'tabela') {
    return (
      // sem `sr-only`: um absoluto dentro da tabela com scroll alarga a página (390 → 491 px)
      <span
        className={cn('text-fg-muted', className)}
        data-noite-sem-janela=""
        title={t.semJanela}
        role="img"
        aria-label={t.semJanela}
      >
        –
      </span>
    );
  }
  if (!janela) {
    return (
      <span className={cn('text-meta text-fg-muted whitespace-normal', className)} data-noite-sem-janela="">
        {t.semJanela}
      </span>
    );
  }
  const { dia, horas } = partesJanela(janela, locale);
  const n = scoreToNota(janela.w.score);
  const aria = t.janelaAria.replace('{dia}', dia).replace('{horas}', horas).replace('{n}', String(n));
  if (layout === 'tabela') {
    return (
      <span className={cn('whitespace-nowrap', className)} data-noite-janela="" aria-label={aria} role="group">
        <span className="text-fg" aria-hidden>
          {dia} <span className="font-mono tabular-nums">{horas}</span>
        </span>
        <span aria-hidden> </span>
        <span aria-hidden>
          <ChipNota score={janela.w.score} locale={locale} className="py-0 text-meta-sm" />
        </span>
      </span>
    );
  }
  if (layout === 'pilha') {
    return (
      <span className={cn('inline-flex flex-col items-end gap-1', className)} data-noite-janela="" aria-label={aria} role="group">
        <span className="text-meta-sm font-semibold uppercase tracking-[0.12em] text-fg-muted" aria-hidden>
          {dia}
        </span>
        <span className="inline-flex items-center gap-1.5" aria-hidden>
          <span className="font-mono tabular-nums text-fg">{horas}</span>
          <ChipNota score={janela.w.score} locale={locale} />
        </span>
      </span>
    );
  }
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)} data-noite-janela="" aria-label={aria} role="group">
      <span className="text-fg-muted" aria-hidden>
        {dia}
      </span>
      <span className="font-mono tabular-nums text-fg" aria-hidden>
        {horas}
      </span>
      <span aria-hidden>
        <ChipNota score={janela.w.score} locale={locale} />
      </span>
    </span>
  );
}

/** Faixa de contexto «🌙 Noite. Por ordem da próxima janela boa…» (uma por lista). */
export function FaixaNoite({ locale, className }: { locale: string; className?: string }) {
  const t = getTranslation(locale).noite;
  return (
    <div
      className={cn('flex items-center gap-3 rounded-card border border-divider bg-surface-1/[0.03] p-3', className)}
      data-faixa-noite=""
    >
      <LuaNoite size={40} locale={locale} decorativa />
      <p className="m-0 text-meta text-fg-muted">
        <strong className="font-semibold text-fg">{t.faixaForte}</strong> {t.faixa}
      </p>
    </div>
  );
}
