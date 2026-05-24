'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MapPin, ArrowLeft, Search } from 'lucide-react';

export default function NotFoundContent() {
  const pathname = usePathname() || '';
  const locale = pathname.startsWith('/en') ? 'en' : 'pt';
  const isPt = locale === 'pt';

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="p-4 rounded-full bg-surface-1 mx-auto w-fit">
          <MapPin className="w-8 h-8 text-data-waves" />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-fg">
            {isPt ? 'Página não encontrada' : 'Page not found'}
          </h1>
          <p className="text-fg-muted text-sm">
            {isPt
              ? 'O conteúdo que procuras não existe ou foi movido. Explora os spots ou volta à homepage.'
              : 'The content you are looking for does not exist or was moved. Browse spots or return home.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href={`/${locale}/spots/`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-data-waves hover:bg-data-waves/80 text-bg-base rounded-xl font-medium transition-all hover:scale-105"
          >
            <Search className="w-4 h-4" />
            {isPt ? 'Ver todos os spots' : 'View all spots'}
          </Link>

          <Link
            href={`/${locale}/`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-surface-1 hover:bg-surface-2 text-fg rounded-xl font-medium transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            {isPt ? 'Voltar à homepage' : 'Back to homepage'}
          </Link>
        </div>
      </div>
    </div>
  );
}
