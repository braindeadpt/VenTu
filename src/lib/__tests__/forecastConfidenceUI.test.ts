import { describe, it, expect } from 'vitest';
import {
  getConfidenceLabel,
  getConfidenceExplain,
  getConfidenceTooltip,
  getConfidenceTokenClass,
} from '@/lib/forecastConfidence';

describe('getConfidenceLabel', () => {
  it('returns PT labels when isPt is true', () => {
    expect(getConfidenceLabel('alta', true)).toBe('Alta');
    expect(getConfidenceLabel('média', true)).toBe('Média');
    expect(getConfidenceLabel('baixa', true)).toBe('Baixa');
  });

  it('returns EN labels when isPt is false', () => {
    expect(getConfidenceLabel('alta', false)).toBe('High');
    expect(getConfidenceLabel('média', false)).toBe('Medium');
    expect(getConfidenceLabel('baixa', false)).toBe('Low');
  });
});

describe('getConfidenceExplain', () => {
  it('returns PT explanations', () => {
    expect(getConfidenceExplain('alta', true)).toContain('Modelos concordam');
    expect(getConfidenceExplain('baixa', true)).toContain('Modelos divergem');
  });

  it('returns EN explanations', () => {
    expect(getConfidenceExplain('alta', false)).toContain('Models agree');
    expect(getConfidenceExplain('média', false)).toContain('model divergence');
  });
});

describe('getConfidenceTooltip', () => {
  it('returns PT tooltip', () => {
    expect(getConfidenceTooltip(true)).toContain('Confiança');
  });

  it('returns EN tooltip', () => {
    expect(getConfidenceTooltip(false)).toContain('Confidence');
  });
});

describe('getConfidenceTokenClass', () => {
  it('returns good tokens for alta', () => {
    expect(getConfidenceTokenClass('alta')).toContain('text-score-good');
  });

  it('returns poor tokens for baixa', () => {
    expect(getConfidenceTokenClass('baixa')).toContain('text-score-poor');
  });

  it('returns fair tokens for média', () => {
    expect(getConfidenceTokenClass('média')).toContain('text-score-fair');
  });
});
