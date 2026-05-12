import Link from 'next/link';
import { MapPin, ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="p-4 rounded-full bg-surface-1 mx-auto w-fit">
          <MapPin className="w-8 h-8 text-data-waves" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-fg">
            Spot não encontrado
          </h2>
          <p className="text-fg-muted text-sm">
            Este spot não existe na nossa base de dados. Verifica se escreveste correctamente ou explora outros spots!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/pt/spots"
            className="inline-flex items-center gap-2 px-6 py-3 bg-data-waves hover:bg-data-waves/80 text-bg-base rounded-xl font-medium transition-all hover:scale-105"
          >
            <Search className="w-4 h-4" />
            Ver todos os spots
          </Link>
          
          <Link
            href="/pt"
            className="inline-flex items-center gap-2 px-6 py-3 bg-surface-1 hover:bg-surface-2 text-fg rounded-xl font-medium transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar à homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
