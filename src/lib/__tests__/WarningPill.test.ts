import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WarningPill, { warningPillTitle } from '@/components/ui/WarningPill';

const render = (props: {
  warning: { level: 'yellow' | 'orange' | 'red'; label: string; seaState?: boolean; areaLabel?: string; type?: string };
  locale: 'pt' | 'en';
  variant?: 'default' | 'compact' | 'mini' | 'popup';
  dataAttr?: string;
  showLevel?: boolean;
}) => renderToStaticMarkup(createElement(WarningPill, props as never));

/**
 * O chip de aviso é PARTILHADO (WarningPill) por card, sticky bar, mapa e
 * preview — o rótulo, o tooltip e o estilo vêm de um único sítio para as
 * superfícies nunca divergirem. Estes testes trancam o contrato.
 */
describe('WarningPill — contrato partilhado do chip de aviso', () => {
  it('sea state → rótulo directo «Mar perigoso» + tooltip «Aviso IPMA: … (Laranja) · área»', () => {
    const html = render({
      warning: { level: 'orange', label: 'Mar perigoso', seaState: true, areaLabel: 'Lisboa', type: 'Agitação Marítima' },
      locale: 'pt',
      dataAttr: 'true',
    });
    expect(html).toContain('data-map-warning="true"');
    expect(html).toContain('>Mar perigoso</span>');
    expect(html).toContain('title="Aviso IPMA: Mar perigoso (Laranja) · Lisboa"');
    // Ícone Waves para sea state — nunca o AlertTriangle.
    expect(html).toContain('lucide-waves');
    expect(html).not.toContain('lucide-alert-triangle');
  });

  it('vento (não-sea-state) → rótulo «Vento» + tooltip EN + ícone AlertTriangle', () => {
    const html = render({
      warning: { level: 'yellow', label: 'Wind', seaState: false },
      locale: 'en',
    });
    expect(html).toContain('>Wind</span>');
    expect(html).toContain('title="IPMA warning: Wind (Yellow)"');
    expect(html).toContain('lucide-triangle-alert');
    expect(html).not.toContain('lucide-waves');
  });

  it('sem dataAttr → sem atributo data-map-warning (SpotListCard/preview)', () => {
    const html = render({ warning: { level: 'red', label: 'Mar perigoso', seaState: true }, locale: 'pt' });
    expect(html).not.toContain('data-map-warning');
  });

  it('showLevel → nível localizado visível no texto («Mar perigoso (Laranja)»)', () => {
    const html = render({
      warning: { level: 'orange', label: 'Mar perigoso', seaState: true },
      locale: 'pt',
      variant: 'popup',
      showLevel: true,
    });
    expect(html).toContain('>Mar perigoso<span');
    expect(html).toContain('(Laranja)');

    const en = render({
      warning: { level: 'red', label: 'Dangerous sea', seaState: true },
      locale: 'en',
      showLevel: true,
    });
    expect(en).toContain('(Red)');
    expect(en).not.toContain('(Vermelho)');
  });

  it('nível desconhecido → chipClass fallback (nunca rebenta o estilo)', () => {
    const html = render({
      warning: { level: 'orange' as 'orange', label: 'Vento' },
      locale: 'pt',
    });
    expect(html).toContain('bg-score-poor/15');
  });

  it('warningPillTitle sem área → só «Aviso IPMA: rótulo (nível)»', () => {
    expect(warningPillTitle({ level: 'yellow', label: 'Vento' }, 'pt')).toBe('Aviso IPMA: Vento (Amarelo)');
    expect(warningPillTitle({ level: 'red', label: 'Dangerous sea' }, 'en')).toBe('IPMA warning: Dangerous sea (Red)');
  });
});
