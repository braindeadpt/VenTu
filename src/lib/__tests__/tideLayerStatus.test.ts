import { describe, expect, it } from 'vitest'
import { deriveTideLayerStatus, latestTideObservations } from '@/lib/tideLayerStatus'

const station = (title: string, lastObs: number, lastData: string) => ({
  codp: title.toLowerCase(),
  title,
  category: 'tide gauge',
  lat: 40,
  lon: -8,
  lastObs,
  lastData,
})

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

  it('ok com fetch recente carrega as observações mais recentes (top 5 por recência)', () => {
    const s = deriveTideLayerStatus(
      {
        fetchedAt: h(2),
        stations: {
          leixoes: station('Leixões', 2.021, '2026-09-08T10:00:00Z'),
          aveiro: station('Aveiro', 1.9, '2026-09-08T11:30:00Z'),
          lisboa: station('Lisboa', 2.5, '2026-09-08T09:00:00Z'),
        },
        spotMapping: { s1: {} },
      },
      NOW,
    )
    expect(s.status).toBe('ok')
    expect(s.observations).toHaveLength(3)
    // Ordenação por recência: Aveiro (11:30) primeiro.
    expect(s.observations?.[0]).toMatchObject({ title: 'Aveiro', heightM: 1.9, at: '2026-09-08T11:30:00Z' })
    expect(s.observations?.[1]).toMatchObject({ title: 'Leixões', heightM: 2.021 })
  })

  it('observações ignoram estações sem leituras (backend a recuperar só com posições)', () => {
    const s = deriveTideLayerStatus(
      {
        fetchedAt: h(1),
        stations: {
          leixoes: station('Leixões', 2.0, '2026-09-08T10:00:00Z'),
          semLeitura: { codp: '9', title: 'Sem leitura', lat: 41, lon: -8 },
          semData: station('Sem data', 1.5, 'not-a-date'),
        },
      },
      NOW,
    )
    expect(s.observations).toHaveLength(1)
    expect(s.observations?.[0].title).toBe('Leixões')
  })

  it('limita a top 5 por recência e omite a lista quando não há leituras', () => {
    const stations: Record<string, unknown> = {}
    for (let i = 0; i < 8; i++) {
      stations['s' + i] = station(`S${i}`, 1 + i, `2026-09-08T0${i}:00:00Z`)
    }
    const s = deriveTideLayerStatus({ fetchedAt: h(1), stations }, NOW)
    expect(s.observations).toHaveLength(5)
    expect(s.observations?.[0].title).toBe('S7')
    expect(deriveTideLayerStatus({ fetchedAt: h(1), stations: { a: {} } }, NOW).observations).toBeUndefined()
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

describe('latestTideObservations', () => {
  it('devolve vazio para ficheiro nulo/sem estações', () => {
    expect(latestTideObservations(null)).toEqual([])
    expect(latestTideObservations({ stations: {} })).toEqual([])
  })
})
