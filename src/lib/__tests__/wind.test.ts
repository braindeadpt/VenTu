import { describe, it, expect } from 'vitest';
import {
  getWindRelationToCoast,
  getWindRelationLabel,
  getCardinalLabel,
  getWindArrow,
} from '@/lib/wind';

describe('getWindRelationToCoast', () => {
  it('returns onshore when wind comes from the same direction as coast orientation', () => {
    expect(getWindRelationToCoast(270, 270)).toBe('onshore');
  });

  it('returns offshore when wind comes from opposite direction', () => {
    expect(getWindRelationToCoast(90, 270)).toBe('offshore');
  });

  it('returns cross when wind is perpendicular', () => {
    expect(getWindRelationToCoast(0, 270)).toBe('cross');
  });

  it('handles wrap-around angles', () => {
    expect(getWindRelationToCoast(350, 10)).toBe('onshore');
    expect(getWindRelationToCoast(10, 350)).toBe('onshore');
  });

  it('classifies near-perpendicular as cross', () => {
    expect(getWindRelationToCoast(180, 270)).toBe('cross');
  });

  it('classifies slight onshore angles correctly', () => {
    expect(getWindRelationToCoast(300, 270)).toBe('onshore');
  });

  it('classifies slight offshore angles correctly', () => {
    expect(getWindRelationToCoast(120, 270)).toBe('offshore');
  });
});

describe('getWindRelationLabel', () => {
  it('returns correct PT labels', () => {
    expect(getWindRelationLabel('offshore', 'pt').label).toBe('Offshore');
    expect(getWindRelationLabel('onshore', 'pt').label).toBe('Onshore');
    expect(getWindRelationLabel('cross', 'pt').label).toBe('Cross-shore');
  });

  it('returns correct EN labels', () => {
    expect(getWindRelationLabel('offshore', 'en').label).toBe('Offshore');
    expect(getWindRelationLabel('cross', 'en').label).toBe('Cross-shore');
  });

  it('includes className for styling', () => {
    const result = getWindRelationLabel('offshore', 'pt');
    expect(result.className).toContain('text-windDir-offshore');
  });

  it('returns distinct classes per relation', () => {
    const off = getWindRelationLabel('offshore', 'pt').className;
    const on = getWindRelationLabel('onshore', 'pt').className;
    const cross = getWindRelationLabel('cross', 'pt').className;
    expect(off).not.toBe(on);
    expect(on).not.toBe(cross);
  });
});

describe('getCardinalLabel', () => {
  it('maps 0° to N', () => {
    expect(getCardinalLabel(0)).toBe('N');
  });

  it('maps 90° to E', () => {
    expect(getCardinalLabel(90)).toBe('E');
  });

  it('maps 180° to S', () => {
    expect(getCardinalLabel(180)).toBe('S');
  });

  it('maps 270° to W', () => {
    expect(getCardinalLabel(270)).toBe('W');
  });

  it('maps 45° to NE', () => {
    expect(getCardinalLabel(45)).toBe('NE');
  });

  it('maps 225° to SW', () => {
    expect(getCardinalLabel(225)).toBe('SW');
  });

  it('maps 360° back to N', () => {
    expect(getCardinalLabel(360)).toBe('N');
  });
});

describe('getWindArrow', () => {
  it('maps 0° (from N) to ↓', () => {
    expect(getWindArrow(0)).toBe('↓');
  });

  it('maps 90° (from E) to ←', () => {
    expect(getWindArrow(90)).toBe('←');
  });

  it('maps 180° (from S) to ↑', () => {
    expect(getWindArrow(180)).toBe('↑');
  });

  it('maps 270° (from W) to →', () => {
    expect(getWindArrow(270)).toBe('→');
  });

  it('maps 45° (from NE) to ↙', () => {
    expect(getWindArrow(45)).toBe('↙');
  });

  it('maps 315° (from NW) to ↘', () => {
    expect(getWindArrow(315)).toBe('↘');
  });
});
