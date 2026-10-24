import { describe, expect, it } from 'vitest'

import { providerRefreshHealth, refreshHealth } from '../refresh-health'

const now = Date.parse('2026-10-24T12:00:00Z')

describe('refreshHealth', () => {
  it('maps the gateway statuses', () => {
    expect(refreshHealth({ status: 'refreshed' }, now).tone).toBe('success')
    expect(refreshHealth({ status: 'error', last_error: 'timeout' }, now).label).toBe(
      'Failing, retrying',
    )
    expect(refreshHealth({ status: 'reauthorization_required' }, now)).toMatchObject({
      tone: 'danger',
      label: 'Needs reauthorization',
    })
  })

  it('flags an expired credential even when the last refresh succeeded', () => {
    expect(
      refreshHealth({ status: 'refreshed', expiration_time: '2026-10-24T11:00:00Z' }, now).label,
    ).toBe('Expired')
  })

  it('shows unknown statuses as they are, failing when there is an error', () => {
    expect(refreshHealth({ status: 'new_state' }, now)).toMatchObject({ label: 'new_state' })
    expect(refreshHealth({ status: 'new_state', last_error: 'x' }, now).tone).toBe('warning')
  })
})

describe('providerRefreshHealth', () => {
  it('is null without refreshed credentials', () => {
    expect(providerRefreshHealth([], now)).toBeNull()
  })

  it('shows the worst credential', () => {
    expect(
      providerRefreshHealth(
        [{ status: 'refreshed' }, { status: 'investigation_required' }, { status: 'configured' }],
        now,
      )?.label,
    ).toBe('Failing')
  })
})
