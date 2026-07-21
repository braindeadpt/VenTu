import { getScoreTokens } from '@/lib/sportScore';

/** Energetic, inclusive PT-PT product voice (not scoring logic). */

export function onLabel(isPt: boolean): string {
  return isPt ? 'a bombar' : 'firing';
}

export function calmLabel(isPt: boolean): string {
  return isPt ? 'mar de espelho' : 'glassy seas';
}

export function spotsOnLine(count: number, isPt: boolean): string {
  const spotWord = count === 1 ? 'spot' : 'spots';
  return `${count} ${spotWord} ${onLabel(isPt)}`;
}

export function heroStatusLine(onCount: number, isPt: boolean): string {
  if (onCount > 0) {
    return spotsOnLine(onCount, isPt);
  }
  return isPt
    ? `${calmLabel(isPt)} — vê o mapa na mesma`
    : `${calmLabel(isPt)} — still worth a look`;
}

/** Short tier phrase for cards / hover — separate from score tier labels in sportScore. */
export function tierPhrase(score: number, isPt: boolean): string {
  const { tier } = getScoreTokens(score);
  const phrases: Record<typeof tier, { pt: string; en: string }> = {
    epic: { pt: 'dia épico', en: 'epic day' },
    good: { pt: 'dá uns sets fáceis', en: 'fun, friendly sets' },
    fair: { pt: 'mar limpo', en: 'clean faces' },
    poor: { pt: 'mar calmo', en: 'slow session' },
    closed: { pt: 'flat', en: 'flat' },
  };
  return phrases[tier][isPt ? 'pt' : 'en'];
}
