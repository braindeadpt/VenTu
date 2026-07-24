import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { DirectoryEntry, DirectoryFile } from '@/types/directory';

export {
  DIRECTORY_KIND_LABELS,
  DIRECTORY_TIER_LABELS,
  tierRank,
  sortDirectoryEntries,
  distanceKm,
  entriesNearSpot,
  kindLabel,
  sportLabel,
} from '@/lib/directoryClient';

const DIRECTORY_PATH = path.join(process.cwd(), 'public', 'data', 'directory.json');

export function loadDirectoryFile(): DirectoryFile | null {
  if (!existsSync(DIRECTORY_PATH)) return null;
  try {
    return JSON.parse(readFileSync(DIRECTORY_PATH, 'utf-8')) as DirectoryFile;
  } catch {
    return null;
  }
}

export function loadDirectoryEntries(): DirectoryEntry[] {
  return loadDirectoryFile()?.entries ?? [];
}
