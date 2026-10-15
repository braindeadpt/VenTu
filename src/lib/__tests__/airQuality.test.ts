import { describe, expect, it } from 'vitest';
import { europeanAqiLevel } from '../airQuality';

describe('europeanAqiLevel (escala oficial UE)', () => {
  it('mapeia os intervalos oficiais 0-20/21-40/41-60/61-80/81-100/>100', () => {
    expect(europeanAqiLevel(0)).toBe('good');
    expect(europeanAqiLevel(20)).toBe('good');
    expect(europeanAqiLevel(21)).toBe('fair');
    expect(europeanAqiLevel(40)).toBe('fair');
    expect(europeanAqiLevel(41)).toBe('moderate');
    expect(europeanAqiLevel(60)).toBe('moderate');
    expect(europeanAqiLevel(61)).toBe('poor');
    expect(europeanAqiLevel(80)).toBe('poor');
    expect(europeanAqiLevel(81)).toBe('veryPoor');
    expect(europeanAqiLevel(100)).toBe('veryPoor');
    expect(europeanAqiLevel(101)).toBe('extreme');
    expect(europeanAqiLevel(250)).toBe('extreme');
  });

  it('valores inválidos degradam para extreme (nunca inventa "bom")', () => {
    expect(europeanAqiLevel(Number.NaN)).toBe('extreme');
    expect(europeanAqiLevel(-5)).toBe('extreme');
  });
});
