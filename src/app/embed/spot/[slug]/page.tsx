import { Suspense } from 'react';
import type { Metadata } from 'next';
import { spots } from '@/lib/spots';
import EmbedSpotWidget from '@/components/directory/EmbedSpotWidget';

export function generateStaticParams() {
  return spots.map((s) => ({ slug: s.slug }));
}

// D10 — params exaustivos: slug sem spot → 404 (o widget não tem nada para
// embutir; sem esta flag o dev renderizava-o com 200). Produção: 404.html;
// dev: 404 após o padrão aquecer — E443 a frio é upstream next.js#56253.
export const dynamicParams = false;

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
