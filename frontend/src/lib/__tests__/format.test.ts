import { describe, expect, it } from 'vitest'

import { enumLabel, formatRelative, middleTruncate } from '../format'

describe('format', () => {
  it('labels enum values', () => {
    expect(enumLabel('SANDBOX_PHASE_READY', 'SANDBOX_PHASE_')).toBe('Ready')
    expect(enumLabel('POLICY_STATUS_LOADED', 'POLICY_STATUS_')).toBe('Loaded')
    expect(enumLabel(undefined)).toBe('')
  })

  it('formats relative times', () => {
    const now = Date.parse('2026-01-01T12:00:00Z')
    expect(formatRelative('2026-01-01T11:55:00Z', now)).toMatch(/5 minutes ago/)
    expect(formatRelative('not a date', now)).toBe('')
  })

  it('shortens long identifiers in the middle', () => {
    expect(middleTruncate('short', 10)).toBe('short')
    const out = middleTruncate('openshell-default--demo-aa27aa8c-supervisor', 20)
    expect(out).toHaveLength(20)
    expect(out).toBe('openshell-…upervisor')
  })
})
