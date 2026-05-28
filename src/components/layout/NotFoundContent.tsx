'use client';

import { usePathname } from 'next/navigation';
import { MapPin, ArrowLeft, Search } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';

export default function NotFoundContent() {
  const pathname = usePathname() || '';
  const locale = pathname.startsWith('/en') ? 'en' : 'pt';
  const isPt = locale === 'pt';

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <PageHeader
          align="center"
          icon={
            <div className="p-4 rounded-full bg-surface-1/[0.04] mx-auto w-fit">
              <MapPin className="w-8 h-8 text-data-waves" />
            </div>
          }
          title={isPt ? 'Página não encontrada' : 'Page not found'}
          subtitle={
            isPt
              ? 'O conteúdo que procuras não existe ou foi movido. Explora os spots ou volta à homepage.'
              : 'The content you are looking for does not exist or was moved. Browse spots or return home.'
          }
        />

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button href={`/${locale}/spots/`} size="lg">
            <Search className="w-4 h-4" aria-hidden />
            {isPt ? 'Ver todos os spots' : 'View all spots'}
          </Button>
          <Button href={`/${locale}/`} variant="secondary" size="lg">
            <ArrowLeft className="w-4 h-4" aria-hidden />
            {isPt ? 'Voltar à homepage' : 'Back to homepage'}
          </Button>
        </div>
      </div>
    </div>
  );
}
