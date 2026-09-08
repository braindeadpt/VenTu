import { describe, expect, it } from 'vitest'
import { deriveTideLayerStatus } from '@/lib/tideLayerStatus'

const NOW = Date.parse('2026-09-08T12:00:00Z')
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString()

describe('deriveTideLayerStatus', () => {
  it('ok com fetch recente (≤24h)', () => {
    const s = deriveTideLayerStatus(
      { fetchedAt: h(2), stations: { a: {} }, spotMapping: { s1: {} } },
      NOW,
    )
    expect(s.status).toBe('ok')
    expect(s.stations).toBe(1)
    expect(s.mappedSpots).toBe(1)
  })

  it('stale quando o ficheiro existe mas fetchedAt é velho (o caso real: 41 dias)', () => {
    const s = deriveTideLayerStatus(
      { fetchedAt: '2026-07-29T11:20:29.532Z', stations: { a: {}, b: {} }, spotMapping: { s1: {} } },
      NOW,
    )
    expect(s.status).toBe('stale')
    expect(s.stations).toBe(2)
    expect(s.mappedSpots).toBe(1)
  })

  it('down sem ficheiro / fetchedAt inválido', () => {
    expect(deriveTideLayerStatus(null, NOW).status).toBe('down')
    expect(deriveTideLayerStatus({}, NOW).status).toBe('down')
    expect(deriveTideLayerStatus({ fetchedAt: 'nope' }, NOW).status).toBe('down')
  })

  it('preserva o streak/lastOkAt do pipeline-meta (para o badge de downtime)', () => {
    const s = deriveTideLayerStatus(
      { fetchedAt: '2026-07-29T11:20:29.532Z' },
      NOW,
      { streak: 3, lastStatus: 'stale', lastOkAt: '2026-07-29T11:20:29.532Z' },
    )
    expect(s.streak).toBe(3)
    expect(s.lastStatus).toBe('stale')
    expect(s.lastOkAt).toBe('2026-07-29T11:20:29.532Z')
  })
})
