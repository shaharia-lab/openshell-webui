import { describe, expect, it } from 'vitest'

import { labelPairs, matchesFilters, parseSelector } from '../sandbox-filters'
import type { Sandbox } from '@/gen/openshell'

const sb: Sandbox = {
  metadata: { name: 'a', labels: { team: 'ml', env: 'dev' } },
  spec: { providers: ['github'] },
  status: { phase: 'SANDBOX_PHASE_READY' },
}
const none = { phase: '', provider: '', labels: '' }

describe('sandbox filters', () => {
  it('parses CLI-style selectors, with bare keys', () => {
    expect(parseSelector(' team=ml , env ')).toEqual([{ key: 'team', value: 'ml' }, { key: 'env' }])
    expect(parseSelector('')).toEqual([])
    expect(() => parseSelector('=ml')).toThrow(/label key/)
  })

  it('matches phase, provider and every label term', () => {
    expect(matchesFilters(sb, none, [])).toBe(true)
    expect(matchesFilters(sb, { ...none, phase: 'SANDBOX_PHASE_ERROR' }, [])).toBe(false)
    expect(matchesFilters(sb, { ...none, provider: 'github' }, [])).toBe(true)
    expect(matchesFilters(sb, { ...none, provider: 'slack' }, [])).toBe(false)
    expect(matchesFilters(sb, none, parseSelector('team=ml,env'))).toBe(true)
    expect(matchesFilters(sb, none, parseSelector('team=ml,env=prod'))).toBe(false)
    expect(matchesFilters(sb, none, parseSelector('owner'))).toBe(false)
  })

  it('lists labels as sorted pairs', () => {
    expect(labelPairs(sb)).toEqual(['env=dev', 'team=ml'])
  })
})
