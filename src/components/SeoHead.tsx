'use client';

import { pipelineSchedule } from '@/lib/dataPipelineSchedule';
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
  image = '/og-image.png',
  type = 'website',
  jsonLd
}: SeoProps) {
  const baseUrl = 'https://ventu.surf';

  const fullTitle = title
    ? `${title} | VenTu`
    : 'VenTu — Condições para Desportos Náuticos em Portugal';

  const fullDesc = description
    || `Condições para surf, kitesurf, windsurf e big wave em Portugal — ${pipelineSchedule('pt')}. Ondas, vento e temperatura da água.`;

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