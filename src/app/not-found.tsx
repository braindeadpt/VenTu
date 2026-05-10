import Link from 'next/link';
import { MapPin, ArrowLeft, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-ocean-950 flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="p-4 rounded-full bg-ocean-500/10 mx-auto w-fit">
          <MapPin className="w-8 h-8 text-ocean-400" />
        </div>
        
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-white/90">
            Spot não encontrado
          </h2>
          <p className="text-white/60 text-sm">
            Este spot não existe na nossa base de dados. Verifica se escreveste correctamente ou explora outros spots!
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/pt/spots"
            className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl font-medium transition-all hover:scale-105"
          >
            <Search className="w-4 h-4" />
            Ver todos os spots
          </Link>
          
          <Link
            href="/pt"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 text-white/80 rounded-xl font-medium transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar à homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
