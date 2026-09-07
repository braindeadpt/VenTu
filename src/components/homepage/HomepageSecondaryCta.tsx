import { ArrowRight, Calendar, Columns3, Heart } from 'lucide-react';
import Card from '@/components/ui/Card';
import { getTranslation, validateLocale } from '@/lib/i18n';

interface HomepageSecondaryCtaProps {
  locale: string;
  /** When true, omit outer section chrome (used inside HomepageFooterSection). */
  compact?: boolean;
}

export default function HomepageSecondaryCta({ locale, compact = false }: HomepageSecondaryCtaProps) {
  const t = getTranslation(validateLocale(locale)).home;

  const cards = [
    {
      href: `/${locale}/sazonalidade/`,
      icon: Calendar,
      title: t.seasonalityTitle,
      body: t.seasonalityBody,
    },
    {
      href: `/${locale}/compare/`,
      icon: Columns3,
      title: t.compareTitle,
      body: t.compareBody,
    },
    {
      href: `/${locale}/favorites/`,
      icon: Heart,
      title: t.favoritesTitle,
      body: t.favoritesBody,
    },
  ] as const;

  const inner = (
    <>
      <h2 className="text-h3 text-fg mb-1">{t.moreToExplore}</h2>
      <p className="text-meta text-fg-muted mb-4">{t.moreToExploreSub}</p>
      <div className="grid md:grid-cols-3 gap-3">
        {cards.map(({ href, icon: Icon, title, body }) => (
          <Card
            key={href}
            href={href}
            hoverable
            padding={false}
            className="group p-4 flex flex-col h-full"
          >
            <Icon className="w-6 h-6 text-data-waves shrink-0" aria-hidden />
            <h3 className="text-h3 text-fg mt-3">{title}</h3>
            <p className="text-body-sm text-fg-muted mt-1 flex-1">{body}</p>
            <ArrowRight
              className="w-4 h-4 text-fg-subtle mt-2 group-hover:text-fg group-hover:translate-x-0.5 transition-[color,transform] duration-150 motion-reduce:transition-none"
              aria-hidden
            />
          </Card>
        ))}
      </div>
    </>
  );

  if (compact) return inner;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {inner}
    </section>
  );
}
