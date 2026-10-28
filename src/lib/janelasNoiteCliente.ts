/**
 * Próximas janelas nas páginas só de cliente (comparador, favoritos, widget
 * embed), que não têm a linha do bake: o MESMO cálculo do
 * `upcomingWindowsBySport` do bake (`computeUpcomingWindowsForSpot`, notas v6
 * hora a hora + o `notaV6` «agora» na hora corrente) sobre o forecast servido
 * do spot. Só corre de noite: o módulo do bake entra por import dinâmico (um
 * chunk à parte, fora do bundle de dia) e o forecast vem da cache partilhada
 * (`loadForecastForSpot`, a mesma da tabela horária do comparador).
 */
import type { Spot } from '@/types';
import type { Conditions } from '@/lib/sportScore';
import type { NotaV6Agora } from '@/lib/notaV6Agora';
import type { ForecastHourRow, UpcomingWindowsBySport } from '@/lib/bestWindowToday';
import { loadForecastForSpot } from '@/lib/spotDataCache';
import { getConditionsDataId } from '@/lib/spotConditionsSource';

export async function janelasDeNoite(
  spot: Spot,
  input: Conditions,
  nv: NotaV6Agora | null,
  nowMs: number,
): Promise<UpcomingWindowsBySport> {
  const [{ computeUpcomingWindowsForSpot }, rows] = await Promise.all([
    import('@/lib/bestWindowBuild'),
    loadForecastForSpot(getConditionsDataId(spot)),
  ]);
  if (!rows.length) return {};
  return computeUpcomingWindowsForSpot(spot, rows as unknown as ForecastHourRow[], input, nowMs, nv);
}
