import { describe, expect, it } from 'vitest';
import { spotTimelineWindow } from '@/components/spots/timeline/spotTimelineWindow';

describe('spotTimelineWindow — janela de 48 h do eixo', () => {
  it('janela normal: [nowIndex, nowIndex+48)', () => {
    expect(spotTimelineWindow(200, 10)).toEqual({ start: 10, end: 58 });
  });

  it('nowIndex < 0 (antes de montar / sem hora actual) → começa em 0', () => {
    expect(spotTimelineWindow(200, -1)).toEqual({ start: 0, end: 48 });
  });

  it('hora actual perto do fim → janela mais curta, nunca além do array', () => {
    expect(spotTimelineWindow(200, 190)).toEqual({ start: 190, end: 200 });
  });

  it('array mais curto que a janela → cobre tudo', () => {
    expect(spotTimelineWindow(20, -1)).toEqual({ start: 0, end: 20 });
    expect(spotTimelineWindow(20, 5)).toEqual({ start: 5, end: 20 });
  });

  it('sem horas → janela vazia', () => {
    expect(spotTimelineWindow(0, -1)).toEqual({ start: 0, end: 0 });
  });

  it('windowHours customizável', () => {
    expect(spotTimelineWindow(200, 10, 24)).toEqual({ start: 10, end: 34 });
  });
});
