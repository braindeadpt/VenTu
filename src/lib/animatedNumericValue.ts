/**
 * Keep the decimals of a formatted metric while the number counts up.
 * `"2.0m"` stays `"2.0m"` (not `"2m"`); `"16kt"` stays `"16kt"`.
 */
export function formatAnimatedNumericValue(displayNum: number, originalValue: string): string {
  const match = originalValue.match(/^([\d.-]+)/);
  if (!match) return originalValue;
  const decimals = match[1].includes('.') ? match[1].split('.')[1].length : 0;
  return displayNum.toFixed(decimals) + originalValue.slice(match[1].length);
}
