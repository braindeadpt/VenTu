'use client';

import { GraduationCap, TriangleAlert } from 'lucide-react';
import type { Spot } from '@/types';
import { resolveSpotLevelToday } from '@/lib/spotLevelToday';
import { cn } from '@/lib/cn';

interface SpotLevelTodayProps {
  difficulty: Spot['difficulty'];
  score: number;
  locale: string;
  className?: string;
}

export default function SpotLevelToday({
  difficulty,
  score,
  locale,
  className,
}: SpotLevelTodayProps) {
  const resolved = resolveSpotLevelToday(difficulty, score);
  // Sem mensagem, a linha continua a ocupar a mesma caixa (invisível): o
  // score vem da hora escolhida, que muda entre o HTML baked e o relógio
  // vivo (e a cada passo da régua). Retirá-la do fluxo encolhia o hero
  // ~27 px depois da hidratação — CLS 0,2 no Lighthouse (25 set).
  if (!resolved) {
    return (
      <p
        aria-hidden
        className={cn(
          // Mesma estrutura do cartão com mensagem (ícone + gap + font-medium +
          // espaço que NÃO colapsa — um espaço simples é removido em fim de
          // linha e a caixa ficava sem line box, com baseline de SVG e 0,3 px
          // menos no wrapper). A baseline de um inline-flex vem do 1.º item:
          // assim a caixa vazia e o cartão com mensagem medem o mesmo, no
          // bake e no relógio vivo.
          'invisible inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-meta-sm font-medium',
          className,
        )}
      >
        <TriangleAlert className="w-3.5 h-3.5 shrink-0" aria-hidden />
        {'\u00A0'}
      </p>
    );
  }

  const isPt = locale === 'pt';
  const message = isPt ? resolved.messagePt : resolved.messageEn;
  const Icon = resolved.tone === 'good' ? GraduationCap : TriangleAlert;

  return (
    <p
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-meta-sm font-medium',
        resolved.tone === 'good'
          ? 'border-score-good/35 bg-score-good/[0.08] text-score-good'
          : 'border-score-poor/35 bg-score-poor/[0.08] text-score-poor',
        className,
      )}
      role="status"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
