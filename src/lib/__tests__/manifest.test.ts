import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { spots } from '@/lib/spots';
import { pipelineSchedule } from '@/lib/dataPipelineSchedule';

describe('manifest.json product facts', () => {
  it('matches spot count and 2h/4h schedule', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), 'public/manifest.json'), 'utf-8'),
    ) as { description: string };
    expect(manifest.description).toContain(`${spots.length} spots`);
    expect(manifest.description).not.toMatch(/\b174\b/);
    expect(manifest.description).not.toMatch(/a cada 3 horas/);
    // Align with pipelineSchedule medium PT copy (2h day / 4h night).
    expect(manifest.description).toContain(pipelineSchedule('pt'));
  });
});
