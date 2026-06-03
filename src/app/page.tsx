import Link from 'next/link';
import type { Metadata } from 'next';
import { buildRootMetadata } from '@/lib/seo';
import RootLocaleRedirect from '@/components/RootLocaleRedirect';
import Button from '@/components/ui/Button';

export const metadata: Metadata = buildRootMetadata();

export default function RootPage() {
  return (
    <>
      <RootLocaleRedirect />
      <div className="min-h-screen bg-bg-base text-fg flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="font-mono text-sm text-fg-muted mb-4">ventu.surf</p>
        <h1 className="font-display text-5xl sm:text-6xl font-bold tracking-tight text-fg">
          VenTu
        </h1>
        <p className="mt-3 text-xl text-sunset font-display font-semibold">Vem. Tu.</p>
        <p className="mt-6 max-w-lg text-fg-muted leading-relaxed">
          Condições náuticas em Portugal — surf, kitesurf, windsurf e mais.
          Scores, mapa e previsão actualizados a cada 3 horas. Grátis · open source.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/pt/">
            <Button variant="primary" size="lg" className="bg-sunset min-w-[140px]">
              Português
            </Button>
          </Link>
          <Link href="/en/">
            <Button variant="secondary" size="lg" className="min-w-[140px]">
              English
            </Button>
          </Link>
        </div>
        <p className="mt-8 text-sm text-fg-subtle">
          Water sports conditions · Portugal · MIT License
        </p>
      </div>
    </>
  );
}
