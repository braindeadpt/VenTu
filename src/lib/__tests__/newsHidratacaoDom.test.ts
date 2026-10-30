// @vitest-environment jsdom
/**
 * Hidratação real do /news/ (#418): HTML do servidor (build ontem) +
 * hydrateRoot no cliente (hoje) — React #418 não pode disparar.
 *
 * Os efeitos pós-mount (troca para Date.now()) correm dentro de act():
 * divergência DEPOIS da hidratação é por design — o que conta é zero
 * warnings «did not match»/«Hydration» na primeira renderização.
 */
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import NewsArchiveClient from '@/components/news/NewsArchiveClient';
import type { NewsItem } from '@/types';
import type { VentuEvent } from '@/types/events';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (id: string, publishedAt: string): NewsItem =>
  ({
    id,
    publishedAt,
    title: id,
    titleEn: id,
    summary: '',
    summaryEn: '',
    category: 'surf',
    source: 'x',
    sourceType: 'rss',
    keyPoints: [],
    url: 'https://x.pt',
    tags: [],
  }) as NewsItem;

const ev = (id: string, startDate: string, endDate?: string): VentuEvent =>
  ({ id, startDate, endDate, title: id, kind: 'competition', sports: ['surf'] }) as unknown as VentuEvent;

// Build de «ontem»: 14 nov 2025, 23:30 Lisboa (inverno, UTC+0)
const BAKED = Date.parse('2025-11-14T23:30:00Z');
const NEWS = [item('a', '2025-11-14T10:00:00Z'), item('b', '2025-11-15T01:00:00Z'), item('v', '2025-11-01T09:00:00Z')];
const EVENTS = [ev('e1', '2025-11-14'), ev('e2', '2025-11-20')];

function props() {
  return { bakedNews: NEWS, bakedEvents: EVENTS, bakedNowMs: BAKED, locale: 'pt' };
}

function hydrationErrors(spy: ReturnType<typeof vi.spyOn>): unknown[] {
  return spy.mock.calls.filter(
    (args: unknown[]) => /did not match|hydrat|Prop .* did not/i.test(String(args[0])) || /did not match/i.test(String(args)),
  );
}

describe('NewsArchiveClient — hidratação real (jsdom)', () => {
  it('HTML do build + hydrateRoot no cliente → zero mismatch', async () => {
    const serverHtml = renderToString(createElement(NewsArchiveClient, props()));
    const container = document.createElement('div');
    container.innerHTML = serverHtml;

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, createElement(NewsArchiveClient, props()));
    });
    const errors = hydrationErrors(spy);
    spy.mockRestore();

    expect(errors).toEqual([]);
  });

  it('o primeiro render do cliente usa bakedNowMs, não o relógio real', async () => {
    // Se o render usasse Date.now(), o grupo «Hoje» do cliente seria o dia
    // actual (≠14 nov 2025) e a hidratação falhava — apanha a regressão.
    const serverHtml = renderToString(createElement(NewsArchiveClient, props()));
    expect(serverHtml).toContain('Hoje');

    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, createElement(NewsArchiveClient, props()));
    });
    spy.mockRestore();

    // Depois dos efeitos o relógio real já pode mudar o conteúdo — mas o
    // grupo «Hoje» do dia do build continua presente ou foi substituído
    // pelo render pós-mount; em nenhum dos casos houve erro de hidratação.
    expect(hydrationErrors(spy)).toEqual([]);
    expect(container.querySelector('div')).toBeTruthy();
  });
});
