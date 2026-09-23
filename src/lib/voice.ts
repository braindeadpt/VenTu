import { getScoreTokens } from '@/lib/sportScore';
import { getTranslation } from '@/lib/i18n';

/** Energetic, inclusive PT-PT product voice (not scoring logic). */

export function onLabel(locale: string): string {
  return getTranslation(locale).voice.onLabel;
}

export function calmLabel(locale: string): string {
  return getTranslation(locale).voice.calmLabel;
}

export function spotsOnLine(count: number, locale: string): string {
  const spotWord = count === 1 ? 'spot' : 'spots';
  return `${count} ${spotWord} ${onLabel(locale)}`;
}

export function heroStatusLine(onCount: number, locale: string): string {
  if (onCount > 0) {
    return spotsOnLine(onCount, locale);
  }
  return `${calmLabel(locale)} ${getTranslation(locale).voice.heroCalmTail}`;
}

/** Short tier phrase for cards / hover — separate from score tier labels in sportScore. */
export function tierPhrase(score: number, locale: string): string {
  const { tier } = getScoreTokens(score);
  const t = getTranslation(locale).voice;
  const phrases: Record<typeof tier, string> = {
    // O card imprime o rótulo do tier («Épico») por baixo do score: a frase
    // não pode repeti-lo. «Um clássico» é como se fala de um dia que se
    // conta depois — diz o que o tier significa sem lhe chamar o nome.
    epic: t.tierEpic,
    good: t.tierGood,
    fair: t.tierFair,
    poor: t.tierPoor,
    closed: t.tierClosed,
  };
  return phrases[tier];
}
