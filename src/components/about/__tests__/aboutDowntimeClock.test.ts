/**
 * Contrato (24/10): o /about deu React #418 em pt/en/es/fr/de porque o card do
 * IH chamava deriveBuoyLayerDowntime(meta) com o Date.now() por defeito no
 * render — o HTML do build e a hidratação viam horas diferentes («~30 h» vs
 * «~32 h»). O render tem de passar sempre um relógio explícito.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveBuoyLayerDowntime } from '@/lib/buoyLayerDowntime';

const src = readFileSync(join(process.cwd(), 'src/components/about/AboutDataCards.tsx'), 'utf8');

describe('AboutDataCards: relógio da degradação das boias', () => {
  it('nunca chama deriveBuoyLayerDowntime só com o meta (Date.now() implícito)', () => {
    expect(src).toContain('deriveBuoyLayerDowntime(');
    // uma chamada com um só argumento (sem vírgula antes do fecho)
    expect(src).not.toMatch(/deriveBuoyLayerDowntime\(\s*[\w.?]+(\s*\?\?\s*null)?\s*\)/);
    expect(src).toMatch(/clockMs \?\?/);
  });

  it('com a referência do último run, build e hidratação dão as mesmas horas', () => {
    const meta = {
      status: 'down' as const,
      streak: 25,
      lastOkAt: '2026-10-23T14:35:00Z',
      streakUpdatedAt: '2026-10-24T20:35:00Z',
    };
    const ref = Date.parse(meta.streakUpdatedAt);
    expect(deriveBuoyLayerDowntime(meta, ref)?.hours).toBe(30);
    expect(deriveBuoyLayerDowntime(meta, ref)).toEqual(deriveBuoyLayerDowntime(meta, ref));
  });
});
