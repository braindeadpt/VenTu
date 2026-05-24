'use client';

// FIX C4: Simplified - only JSON-LD since OG tags are now handled by Next.js generateMetadata
// This component is for dynamic structured data that can't be generated at build time

interface SeoProps {
  title?: string;
  description?: string;
  image?: string;
  type?: 'website' | 'article';
  jsonLd?: Record<string, unknown>;
}

export default function SeoHead({
  title,
  description,
  image = '/og-image.svg',
  type = 'website',
  jsonLd
}: SeoProps) {
  const baseUrl = 'https://ventu.surf';

  const fullTitle = title
    ? `${title} | VenTu`
    : 'VenTu — Condições em Tempo Real para Desportos Náuticos';

  const fullDesc = description
    || 'Condições em tempo real para surf, kitesurf, windsurf e big wave em Portugal. Ondas, vento e temperatura da água para 167 spots.';

  return (
    <>
      {/* Only JSON-LD needs client-side rendering for dynamic spot data */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
    </>
  );
}