import { describe, it, expect } from 'vitest';
import { formatCoastalCategory } from '@/lib/formatCoastalCategory';

describe('formatCoastalCategory', () => {
  it('adds accents to IH «maritima» categories', () => {
    expect(formatCoastalCategory('Requisitos de segurança maritima')).toBe(
      'Requisitos de segurança marítima',
    );
    expect(formatCoastalCategory('Segurança Maritima')).toBe('Segurança Marítima');
  });

  it('adds accents to Exercicio(s)', () => {
    expect(formatCoastalCategory('Exercicios')).toBe('Exercícios');
    expect(formatCoastalCategory('Exercicio militar')).toBe('Exercício militar');
    expect(formatCoastalCategory('exercicios navais')).toBe('exercícios navais');
  });

  it('leaves already-accented and Spanish categories alone', () => {
    expect(formatCoastalCategory('Exercício militar')).toBe('Exercício militar');
    expect(formatCoastalCategory('Ejercicio naval')).toBe('Ejercicio naval');
    expect(formatCoastalCategory('Comunicações')).toBe('Comunicações');
  });

  it('handles empty input', () => {
    expect(formatCoastalCategory('')).toBe('');
  });
});
