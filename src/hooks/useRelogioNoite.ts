'use client';

import { useEffect, useState } from 'react';

/**
 * Relógio do estado «Noite» (dia da próxima janela, janelas que já acabaram):
 * o do build (`bakedAtMs`) no primeiro render — paridade com o HTML estático,
 * React #418 — e o real depois de montar (o padrão do hero / `estadoHome` e do
 * `HomepageRankedSection`). Sem relógio do build (página só cliente): `null`
 * até montar, e quem lê mostra o dia da semana em vez de «amanhã».
 */
export function useRelogioNoite(bakedAtMs?: number | null): number | null {
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => setAgora(Date.now()), []);
  return agora ?? bakedAtMs ?? null;
}
