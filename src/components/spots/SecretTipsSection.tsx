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
    known: { pt: 'Conhecido', en: 'Known', color: 'bg-windDir-offshore/20 text-windDir-offshore border-windDir-offshore/30' },
    'semi-secret': { pt: 'Semi-Secreto', en: 'Semi-Secret', color: 'bg-score-fair/20 text-score-fair border-score-fair/30' },
    secret: { pt: 'Secreto', en: 'Secret', color: 'bg-score-poor/20 text-score-poor border-score-poor/30' },
    'deep-secret': { pt: 'Deep Secret', en: 'Deep Secret', color: 'bg-windDir-onshore/20 text-windDir-onshore border-windDir-onshore/30' },
  };

  const level = secretLevel ? levelLabels[secretLevel] : null;

  return (
    <div className="bg-bg-elevated/60 backdrop-blur-sm rounded-xl p-5 border border-data-waves/30 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-data-waves/5 rounded-full blur-3xl" />

      <div className="flex items-center gap-2 mb-4 relative">
        <Lock className="w-5 h-5 text-data-waves" />
        <h3 className="text-lg font-bold text-fg">
          {isPT ? 'Segredo Local' : 'Local Secret'}
        </h3>
        {level && (
          <span className={`ml-auto px-2 py-1 rounded-full text-xs font-bold border ${level.color}`}>
            {isPT ? level.pt : level.en}
          </span>
        )}
      </div>

      <div className="bg-data-waves/10 border border-data-waves/20 rounded-lg p-4">
        <p className="text-sm text-fg-muted leading-relaxed">
          {isPT ? tips.tips : tips.tipsEn}
        </p>
      </div>

      <p className="mt-3 text-xs text-fg-subtle italic">
        {isPT
          ? 'Respeita este spot. Não partilhes a localização exata nas redes sociais.'
          : 'Respect this spot. Don\'t share the exact location on social media.'}
      </p>
    </div>
  );
}
