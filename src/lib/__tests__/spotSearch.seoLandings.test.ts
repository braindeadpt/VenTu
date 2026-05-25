import { describe, it, expect } from 'vitest'
import { searchSpots } from '@/lib/spotSearch'
import {
  SEO_LANDINGS,
  getSeoLanding,
  landingTitle,
  landingDescription,
} from '@/lib/seoLandings'
import { getSpotLivecam, getLivecamSpotCount } from '@/lib/spotLivecams'

describe('searchSpots', () => {
  it('returns top spots when query is empty', () => {
    const results = searchSpots({ locale: 'pt', query: '', limit: 5 })
    expect(results).toHaveLength(5)
  })

  it('finds spot by name (accent-insensitive)', () => {
    const results = searchSpots({ locale: 'pt', query: 'nazare', limit: 5 })
    expect(results.some((s) => s.slug === 'nazare')).toBe(true)
  })

  it('finds spots by region', () => {
    const results = searchSpots({ locale: 'pt', query: 'algarve', limit: 20 })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((s) => s.region === 'Algarve' || s.regionEn.toLowerCase().includes('algarve'))).toBe(true)
  })

  it('finds kitesurf-compatible spots by sport keyword', () => {
    const results = searchSpots({ locale: 'pt', query: 'kitesurf', limit: 20 })
    expect(results.length).toBeGreaterThan(0)
  })

  it('returns empty for nonsense query', () => {
    const results = searchSpots({ locale: 'pt', query: 'zzzznotaspot', limit: 8 })
    expect(results).toHaveLength(0)
  })
})

describe('seoLandings', () => {
  it('generates landings for all major sports', () => {
    expect(SEO_LANDINGS.length).toBeGreaterThan(40)
    expect(getSeoLanding('surf')).toBeDefined()
    expect(getSeoLanding('kitesurf-algarve')).toBeDefined()
  })

  it('returns undefined for invalid slug', () => {
    expect(getSeoLanding('not-a-real-slug')).toBeUndefined()
  })

  it('landingTitle includes region when set', () => {
    const landing = getSeoLanding('surf-algarve')
    expect(landing).toBeDefined()
    expect(landingTitle(landing!, 'pt')).toMatch(/Algarve/i)
    expect(landingDescription(landing!, 'pt')).toMatch(/spots/)
  })

  it('sport-only landing has no region', () => {
    const landing = getSeoLanding('surf')
    expect(landing?.region).toBeUndefined()
    expect(landing?.spotCount).toBeGreaterThan(50)
  })
})

describe('spotLivecams', () => {
  it('has livecams for popular spots', () => {
    expect(getLivecamSpotCount()).toBeGreaterThanOrEqual(34)
    expect(getSpotLivecam('guincho')?.provider).toBe('Surftotal')
    expect(getSpotLivecam('supertubos')?.provider).toBe('MEO Beachcam')
    expect(getSpotLivecam('coxos')?.url).toContain('beachcam.meo.pt')
    expect(getSpotLivecam('baleal')?.url).toContain('surftotal.com')
  })

  it('returns null for spots without livecam', () => {
    expect(getSpotLivecam('not-a-spot')).toBeNull()
  })
})
