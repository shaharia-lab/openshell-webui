import { describe, expect, it } from 'vitest'

import { enumLabel, formatRelative, middleTruncate, shortImage } from '../format'

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

describe('shortImage', () => {
  it('keeps the last path segment and the tag', () => {
    expect(
      shortImage('europe-west3-docker.pkg.dev/org/repo/hello-sandbox-dev:sha-a8b083562a62'),
    ).toBe('hello-s…box-dev:sha-a8b083562a62')
    expect(shortImage('ghcr.io/org/agent:1.2', 40)).toBe('agent:1.2')
    expect(shortImage('local/openshell-claude:latest')).toBe('openshell-claude:latest')
    expect(shortImage('ubuntu')).toBe('ubuntu')
  })

  it('keeps a registry port out of the tag', () => {
    expect(shortImage('localhost:5000/agent')).toBe('agent')
  })

  it('cuts a digest to twelve characters', () => {
    expect(shortImage(`ghcr.io/org/agent@sha256:${'a'.repeat(64)}`)).toBe(
      'agent@sha256:aaaaaaaaaaaa',
    )
  })
})
