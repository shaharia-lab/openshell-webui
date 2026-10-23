import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { CommandPalette } from '../command-palette'
import { renderApp } from '@/test/render'
import { server } from '@/test/server'

describe('CommandPalette', () => {
  it('opens with Ctrl+K and jumps to a sandbox', async () => {
    server.use(
      http.get('/api/gw/:gw/sandboxes', () =>
        HttpResponse.json({
          sandboxes: [
            {
              metadata: { name: 'web', workspace: 'team' },
              status: { phase: 'SANDBOX_PHASE_READY' },
            },
          ],
        }),
      ),
    )
    const { router } = renderApp(<CommandPalette />, {
      routes: [{ path: '/sandboxes/:workspace/:name/:tab?', element: <p>detail</p> }],
    })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = await screen.findByPlaceholderText(/Go to a page or sandbox/)
    await userEvent.type(input, 'web')
    await waitFor(() => expect(screen.getByRole('option', { name: /^web/ })).toBeInTheDocument())
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/sandboxes/team/web'))
  })

  it('navigates to pages', async () => {
    const { router } = renderApp(<CommandPalette />, {
      routes: [{ path: '/providers', element: <p>providers</p> }],
    })
    await userEvent.click(screen.getByRole('button', { name: 'Search and commands' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Providers' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/providers'))
  })
})
