import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useLeaveGuard } from '../use-leave-guard'

function Guarded({ when }: { when: boolean }) {
  useLeaveGuard(when, 'Leave?')
  return <p>guarded</p>
}

function setup(when: boolean) {
  const router = createMemoryRouter(
    [
      { path: '/a', element: <Guarded when={when} /> },
      { path: '/b', element: <p>other</p> },
    ],
    { initialEntries: ['/a'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('useLeaveGuard', () => {
  afterEach(() => vi.restoreAllMocks())

  it('stays on the page when the user cancels', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = setup(true)
    await act(() => router.navigate('/b'))
    expect(confirm).toHaveBeenCalledWith('Leave?')
    expect(router.state.location.pathname).toBe('/a')
  })

  it('leaves when the user confirms', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const router = setup(true)
    await act(() => router.navigate('/b'))
    expect(router.state.location.pathname).toBe('/b')
  })

  it('lets search changes and inactive guards through without asking', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const router = setup(true)
    await act(() => router.navigate('/a?x=1'))
    expect(router.state.location.search).toBe('?x=1')

    const idle = setup(false)
    await act(() => idle.navigate('/b'))
    expect(idle.state.location.pathname).toBe('/b')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks the browser to confirm a reload or tab close while active', () => {
    setup(true)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
