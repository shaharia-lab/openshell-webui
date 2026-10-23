import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { useSandboxes } from '../queries'
import { createQueryClient } from '@/app/query-client'
import { usePreferences } from '@/lib/preferences'
import { server } from '@/test/server'

describe('useSandboxes', () => {
  it('polls quickly while a sandbox changes phase, even with auto-refresh off', async () => {
    usePreferences.setState({ refreshInterval: 0 })
    const phases = ['SANDBOX_PHASE_STARTING', 'SANDBOX_PHASE_READY']
    let calls = 0
    server.use(
      http.get('/api/gw/:gw/sandboxes', () => {
        const phase = phases[Math.min(calls++, phases.length - 1)]
        return HttpResponse.json({ sandboxes: [{ metadata: { name: 'box' }, status: { phase } }] })
      }),
    )
    const client = createQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useSandboxes('gw', 'default'), { wrapper })
    await waitFor(() =>
      expect(result.current.data?.sandboxes?.[0].status?.phase).toBe('SANDBOX_PHASE_STARTING'),
    )
    await waitFor(
      () => expect(result.current.data?.sandboxes?.[0].status?.phase).toBe('SANDBOX_PHASE_READY'),
      {
        timeout: 4000,
      },
    )
    // Once ready, polling stops (auto-refresh is off).
    await new Promise((r) => setTimeout(r, 2500))
    expect(calls).toBe(2)
  })
})
