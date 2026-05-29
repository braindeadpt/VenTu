import { ArrowRight, Bell, Calendar, Columns3 } from 'lucide-react';
import Card from '@/components/ui/Card';

interface HomepageSecondaryCtaProps {
  locale: string;
  /** When true, omit outer section chrome (used inside HomepageFooterSection). */
  compact?: boolean;
}

export default function HomepageSecondaryCta({ locale, compact = false }: HomepageSecondaryCtaProps) {
  const isPt = locale === 'pt';

  const cards = [
    {
      href: `/${locale}/sazonalidade/`,
      icon: Calendar,
      title: isPt ? 'Sazonalidade' : 'Seasonality',
      body: isPt
        ? 'Quando ir a cada spot — vento e ondas por mês'
        : 'When to go to each spot — wind and waves by month',
    },
    {
      href: `/${locale}/compare/`,
      icon: Columns3,
      title: isPt ? 'Comparar spots' : 'Compare spots',
      body: isPt ? 'Lado a lado, mesmo timeframe' : 'Side by side, same timeframe',
    },
    {
      href: `/${locale}/alerts/`,
      icon: Bell,
      title: isPt ? 'Alertas' : 'Alerts',
      body: isPt
        ? 'Avisos por email quando o teu spot estiver a bombar'
        : 'Email alerts when your spot is firing',
    },
  ] as const;

  const inner = (
    <>
      <h2 className="text-h3 text-fg mb-1">
        {isPt ? 'Mais para explorar' : 'More to explore'}
      </h2>
      <p className="text-meta text-fg-muted mb-4">
        {isPt
          ? 'Ferramentas para planear a próxima sessão'
          : 'Tools to plan your next session'}
      </p>
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
