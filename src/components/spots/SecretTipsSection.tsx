'use client';

import { Lock } from 'lucide-react';
import { SpotSecretTips } from '@/lib/spotTips';

interface SecretTipsSectionProps {
  tips: SpotSecretTips;
  locale: string;
  secretLevel?: string;
}

export function SecretTipsSection({ tips, locale, secretLevel }: SecretTipsSectionProps) {
  const isPT = locale === 'pt';

  const levelLabels: Record<string, { pt: string; en: string; color: string }> = {
    known: { pt: 'Conhecido', en: 'Known', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
    'semi-secret': { pt: 'Semi-Secreto', en: 'Semi-Secret', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    secret: { pt: 'Secreto', en: 'Secret', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    'deep-secret': { pt: 'Deep Secret', en: 'Deep Secret', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  };

  const level = secretLevel ? levelLabels[secretLevel] : null;

  return (
    <div className="bg-slate-800/60 backdrop-blur-sm rounded-xl p-5 border border-purple-500/30 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl" />

      <div className="flex items-center gap-2 mb-4 relative">
        <Lock className="w-5 h-5 text-purple-400" />
        <h3 className="text-lg font-bold text-white">
          {isPT ? 'Segredo Local' : 'Local Secret'}
        </h3>
        {level && (
          <span className={`ml-auto px-2 py-1 rounded-full text-xs font-bold border ${level.color}`}>
            {isPT ? level.pt : level.en}
          </span>
        )}
      </div>

      <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
        <p className="text-sm text-purple-100 leading-relaxed">
          {isPT ? tips.tips : tips.tipsEn}
        </p>
      </div>

      <p className="mt-3 text-xs text-slate-500 italic">
        {isPT
          ? 'Respeita este spot. Não partilhes a localização exata nas redes sociais.'
          : 'Respect this spot. Don\'t share the exact location on social media.'}
      </p>
    </div>
  );
}
