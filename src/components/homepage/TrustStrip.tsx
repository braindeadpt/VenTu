import { Activity, Clock, Github, Globe, MapPin } from 'lucide-react';

interface TrustStripProps {
  spotCount: number;
  sportsCount: number;
  maxTs?: number | null;
  locale: string;
  variant?: 'default' | 'inline';
}

export default function TrustStrip({
  spotCount,
  sportsCount,
  locale,
  variant = 'default',
}: TrustStripProps) {
  const isPt = locale === 'pt';

  const items: { icon: typeof MapPin; label: React.ReactNode }[] = [
    {
      icon: MapPin,
      label: (
        <>
          <span className="font-mono tabular-nums text-fg">{spotCount}</span> spots
        </>
      ),
    },
    {
      icon: Activity,
      label: (
        <>
          <span className="font-mono tabular-nums text-fg">{sportsCount}</span>{' '}
          {isPt ? 'desportos' : 'sports'}
        </>
      ),
    },
    {
      icon: Globe,
      label: 'Open-Meteo',
    },
    {
      icon: Clock,
      label: isPt ? 'Actualização: 3h/3h' : 'Refresh: every 3h',
    },
    {
      icon: Github,
      label: isPt ? 'MIT · Open source' : 'MIT · Open source',
    },
  ];

  if (variant === 'inline') {
    return (
      <div
        className="mt-6 pt-4 border-t border-divider"
        aria-label={isPt ? 'Prova social' : 'Trust indicators'}
      >
        <ul className="flex items-center gap-2 overflow-x-auto no-scrollbar list-none p-0 m-0">
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <li key={index} className="flex items-center gap-2 shrink-0 text-meta-sm text-fg-muted">
                {index > 0 && <span aria-hidden>·</span>}
                <Icon className="w-3 h-3 shrink-0" aria-hidden />
                {item.label}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 border-b border-divider"
      aria-label={isPt ? 'Prova social' : 'Trust indicators'}
    >
      <ul className="flex items-center gap-2 overflow-x-auto overscroll-x-contain touch-pan-x no-scrollbar edge-fade-x list-none p-0 m-0">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <li key={index} className="flex items-center gap-2 shrink-0">
              {index > 0 && (
                <span aria-hidden className="text-fg-subtle">
                  ·
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-meta text-fg-muted whitespace-nowrap">
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {item.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
