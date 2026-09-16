'use client';

import type { SpotVerdict as Verdict } from '@/lib/spotVerdict';

interface SpotVerdictProps {
  verdict: Verdict;
}

const TONE_CLASSES: Record<Verdict['tone'], string> = {
  epic: 'border-score-epic/40 text-score-epic',
  good: 'border-score-good/40 text-score-good',
  fair: 'border-score-fair/40 text-score-fair',
  poor: 'border-score-poor/40 text-score-poor',
};

/**
 * Veredicto — a resposta de uma linha («devo ir?») logo após as tabs de
 * desporto. Editorial, não é um card de dados: headline + condições actuais
 * em mono. A cor segue o tier do score/janela.
 */
export default function SpotVerdict({ verdict }: SpotVerdictProps) {
  const tone = TONE_CLASSES[verdict.tone];

  return (
    <div
      className={`rounded-card border-l-4 border-y border-r border-divider bg-surface-1/[0.04] px-4 py-3 ${tone}`}
      role="status"
    >
      <p className="font-display text-h3 font-semibold leading-tight text-fg">
        {verdict.headline}
      </p>
      {verdict.detail && (
        <p className="mt-1 text-meta-sm font-mono tabular-nums text-fg-muted">
          {verdict.detail}
        </p>
      )}
    </div>
  );
}
