import { parseEvents } from '@/lib/events'
import type { VentuEvent } from '@/types/events'
import fs from 'fs'
import path from 'path'

/** Server/build only — read public/data/events.json. */
export async function loadEvents(): Promise<VentuEvent[]> {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'events.json')
    if (!fs.existsSync(filePath)) return []
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return parseEvents(raw)
  } catch (err) {
    console.warn('Failed to load events.json:', err)
    return []
  }
}
