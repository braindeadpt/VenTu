import { describe, expect, it } from 'vitest'
import {
  deriveRadarLayerStatus,
  formatRadarAge,
  RADAR_MAX_AGE_MINUTES,
} from '@/lib/radarLayerStatusPure'

const NOW = Date.parse('2026-09-08T12:00:00Z')
const min = (n: number) => new Date(NOW - n * 60_000).toISOString()

describe('deriveRadarLayerStatus', () => {
  it('ok com frame recente (≤25 min) via frameTime', () => {
    const s = deriveRadarLayerStatus({ frameTime: min(5) }, NOW)
    expect(s.status).toBe('ok')
    expect(s.frameTime).toBe(min(5))
    expect(s.ageMin).toBeCloseTo(5)
    expect(s.frames).toBe(1)
  })

  it('ok com frames array (frames[0] = mais recente) e contagem correcta', () => {
    const s = deriveRadarLayerStatus(
      {
        frameTime: min(5),
        frames: [
          { frameTime: min(5) },
          { frameTime: min(10) },
          { frameTime: min(15) },
        ],
      },
      NOW,
    )
    expect(s.status).toBe('ok')
    expect(s.frames).toBe(3)
  })

  it('stale quando o último frame é velho (o caso real: outage de 2026-09-08/09)', () => {
    const s = deriveRadarLayerStatus(
      { frameTime: '2026-09-07T23:25:00.000Z', frames: [{ frameTime: '2026-09-07T23:25:00.000Z' }] },
      NOW,
    )
    expect(s.status).toBe('stale')
    expect(s.ageMin).toBeGreaterThan(RADAR_MAX_AGE_MINUTES)
  })

  it('down sem ficheiro / sem frameTime / frameTime inválido', () => {
    expect(deriveRadarLayerStatus(null, NOW).status).toBe('down')
    expect(deriveRadarLayerStatus({}, NOW).status).toBe('down')
    expect(deriveRadarLayerStatus({ frameTime: 'nope' }, NOW).status).toBe('down')
    expect(deriveRadarLayerStatus({ frames: [] }, NOW).status).toBe('down')
  })

  it('merge do streak do pipeline-meta (radarLayer)', () => {
    const s = deriveRadarLayerStatus(
      { frameTime: min(120), frames: [{ frameTime: min(120) }] },
      NOW,
      {
        streak: 7,
        lastStatus: 'stale',
        lastOkAt: '2026-09-08T06:00:00.000Z',
        streakUpdatedAt: '2026-09-08T11:00:00.000Z',
      },
    )
    expect(s.status).toBe('stale')
    expect(s.streak).toBe(7)
    expect(s.lastStatus).toBe('stale')
    expect(s.lastOkAt).toBe('2026-09-08T06:00:00.000Z')
    expect(s.streakUpdatedAt).toBe('2026-09-08T11:00:00.000Z')
  })

  it('sem meta → campos opcionais ausentes', () => {
    const s = deriveRadarLayerStatus({ frameTime: min(5) }, NOW)
    expect(s.streak).toBeUndefined()
    expect(s.lastOkAt).toBeUndefined()
  })
})

describe('formatRadarAge', () => {
  it('minutos, horas e dias em texto curto', () => {
    expect(formatRadarAge(0)).toBe('0m')
    expect(formatRadarAge(26)).toBe('26m')
    expect(formatRadarAge(185)).toBe('3h 05m')
    expect(formatRadarAge(42 * 60)).toBe('1d 18h')
  })

  it('negativo ou NaN degradam para 0m (relógio do sistema)', () => {
    expect(formatRadarAge(-5)).toBe('0m')
    expect(formatRadarAge(Number.NaN)).toBe('0m')
  })
})