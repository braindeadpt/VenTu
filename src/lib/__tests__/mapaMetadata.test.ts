import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

describe('mapa page SEO', () => {
  it('declares trailing-slash canonical for PT and EN', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/[locale]/mapa/page.tsx'),
      'utf-8',
    );
    expect(source).toContain("canonical: `/${locale}/mapa/`");
    expect(source).toContain("pt: '/pt/mapa/'");
    expect(source).toContain("en: '/en/mapa/'");
    expect(source).toContain('Mapa de spots — VenTu');
    expect(source).toContain('Spots map — VenTu');
  });
});
