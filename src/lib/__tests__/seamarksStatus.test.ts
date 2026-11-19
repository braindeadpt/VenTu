import { describe, it, expect } from 'vitest'
import { nextSeamarksTally, seamarksDown, SEAMARKS_DOWN_AFTER, type SeamarksTally } from '@/lib/seamarksStatus'

const run = (evs: Array<'load' | 'error'>): SeamarksTally =>
  evs.reduce(nextSeamarksTally, { loads: 0, errors: 0 })

describe('seamarksStatus', () => {
  it('começa disponível', () => {
    expect(seamarksDown({ loads: 0, errors: 0 })).toBe(false)
  })
  it('poucos erros isolados não marcam indisponível', () => {
    expect(seamarksDown(run(Array(SEAMARKS_DOWN_AFTER - 1).fill('error')))).toBe(false)
  })
  it('erros seguidos sem nenhum tile bom marcam indisponível', () => {
    expect(seamarksDown(run(Array(SEAMARKS_DOWN_AFTER).fill('error')))).toBe(true)
  })
  it('um tile bom zera os erros', () => {
    const t = run(['error', 'error', 'error', 'load', 'error'])
    expect(t.errors).toBe(1)
    expect(seamarksDown(t)).toBe(false)
  })
  it('o serviço que volta repõe o estado', () => {
    const down = run(Array(SEAMARKS_DOWN_AFTER + 2).fill('error'))
    expect(seamarksDown(down)).toBe(true)
    expect(seamarksDown(nextSeamarksTally(down, 'load'))).toBe(false)
  })
})
