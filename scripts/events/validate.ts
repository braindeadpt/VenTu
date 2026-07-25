/**
 * Validate public/data/events.json
 * Usage: npx tsx scripts/events/validate.ts
 *    or: npm run events:validate
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { EVENT_KINDS, EVENT_SPORTS, type VentuEvent } from '../../src/types/events';
import { spots } from '../../src/lib/spots';
import { safeExternalUrl } from '../../src/lib/safeUrl';

const PATH = join(process.cwd(), 'public', 'data', 'events.json');
const PUBLIC = join(process.cwd(), 'public');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HM = /^\d{2}:\d{2}$/;

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
  );
}

function main() {
  if (!existsSync(PATH)) {
    console.error('Missing', PATH);
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(PATH, 'utf-8'));
  } catch (e) {
    console.error('Invalid JSON in events.json:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  if (!Array.isArray(raw)) {
    console.error('events.json must be a JSON array');
    process.exit(1);
  }

  const spotIds = new Set(spots.map((s) => s.id));
  const ids = new Set<string>();
  const errors: string[] = [];

  raw.forEach((item, index) => {
    const label = `events[${index}]`;
    if (!item || typeof item !== 'object') {
      errors.push(`${label}: must be an object`);
      return;
    }
    const e = item as Partial<VentuEvent> & Record<string, unknown>;

    if (typeof e.id !== 'string' || !e.id.trim()) {
      errors.push(`${label}: missing id`);
    } else if (ids.has(e.id)) {
      errors.push(`${label}: duplicate id "${e.id}"`);
    } else {
      ids.add(e.id);
    }

    if (typeof e.title !== 'string' || !e.title.trim()) {
      errors.push(`${label}: missing title`);
    }
    if (typeof e.titleEn !== 'string' || !e.titleEn.trim()) {
      errors.push(`${label}: missing titleEn`);
    }
    if (typeof e.summary !== 'string' || !e.summary.trim()) {
      errors.push(`${label}: missing summary`);
    }
    if (typeof e.summaryEn !== 'string' || !e.summaryEn.trim()) {
      errors.push(`${label}: missing summaryEn`);
    }

    if (!isIsoDate(e.startDate)) {
      errors.push(`${label}: startDate must be ISO YYYY-MM-DD`);
    }

    if (e.endDate !== undefined && e.endDate !== null && e.endDate !== '') {
      if (!isIsoDate(e.endDate)) {
        errors.push(`${label}: endDate must be ISO YYYY-MM-DD`);
      } else if (isIsoDate(e.startDate) && e.endDate < e.startDate) {
        errors.push(`${label}: endDate must be >= startDate`);
      }
    }

    if (e.startTime !== undefined && e.startTime !== null && e.startTime !== '') {
      if (typeof e.startTime !== 'string' || !TIME_HM.test(e.startTime)) {
        errors.push(`${label}: startTime must be HH:MM`);
      }
    }

    if (typeof e.location !== 'string' || !e.location.trim()) {
      errors.push(`${label}: missing location`);
    }

    if (!Array.isArray(e.spotIds)) {
      errors.push(`${label}: spotIds must be an array`);
    } else {
      for (const sid of e.spotIds) {
        if (typeof sid !== 'string' || !sid.trim()) {
          errors.push(`${label}: invalid spotId entry`);
          continue;
        }
        if (!spotIds.has(sid)) {
          errors.push(`${label}: unknown spotId "${sid}" (not in src/lib/spots.ts)`);
        }
      }
    }

    if (typeof e.sport !== 'string' || !(EVENT_SPORTS as readonly string[]).includes(e.sport)) {
      errors.push(`${label}: sport must be one of ${EVENT_SPORTS.join('|')}`);
    }
    if (typeof e.kind !== 'string' || !(EVENT_KINDS as readonly string[]).includes(e.kind)) {
      errors.push(`${label}: kind must be one of ${EVENT_KINDS.join('|')}`);
    }

    if (e.url !== undefined && e.url !== null && e.url !== '') {
      if (typeof e.url !== 'string' || !safeExternalUrl(e.url)) {
        errors.push(`${label}: url must be http(s)`);
      }
    }

    if (e.image !== undefined && e.image !== null && e.image !== '') {
      if (typeof e.image !== 'string' || !e.image.startsWith('/')) {
        errors.push(`${label}: image must be a root-relative path under public/`);
      } else {
        const disk = join(PUBLIC, e.image.replace(/^\//, ''));
        if (!existsSync(disk)) {
          errors.push(`${label}: image file missing at public${e.image}`);
        }
      }
    }

    if (e.free !== undefined && typeof e.free !== 'boolean') {
      errors.push(`${label}: free must be boolean when set`);
    }
  });

  console.log(`Events: ${raw.length}`);
  if (errors.length) {
    for (const msg of errors) console.error('·', msg);
    console.error(`❌ ${errors.length} error(s)`);
    process.exit(1);
  }
  console.log('✅ events OK');
}

main();
