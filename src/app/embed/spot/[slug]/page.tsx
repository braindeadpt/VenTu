import { Suspense } from 'react';
import type { Metadata } from 'next';
import { spots } from '@/lib/spots';
import EmbedSpotWidget from '@/components/directory/EmbedSpotWidget';

export function generateStaticParams() {
  return spots.map((s) => ({ slug: s.slug }));
}

export const metadata: Metadata = {
  title: 'VenTu embed',
  robots: { index: false, follow: false },
};

export default async function EmbedSpotPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div data-embed-widget className="p-4 text-sm text-fg-muted">…</div>}>
      <EmbedSpotWidget slug={slug} />
    </Suspense>
  );
}
