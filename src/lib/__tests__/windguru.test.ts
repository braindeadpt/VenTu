import { describe, it, expect } from 'vitest';
import { getWindguruSpotUrl, getWindguruUrl } from '../windguru';

describe('getWindguruUrl', () => {
  it('uses curated Cabedelo Viana page', () => {
    expect(getWindguruSpotUrl('cabedelo')).toBe('https://www.windguru.cz/54473');
    expect(getWindguruUrl('cabedelo', 'Cabedelo', 41.679, -8.833)).toBe(
      'https://www.windguru.cz/54473',
    );
  });

  it('falls back to search for unmapped spots', () => {
    const url = getWindguruUrl('guincho', 'Guincho', 38.733, -9.476);
    expect(url).toContain('search.php');
    expect(url).toContain('Guincho');
  });
});
