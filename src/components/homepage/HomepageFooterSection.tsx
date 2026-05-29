import TrustStrip from '@/components/homepage/TrustStrip';
import HomepageSecondaryCta from '@/components/homepage/HomepageSecondaryCta';

interface HomepageFooterSectionProps {
  locale: string;
  spotCount: number;
  sportsCount: number;
}

/** Trust + secondary CTAs — single pre-footer block. */
export default function HomepageFooterSection({
  locale,
  spotCount,
  sportsCount,
}: HomepageFooterSectionProps) {
  return (
    <section
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-divider"
      aria-label={locale === 'pt' ? 'Mais ferramentas' : 'More tools'}
    >
      <HomepageSecondaryCta locale={locale} compact />
      <TrustStrip
        spotCount={spotCount}
        sportsCount={sportsCount}
        locale={locale}
        variant="inline"
      />
    </section>
  );
}
