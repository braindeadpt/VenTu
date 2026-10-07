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

function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/**
 * Linha de estado do ticker do hero.
 *
 * `onCount` tem de vir do mesmo limiar que o banner «Melhor janela» e o
 * «A bombar agora» (≥ Bom — `TOP_NOW_MIN_SCORE`). Quando nada está a bombar
 * agora mas há uma janela ≥ Bom mais logo (`goodWindowLater`), o ticker não
 * pode dizer «mar de espelho» ao lado de um banner «Bom 70».
 * A frase começa sempre em maiúscula — em minúscula parecia cortada.
 */
export function heroStatusLine(
  onCount: number,
  locale: string,
  options?: { goodWindowLater?: boolean },
): string {
  if (onCount > 0) {
    return spotsOnLine(onCount, locale);
  }
  const voice = getTranslation(locale).voice;
  if (options?.goodWindowLater) return voice.heroWindowLater;
  return capitalizeFirst(`${calmLabel(locale)} ${voice.heroCalmTail}`);
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
