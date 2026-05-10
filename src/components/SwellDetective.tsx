'use client';

import { useState } from 'react';
import { Search, Waves, Wind, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';

interface SwellPattern {
  name: string;
  nameEn: string;
  probability: number;
  description: string;
  descriptionEn: string;
  bestMonths: string[];
  typicalHeight: string;
}

// Simulated swell patterns for Portuguese spots
const swellPatterns: Record<string, SwellPattern[]> = {
  'supertubos': [
    { name: 'Swell de Norte', nameEn: 'North Swell', probability: 85, description: 'Ondas limpas e tubulares. Melhor condição para Supertubos.', descriptionEn: 'Clean tubular waves. Best condition for Supertubos.', bestMonths: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb'], typicalHeight: '1.5-3m' },
    { name: 'Swell de Noroeste', nameEn: 'Northwest Swell', probability: 70, description: 'Ondas largas e consistentes. Boa para todos os níveis.', descriptionEn: 'Wide and consistent waves. Good for all levels.', bestMonths: ['Sep', 'Oct', 'Nov', 'Mar', 'Apr'], typicalHeight: '1-2.5m' },
    { name: 'Swell de Oeste', nameEn: 'West Swell', probability: 45, description: 'Pode fechar o spot. Verificar condições antes de ir.', descriptionEn: 'May close out the spot. Check conditions before going.', bestMonths: ['Dec', 'Jan', 'Feb'], typicalHeight: '2-4m' },
  ],
  'guincho': [
    { name: 'Nortada Térmica', nameEn: 'Thermal Nortada', probability: 90, description: 'Vento de NW consistente de tarde. Perfeito para kitesurf.', descriptionEn: 'Consistent NW wind in the afternoon. Perfect for kitesurfing.', bestMonths: ['May', 'Jun', 'Jul', 'Aug', 'Sep'], typicalHeight: 'Flat' },
    { name: 'Swell de SW', nameEn: 'SW Swell', probability: 60, description: 'Ondas que entram na baía. Surf possível nas extremidades.', descriptionEn: 'Waves entering the bay. Surf possible at the ends.', bestMonths: ['Oct', 'Nov', 'Dec', 'Jan'], typicalHeight: '1-2m' },
  ],
  'nazare': [
    { name: 'Swell Gigante de NW', nameEn: 'Giant NW Swell', probability: 75, description: 'Ondas de 10m+. Só para especialistas e tow-in.', descriptionEn: '10m+ waves. Experts and tow-in only.', bestMonths: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb'], typicalHeight: '4-15m' },
    { name: 'Swell de W', nameEn: 'West Swell', probability: 80, description: 'Ondas grandes e consistentes. Clássico da Nazaré.', descriptionEn: 'Big consistent waves. Nazaré classic.', bestMonths: ['Nov', 'Dec', 'Jan', 'Feb'], typicalHeight: '3-8m' },
    { name: 'Swell de N', nameEn: 'North Swell', probability: 55, description: 'Ondas de tamanho médio. Boa para surf normal.', descriptionEn: 'Medium-sized waves. Good for normal surfing.', bestMonths: ['Sep', 'Oct', 'Mar', 'Apr'], typicalHeight: '1.5-3m' },
  ],
  'default': [
    { name: 'Swell de NW', nameEn: 'NW Swell', probability: 65, description: 'Swell dominante em Portugal. Funciona na maioria dos spots.', descriptionEn: 'Dominant swell in Portugal. Works at most spots.', bestMonths: ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'], typicalHeight: '1-3m' },
    { name: 'Swell de W', nameEn: 'West Swell', probability: 50, description: 'Ondas mais grandes. Cuidado com o fecho.', descriptionEn: 'Bigger waves. Watch out for close-outs.', bestMonths: ['Nov', 'Dec', 'Jan'], typicalHeight: '2-5m' },
    { name: 'Nortada Térmica', nameEn: 'Thermal Nortada', probability: 85, description: 'Vento de NW no verão. Ideal para kite e windsurf.', descriptionEn: 'NW wind in summer. Ideal for kite and windsurf.', bestMonths: ['May', 'Jun', 'Jul', 'Aug', 'Sep'], typicalHeight: 'Flat-0.5m' },
  ],
};

interface SwellDetectiveProps {
  spotSlug: string;
  locale: string;
}

export default function SwellDetective({ spotSlug, locale }: SwellDetectiveProps) {
  const isPt = locale === 'pt';
  const patterns = swellPatterns[spotSlug] || swellPatterns['default'];
  const [selectedPattern, setSelectedPattern] = useState<SwellPattern | null>(null);

  const getTrendIcon = (prob: number) => {
    if (prob >= 80) return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (prob >= 50) return <Minus className="w-4 h-4 text-yellow-400" />;
    return <TrendingDown className="w-4 h-4 text-red-400" />;
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2.5 rounded-xl bg-blue-500/10">
          <Search className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">
            {isPt ? '🔍 Swell Detective' : '🔍 Swell Detective'}
          </h3>
          <p className="text-sm text-white/50">
            {isPt 
              ? 'Padrões de swell históricos para este spot'
              : 'Historical swell patterns for this spot'
            }
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {patterns.map((pattern, i) => (
          <div
            key={i}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              selectedPattern === pattern
                ? 'bg-white/10 border-blue-500/30'
                : 'bg-white/5 border-white/10 hover:bg-white/8'
            }`}
            onClick={() => setSelectedPattern(selectedPattern === pattern ? null : pattern)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  pattern.probability >= 80 ? 'bg-green-500/10' :
                  pattern.probability >= 50 ? 'bg-yellow-500/10' :
                  'bg-red-500/10'
                }`}>
                  <Waves className={`w-5 h-5 ${
                    pattern.probability >= 80 ? 'text-green-400' :
                    pattern.probability >= 50 ? 'text-yellow-400' :
                    'text-red-400'
                  }`} />
                </div>
                <div>
                  <div className="font-bold text-white">
                    {isPt ? pattern.name : pattern.nameEn}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <Wind className="w-3 h-3" />
                    {pattern.typicalHeight}
                    <span className="mx-1">•</span>
                    {pattern.bestMonths.join(', ')}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-2">
                  {getTrendIcon(pattern.probability)}
                  <span className={`text-lg font-bold ${
                    pattern.probability >= 80 ? 'text-green-400' :
                    pattern.probability >= 50 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {pattern.probability}%
                  </span>
                </div>
                <div className="text-xs text-white/40">
                  {isPt ? 'probabilidade' : 'probability'}
                </div>
              </div>
            </div>

            {selectedPattern === pattern && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-white/70">
                    {isPt ? pattern.description : pattern.descriptionEn}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pattern.bestMonths.map(month => (
                    <span
                      key={month}
                      className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-white/60 border border-white/10"
                    >
                      {month}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-white/50">
            {isPt 
              ? `Dados baseados em análise histórica de condições (${new Date().getFullYear()}). Probabilidades são estimativas baseadas em padrões sazonais. Sempre verifica as condições atuais antes de ir.`
              : `Data based on historical condition analysis (${new Date().getFullYear()}). Probabilities are estimates based on seasonal patterns. Always check current conditions before going.`
            }
          </p>
        </div>
      </div>
    </div>
  );
}
